"""
Embedding Cache using Redis
Stores and retrieves face embeddings for fast 1:N matching.
"""
import redis.asyncio as redis
import json
import numpy as np


class EmbeddingCache:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url)
        self.KEY_PREFIX = "face_emb:"

    async def set(self, employee_id: str, embedding: np.ndarray):
        """Store an embedding in Redis."""
        await self.redis.set(
            f"{self.KEY_PREFIX}{employee_id}",
            json.dumps(embedding.tolist())
        )

    async def delete(self, employee_id: str):
        """Remove an embedding from cache."""
        await self.redis.delete(f"{self.KEY_PREFIX}{employee_id}")

    async def get(self, employee_id: str) -> np.ndarray | None:
        """Get a single embedding from cache."""
        val = await self.redis.get(f"{self.KEY_PREFIX}{employee_id}")
        if val:
            return np.array(json.loads(val))
        return None

    async def get_all(self) -> dict:
        """Get all embeddings from cache as dict {employee_id: embedding}."""
        keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
        result = {}
        for key in keys:
            emp_id = key.decode().replace(self.KEY_PREFIX, "")
            val = await self.redis.get(key)
            if val:
                result[emp_id] = np.array(json.loads(val))
        return result

    async def reload_from_db(self, bridge_client):
        """Load/reload all embeddings from Smart Attendance DB via bridge API."""
        print("[Cache] Loading embeddings from DB...")
        try:
            embeddings = await bridge_client.get_all_embeddings()
            loaded = 0
            for emp in embeddings:
                if emp.get("faceEmbeddingV2"):
                    await self.set(
                        str(emp["id"]),
                        np.array(emp["faceEmbeddingV2"])
                    )
                    loaded += 1
            print(f"[Cache] Loaded {loaded} embeddings from {len(embeddings)} employees")
        except Exception as e:
            print(f"[Cache] Failed to load from DB: {e}")
            raise

    async def count(self) -> int:
        """Count number of cached embeddings."""
        keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
        return len(keys)
