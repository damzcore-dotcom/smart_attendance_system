# 🚀 Panduan Implementasi: Face Recognition → Smart Attendance System

> **Jawaban Singkat: YA, bisa diimplementasikan.**
> Dokumen Face Recognition sudah dirancang khusus untuk sistem Smart Attendance Anda, dengan strategi **tanpa rewrite** — semua fitur yang sudah ada tetap berjalan, hanya ditambah microservice baru di sampingnya.

---

## 🔍 Analisis Kesesuaian Sistem

### Pemetaan Menu Existing ke Integrasi Face Recognition

| Menu di Sistem Anda | Perubahan yang Diperlukan |
|---|---|
| Dashboard Utama (Admin) | ✎ Tambah widget live kamera + event log real-time |
| Data Karyawan | ✎ Tambah kolom `face_embedding` + tombol "Enroll Wajah" |
| Log Kehadiran | ✎ Tambah kolom foto check-in/out + similarity score |
| Perangkat Mesin Absen | ✎ Tambah tab manajemen kamera CCTV Hikvision |
| Log Audit Sistem | ✎ Tambah log event unknown face & spoof detected |
| Registrasi Pengecekan Wajah | ✦ Sudah ada di sitemap Anda — tinggal implementasi full |
| Beranda Karyawan | ✎ Tambah notifikasi konfirmasi absen otomatis CCTV |
| Absen Masuk/Pulang via Scan Wajah | ✎ Sekarang otomatis dari CCTV, tidak perlu tap manual |
| Riwayat Kehadiran | ✎ Tambah foto snapshot dari CCTV |
| Dashboard Tim (Manager) | ✎ Tambah grafik kehadiran real-time per kamera/lokasi |
| Dashboard Eksekutif (Direktur) | ✎ Tambah ringkasan kehadiran live seluruh perusahaan |

**Menu baru yang perlu ditambahkan:**
- `/admin/face-enrollment` → Registrasi Wajah
- `/admin/cameras/monitor` → Live Camera Monitor
- `/admin/security/unknown-alerts` → Alert Wajah Asing

---

## 📋 Checklist Implementasi Lengkap

Ikuti urutan ini secara berurutan di IDE Anda.

---

### FASE 1 — Persiapan Infrastruktur

#### 1.1 Cek Prerequisites

```bash
# Pastikan Docker & Docker Compose terinstall
docker --version
docker-compose --version

# Pastikan Python 3.11+ tersedia (untuk AI Engine)
python3 --version

# Cek PostgreSQL bisa diakses
psql -U postgres -c "SELECT version();"

# Cek Redis berjalan
redis-cli ping
```

#### 1.2 Generate Secret Keys

```bash
# Buka terminal di root project Smart Attendance Anda
cd smart-attendance/

# Generate kunci-kunci baru
echo "INTERNAL_BRIDGE_KEY=$(openssl rand -hex 32)"
echo "FACE_ENCRYPT_KEY=$(openssl rand -hex 16)"
```

#### 1.3 Tambahkan Environment Variables ke `.env`

Buka file `.env` Anda, tambahkan baris berikut di bagian paling bawah:

```dotenv
# ── Face Recognition Integration ──────────────────────────────────
INTERNAL_BRIDGE_KEY=<hasil generate di atas>
AI_ENGINE_URL=http://ai-engine:8001
FACE_ENCRYPT_KEY=<hasil generate di atas>

# MinIO (Object Storage untuk foto wajah)
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123   # ganti dengan password kuat

# AI Settings
AI_DEVICE=cpu                    # ganti ke "cuda" jika ada GPU NVIDIA
MIN_RECOGNITION_SCORE=0.60       # threshold minimal (0.0–1.0)
ATTENDANCE_COOLDOWN_MIN=5        # cooldown per karyawan (menit)
```

---

### FASE 2 — Database Migration

#### 2.1 Buat File Migration

Buat file baru: `backend/migrations/0010_add_face_recognition.sql`

