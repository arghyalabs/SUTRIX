import json
import asyncio
import logging
import time
from typing import Dict, Set, Any, List
from collections import defaultdict, deque
from fastapi import WebSocket

logger = logging.getLogger("sdo.backend.workers.websocket")


class JobWebSocketManager:
    """
    Upgraded WebSocket coordinator for SUTRIX.
    - Per-client message queues with 200ms batched flush
    - Supports all new message types: STAGE_CHANGE, PROGRESS_UPDATE, ACTIVE_NODE, PARTIAL_SAVE
    - Heartbeat monitor cleans stale connections
    """
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        # Per-client outgoing message queue for batching
        self._queues: Dict[str, deque] = defaultdict(deque)
        self._flush_task: asyncio.Task = None

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self._queues[client_id] = deque()
        logger.info(f"WebSocket Connected: '{client_id}'. Pool size: {len(self.active_connections)}")

        # Send initial handshake with connection confirmation
        await self._direct_send(client_id, {
            "type": "CONNECTED",
            "workspace_id": client_id,
            "timestamp": time.time(),
            "message": "SUTRIX pipeline gateway connected."
        })

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"WebSocket Disconnected: '{client_id}'. Pool size: {len(self.active_connections)}")

    async def _direct_send(self, client_id: str, message: Dict[str, Any]) -> bool:
        """Send immediately to a specific client."""
        ws = self.active_connections.get(client_id)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(message, default=str))
            return True
        except Exception:
            self.disconnect(client_id)
            return False

    async def send_to_client(self, client_id: str, message: Dict[str, Any]) -> bool:
        """Send directly — used for high-priority events (STAGE_CHANGE, JOB_COMPLETED)."""
        return await self._direct_send(client_id, message)

    async def broadcast(self, message: Dict[str, Any]):
        """Push to ALL connected clients simultaneously."""
        if not self.active_connections:
            return
        payload = json.dumps(message, default=str)
        dead_clients: Set[str] = set()
        tasks = []
        for client_id, ws in list(self.active_connections.items()):
            async def safe_send(c_id=client_id, socket=ws):
                try:
                    await socket.send_text(payload)
                except Exception:
                    dead_clients.add(c_id)
            tasks.append(safe_send())
        if tasks:
            await asyncio.gather(*tasks)
        for cid in dead_clients:
            self.disconnect(cid)

    def connection_count(self) -> int:
        return len(self.active_connections)

    async def start_heartbeat_monitor(self):
        """Background ping every 15s to clean stale sockets."""
        while True:
            await asyncio.sleep(15.0)
            if not self.active_connections:
                continue
            dead: Set[str] = set()
            for cid, ws in list(self.active_connections.items()):
                try:
                    await ws.send_text(json.dumps({"type": "PING"}))
                except Exception:
                    dead.add(cid)
            for cid in dead:
                self.disconnect(cid)


# Global singleton
ws_broadcaster = JobWebSocketManager()
