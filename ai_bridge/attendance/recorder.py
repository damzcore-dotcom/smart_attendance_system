"""
Attendance Recorder
Handles the business logic of recording attendance from CCTV recognition.
Includes cooldown to prevent duplicate records and auto re-enrollment tracking.
"""
import asyncio
from datetime import datetime
from collections import defaultdict, deque
import cv2
import numpy as np


# ── Re-enrollment Suggestion Config ─────────────────────────────────────
RE_ENROLLMENT_WINDOW = 30       # Track last N similarity scores per employee
RE_ENROLLMENT_THRESHOLD = 0.65  # Flag if average similarity drops below this
RE_ENROLLMENT_MIN_SAMPLES = 5   # Minimum samples before evaluating


class AttendanceRecorder:
    def __init__(self, bridge, cache, storage):
        self.bridge = bridge
        self.cache = cache
        self.storage = storage
        self._cooldowns: dict = {}

        # ── Re-enrollment tracking ──────────────────────────────────
        # {employee_id: deque([similarity1, similarity2, ...], maxlen=30)}
        self._similarity_history: dict[str, deque] = defaultdict(
            lambda: deque(maxlen=RE_ENROLLMENT_WINDOW)
        )
        # Cache of flagged employees {employee_id: {avg, count, last_seen}}
        self._re_enrollment_flags: dict[str, dict] = {}
        
        # Load cooldown dynamically from environment, default to 300s
        import os
        try:
            self.cooldown_seconds = int(os.getenv("ATTENDANCE_COOLDOWN_SECONDS", "300"))
        except:
            self.cooldown_seconds = 300
        print(f"[Recorder] Initialized with cooldown_seconds={self.cooldown_seconds}")

    def _in_cooldown(self, employee_id: str) -> bool:
        if employee_id not in self._cooldowns:
            return False
        elapsed = (datetime.now() - self._cooldowns[employee_id]).total_seconds()
        return elapsed < self.cooldown_seconds

    def track_similarity(self, employee_id: str, similarity: float):
        """
        Track a similarity score for re-enrollment analysis.
        Called for every recognized face (including during cooldown) to build
        a comprehensive rolling picture of recognition quality.
        """
        self._similarity_history[employee_id].append(similarity)
        self._evaluate_re_enrollment(employee_id)

    def _evaluate_re_enrollment(self, employee_id: str):
        """Check if an employee's average similarity warrants a re-enrollment suggestion."""
        history = self._similarity_history.get(employee_id)
        if not history or len(history) < RE_ENROLLMENT_MIN_SAMPLES:
            # Not enough data to evaluate
            if employee_id in self._re_enrollment_flags:
                del self._re_enrollment_flags[employee_id]
            return

        avg_sim = sum(history) / len(history)
        if avg_sim < RE_ENROLLMENT_THRESHOLD:
            self._re_enrollment_flags[employee_id] = {
                "avg_similarity": round(avg_sim, 4),
                "sample_count": len(history),
                "last_seen": datetime.now().isoformat(),
                "min_similarity": round(min(history), 4),
                "max_similarity": round(max(history), 4),
            }
        else:
            # Recovered above threshold — remove flag
            if employee_id in self._re_enrollment_flags:
                del self._re_enrollment_flags[employee_id]

    def get_re_enrollment_suggestions(self) -> list:
        """
        Return a list of employees whose average similarity has dropped
        below the re-enrollment threshold, suggesting their face data
        needs to be refreshed.
        """
        suggestions = []
        for emp_id, info in self._re_enrollment_flags.items():
            suggestions.append({
                "employee_id": emp_id,
                **info
            })
        # Sort worst performers first
        suggestions.sort(key=lambda x: x["avg_similarity"])
        return suggestions

    async def record(self, employee_id: str, camera_id: str,
                     face_snapshot: np.ndarray, similarity: float):
        """
        Record an attendance event from CCTV face recognition.
        - Tracks similarity for re-enrollment analysis
        - Checks cooldown to prevent duplicates
        - Uploads snapshot to MinIO
        - Posts record to Smart Attendance backend via bridge
        """
        # Always track similarity for re-enrollment analysis (even during cooldown)
        self.track_similarity(employee_id, similarity)

        if self._in_cooldown(employee_id):
            return {"status": "COOLDOWN"}

        self._cooldowns[employee_id] = datetime.now()
        timestamp = datetime.now()

        # Upload snapshot to MinIO
        photo_url = await self.storage.upload_snapshot(
            employee_id, face_snapshot, timestamp
        )

        # Get employee data + shift info from backend
        try:
            emp = await self.bridge.get_employee(employee_id)
        except Exception as e:
            print(f"[Recorder] Failed to get employee {employee_id}: {e}")
            emp = {}

        # Determine confidence level
        if similarity >= 0.75:
            confidence_level = "HIGH"
            notes = f"Confidence: HIGH ({similarity:.2f})"
        elif similarity >= 0.60:
            confidence_level = "MEDIUM"
            notes = f"Confidence: MEDIUM ({similarity:.2f})"
        else:
            confidence_level = "LOW"
            notes = f"Perlu Verifikasi Manual - Confidence: LOW ({similarity:.2f})"

        # Determine attendance status based on shift
        shift = emp.get("activeShift", {})
        checkin_deadline = shift.get("checkinDeadline", "09:00")

        try:
            deadline_time = datetime.strptime(checkin_deadline, "%H:%M").time()
            status = "PRESENT" if timestamp.time() <= deadline_time else "LATE"
        except:
            status = "PRESENT"

        record = {
            "employeeId": int(employee_id),
            "date": timestamp.date().isoformat(),
            "timestamp": timestamp.isoformat(),
            "cameraId": camera_id,
            "similarity": similarity,
            "photoUrl": photo_url,
            "status": status,
            "source": "face_cctv",
            "notes": notes
        }

        # Post to Smart Attendance backend
        try:
            result = await self.bridge.post_checkin(record)

            # Broadcast real-time event for live dashboards
            await self.bridge.broadcast_event({
                "type": "ATTENDANCE_CHECKIN",
                "payload": {
                    **record,
                    "name": emp.get("name", "Unknown"),
                    "department": emp.get("department", {}).get("name", "")
                }
            })

            # Log face event for audit
            await self.bridge.post_face_event({
                "cameraId": camera_id,
                "employeeId": int(employee_id),
                "eventTime": timestamp.isoformat(),
                "similarity": similarity,
                "photoUrl": photo_url,
                "isUnknown": False,
                "isSpoof": False,
                "processed": True
            })

            print(f"[Recorder] ✓ Recorded: Employee {employee_id} at {camera_id} (sim={similarity:.2f}, status={status})")
            return result
        except Exception as e:
            print(f"[Recorder] Failed to record attendance: {e}")
            return {"status": "ERROR", "message": str(e)}

    async def record_unknown(self, camera_id: str, face_region: np.ndarray):
        """Record an unknown face detection event."""
        timestamp = datetime.now()

        # Upload photo
        photo_url = await self.storage.upload_unknown(face_region, timestamp)

        # Post alert to backend
        try:
            await self.bridge.post_unknown_alert({
                "cameraId": camera_id,
                "eventTime": timestamp.isoformat(),
                "photoUrl": photo_url
            })

            # Log face event
            await self.bridge.post_face_event({
                "cameraId": camera_id,
                "employeeId": None,
                "eventTime": timestamp.isoformat(),
                "similarity": None,
                "photoUrl": photo_url,
                "isUnknown": True,
                "isSpoof": False,
                "processed": True
            })

            print(f"[Recorder] ⚠ Unknown face at {camera_id}")
        except Exception as e:
            print(f"[Recorder] Failed to record unknown alert: {e}")

    async def record_spoof(self, camera_id: str, face_region: np.ndarray):
        """Record a spoof attempt detection."""
        timestamp = datetime.now()
        photo_url = await self.storage.upload_unknown(face_region, timestamp)

        try:
            await self.bridge.post_face_event({
                "cameraId": camera_id,
                "employeeId": None,
                "eventTime": timestamp.isoformat(),
                "similarity": None,
                "photoUrl": photo_url,
                "isUnknown": False,
                "isSpoof": True,
                "processed": True
            })
            print(f"[Recorder] 🚫 Spoof detected at {camera_id}")
        except Exception as e:
            print(f"[Recorder] Failed to record spoof event: {e}")
