"""
Face Recognizer using InsightFace ArcFace
Extracts 512-dim embeddings and performs 1:N matching.
"""
import insightface
import numpy as np


class FaceRecognizer:
    def __init__(self, device: str = "cpu", model_root: str = "/app/models"):
        import os
        import onnxruntime as ort
        device = device.lower()
        
        ctx_id = -1
        if device == "cuda":
            providers = ort.get_available_providers()
            if "CUDAExecutionProvider" in providers:
                ctx_id = 0
                print("[FaceRecognizer] GPU CUDA is available and will be used.")
            else:
                print("[FaceRecognizer] WARNING: CUDA requested but CUDAExecutionProvider not found. Falling back to CPU.")

        size_str = os.getenv("DETECTION_SIZE", "640,640")
        try:
            w, h = map(int, size_str.split(","))
            det_size = (w, h)
        except:
            det_size = (640, 640)
        self.model = insightface.app.FaceAnalysis(
            name='buffalo_l',
            allowed_modules=['detection', 'recognition'],
            root=model_root
        )
        self.model.prepare(ctx_id=ctx_id, det_size=det_size)
        print(f"[FaceRecognizer] Model loaded on {'GPU' if ctx_id == 0 else 'CPU'} with det_size={det_size}")

    def get_embedding(self, frame: np.ndarray) -> np.ndarray | None:
        """Extract 512-dim face embedding from a frame/aligned face crop."""
        try:
            # If the user provides a pre-aligned 112x112 image crop
            if frame.shape[:2] == (112, 112):
                recognizer = self.model.models['recognition']
                feat = recognizer.get_feat(frame)
                
                if feat is not None:
                    # 'get_feat' usually returns list or an array of shape (512,)
                    if isinstance(feat, list):
                        embedding = np.array(feat[0]).flatten()
                    else:
                        embedding = np.array(feat).flatten()
                    
                    norm = np.linalg.norm(embedding)
                    if norm > 0:
                        embedding = embedding / norm
                    return embedding
                return None
            else:
                faces = self.model.get(frame)
                if faces and len(faces) > 0:
                    embedding = faces[0].embedding
                    norm = np.linalg.norm(embedding)
                    if norm > 0:
                        embedding = embedding / norm
                    return embedding
        except Exception as e:
            print(f"[FaceRecognizer] Embedding extraction error: {e}")
        return None

    def match(
        self,
        embedding: np.ndarray,
        database: dict = None,
        db_matrix: np.ndarray = None,
        ids: list = None,
        threshold: float = None,
        use_adaptive: bool = True
    ) -> dict | None:
        """
        Match an embedding against the database of enrolled employees.
        Supports both fast NumPy vectorized matching and dict fallback.
        Applies adaptive thresholds depending on the number of embeddings.
        """
        # Ensure query embedding is normalized
        emb_norm = np.linalg.norm(embedding)
        if emb_norm > 0:
            embedding = embedding / emb_norm

        # 1. Vectorized Matching (NumPy Matrix Multiplication) - Extremely Fast
        if db_matrix is not None and ids is not None and len(ids) > 0:
            similarities = db_matrix @ embedding  # Dot product of all embeddings at once
            best_idx = int(np.argmax(similarities))
            best_score = float(similarities[best_idx])
            best_id = ids[best_idx]

            # Determine adaptive threshold
            if threshold is not None:
                active_thresh = threshold
            elif use_adaptive:
                # Count enrolled embeddings for this employee
                emb_count = ids.count(best_id)
                if emb_count <= 1:
                    active_thresh = 0.62
                elif emb_count <= 3:
                    active_thresh = 0.55
                else:
                    active_thresh = 0.50
            else:
                active_thresh = 0.60

            if best_score >= active_thresh:
                return {
                    "employee_id": best_id,
                    "similarity": round(best_score, 4)
                }
            return None

        # 2. Fallback Dictionary Scan (Slow, but backward compatible)
        if not database:
            return None

        best_id = None
        best_score = 0.0
        best_count = 1

        for emp_id, db_val in database.items():
            if isinstance(db_val, list) and len(db_val) > 0 and isinstance(db_val[0], list):
                embeddings_list = db_val
            else:
                embeddings_list = [db_val]

            for db_embed in embeddings_list:
                db_embed = np.array(db_embed, dtype=np.float32)
                db_norm = np.linalg.norm(db_embed)
                if db_norm > 0:
                    db_embed = db_embed / db_norm

                score = float(np.dot(embedding, db_embed))
                if score > best_score:
                    best_score = score
                    best_id = emp_id
                    best_count = len(embeddings_list)

        if best_id is not None:
            if threshold is not None:
                active_thresh = threshold
            elif use_adaptive:
                if best_count <= 1:
                    active_thresh = 0.62
                elif best_count <= 3:
                    active_thresh = 0.55
                else:
                    active_thresh = 0.50
            else:
                active_thresh = 0.60

            if best_score >= active_thresh:
                return {
                    "employee_id": best_id,
                    "similarity": round(best_score, 4)
                }

        return None

    def compute_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Compute cosine similarity between two embeddings."""
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(np.dot(emb1, emb2) / (norm1 * norm2))
