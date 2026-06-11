"""
Hikvision CCTV RTSP Stream Manager
Manages multiple camera feeds with auto-reconnection.
"""
import cv2
import threading
import asyncio
import yaml
from queue import Queue, Empty


class HikvisionStreamManager:
    def __init__(self):
        import os
        self.cameras = {}
        self.frame_queues = {}
        self._running = True
        self.frame_skip = int(os.getenv("FRAME_SKIP", "10"))

    def load_from_config_sync(self, config_path: str):
        with open(config_path) as f:
            config = yaml.safe_load(f)
        for cam in config.get("cameras", []):
            if cam.get("enabled", True):
                self.add_camera(cam["id"], cam["rtsp_url"], cam.get("direction", "BOTH"))

    async def load_from_config(self, config_path: str):
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.load_from_config_sync, config_path)

    def load_from_api(self, cameras_list: list):
        """Memuat kamera dari respons HTTP API Smart Attendance"""
        for cam in cameras_list:
            if cam.get("active", True) and cam.get("rtspUrl"):
                self.add_camera(cam["id"], cam["rtspUrl"], cam.get("direction", "BOTH"), cam.get("detectUnknown", True))

    def add_camera(self, cam_id: str, rtsp_url: str, direction: str = "BOTH", detect_unknown: bool = True):
        cap = cv2.VideoCapture(rtsp_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cameras[cam_id] = {
            "cap": cap,
            "rtsp_url": rtsp_url,
            "direction": direction,
            "detect_unknown": detect_unknown,
            "connected": cap.isOpened(),
            "active_detections": [],
            "viewers": 0
        }
        self.frame_queues[cam_id] = Queue(maxsize=5)
        t = threading.Thread(target=self._capture_loop, args=(cam_id,), daemon=True)
        t.start()
        print(f"[Camera] Started stream for {cam_id} (dir={direction}, skip={self.frame_skip})")

    def increment_viewers(self, cam_id: str):
        if cam_id in self.cameras:
            self.cameras[cam_id]["viewers"] = self.cameras[cam_id].get("viewers", 0) + 1

    def decrement_viewers(self, cam_id: str):
        if cam_id in self.cameras:
            self.cameras[cam_id]["viewers"] = max(0, self.cameras[cam_id].get("viewers", 0) - 1)

    def _capture_loop(self, cam_id: str):
        frame_count = 0
        consecutive_failures = 0
        import time
        while self._running:
            try:
                ret, frame = self.cameras[cam_id]["cap"].read()
                if ret:
                    consecutive_failures = 0
                    frame_count += 1
                    
                    # Process every Nth frame for AI recognition
                    if frame_count % self.frame_skip == 0:
                        # Convert to gray and blur for noise reduction
                        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        gray = cv2.GaussianBlur(gray, (21, 21), 0)
                        
                        has_motion = True
                        prev_gray = self.cameras[cam_id].get("prev_gray")
                        if prev_gray is not None:
                            # Check size compatibility (in case of dynamic stream resolution changes)
                            if prev_gray.shape == gray.shape:
                                # Calculate absolute difference
                                frame_delta = cv2.absdiff(prev_gray, gray)
                                thresh = cv2.threshold(frame_delta, 20, 255, cv2.THRESH_BINARY)[1]
                                motion_pixels = cv2.countNonZero(thresh)
                                total_pixels = gray.shape[0] * gray.shape[1]
                                motion_ratio = motion_pixels / total_pixels
                                
                                # If motion is below 0.3% of the frame area, skip AI processing
                                if motion_ratio < 0.003:
                                    has_motion = False
                        
                        self.cameras[cam_id]["prev_gray"] = gray
                        
                        if has_motion:
                            if not self.frame_queues[cam_id].full():
                                self.frame_queues[cam_id].put(frame)
                    
                    # Draw and encode to JPEG only if there are active viewers
                    viewers = self.cameras[cam_id].get("viewers", 0)
                    now = time.time()
                    
                    if viewers > 0:
                        # Limit JPEG encoding rate to ~12.5 FPS (every 0.08 seconds) to save CPU
                        if now - self.cameras[cam_id].get("last_jpeg_time", 0) >= 0.08:
                            active_detections = self.cameras[cam_id].get("active_detections", [])
                            active_detections = [d for d in active_detections if now - d["timestamp"] < 0.6]
                            self.cameras[cam_id]["active_detections"] = active_detections
                            
                            draw_frame = frame
                            roi_box = self.cameras[cam_id].get("roi_box")
                            if active_detections or roi_box:
                                draw_frame = frame.copy()
                                
                                # Draw ROI Box (Scanning boundary)
                                if roi_box:
                                    rx1, ry1, rx2, ry2 = roi_box
                                    cv2.rectangle(draw_frame, (rx1, ry1), (rx2, ry2), (180, 180, 180), 1, cv2.LINE_AA)
                                    cv2.putText(draw_frame, "DETECTION ZONE", (rx1 + 8, ry1 + 18),
                                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1, cv2.LINE_AA)
                                
                                # Draw Active Face Detections
                                if active_detections:
                                    for d in active_detections:
                                        x1, y1, x2, y2 = d["bbox"]
                                        color = d.get("color", (0, 255, 0)) # Default green
                                        name = d.get("name", "Unknown")
                                        cv2.rectangle(draw_frame, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
                                        cv2.putText(draw_frame, name, (x1, y1 - 10),
                                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA)
                            
                            ret_jpeg, jpeg = cv2.imencode('.jpg', draw_frame)
                            if ret_jpeg:
                                self.cameras[cam_id]["latest_jpeg"] = jpeg.tobytes()
                                self.cameras[cam_id]["last_jpeg_time"] = now
                    else:
                        # Clear latest_jpeg to free memory when no one is watching
                        if "latest_jpeg" in self.cameras[cam_id]:
                            self.cameras[cam_id]["latest_jpeg"] = None
                    
                    self.cameras[cam_id]["connected"] = True
                else:
                    consecutive_failures += 1
                    # Sleep briefly to not spin CPU on failures
                    time.sleep(0.01)
                    
                    if consecutive_failures >= 30: # Tolerates brief frame loss (~1 second)
                        print(f"[Camera {cam_id}] Stream disconnected (30 consecutive frame failures). Reconnecting...")
                        self.cameras[cam_id]["connected"] = False
                        self.cameras[cam_id]["latest_jpeg"] = None
                        self._reconnect(cam_id)
                        consecutive_failures = 0
            except Exception as e:
                consecutive_failures += 1
                time.sleep(0.1)
                if consecutive_failures >= 10:
                    print(f"[Camera {cam_id}] Capture exception: {e}. Reconnecting...")
                    self.cameras[cam_id]["connected"] = False
                    self.cameras[cam_id]["latest_jpeg"] = None
                    self._reconnect(cam_id)
                    consecutive_failures = 0

    def _reconnect(self, cam_id: str):
        import time
        print(f"[Camera {cam_id}] Reconnecting in 5s...")
        time.sleep(5)
        rtsp_url = self.cameras[cam_id]["rtsp_url"]
        old_cap = self.cameras[cam_id]["cap"]
        if old_cap:
            old_cap.release()
        self.cameras[cam_id]["cap"] = cv2.VideoCapture(rtsp_url)
        self.cameras[cam_id]["cap"].set(cv2.CAP_PROP_BUFFERSIZE, 1)

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

    def get_latest_jpeg(self, cam_id: str):
        """Mengambil byte JPEG terbaru secara thread-safe"""
        if cam_id in self.cameras:
            return self.cameras[cam_id].get("latest_jpeg")
        return None


    def get_status(self):
        return {
            "cameras": {
                cam_id: {
                    "connected": data.get("connected", False),
                    "direction": data.get("direction", "BOTH"),
                    "queue_size": self.frame_queues.get(cam_id, Queue()).qsize()
                }
                for cam_id, data in self.cameras.items()
            }
        }

    def stop_all(self):
        self._running = False
        for cam_id, cam_data in self.cameras.items():
            try:
                cam_data["cap"].release()
                print(f"[Camera] Released {cam_id}")
            except:
                pass