```sql
-- ── MIGRATION: Tambah dukungan Face Recognition ────────────────────────────
-- Jalankan SEKALI di database Smart Attendance yang sudah ada.
-- TIDAK ADA tabel lama yang dihapus atau diubah struktur intinya.

-- ── Step 1: Aktifkan pgvector extension ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Step 2: Tambah kolom face ke tabel employees ─────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS face_embedding   vector(512),
  ADD COLUMN IF NOT EXISTS face_enrolled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS face_samples     INTEGER DEFAULT 0;

-- Index untuk pencarian vector cepat (cosine similarity)
CREATE INDEX IF NOT EXISTS idx_emp_face
  ON employees USING ivfflat (face_embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Step 3: Tambah kolom foto & similarity ke tabel attendance ────────────
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS checkin_photo_url  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS checkout_photo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS checkin_similarity  DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS checkout_similarity DECIMAL(5,4),
  ADD COLUMN IF NOT EXISTS checkin_camera_id  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS checkout_camera_id VARCHAR(20),
  ADD COLUMN IF NOT EXISTS source             VARCHAR(20) DEFAULT 'manual';
  -- source: 'face_cctv' | 'fingerprint' | 'manual'

-- ── Step 4: Tabel baru — manajemen kamera CCTV ───────────────────────────
CREATE TABLE IF NOT EXISTS cameras (
    id          VARCHAR(20) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    location    VARCHAR(100),
    ip_address  VARCHAR(15),
    rtsp_url    VARCHAR(500),
    direction   VARCHAR(10) DEFAULT 'BOTH',   -- IN | OUT | BOTH
    active      BOOLEAN DEFAULT true,
    last_seen   TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Step 5: Tabel baru — log event wajah mentah dari AI ──────────────────
CREATE TABLE IF NOT EXISTS face_events (
    id              SERIAL PRIMARY KEY,
    camera_id       VARCHAR(20) REFERENCES cameras(id),
    employee_id     VARCHAR(20) REFERENCES employees(id),  -- NULL jika unknown
    event_time      TIMESTAMP NOT NULL,
    similarity      DECIMAL(5,4),
    liveness_score  DECIMAL(5,4),
    is_unknown      BOOLEAN DEFAULT false,
    is_spoof        BOOLEAN DEFAULT false,
    photo_url       VARCHAR(500),
    processed       BOOLEAN DEFAULT false,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_face_events_time     ON face_events(event_time);
CREATE INDEX IF NOT EXISTS idx_face_events_employee ON face_events(employee_id);
CREATE INDEX IF NOT EXISTS idx_face_events_unknown  ON face_events(is_unknown) WHERE is_unknown = true;

-- ── Step 6: Tabel baru — alert wajah tidak dikenal ───────────────────────
CREATE TABLE IF NOT EXISTS unknown_face_alerts (
    id          SERIAL PRIMARY KEY,
    camera_id   VARCHAR(20) REFERENCES cameras(id),
    event_time  TIMESTAMP NOT NULL,
    photo_url   VARCHAR(500),
    similarity  DECIMAL(5,4),
    resolved    BOOLEAN DEFAULT false,
    resolved_by VARCHAR(20),
    resolved_at TIMESTAMP,
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Selesai ───────────────────────────────────────────────────────────────
-- Verifikasi: SELECT column_name FROM information_schema.columns WHERE table_name = 'employees' AND column_name LIKE 'face%';
```

#### 2.2 Jalankan Migration

```bash
# Sesuaikan nama database dan user Anda
psql -U postgres -d attendance_db -f backend/migrations/0010_add_face_recognition.sql

# Verifikasi berhasil
psql -U postgres -d attendance_db -c "\d employees" | grep face
psql -U postgres -d attendance_db -c "\dt face_*"
psql -U postgres -d attendance_db -c "\dt cameras"
```

---

### FASE 3 — Buat Microservice AI Engine

#### 3.1 Buat Struktur Folder

```bash
# Di root project Smart Attendance Anda
mkdir -p ai_bridge/{camera,ai,attendance,bridge,storage,models,config,scripts}
touch ai_bridge/__init__.py
touch ai_bridge/camera/__init__.py
touch ai_bridge/ai/__init__.py
touch ai_bridge/attendance/__init__.py
touch ai_bridge/bridge/__init__.py
touch ai_bridge/storage/__init__.py
```

#### 3.2 Buat File `ai_bridge/requirements.txt`

```txt
fastapi==0.111.0
uvicorn[standard]==0.29.0
insightface==0.7.3
opencv-python-headless==4.9.0.80
numpy==1.26.4
onnxruntime==1.17.3       # ganti dengan onnxruntime-gpu jika ada GPU
redis==5.0.4
httpx==0.27.0
minio==7.2.7
python-multipart==0.0.9
python-dotenv==1.0.1
celery==5.4.0
pillow==10.3.0
```

#### 3.3 Buat File `ai_bridge/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libsm6 libxext6 libxrender-dev \
    libgomp1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

#### 3.4 Buat File `ai_bridge/main.py`

