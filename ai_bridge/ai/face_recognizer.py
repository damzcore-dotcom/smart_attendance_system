"""
Face Recognizer using InsightFace ArcFace
Extracts 512-dim embeddings and performs 1:N matching.
"""
import insightface
import numpy as np


class FaceRecognizer:
    def __init__(self, device: str = "cpu", model_root: str = "/app/models"):
        ctx_id = 0 if device == "cuda" else -1
        import os
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
        print(f"[FaceRecognizer] Model loaded on {'GPU' if device == 'cuda' else 'CPU'} with det_size={det_size}")

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

    def match(self, embedding: np.ndarray, database: dict, threshold: float = 0.60) -> dict | None:
        """
        Match an embedding against the database of enrolled employees.
        
        Args:
            embedding: 512-dim normalized vector
            database: dict of {employee_id: embedding_vector}
            threshold: minimum cosine similarity (0.0 - 1.0)
            
        Returns:
            dict with employee_id and similarity, or None if no match
        """
        if not database:
            return None

        best_id = None
        best_score = 0.0

        for emp_id, db_embed in database.items():
            db_embed = np.array(db_embed, dtype=np.float32)
            
            # Normalize db embedding if not already
            db_norm = np.linalg.norm(db_embed)
            if db_norm > 0:
                db_embed = db_embed / db_norm

            # Cosine similarity
            score = float(np.dot(embedding, db_embed))

            if score > best_score:
                best_score = score
                best_id = emp_id

        if best_score >= threshold and best_id is not None:
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
