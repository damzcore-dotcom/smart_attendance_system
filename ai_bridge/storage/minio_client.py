"""
MinIO Object Storage Client
Handles uploading face snapshots for attendance records and unknown alerts.
"""
from minio import Minio
from io import BytesIO
import cv2
import numpy as np
from datetime import datetime
import os


class MinioStorage:
    def __init__(self):
        self.client = Minio(
            f"{os.getenv('MINIO_ENDPOINT', 'localhost')}:{os.getenv('MINIO_PORT', '9000')}",
            access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin123"),
            secure=False
        )
        self._ensure_buckets()

    def _ensure_buckets(self):
        """Create required buckets if they don't exist."""
        for bucket in ["face-snapshots", "unknown-faces"]:
            try:
                if not self.client.bucket_exists(bucket):
                    self.client.make_bucket(bucket)
                    print(f"[MinIO] Created bucket: {bucket}")
            except Exception as e:
                print(f"[MinIO] Warning: Could not ensure bucket '{bucket}': {e}")

    def _frame_to_bytes(self, frame: np.ndarray) -> bytes:
        """Convert OpenCV frame to JPEG bytes."""
        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes()

    async def upload_snapshot(self, employee_id: str, frame: np.ndarray, timestamp: datetime) -> str:
        """
        Upload an attendance face snapshot.
        Returns the object path for reference.
        """
        try:
            data = self._frame_to_bytes(frame)
            key = f"{employee_id}/{timestamp.strftime('%Y%m%d_%H%M%S')}.jpg"
            self.client.put_object(
                "face-snapshots", key, BytesIO(data), len(data), "image/jpeg"
            )
            return f"face-snapshots/{key}"
        except Exception as e:
            print(f"[MinIO] Upload snapshot error: {e}")
            return ""

    async def upload_unknown(self, frame: np.ndarray, timestamp: datetime) -> str:
        """
        Upload an unknown face snapshot.
        Returns the object path for reference.
        """
        try:
            data = self._frame_to_bytes(frame)
            key = f"unknown/{timestamp.strftime('%Y%m%d_%H%M%S_%f')}.jpg"
            self.client.put_object(
                "unknown-faces", key, BytesIO(data), len(data), "image/jpeg"
            )
            return f"unknown-faces/{key}"
        except Exception as e:
            print(f"[MinIO] Upload unknown error: {e}")
            return ""

    def get_url(self, object_path: str) -> str:
        """Get a presigned URL for an object (valid for 7 days)."""
        try:
            bucket, key = object_path.split("/", 1)
            from datetime import timedelta
            url = self.client.presigned_get_object(bucket, key, expires=timedelta(days=7))
            return url
        except Exception as e:
            print(f"[MinIO] Get URL error: {e}")
            return ""