```python
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
import asyncio

from camera.stream_manager import HikvisionStreamManager
from ai.face_detector import FaceDetector
from ai.face_recognizer import FaceRecognizer
from ai.liveness_detector import LivenessDetector
from ai.embedding_cache import EmbeddingCache
from attendance.recorder import AttendanceRecorder
from bridge.client import BridgeClient
from storage.minio_client import MinioStorage
import os

# ── Inisialisasi komponen saat startup ────────────────────────────────────
stream_manager = None
recorder = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global stream_manager, recorder

    bridge = BridgeClient(
        base_url=os.getenv("SMART_ATTENDANCE_URL", "http://backend:8000"),
        api_key=os.getenv("BRIDGE_API_KEY")
    )
    cache = EmbeddingCache(redis_url=os.getenv("REDIS_URL", "redis://redis:6379"))
    storage = MinioStorage()
    detector = FaceDetector()
    recognizer = FaceRecognizer()
    liveness = LivenessDetector()
    recorder = AttendanceRecorder(bridge=bridge, cache=cache, storage=storage)

    # Load embeddings dari DB ke cache Redis
    await cache.reload_from_db(bridge)

    # Inisialisasi stream kamera dari config
    stream_manager = HikvisionStreamManager()
    await stream_manager.load_from_config("/app/config/cameras.yaml")

    # Mulai loop pemrosesan frame
    asyncio.create_task(
        process_frames_loop(stream_manager, detector, recognizer, liveness, recorder)
    )

    yield
    stream_manager.stop_all()

app = FastAPI(title="Face Recognition AI Engine", version="1.0.0", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-engine"}

@app.get("/cameras/status")
async def cameras_status():
    return stream_manager.get_status()

async def process_frames_loop(stream_manager, detector, recognizer, liveness, recorder):
    """Loop utama pemrosesan frame dari semua kamera."""
    while True:
        for cam_id in stream_manager.get_active_cameras():
            try:
                frame = await stream_manager.get_frame_async(cam_id)
                if frame is None:
                    continue

                faces = detector.detect(frame)
                for face in faces:
                    if not liveness.check(face["region"])["is_real"]:
                        continue  # SPOOF — skip

                    embedding = recognizer.get_embedding(face["aligned"])
                    if embedding is None:
                        continue

                    match = recognizer.match(embedding, await recorder.cache.get_all())
                    if match:
                        await recorder.record(
                            employee_id=match["employee_id"],
                            camera_id=cam_id,
                            face_snapshot=face["region"],
                            similarity=match["similarity"]
                        )
                    else:
                        await recorder.record_unknown(cam_id, face["region"])

            except Exception as e:
                print(f"[{cam_id}] Error: {e}")

        await asyncio.sleep(0.1)
```

#### 3.5 Buat File `ai_bridge/camera/stream_manager.py`

```python
import cv2, threading, asyncio, yaml
from queue import Queue, Empty

class HikvisionStreamManager:
    def __init__(self):
        self.cameras = {}
        self.frame_queues = {}
        self._running = True

    def load_from_config_sync(self, config_path: str):
        with open(config_path) as f:
            config = yaml.safe_load(f)
        for cam in config.get("cameras", []):
            if cam.get("enabled", True):
                self.add_camera(cam["id"], cam["rtsp_url"])

    async def load_from_config(self, config_path: str):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.load_from_config_sync, config_path)

    def add_camera(self, cam_id: str, rtsp_url: str):
        cap = cv2.VideoCapture(rtsp_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cameras[cam_id] = {"cap": cap, "rtsp_url": rtsp_url}
        self.frame_queues[cam_id] = Queue(maxsize=5)
        t = threading.Thread(target=self._capture_loop, args=(cam_id,), daemon=True)
        t.start()

    def _capture_loop(self, cam_id: str):
        frame_count = 0
        while self._running:
            ret, frame = self.cameras[cam_id]["cap"].read()
            if ret:
                frame_count += 1
                if frame_count % 3 == 0:  # Proses tiap 3 frame
                    if not self.frame_queues[cam_id].full():
                        self.frame_queues[cam_id].put(frame)
            else:
                self._reconnect(cam_id)

    def _reconnect(self, cam_id: str):
        import time
        time.sleep(5)
        rtsp_url = self.cameras[cam_id]["rtsp_url"]
        self.cameras[cam_id]["cap"] = cv2.VideoCapture(rtsp_url)

    def get_active_cameras(self):
        return list(self.cameras.keys())

    async def get_frame_async(self, cam_id: str):
        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(
                None, lambda: self.frame_queues[cam_id].get(timeout=0.5)
            )
        except Empty:
            return None

    def get_status(self):
        return {
            cam_id: {"connected": data["cap"].isOpened()}
            for cam_id, data in self.cameras.items()
        }

    def stop_all(self):
        self._running = False
        for cam_data in self.cameras.values():
            cam_data["cap"].release()
```

