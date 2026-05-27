"""
Attendance Recorder
Handles the business logic of recording attendance from CCTV recognition.
Includes cooldown to prevent duplicate records.
"""
import asyncio
from datetime import datetime
import cv2
import numpy as np


class AttendanceRecorder:
    COOLDOWN_SECONDS = 300  # 5 minutes between records per employee

    def __init__(self, bridge, cache, storage):
        self.bridge = bridge
        self.cache = cache
        self.storage = storage
        self._cooldowns: dict = {}

    def _in_cooldown(self, employee_id: str) -> bool:
        if employee_id not in self._cooldowns:
            return False
        elapsed = (datetime.now() - self._cooldowns[employee_id]).total_seconds()
        return elapsed < self.COOLDOWN_SECONDS

    async def record(self, employee_id: str, camera_id: str,
                     face_snapshot: np.ndarray, similarity: float):
        """
        Record an attendance event from CCTV face recognition.
        - Checks cooldown to prevent duplicates
        - Uploads snapshot to MinIO
        - Posts record to Smart Attendance backend via bridge
        """
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
            "source": "face_cctv"
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
