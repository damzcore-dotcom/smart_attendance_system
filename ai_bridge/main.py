"""
Face Recognition AI Engine - Main Entry Point
Microservice yang berdiri sendiri, berkomunikasi dengan Smart Attendance Backend
via HTTP Bridge API.
"""
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
import asyncio
import os

# Force TCP transport and 5-second socket timeout (5,000,000 microseconds) globally
# for all OpenCV/FFmpeg RTSP camera connections. This prevents offline cameras
# from hanging startup/reconnection threads and blocking other threads.
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"

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

# CORS configuration: Allow all origins because AI Engine is accessed via dynamic LAN and public IPs.
# Since it does not use cookies/sessions, allow_credentials is set to False.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
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


# ── Camera Stream (MJPEG) ────────────────────────────────────────────────
async def frame_generator(cam_id: str):
    """Generator asinkron untuk mengalirkan frame JPEG sebagai MJPEG"""
    if stream_manager:
        stream_manager.increment_viewers(cam_id)
    try:
        while True:
            if not stream_manager:
                await asyncio.sleep(0.1)
                continue
            
            jpeg_bytes = stream_manager.get_latest_jpeg(cam_id)
            if jpeg_bytes is None:
                await asyncio.sleep(0.1)
                continue
                
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
            
            # Batasi rate streaming ~15 FPS agar ramah bandwidth internet publik
            await asyncio.sleep(0.06)
    finally:
        if stream_manager:
            stream_manager.decrement_viewers(cam_id)


@app.get("/cameras/{cam_id}/stream")
async def stream_camera(cam_id: str):
    """Endpoint untuk live stream MJPEG kamera CCTV"""
    if not stream_manager or cam_id not in stream_manager.get_active_cameras():
        raise HTTPException(status_code=404, detail="Kamera tidak ditemukan atau non-aktif")
        
    return StreamingResponse(
        frame_generator(cam_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )




# ── Test Camera RTSP Connection ──────────────────────────────────────────
@app.post("/cameras/test")
async def test_camera(payload: dict):
    """
    Test connection to a camera RTSP URL using OpenCV in a separate subprocess
    to avoid GIL, global locks, and threading issues.
    """
    rtsp_url = payload.get("rtspUrl")
    if not rtsp_url:
        raise HTTPException(status_code=400, detail="rtspUrl is required")

    import subprocess
    import sys

    # Python script code to run in subprocess
    script_code = f"""
import cv2
import os
import sys

# Force TCP and 5s timeout
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;5000000"

url = {repr(rtsp_url)}
try:
    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        print("FAIL:Tidak dapat membuka stream RTSP. Periksa host, port, username, password, atau tipe stream.")
        sys.exit(0)
    
    ret, frame = cap.read()
    cap.release()
    
    if not ret:
        print("FAIL:Koneksi berhasil terhubung, namun video stream tidak menghasilkan frame.")
    else:
        print("SUCCESS:Koneksi berhasil dan stream video aktif!")
except Exception as e:
    print("FAIL:Terjadi kesalahan saat menghubungi kamera: " + str(e))
sys.exit(0)
"""

    try:
        # Run subprocess with a 10 second timeout
        proc = subprocess.run(
            [sys.executable, "-c", script_code],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        output = proc.stdout.strip()
        if output.startswith("SUCCESS:"):
            return {"success": True, "message": output.split("SUCCESS:")[1]}
        elif output.startswith("FAIL:"):
            return {"success": False, "message": output.split("FAIL:")[1]}
        else:
            err_msg = proc.stderr.strip() or output or "Unknown subprocess error"
            return {"success": False, "message": f"Gagal menguji koneksi: {err_msg}"}
            
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "Uji koneksi waktu habis (Timeout 10 detik)."}
    except Exception as e:
        return {"success": False, "message": f"Terjadi kesalahan internal: {str(e)}"}


# ── Get and Set Detection Zone ROIs ──────────────────────────────────────
@app.get("/cameras/rois")
async def get_camera_rois():
    """Get all ROI configurations."""
    rois = load_rois()
    return {"success": True, "rois": rois}


@app.post("/cameras/rois")
async def update_camera_rois(payload: dict):
    """Update ROI configuration and save to rois.yaml."""
    rois_path = "/app/config/rois.yaml"
    if not os.path.exists(rois_path):
        rois_path = os.path.join(os.path.dirname(__file__), "config", "rois.yaml")
        
    try:
        import yaml
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(rois_path), exist_ok=True)
        
        # Read existing or start with empty
        existing = {}
        if os.path.exists(rois_path):
            with open(rois_path) as f:
                existing = yaml.safe_load(f) or {}
                
        # Update configs from payload
        for cam_id, config in payload.items():
            if isinstance(config, dict) and "roi" in config:
                existing[cam_id] = config
            elif isinstance(config, list):
                existing[cam_id] = {"roi": config}
                
        with open(rois_path, "w") as f:
            yaml.safe_dump(existing, f)
            
        return {"success": True, "message": "Konfigurasi ROI berhasil disimpan!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan konfigurasi ROI: {str(e)}")


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