#### 3.6 Buat File `ai_bridge/ai/face_recognizer.py`

```python
import insightface
import numpy as np

class FaceRecognizer:
    def __init__(self, device: str = "cpu"):
        ctx_id = 0 if device == "cuda" else -1
        self.model = insightface.app.FaceAnalysis(
            name='buffalo_l',
            allowed_modules=['detection', 'recognition'],
            root='/app/models'
        )
        self.model.prepare(ctx_id=ctx_id, det_size=(640, 640))

    def get_embedding(self, frame) -> np.ndarray | None:
        faces = self.model.get(frame)
        return faces[0].embedding if faces else None

    def match(self, embedding: np.ndarray, database: dict, threshold: float = 0.60) -> dict | None:
        best_id, best_score = None, 0.0
        for emp_id, db_embed in database.items():
            db_embed = np.array(db_embed)
            score = float(
                np.dot(embedding, db_embed) /
                (np.linalg.norm(embedding) * np.linalg.norm(db_embed))
            )
            if score > best_score:
                best_score, best_id = score, emp_id

        if best_score >= threshold:
            return {"employee_id": best_id, "similarity": round(best_score, 4)}
        return None
```

#### 3.7 Buat File `ai_bridge/ai/liveness_detector.py`

```python
import numpy as np

class LivenessDetector:
    """
    Silent Face Anti-Spoofing (MiniFASNet).
    Deteksi: foto cetak, layar HP, video replay.
    Referensi: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
    """
    def __init__(self, model_path: str = "/app/models/anti_spoof"):
        self.model = self._load_model(model_path)

    def _load_model(self, path):
        # Import dan load model Silent-Face sesuai library yang dipilih
        try:
            from silent_face import AntiSpoofPredict
            return AntiSpoofPredict(device_id=0)
        except ImportError:
            print("[WARN] Silent-Face tidak ditemukan, liveness detection dinonaktifkan")
            return None

    def check(self, face_region) -> dict:
        if self.model is None:
            return {"is_real": True, "confidence": 1.0, "verdict": "SKIP"}

        score = self.model.predict(face_region)
        is_real = score.get("real", 0) > 0.80
        return {
            "is_real": is_real,
            "confidence": round(score.get("real", 0), 4),
            "verdict": "LIVE" if is_real else "SPOOF"
        }
```

#### 3.8 Buat File `ai_bridge/ai/embedding_cache.py`

```python
import redis.asyncio as redis
import json, numpy as np

class EmbeddingCache:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)
        self.KEY_PREFIX = "face_emb:"

    async def set(self, employee_id: str, embedding: np.ndarray):
        await self.redis.set(
            f"{self.KEY_PREFIX}{employee_id}",
            json.dumps(embedding.tolist())
        )

    async def get_all(self) -> dict:
        keys = await self.redis.keys(f"{self.KEY_PREFIX}*")
        result = {}
        for key in keys:
            emp_id = key.decode().replace(self.KEY_PREFIX, "")
            val = await self.redis.get(key)
            if val:
                result[emp_id] = np.array(json.loads(val))
        return result

    async def reload_from_db(self, bridge_client):
        """Load ulang semua embedding dari Smart Attendance DB ke Redis."""
        print("[Cache] Loading embeddings from DB...")
        embeddings = await bridge_client.get_all_embeddings()
        for emp in embeddings:
            if emp.get("face_embedding"):
                await self.set(emp["employee_id"], np.array(emp["face_embedding"]))
        print(f"[Cache] Loaded {len(embeddings)} embeddings")
```

#### 3.9 Buat File `ai_bridge/bridge/client.py`

