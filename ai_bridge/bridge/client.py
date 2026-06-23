"""
Bridge Client - HTTP client to communicate with Smart Attendance Backend.
All attendance records and employee data are synchronized through this client.
"""
import httpx
from datetime import datetime


class BridgeClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "X-Bridge-Key": api_key,
            "Content-Type": "application/json"
        }

    async def get_employee(self, employee_id: str) -> dict:
        """Get employee data + active shift from Smart Attendance backend."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/bridge/employee/{employee_id}",
                headers=self.headers,
                timeout=5.0
            )
            r.raise_for_status()
            return r.json().get("data", {})

    async def post_checkin(self, record: dict) -> dict:
        """Post an attendance check-in/out record from CCTV recognition."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/bridge/checkin",
                headers=self.headers,
                json=record,
                timeout=5.0
            )
            r.raise_for_status()
            return r.json()

    async def post_face_event(self, event: dict) -> dict:
        """Post a raw face event log (for audit trail)."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/bridge/face-event",
                headers=self.headers,
                json=event,
                timeout=5.0
            )
            r.raise_for_status()
            return r.json()

    async def post_unknown_alert(self, payload: dict) -> dict:
        """Post an unknown face alert to the backend."""
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/api/bridge/alert/unknown",
                headers=self.headers,
                json=payload,
                timeout=5.0
            )
            r.raise_for_status()
            return r.json()

    async def get_all_embeddings(self) -> list:
        """Get all employees that have face embeddings enrolled."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/api/bridge/embeddings",
                headers=self.headers,
                timeout=10.0
            )
            r.raise_for_status()
            return r.json().get("data", [])

    async def get_cameras(self) -> list:
        """Get all active cameras from Smart Attendance frontend/DB."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/api/bridge/cameras",
                    headers=self.headers,
                    timeout=5.0
                )
                if r.status_code == 200:
                    return r.json().get("data", [])
                return []
        except Exception:
            return []

    async def broadcast_event(self, event: dict):
        """Broadcast a real-time event to the backend (for WebSocket relay)."""
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.base_url}/api/bridge/event/broadcast",
                    headers=self.headers,
                    json=event,
                    timeout=3.0
                )
        except Exception as e:
            print(f"[BridgeClient] Broadcast error (non-fatal): {e}")

    async def health_check(self) -> bool:
        """Check if the Smart Attendance backend is reachable."""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/api/bridge/health",
                    headers=self.headers,
                    timeout=3.0
                )
                return r.status_code == 200
        except:
            return False