# ── Load ROI configurations from file ────────────────────────────────────
def load_rois() -> dict:
    """Load ROI mapping from config/rois.yaml if it exists."""
    rois_path = "/app/config/rois.yaml"
    if not os.path.exists(rois_path):
        rois_path = os.path.join(os.path.dirname(__file__), "config", "rois.yaml")
        
    if os.path.exists(rois_path):
        try:
            import yaml
            with open(rois_path) as f:
                data = yaml.safe_load(f)
                return data if isinstance(data, dict) else {}
        except Exception as e:
            print(f"[AI Engine] Error loading ROIs: {e}")
    return {}


# ── Main Processing Loop ────────────────────────────────────────────────
async def process_frames_loop(stream_manager, detector, recognizer, liveness, recorder):
    """Main loop: grab frames from all cameras, detect + recognize faces."""
    threshold = float(os.getenv("MIN_RECOGNITION_SCORE", "0.60"))
    liveness_enabled = os.getenv("LIVENESS_ENABLED", "false").lower() == "true"
    import time

    rois = load_rois()
    last_roi_load = time.time()

    while True:
        # Reload ROI configurations every 10 seconds
        now_time = time.time()
        if now_time - last_roi_load > 10.0:
            rois = load_rois()
            last_roi_load = now_time

        for cam_id in stream_manager.get_active_cameras():
            try:
                frame = await stream_manager.get_frame_async(cam_id)
                if frame is None:
                    continue

                # Handle ROI (Region of Interest / Detection Zone)
                cam_roi = rois.get(cam_id, {}).get("roi")
                h, w = frame.shape[:2]
                x1, y1, x2, y2 = 0, 0, w, h

                if cam_roi and len(cam_roi) == 4:
                    ymin, xmin, ymax, xmax = cam_roi
                    x1 = max(0, int(xmin * w))
                    y1 = max(0, int(ymin * h))
                    x2 = min(w, int(xmax * w))
                    y2 = min(h, int(ymax * h))

                # Crop to detection zone if it restricts the frame
                if y1 > 0 or x1 > 0 or y2 < h or x2 < w:
                    if cam_id in stream_manager.cameras:
                        stream_manager.cameras[cam_id]["roi_box"] = [x1, y1, x2, y2]
                    roi_frame = frame[y1:y2, x1:x2].copy()
                else:
                    if cam_id in stream_manager.cameras:
                        stream_manager.cameras[cam_id]["roi_box"] = None
                    roi_frame = frame

                # Detect faces only in the ROI frame
                faces = detector.detect(roi_frame)
                active_detections = []

                for face in faces:
                    is_real = True
                    if liveness_enabled:
                        liveness_result = liveness.check(face["region"])
                        is_real = liveness_result.get("is_real", True)

                    name = "Unknown"
                    color = (0, 255, 255)  # BGR: Yellow for Unknown

                    if not is_real:
                        name = "SPOOF DETECTED"
                        color = (0, 0, 255)  # BGR: Red for spoof
                        # Log spoof attempt
                        await recorder.record_spoof(cam_id, face["region"])
                        
                        bbox = face["bbox"]
                        face["bbox"] = [bbox[0] + x1, bbox[1] + y1, bbox[2] + x1, bbox[3] + y1]
                        active_detections.append({
                            "bbox": face["bbox"],
                            "color": color,
                            "name": name,
                            "timestamp": time.time()
                        })
                    else:
                        # Extract embedding
                        embedding = recognizer.get_embedding(face["aligned"])
                        if embedding is not None:
                            # Match against database
                            all_embeddings = await recorder.cache.get_all()
                            match = recognizer.match(embedding, all_embeddings, threshold=threshold)

                            if match:
                                emp_id = match["employee_id"]
                                db_name = await recorder.cache.get_name(str(emp_id))
                                name = db_name if db_name else f"Employee {emp_id}"
                                color = (0, 255, 0)  # BGR: Green for match
                                
                                await recorder.record(
                                    employee_id=str(emp_id),
                                    camera_id=cam_id,
                                    face_snapshot=face["region"],
                                    similarity=match["similarity"]
                                )
                                bbox = face["bbox"]
                                face["bbox"] = [bbox[0] + x1, bbox[1] + y1, bbox[2] + x1, bbox[3] + y1]
                                active_detections.append({
                                    "bbox": face["bbox"],
                                    "color": color,
                                    "name": name,
                                    "timestamp": time.time()
                                })
                            else:
                                detect_unknown = stream_manager.cameras.get(cam_id, {}).get("detect_unknown", True)
                                if detect_unknown:
                                    await recorder.record_unknown(cam_id, face["region"])
                                    bbox = face["bbox"]
                                    face["bbox"] = [bbox[0] + x1, bbox[1] + y1, bbox[2] + x1, bbox[3] + y1]
                                    active_detections.append({
                                        "bbox": face["bbox"],
                                        "color": color,
                                        "name": name,
                                        "timestamp": time.time()
                                    })

                if cam_id in stream_manager.cameras:
                    stream_manager.cameras[cam_id]["active_detections"] = active_detections

            except Exception as e:
                print(f"[{cam_id}] Processing error: {e}")

        await asyncio.sleep(0.1)
