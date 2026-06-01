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
        self.cameras = {}
        self.frame_queues = {}
        self._running = True

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
                self.add_camera(cam["id"], cam["rtspUrl"], cam.get("direction", "BOTH"))

    def add_camera(self, cam_id: str, rtsp_url: str, direction: str = "BOTH"):
        cap = cv2.VideoCapture(rtsp_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cameras[cam_id] = {
            "cap": cap,
            "rtsp_url": rtsp_url,
            "direction": direction,
            "connected": cap.isOpened()
        }
        self.frame_queues[cam_id] = Queue(maxsize=5)
        t = threading.Thread(target=self._capture_loop, args=(cam_id,), daemon=True)
        t.start()
        print(f"[Camera] Started stream for {cam_id} (dir={direction})")

    def _capture_loop(self, cam_id: str):
        frame_count = 0
        while self._running:
            try:
                ret, frame = self.cameras[cam_id]["cap"].read()
                if ret:
                    frame_count += 1
                    # Process every 3rd frame for efficiency
                    if frame_count % 3 == 0:
                        if not self.frame_queues[cam_id].full():
                            self.frame_queues[cam_id].put(frame)
                    
                    # Cache frame and encode to JPEG once to save CPU for streaming
                    ret_jpeg, jpeg = cv2.imencode('.jpg', frame)
                    if ret_jpeg:
                        self.cameras[cam_id]["latest_jpeg"] = jpeg.tobytes()
                    
                    self.cameras[cam_id]["connected"] = True
                else:
                    self.cameras[cam_id]["connected"] = False
                    self.cameras[cam_id]["latest_jpeg"] = None
                    self._reconnect(cam_id)
            except Exception as e:
                print(f"[Camera {cam_id}] Capture error: {e}")
                self.cameras[cam_id]["latest_jpeg"] = None
                self._reconnect(cam_id)

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
