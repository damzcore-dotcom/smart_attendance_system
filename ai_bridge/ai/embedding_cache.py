"""
Embedding Cache using Redis with In-Memory Numpy Matrix representation.
Optimized for high-speed batch matching and multi-embedding support.
"""
import redis.asyncio as redis
import json
import numpy as np


class EmbeddingCache:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url)
        self.KEY_PREFIX = "face_emb:"
        
        # In-memory caches for instant matching
        self.db_matrix = None  # numpy array of shape (M, 512)
        self.ids_list = []     # list of employee IDs of size M
        self.names_map = {}    # dict of {employee_id: name}

    async def set(self, employee_id: str, embeddings_list: list, rebuild: bool = True):
        """
        Store a list of embeddings in Redis and (optionally) rebuild the matrix.

        Pass rebuild=False during bulk loads to avoid an O(N^2) rebuild on every
        employee; the caller is then responsible for one final rebuild_matrix()
        (PERBAIKAN_WAJAH_CCTV.md #8).
        """
        # Convert numpy arrays to lists and drop null/invalid entries so a bad
        # slot (e.g. a padded None from the slot-based enrollment path) can never
        # corrupt the in-memory matrix later (PERBAIKAN_WAJAH_CCTV.md #5).
        serializable_list = []
        for emb in embeddings_list:
            if isinstance(emb, np.ndarray):
                serializable_list.append(emb.tolist())
            elif isinstance(emb, list) and len(emb) > 0:
                serializable_list.append(emb)
            # else: None / empty → skip

        await self.redis.set(
            f"{self.KEY_PREFIX}{employee_id}",
            json.dumps(serializable_list)
        )
        if rebuild:
            await self.rebuild_matrix()

    async def set_name(self, employee_id: str, name: str):
        """Store employee name in Redis and update in-memory names map."""
        await self.redis.set(
            f"face_name:{employee_id}",
            name
        )
        self.names_map[str(employee_id)] = name

    async def get_name(self, employee_id: str) -> str | None:
        """Get employee name from in-memory cache, fallback to Redis."""
        emp_id = str(employee_id)
        if emp_id in self.names_map:
            return self.names_map[emp_id]
        
        val = await self.redis.get(f"face_name:{emp_id}")
        if val:
            name = val.decode()
            self.names_map[emp_id] = name
            return name
        return None

    async def delete(self, employee_id: str):
        """Remove an embedding from cache and rebuild in-memory matrix."""
        emp_id = str(employee_id)
        await self.redis.delete(f"{self.KEY_PREFIX}{emp_id}")
        await self.redis.delete(f"face_name:{emp_id}")
        if emp_id in self.names_map:
            del self.names_map[emp_id]
        await self.rebuild_matrix()

    async def get(self, employee_id: str) -> list | None:
        """Get list of embeddings from Redis."""
        val = await self.redis.get(f"{self.KEY_PREFIX}{employee_id}")
        if val:
            return json.loads(val)
        return None

    async def get_all(self) -> dict:
        """
        Get all embeddings from cache as dict {employee_id: [embeddings]}.
        Uses Redis pipeline for high efficiency.
        """
        keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
        if not keys:
            return {}

        pipe = self.redis.pipeline()
        for key in keys:
            pipe.get(key)
        values = await pipe.execute()

        result = {}
        for key, val in zip(keys, values):
            emp_id = key.decode().replace(self.KEY_PREFIX, "")
            if val:
                result[emp_id] = json.loads(val)
        return result

    async def rebuild_matrix(self):
        """Rebuild in-memory numpy matrix of all active embeddings."""
        keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
        if not keys:
            self.db_matrix = None
            self.ids_list = []
            self.names_map = {}
            print("[Cache] No embeddings in cache. In-memory matrix is empty.")
            return

        # Use Redis pipeline to fetch all keys in a single batch
        pipe = self.redis.pipeline()
        for k in keys:
            pipe.get(k)
        values = await pipe.execute()

        # Fetch all names in a single batch
        pipe_names = self.redis.pipeline()
        for k in keys:
            emp_id = k.decode().replace(self.KEY_PREFIX, "")
            pipe_names.get(f"face_name:{emp_id}")
        names_vals = await pipe_names.execute()

        db_matrix_list = []
        ids_list = []
        names_map = {}

        for k, val, name_val in zip(keys, values, names_vals):
            emp_id = k.decode().replace(self.KEY_PREFIX, "")
            if val:
                try:
                    data = json.loads(val)
                    # Support both list of embeddings and single embedding (backward compatibility)
                    if isinstance(data, list) and len(data) > 0:
                        # Normalize to a list-of-embeddings shape
                        multi = data if isinstance(data[0], list) else [data]
                        for emb in multi:
                            # Skip null / empty / malformed entries so one bad slot
                            # cannot break np.stack below (PERBAIKAN_WAJAH_CCTV.md #5)
                            if not isinstance(emb, list) or len(emb) == 0:
                                continue
                            arr = np.array(emb, dtype=np.float32)
                            norm = np.linalg.norm(arr)
                            if norm > 0:
                                arr = arr / norm
                            db_matrix_list.append(arr)
                            ids_list.append(emp_id)
                except Exception as e:
                    print(f"[Cache] Error parsing embedding for employee {emp_id}: {e}")

            if name_val:
                names_map[emp_id] = name_val.decode()

        if db_matrix_list:
            self.db_matrix = np.stack(db_matrix_list)  # shape (M, 512)
            self.ids_list = ids_list
        else:
            self.db_matrix = None
            self.ids_list = []

        self.names_map = names_map
        print(f"[Cache] In-memory matrix rebuilt: {len(self.ids_list)} embeddings (representing {len(names_map)} employees)")

    def get_matrix(self):
        """Returns the pre-computed in-memory database matrix and corresponding ids."""
        return self.db_matrix, self.ids_list

    async def reload_from_db(self, bridge_client):
        """Load/reload all embeddings from Smart Attendance DB via bridge API."""
        print("[Cache] Loading embeddings from DB...")
        try:
            embeddings = await bridge_client.get_all_embeddings()
            loaded = 0
            
            # We want to clear Redis first to prevent stale data
            keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
            name_keys = await self.redis.keys("face_name:*")
            if keys:
                await self.redis.delete(*keys)
            if name_keys:
                await self.redis.delete(*name_keys)
            
            # Re-insert all embeddings
            for emp in embeddings:
                raw_emb = emp.get("faceEmbeddingV2")
                if raw_emb:
                    # Parse into a list of embeddings
                    if isinstance(raw_emb, list) and len(raw_emb) > 0:
                        if isinstance(raw_emb[0], (int, float)):
                            embeddings_list = [raw_emb]
                        else:
                            embeddings_list = raw_emb
                    else:
                        embeddings_list = []

                    if embeddings_list:
                        # rebuild=False: defer the (expensive) matrix rebuild to a
                        # single call after the loop instead of once per employee
                        # (PERBAIKAN_WAJAH_CCTV.md #8).
                        await self.set(str(emp["id"]), embeddings_list, rebuild=False)
                        if emp.get("name"):
                            await self.set_name(str(emp["id"]), emp["name"])
                        loaded += 1

            await self.rebuild_matrix()
            print(f"[Cache] Loaded {loaded} employees' embeddings from DB")
        except Exception as e:
            print(f"[Cache] Failed to load from DB: {e}")
            raise

    async def count(self) -> int:
        """Count number of cached employee IDs."""
        keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
        return len(keys)
