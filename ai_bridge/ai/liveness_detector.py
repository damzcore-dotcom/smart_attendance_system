"""
Liveness Detector (Anti-Spoofing)
Detects whether a face is real or a spoof (printed photo, screen replay, mask).
Uses Silent-Face Anti-Spoofing when available, falls back to advanced heuristics.
"""
import numpy as np
import cv2
import time


class LivenessDetector:
    def __init__(self, model_path: str = "/app/models/anti_spoof"):
        self.model = self._load_model(model_path)
        self._use_heuristic = self.model is None
        
        # History for multi-frame tracking: {cam_id: [ { "bbox": bbox, "frames": [gray_crop1, ...], "last_seen": timestamp } ]}
        self.history = {}

    def _load_model(self, path):
        try:
            from silent_face import AntiSpoofPredict
            model = AntiSpoofPredict(device_id=0)
            print("[LivenessDetector] Silent-Face model loaded")
            return model
        except ImportError:
            print("[LivenessDetector] Silent-Face not found, using heuristic fallback")
            return None
        except Exception as e:
            print(f"[LivenessDetector] Model load error: {e}, using heuristic fallback")
            return None

    def check(self, face_region: np.ndarray) -> dict:
        """Standard single-frame liveness check."""
        if self.model is not None:
            return self._check_model(face_region)
        elif self._use_heuristic:
            return self._check_heuristic(face_region)
        else:
            return {"is_real": True, "confidence": 1.0, "verdict": "SKIP"}

    def check_v2(self, face_region: np.ndarray, bbox: list, cam_id: str) -> dict:
        """
        Advanced liveness check with multi-frame micro-motion and screen reflection checks.
        Uses tracking to associate faces across frames.
        """
        # If ML model is available, use it (it is superior)
        if self.model is not None:
            return self._check_model(face_region)

        # Single-frame heuristic baseline
        single_res = self._check_heuristic(face_region)
        if not single_res["is_real"]:
            # If single frame already rejects it, fail immediately
            return single_res

        # If it passes single-frame, run reflection and multi-frame checks
        h, w = face_region.shape[:2]
        if h < 40 or w < 40:
            return single_res

        # 1. Screen Reflection / Glare Detection
        hsv = cv2.cvtColor(face_region, cv2.COLOR_BGR2HSV)
        v_channel = hsv[:, :, 2]
        
        # Bright spots (glare on screen or phone)
        _, bright_spots = cv2.threshold(v_channel, 240, 255, cv2.THRESH_BINARY)
        bright_area_ratio = cv2.countNonZero(bright_spots) / (h * w)
        
        # If there's a highly concentrated bright spot (typical of screen reflections), flag as spoof
        if 0.01 < bright_area_ratio < 0.15:
            # Check if it has high local contrast (sharp borders)
            contours, _ = cv2.findContours(bright_spots, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if len(contours) > 0:
                # Phone screen glare detected
                return {
                    "is_real": False,
                    "confidence": 0.85,
                    "verdict": "SPOOF",
                    "reason": "Screen reflection/glare detected",
                    "method": "reflection"
                }

        # 2. Multi-frame Micro-motion Check (Anti static-photo)
        now = time.time()
        cam_history = self.history.setdefault(cam_id, [])
        
        # Clean up old history entries (> 3 seconds old)
        cam_history = [face for face in cam_history if now - face["last_seen"] < 3.0]
        self.history[cam_id] = cam_history

        # Try to find matching face in history using center distance
        match_entry = None
        face_center = np.array([(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0])
        
        for entry in cam_history:
            prev_bbox = entry["bbox"]
            prev_center = np.array([(prev_bbox[0] + prev_bbox[2]) / 2.0, (prev_bbox[1] + prev_bbox[3]) / 2.0])
            dist = np.linalg.norm(face_center - prev_center)
            
            # If centers are within 60 pixels, it's likely the same face
            if dist < 60:
                match_entry = entry
                break

        # Convert crop to grayscale and resize for history
        gray_crop = cv2.cvtColor(cv2.resize(face_region, (100, 100)), cv2.COLOR_BGR2GRAY)
        # Apply histogram equalization to normalize lighting
        gray_crop = cv2.equalizeHist(gray_crop)

        if match_entry is None:
            # Create new tracker entry
            match_entry = {
                "bbox": bbox,
                "frames": [gray_crop],
                "last_seen": now
            }
            cam_history.append(match_entry)
            # Not enough frames yet, return single frame result
            return single_res
        else:
            # Update matching entry
            match_entry["bbox"] = bbox
            match_entry["last_seen"] = now
            match_entry["frames"].append(gray_crop)
            
            # Keep only the last 5 frames
            if len(match_entry["frames"]) > 5:
                match_entry["frames"].pop(0)

            # Perform motion analysis if we have at least 3 frames
            if len(match_entry["frames"]) >= 3:
                frames = match_entry["frames"]
                
                # Compute absolute difference between consecutive frames
                diffs = []
                for i in range(len(frames) - 1):
                    diff = cv2.absdiff(frames[i], frames[i+1])
                    diffs.append(np.mean(diff))
                
                avg_diff = np.mean(diffs)
                
                # Heuristics:
                # - If the face is a printed photo held in front of the camera, the crop difference is near 0 (static).
                # - If it's a real face, there is a natural micro-expression/motion (avg diff is between 1.5 and 15).
                # - If it's extreme change (avg diff > 20), it's probably someone moving very fast or camera jerk.
                if avg_diff < 0.8:
                    return {
                        "is_real": False,
                        "confidence": 0.90,
                        "verdict": "SPOOF",
                        "reason": "Static face detected (No micro-motions)",
                        "method": "micro-motion"
                    }

        return single_res

    def _check_model(self, face_region: np.ndarray) -> dict:
        """Use ML model for liveness detection."""
        try:
            score = self.model.predict(face_region)
            real_score = score.get("real", 0)
            is_real = real_score > 0.80
            return {
                "is_real": is_real,
                "confidence": round(real_score, 4),
                "verdict": "LIVE" if is_real else "SPOOF"
            }
        except Exception as e:
            print(f"[LivenessDetector] Model prediction error: {e}")
            return {"is_real": True, "confidence": 0.5, "verdict": "ERROR"}

    def _check_heuristic(self, face_region: np.ndarray) -> dict:
        """
        Heuristic-based liveness detection.
        Checks for texture, color distribution, and Laplacian sharpness.
        """
        try:
            if face_region is None or face_region.size == 0:
                return {"is_real": False, "confidence": 0.0, "verdict": "INVALID"}

            # Resize for consistent analysis
            face = cv2.resize(face_region, (128, 128))

            # 1. Laplacian variance (blur detection)
            gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

            # 2. Color range analysis (printed photos tend to have less color variation)
            hsv = cv2.cvtColor(face, cv2.COLOR_BGR2HSV)
            h_std = np.std(hsv[:, :, 0])
            s_std = np.std(hsv[:, :, 1])
            v_std = np.std(hsv[:, :, 2])

            # 3. Moire pattern detection (screens)
            freq = np.fft.fft2(gray)
            freq_shift = np.fft.fftshift(freq)
            magnitude = np.abs(freq_shift)
            high_freq_ratio = np.sum(magnitude > np.mean(magnitude) * 3) / magnitude.size

            # Score calculation
            score = 0.0
            if laplacian_var > 100:  # Good sharpness
                score += 0.3
            if h_std > 10:  # Good hue variation
                score += 0.2
            if s_std > 20:  # Good saturation variation
                score += 0.2
            if high_freq_ratio < 0.05:  # Low moire patterns
                score += 0.3

            is_real = score >= 0.60
            return {
                "is_real": is_real,
                "confidence": round(score, 4),
                "verdict": "LIVE" if is_real else "SPOOF",
                "method": "heuristic"
            }

        except Exception as e:
            print(f"[LivenessDetector] Heuristic check error: {e}")
            return {"is_real": True, "confidence": 0.5, "verdict": "ERROR"}