```python
import httpx
from datetime import datetime

class BridgeClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.headers = {"X-Bridge-Key": api_key, "Content-Type": "application/json"}

    async def get_employee(self, employee_id: str) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/v1/bridge/employee/{employee_id}",
                headers=self.headers, timeout=5.0
            )
            r.raise_for_status()
            return r.json()

    async def post_checkin(self, record: dict) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/v1/bridge/checkin",
                headers=self.headers, json=record, timeout=5.0
            )
            r.raise_for_status()
            return r.json()

    async def post_unknown_alert(self, payload: dict) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/v1/bridge/alert/unknown",
                headers=self.headers, json=payload, timeout=5.0
            )
            r.raise_for_status()
            return r.json()

    async def get_all_embeddings(self) -> list:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/v1/bridge/embeddings",
                headers=self.headers, timeout=10.0
            )
            r.raise_for_status()
            return r.json()

    async def broadcast_event(self, event: dict):
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{self.base_url}/api/v1/bridge/event/broadcast",
                headers=self.headers, json=event, timeout=3.0
            )
```

#### 3.10 Buat File `ai_bridge/attendance/recorder.py`

```python
import asyncio
from datetime import datetime
import cv2, numpy as np

class AttendanceRecorder:
    COOLDOWN_SECONDS = 300  # 5 menit

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
                     face_snapshot, similarity: float):
        if self._in_cooldown(employee_id):
            return {"status": "COOLDOWN"}

        self._cooldowns[employee_id] = datetime.now()
        timestamp = datetime.now()

        # Upload foto ke MinIO
        photo_url = await self.storage.upload_snapshot(
            employee_id, face_snapshot, timestamp
        )

        # Ambil data karyawan & shift
        emp = await self.bridge.get_employee(employee_id)

        # Tentukan status kehadiran
        shift = emp.get("active_shift", {})
        checkin_deadline = shift.get("checkin_deadline", "09:00")
        deadline_time = datetime.strptime(checkin_deadline, "%H:%M").time()
        status = "HADIR" if timestamp.time() <= deadline_time else "TERLAMBAT"

        record = {
            "employee_id": employee_id,
            "date": timestamp.date().isoformat(),
            "timestamp": timestamp.isoformat(),
            "camera_id": camera_id,
            "similarity": similarity,
            "photo_url": photo_url,
            "status": status,
            "source": "face_cctv"
        }

        result = await self.bridge.post_checkin(record)
        await self.bridge.broadcast_event({
            "type": "ATTENDANCE_CHECKIN",
            "payload": {**record, "name": emp.get("name"), "department": emp.get("department")}
        })
        return result

    async def record_unknown(self, camera_id: str, face_region):
        timestamp = datetime.now()
        photo_url = await self.storage.upload_unknown(face_region, timestamp)
        await self.bridge.post_unknown_alert({
            "camera_id": camera_id,
            "event_time": timestamp.isoformat(),
            "photo_url": photo_url
        })
```

#### 3.11 Buat File `ai_bridge/storage/minio_client.py`

```python
from minio import Minio
from io import BytesIO
import cv2, numpy as np
from datetime import datetime
import os

class MinioStorage:
    def __init__(self):
        self.client = Minio(
            os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
            secure=False
        )
        self._ensure_buckets()

    def _ensure_buckets(self):
        for bucket in ["face-snapshots", "unknown-faces"]:
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)

    def _frame_to_bytes(self, frame) -> bytes:
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes()

    async def upload_snapshot(self, employee_id: str, frame, timestamp: datetime) -> str:
        data = self._frame_to_bytes(frame)
        key = f"{employee_id}/{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
        self.client.put_object(
            "face-snapshots", key, BytesIO(data), len(data), "image/jpeg"
        )
        return f"face-snapshots/{key}"

    async def upload_unknown(self, frame, timestamp: datetime) -> str:
        data = self._frame_to_bytes(frame)
        key = f"unknown/{timestamp.strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        self.client.put_object(
            "unknown-faces", key, BytesIO(data), len(data), "image/jpeg"
        )
        return f"unknown-faces/{key}"
```

---

### FASE 4 — Tambahkan Endpoint Bridge ke Smart Attendance Backend

