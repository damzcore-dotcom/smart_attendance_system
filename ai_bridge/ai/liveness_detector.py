"""
Liveness Detector (Anti-Spoofing)
Detects whether a face is real or a spoof (printed photo, screen replay, mask).
Uses Silent-Face Anti-Spoofing when available, falls back to heuristic checks.
"""
import numpy as np
import cv2


class LivenessDetector:
    """
    Silent Face Anti-Spoofing (MiniFASNet).
    Detects: printed photos, phone screens, video replays.
    Reference: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
    """
    def __init__(self, model_path: str = "/app/models/anti_spoof"):
        self.model = self._load_model(model_path)
        self._use_heuristic = self.model is None

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
        """
        Check if a face region is real (live) or spoofed.
        
        Returns:
            dict with keys: is_real, confidence, verdict (LIVE|SPOOF|SKIP)
        """
        if self.model is not None:
            return self._check_model(face_region)
        elif self._use_heuristic:
            return self._check_heuristic(face_region)
        else:
            return {"is_real": True, "confidence": 1.0, "verdict": "SKIP"}

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
        Not as accurate as ML model, but better than nothing.
        """
        try:
            if face_region is None or face_region.size == 0:
                return {"is_real": False, "confidence": 0.0, "verdict": "INVALID"}

            # Resize for consistent analysis
            face = cv2.resize(face_region, (128, 128))

            # 1. Laplacian variance (blur detection — screens tend to have uniform blur)
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

            is_real = score >= 0.6
            return {
                "is_real": is_real,
                "confidence": round(score, 4),
                "verdict": "LIVE" if is_real else "SPOOF",
                "method": "heuristic"
            }

        except Exception as e:
            print(f"[LivenessDetector] Heuristic check error: {e}")
            return {"is_real": True, "confidence": 0.5, "verdict": "ERROR"}
