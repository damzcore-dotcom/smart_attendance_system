"""
Face Recognition AI Engine - Main Entry Point
Microservice yang berdiri sendiri, berkomunikasi dengan Smart Attendance Backend
via HTTP Bridge API.
"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import os

from camera.stream_manager import HikvisionStreamManager
from ai.face_detector import FaceDetector
from ai.face_recognizer import FaceRecognizer
from ai.liveness_detector import LivenessDetector
from ai.embedding_cache import EmbeddingCache
from attendance.recorder import AttendanceRecorder
from bridge.client import BridgeClient
from storage.minio_client import MinioStorage

# ── Global instances ─────────────────────────────────────────────────────
stream_manager = None
recorder = None
face_recognizer = None
face_detector = None
liveness_detector = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global stream_manager, recorder, face_recognizer, face_detector, liveness_detector

    print("[AI Engine] Starting up...")

    # Initialize components
    bridge = BridgeClient(
        base_url=os.getenv("SMART_ATTENDANCE_URL", "http://localhost:5000"),
        api_key=os.getenv("BRIDGE_API_KEY", "")
    )
    cache = EmbeddingCache(redis_url=os.getenv("REDIS_URL", "redis://localhost:6379"))
    storage = MinioStorage()
    face_detector = FaceDetector()
    face_recognizer = FaceRecognizer(device=os.getenv("AI_DEVICE", "cpu"))
    liveness_detector = LivenessDetector()
    recorder = AttendanceRecorder(bridge=bridge, cache=cache, storage=storage)

    # Load embeddings from DB to Redis cache
    try:
        await cache.reload_from_db(bridge)
    except Exception as e:
        print(f"[AI Engine] Warning: Could not load embeddings from DB: {e}")

    # Initialize camera streams
    stream_manager = HikvisionStreamManager()
    
    try:
        # Coba ambil kamera dari Database via Node.js API
        api_cameras = await bridge.get_cameras()
        if api_cameras and len(api_cameras) > 0:
            stream_manager.load_from_api(api_cameras)
            print(f"[AI Engine] Loaded {len(stream_manager.get_active_cameras())} cameras successfully from DB")
        else:
            # Fallback ke YAML jika kosong / gagal
            config_path = os.getenv("CAMERA_CONFIG", "/app/config/cameras.yaml")
            if os.path.exists(config_path):
                await stream_manager.load_from_config(config_path)
                print(f"[AI Engine] Loaded cameras from fallback config {config_path}")
            else:
                print("[AI Engine] No camera config found, running in API-only mode")
                
        # Start frame processing loop if there are cameras
        if len(stream_manager.get_active_cameras()) > 0:
            asyncio.create_task(
                process_frames_loop(stream_manager, face_detector, face_recognizer, liveness_detector, recorder)
            )
            print(f"[AI Engine] Camera processing started!")
            
    except Exception as e:
        print(f"[AI Engine] Failed to initialize camera streams: {e}")

    print("[AI Engine] Ready!")
    yield

    # Cleanup
    if stream_manager:
        stream_manager.stop_all()
    print("[AI Engine] Shut down.")


app = FastAPI(
    title="Face Recognition AI Engine",
    description="Microservice for CCTV-based face recognition in Smart Attendance",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health Check ─────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ai-engine",
        "cameras": len(stream_manager.get_active_cameras()) if stream_manager else 0
    }


# ── Camera Status ────────────────────────────────────────────────────────
@app.get("/cameras/status")
async def cameras_status():
    if not stream_manager:
        return {"cameras": {}}
    return stream_manager.get_status()


# ── Enrollment: Extract embedding from uploaded image ────────────────────
@app.post("/enroll")
async def enroll_face(employee_id: int, file: UploadFile = File(...)):
    """
    Receive a face photo, extract embedding, return 512-dim vector.
    The Smart Attendance backend will store this in DB.
    """
    import numpy as np
    import cv2

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    # Detect face
    faces = face_detector.detect(frame)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected in image")

    face = faces[0]

    # Check liveness
    liveness_result = liveness_detector.check(face["region"])
    if liveness_result.get("is_real") is False:
        raise HTTPException(status_code=403, detail="Liveness spoofing terdeteksi (Wajah palsu/foto tidak diizinkan)")

    # Extract embedding
    embedding = face_recognizer.get_embedding(face["aligned"])
    if embedding is None:
        raise HTTPException(status_code=400, detail="Could not extract face embedding")

    return {
        "success": True,
        "employee_id": employee_id,
        "embedding": embedding.tolist(),
        "embedding_dim": len(embedding),
        "liveness": liveness_result,
        "face_quality": float(face.get("det_score", 0))
    }


# ── Recognize: Match a face against all embeddings ───────────────────────
@app.post("/recognize")
async def recognize_face(file: UploadFile = File(...)):
    """
    Receive a face photo, match against all enrolled employees.
    """
    import numpy as np
    import cv2

    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    faces = face_detector.detect(frame)
    if not faces:
        raise HTTPException(status_code=400, detail="No face detected")

    face = faces[0]
    embedding = face_recognizer.get_embedding(face["aligned"])
    if embedding is None:
        raise HTTPException(status_code=400, detail="Could not extract embedding")

    # Match against cache
    all_embeddings = await recorder.cache.get_all()
    threshold = float(os.getenv("MIN_RECOGNITION_SCORE", "0.60"))
    match = face_recognizer.match(embedding, all_embeddings, threshold=threshold)

    if match:
        return {
            "success": True,
            "matched": True,
            "employee_id": match["employee_id"],
            "similarity": match["similarity"]
        }
    else:
        return {
            "success": True,
            "matched": False,
            "message": "No matching employee found"
        }


# ── Reload embeddings cache ─────────────────────────────────────────────
@app.post("/cache/reload")
async def reload_cache():
    """Force reload all embeddings from DB to Redis cache."""
    try:
        await recorder.cache.reload_from_db(recorder.bridge)
        count = len(await recorder.cache.get_all())
        return {"success": True, "cached_embeddings": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Main Processing Loop ────────────────────────────────────────────────
async def process_frames_loop(stream_manager, detector, recognizer, liveness, recorder):
    """Main loop: grab frames from all cameras, detect + recognize faces."""
    threshold = float(os.getenv("MIN_RECOGNITION_SCORE", "0.60"))

    while True:
        for cam_id in stream_manager.get_active_cameras():
            try:
                frame = await stream_manager.get_frame_async(cam_id)
                if frame is None:
                    continue

                faces = detector.detect(frame)
                for face in faces:
                    # Check liveness
                    liveness_result = liveness.check(face["region"])
                    if not liveness_result["is_real"]:
                        # Log spoof attempt
                        await recorder.record_spoof(cam_id, face["region"])
                        continue

                    # Extract embedding
                    embedding = recognizer.get_embedding(face["aligned"])
                    if embedding is None:
                        continue

                    # Match against database
                    all_embeddings = await recorder.cache.get_all()
                    match = recognizer.match(embedding, all_embeddings, threshold=threshold)

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
                print(f"[{cam_id}] Processing error: {e}")

        await asyncio.sleep(0.1)