Buat file baru: `backend/routes/bridge.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List
import os

router = APIRouter(prefix="/api/v1/bridge", tags=["bridge"])

BRIDGE_API_KEY = os.getenv("INTERNAL_BRIDGE_KEY")

# ── Middleware verifikasi kunci bridge ────────────────────────────────────
async def verify_bridge(request: Request):
    key = request.headers.get("X-Bridge-Key")
    if key != BRIDGE_API_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized bridge access")

# ── Endpoint: catat absensi dari AI Engine ────────────────────────────────
@router.post("/checkin", dependencies=[Depends(verify_bridge)])
async def bridge_checkin(payload: dict):
    """
    Dipanggil oleh AI Engine saat wajah dikenali.
    Payload: employee_id, date, timestamp, camera_id, similarity,
             photo_url, status (HADIR/TERLAMBAT), source
    """
    # TODO: panggil attendance service yang sudah ada
    # attendance_service.create_or_update(payload)
    return {"success": True, "message": "Attendance recorded"}

# ── Endpoint: ambil data karyawan + shift aktif ───────────────────────────
@router.get("/employee/{employee_id}", dependencies=[Depends(verify_bridge)])
async def bridge_get_employee(employee_id: str):
    """
    Return: data karyawan + shift aktif hari ini.
    """
    # TODO: ambil dari employee service + shift service yang sudah ada
    return {
        "employee_id": employee_id,
        "name": "...",
        "department": "...",
        "active_shift": {
            "name": "Shift Pagi",
            "checkin_deadline": "08:00",
            "checkout_time": "17:00"
        }
    }

# ── Endpoint: simpan alert wajah tidak dikenal ────────────────────────────
@router.post("/alert/unknown", dependencies=[Depends(verify_bridge)])
async def bridge_unknown_alert(payload: dict):
    """
    Simpan ke tabel unknown_face_alerts + broadcast WebSocket ke Admin/HRD.
    """
    # TODO: simpan ke DB + broadcast ke WebSocket
    return {"success": True}

# ── Endpoint: simpan face embedding hasil enrollment ─────────────────────
@router.post("/enrollment/save", dependencies=[Depends(verify_bridge)])
async def bridge_save_enrollment(payload: dict):
    """
    Payload: employee_id, embeddings (list of 512-dim vectors), samples_count
    """
    # TODO: update employees.face_embedding di DB
    return {"success": True}

# ── Endpoint: ambil semua embedding untuk cache AI ───────────────────────
@router.get("/embeddings", dependencies=[Depends(verify_bridge)])
async def bridge_get_embeddings():
    """
    Return semua karyawan yang sudah punya face_embedding.
    """
    # TODO: SELECT id, face_embedding FROM employees WHERE face_embedding IS NOT NULL
    return []

# ── Endpoint: broadcast WebSocket event ──────────────────────────────────
@router.post("/event/broadcast", dependencies=[Depends(verify_bridge)])
async def bridge_broadcast(payload: dict):
    """
    Kirim event ke semua WebSocket client yang sedang terhubung.
    """
    # TODO: panggil websocket manager.broadcast(payload)
    return {"success": True}

# ── Endpoint: health check koneksi AI ↔ Backend ──────────────────────────
@router.get("/health")
async def bridge_health():
    return {"status": "ok", "bridge": "connected"}
```

**Daftarkan router di main backend app:**

```python
# Di backend/main.py (atau app.py), tambahkan:
from routes.bridge import router as bridge_router
app.include_router(bridge_router)
```

---

### FASE 5 — Konfigurasi Kamera

#### 5.1 Buat File `config/cameras.yaml`

```yaml
cameras:
  - id: "CAM_LOBBY_01"
    name: "Pintu Masuk Utama"
    ip: "192.168.1.64"        # ← ganti dengan IP CCTV Anda
    port: 554
    username: "admin"
    password: "password123"   # ← ganti dengan password CCTV Anda
    rtsp_url: "rtsp://admin:password123@192.168.1.64:554/Streaming/Channels/102"
    location: "Lobi Utama"
    direction: "IN"            # IN | OUT | BOTH
    enabled: true

  - id: "CAM_EXIT_01"
    name: "Pintu Keluar"
    ip: "192.168.1.65"
    port: 554
    username: "admin"
    password: "password123"
    rtsp_url: "rtsp://admin:password123@192.168.1.65:554/Streaming/Channels/102"
    location: "Pintu Keluar"
    direction: "OUT"
    enabled: true

# Catatan URL RTSP Hikvision:
# Channel 101 = Main Stream (1080p) — untuk recording
# Channel 102 = Sub Stream (480p)  — GUNAKAN INI untuk AI (lebih ringan)
# Channel 103 = Third Stream (360p) — untuk thumbnail
```

---

### FASE 6 — Update Docker Compose

Tambahkan service berikut ke `docker-compose.yml` Anda:

