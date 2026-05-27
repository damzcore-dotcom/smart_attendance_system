"""
Face Detector using InsightFace
Detects faces and returns aligned crops + bounding boxes.
"""
import insightface
import numpy as np
import cv2


class FaceDetector:
    def __init__(self, det_size=(640, 640), model_root="/app/models"):
        self.det_size = det_size
        self.model_root = model_root
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            try:
                self._model = insightface.app.FaceAnalysis(
                    name='buffalo_l',
                    allowed_modules=['detection'],
                    root=self.model_root
                )
                self._model.prepare(ctx_id=-1, det_size=self.det_size)
                print("[FaceDetector] Model loaded successfully")
            except Exception as e:
                print(f"[FaceDetector] Failed to load model: {e}")
                raise

    def detect(self, frame: np.ndarray) -> list:
        """
        Detect faces in a frame.
        Returns list of dicts with keys: region, aligned, bbox, det_score
        """
        self._ensure_model()

        try:
            faces = self._model.get(frame)
        except Exception as e:
            print(f"[FaceDetector] Detection error: {e}")
            return []

        results = []
        for face in faces:
            bbox = face.bbox.astype(int)
            x1, y1, x2, y2 = bbox

            # Ensure coords are within frame bounds
            h, w = frame.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if x2 - x1 < 20 or y2 - y1 < 20:
                continue  # Too small

            region = frame[y1:y2, x1:x2].copy()

            # Create aligned face crop (112x112 for recognition)
            aligned = self._align_face(frame, face)

            results.append({
                "region": region,
                "aligned": aligned if aligned is not None else region,
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "det_score": float(face.det_score) if hasattr(face, 'det_score') else 0.0
            })

        return results

    def _align_face(self, frame, face):
        """Get aligned face crop using InsightFace landmarks."""
        try:
            if hasattr(face, 'kps') and face.kps is not None:
                # Use insightface's built-in alignment
                aligned = insightface.utils.face_align.norm_crop(frame, face.kps)
                return aligned
        except:
            pass
        return None