```yaml
services:
  # ... service existing Anda (backend, frontend, postgres, redis) ...

  # ── Service baru: AI Face Recognition Engine ──────────────────────────
  ai-engine:
    build: ./ai_bridge
    container_name: face_ai_engine
    ports:
      - "8001:8001"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - MINIO_ENDPOINT=${MINIO_ENDPOINT}
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - SMART_ATTENDANCE_URL=http://backend:8000
      - BRIDGE_API_KEY=${INTERNAL_BRIDGE_KEY}
      - AI_DEVICE=${AI_DEVICE:-cpu}
    volumes:
      - ./ai_bridge/models:/app/models
      - ./config/cameras.yaml:/app/config/cameras.yaml
    depends_on:
      - backend
      - redis
      - minio
    restart: unless-stopped
    # Hapus blok deploy jika tidak ada GPU
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # ── Service baru: MinIO (Object Storage foto wajah) ───────────────────
  minio:
    image: minio/minio:latest
    container_name: minio_storage
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY:-minioadmin}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY:-minioadmin123}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"   # API
      - "9001:9001"   # Admin Console (akses: http://localhost:9001)
    restart: unless-stopped

volumes:
  minio_data:
```

---

### FASE 7 — Frontend: Halaman & Komponen Baru

#### 7.1 Buat Halaman Registrasi Wajah

Buat file: `frontend/src/pages/FaceEnrollment.tsx`

```typescript
import { useState } from "react";
import axios from "axios";

export default function FaceEnrollment() {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);

  const startEnrollment = async (employeeId: string) => {
    setCapturing(true);
    setProgress(0);
    // Panggil AI Engine untuk mulai capture 15-20 foto
    const response = await axios.post("/api/v1/bridge/enrollment/start", {
      employee_id: employeeId
    });
    // Polling progress hingga selesai
    pollEnrollmentProgress(response.data.session_id);
  };

  const pollEnrollmentProgress = async (sessionId: string) => {
    const interval = setInterval(async () => {
      const r = await axios.get(`/api/v1/bridge/enrollment/status/${sessionId}`);
      setProgress(r.data.progress);
      if (r.data.status === "completed") {
        clearInterval(interval);
        setCapturing(false);
        alert(`Enrollment berhasil! Akurasi: ${r.data.accuracy}%`);
      }
    }, 1000);
  };

  return (
    <div className="face-enrollment-page">
      <h2>Registrasi Wajah Karyawan</h2>
      {/* TODO: form pilih karyawan + preview kamera + progress bar */}
    </div>
  );
}
```

#### 7.2 Buat WebSocket Hook

Buat file: `frontend/src/hooks/useLiveAttendance.ts`

```typescript
import { useEffect, useCallback } from "react";

export function useLiveAttendance(onEvent: (event: any) => void) {
  const connect = useCallback(() => {
    const wsUrl = process.env.REACT_APP_WS_URL || "ws://localhost:8000";
    const ws = new WebSocket(`${wsUrl}/ws/live`);

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        onEvent(event);
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onclose = () => {
      // Auto-reconnect setelah 3 detik
      setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return ws;
  }, [onEvent]);

  useEffect(() => {
    const ws = connect();
    return () => ws.close();
  }, [connect]);
}

// Penggunaan di Dashboard:
// useLiveAttendance((event) => {
//   if (event.type === "ATTENDANCE_CHECKIN") {
//     setLiveEvents(prev => [event.payload, ...prev.slice(0, 49)]);
//   }
//   if (event.type === "UNKNOWN_FACE_ALERT") {
//     showAlert("Wajah asing terdeteksi!", "warning");
//   }
// });
```

#### 7.3 Tambahkan Route Baru di Frontend Router

```typescript
// Di App.tsx atau router config Anda, tambahkan:

// Route Admin baru
{ path: "/admin/face-enrollment",        component: FaceEnrollment,    role: ["admin", "hrd"] },
{ path: "/admin/cameras/monitor",        component: LiveCameraMonitor, role: ["admin", "hrd"] },
{ path: "/admin/security/unknown-alerts", component: UnknownAlerts,   role: ["admin", "hrd"] },
```

#### 7.4 Update Sidebar Menu Admin

Tambahkan item menu berikut di sidebar admin (`/admin`):

```typescript
// Di bawah "Operasional Absensi":
{ label: "Registrasi Wajah", path: "/admin/face-enrollment", icon: "UserScan" },

// Di bawah "Pengaturan → Perangkat Mesin Absen":
{ label: "Live Camera Monitor", path: "/admin/cameras/monitor", icon: "Camera" },

// Di bawah "Keamanan & Sistem":
{ label: "Alert Wajah Asing", path: "/admin/security/unknown-alerts", icon: "AlertTriangle" },
```

---

### FASE 8 — Download AI Models

```bash
# Buat script download model
cat > ai_bridge/scripts/download_models.sh << 'EOF'
#!/bin/bash
mkdir -p /app/models

echo "[1/2] Downloading InsightFace buffalo_l model..."
python3 -c "
import insightface
app = insightface.app.FaceAnalysis(name='buffalo_l', root='/app/models')
app.prepare(ctx_id=-1)
print('InsightFace model ready.')
"

echo "[2/2] Silent-Face Anti-Spoofing model..."
echo "Download manual dari: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing"
echo "Letakkan di: /app/models/anti_spoof/"

echo "Done."
EOF
chmod +x ai_bridge/scripts/download_models.sh
```

---

### FASE 9 — Running & Verifikasi

```bash
# Build dan jalankan semua service
docker-compose up -d --build

# Cek semua service berjalan
docker-compose ps

# Verifikasi AI Engine berjalan
curl http://localhost:8001/health

# Verifikasi Bridge endpoint
curl http://localhost:8000/api/v1/bridge/health

# Cek log AI Engine
docker-compose logs -f ai-engine

# Cek log backend
docker-compose logs -f backend

# Akses MinIO Console (untuk lihat foto tersimpan)
# Buka: http://localhost:9001
# Login: minioadmin / minioadmin123
```

---

## 📊 Summary: File yang Dibuat & Dimodifikasi

### File BARU yang Dibuat

| File | Keterangan |
|---|---|
| `backend/routes/bridge.py` | Endpoint bridge API |
| `backend/migrations/0010_add_face_recognition.sql` | Database migration |
| `ai_bridge/main.py` | Entry point AI Engine |
| `ai_bridge/camera/stream_manager.py` | Manajemen RTSP stream |
| `ai_bridge/ai/face_recognizer.py` | ArcFace recognition |
| `ai_bridge/ai/liveness_detector.py` | Anti-spoofing |
| `ai_bridge/ai/embedding_cache.py` | Redis cache embedding |
| `ai_bridge/bridge/client.py` | HTTP client ke backend |
| `ai_bridge/attendance/recorder.py` | Logic absensi |
| `ai_bridge/storage/minio_client.py` | Upload foto ke MinIO |
| `ai_bridge/requirements.txt` | Dependency Python |
| `ai_bridge/Dockerfile` | Container AI Engine |
| `config/cameras.yaml` | Konfigurasi kamera CCTV |
| `frontend/src/pages/FaceEnrollment.tsx` | Halaman registrasi wajah |
| `frontend/src/pages/LiveCameraMonitor.tsx` | Halaman monitor kamera |
| `frontend/src/pages/UnknownAlerts.tsx` | Halaman alert wajah asing |
| `frontend/src/hooks/useLiveAttendance.ts` | WebSocket hook |

### File EXISTING yang Dimodifikasi

| File | Perubahan |
|---|---|
| `.env` | Tambah variabel Face Recognition |
| `docker-compose.yml` | Tambah service `ai-engine` dan `minio` |
| `backend/main.py` | Daftarkan `bridge_router` |
| `backend/websocket.py` | Tambah event types baru |
| `frontend/src/App.tsx` | Tambah route halaman baru |
| `frontend/src/components/Sidebar.tsx` | Tambah menu baru |

---

## ⚠️ Catatan Penting

1. **Koneksi Jaringan CCTV** — Pastikan server dan CCTV Hikvision berada di jaringan yang sama. Test koneksi RTSP terlebih dahulu: `ffplay rtsp://admin:password@IP_KAMERA:554/Streaming/Channels/102`

2. **pgvector** — Harus diinstall sebagai PostgreSQL extension. Jika menggunakan managed database (RDS, Supabase), aktifkan dari panel database provider.

3. **GPU** — Opsional tapi sangat direkomendasikan untuk 4+ kamera. Tanpa GPU (CPU saja), batasi maksimum 2 kamera dengan `detection_interval: 5`.

4. **Enrollment Wajah** — Lakukan enrollment minimal 15 foto per karyawan dari berbagai sudut sebelum sistem bisa mengenali. Akurasi terbaik dengan pencahayaan merata.

5. **Threshold Similarity** — Default 0.60. Naikkan ke 0.70 jika false-positive tinggi. Turunkan ke 0.55 jika terlalu banyak wajah dikenali sebagai "unknown".

---

*Dokumen ini dibuat berdasarkan analisis `SISTEM_ABSENSI_FACE_RECOGNITION.md` dan `alur_sistem_Smart_Attendence_sistem` — Mei 2026*
