"""WebRTC signaling relay.

Thin JSON pipe between the two peers in a room. We only support a 1:1 call
(one patient, one clinician per room). The server forwards messages to the other peer.

Message envelope (JSON text frames):
    { "type": "offer" | "answer" | "ice", ...payload }

Server-originated notifications to each peer:
    { "type": "peer-joined", "peer": "patient"|"clinician" }
    { "type": "peer-left", "peer": "patient"|"clinician" }
    { "type": "role-assigned", "role": "patient"|"clinician" }
    { "type": "ready", "role": "patient"|"clinician", "peer": "patient"|"clinician"|null }
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.rooms import rooms as rooms_mgr

logger = logging.getLogger("truevoice.signal")

_VALID_ROLES = frozenset({"patient", "clinician"})
_OTHER = {"patient": "clinician", "clinician": "patient"}

router = APIRouter()


async def _safe_send_json(ws: WebSocket, payload: dict) -> bool:
    try:
        if ws.client_state == WebSocketState.CONNECTED:
            await ws.send_json(payload)
            return True
        return False
    except Exception:
        return False


@router.websocket("/ws/signal/{role}/{room_id}")
async def signal_relay(ws: WebSocket, role: str, room_id: str) -> None:
    await ws.accept()

    role = (role or "").strip().lower()
    room_id = (room_id or "").strip().lower()

    if role not in _VALID_ROLES:
        logger.warning("[signal] Rejecting socket: invalid role %r", role)
        await ws.close(code=4404, reason=f"invalid role: {role}")
        return

    # Ensure room exists or auto-create it on demand
    room = rooms_mgr.get_or_create(room_id)
    other_role = _OTHER[role]

    # Check if this role is already registered and actively connected
    existing_ws = room.peers.get(role)
    is_existing_alive = False
    if existing_ws is not None and existing_ws is not ws:
        try:
            if existing_ws.client_state == WebSocketState.CONNECTED:
                is_existing_alive = True
        except Exception:
            is_existing_alive = False

    # Prevent client registrations from overwriting each other
    if is_existing_alive:
        other_candidate = _OTHER[role]
        existing_other = room.peers.get(other_candidate)
        is_other_alive = False
        if existing_other is not None:
            try:
                if existing_other.client_state == WebSocketState.CONNECTED:
                    is_other_alive = True
            except Exception:
                is_other_alive = False

        if not is_other_alive:
            # Auto-assign the incoming client to the vacant counterpart role
            logger.info(
                "[signal] %s already occupied in room %s; assigning vacant role %s to incoming socket",
                role, room_id, other_candidate,
            )
            role = other_candidate
            other_role = _OTHER[role]
            await _safe_send_json(ws, {"type": "role-assigned", "role": role})
        else:
            # Both roles are actively occupied -> room full
            logger.warning("[signal] Rejecting socket: room %s is full with active %s and %s", room_id, role, other_role)
            await ws.close(code=4409, reason="room is full (both clinician and patient already connected)")
            return
    else:
        # If there was a stale dead socket, close it cleanly
        if existing_ws is not None and existing_ws is not ws:
            try:
                await existing_ws.close(code=4000, reason="replaced by active socket")
            except Exception:
                pass

    room.peers[role] = ws
    other_ws = room.peers.get(other_role)

    logger.info(
        "[signal] %s@%s registered successfully (partner=%s)",
        role, room_id, "present" if other_ws else "absent",
    )

    # 1. Inform the newly registered socket of room state
    await _safe_send_json(ws, {
        "type": "ready",
        "role": role,
        "peer": other_role if other_ws else None,
    })

    # 2. If partner is present, inform BOTH sockets that peer is joined
    if other_ws is not None:
        sent = await _safe_send_json(other_ws, {"type": "peer-joined", "peer": role})
        if not sent:
            room.peers.pop(other_role, None)
            other_ws = None
        else:
            await _safe_send_json(ws, {"type": "peer-joined", "peer": other_role})

    try:
        while True:
            msg = await ws.receive_json()
            msg_type = msg.get("type") if isinstance(msg, dict) else None

            # Handle ping / ready presence sync
            if msg_type in {"ping", "ready"}:
                target = room.peers.get(other_role)
                await _safe_send_json(ws, {"type": "ready", "role": role, "peer": other_role if target else None})
                if target:
                    await _safe_send_json(target, {"type": "peer-joined", "peer": role})
                continue

            if msg_type not in {"offer", "answer", "ice"}:
                logger.warning("[signal] %s@%s unrecognized msg type: %r", role, room_id, msg_type)
                continue

            target = room.peers.get(other_role)
            if target is None:
                logger.warning("[signal] %s@%s cannot relay %s: partner absent", role, room_id, msg_type)
                continue

            ok = await _safe_send_json(target, msg)
            if not ok:
                logger.warning("[signal] %s@%s failed to relay %s to partner", role, room_id, msg_type)
                room.peers.pop(other_role, None)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("[signal] %s@%s relay error: %s", role, room_id, exc)
    finally:
        if room.peers.get(role) is ws:
            room.peers.pop(role, None)
        other_ws = room.peers.get(other_role)
        if other_ws is not None:
            await _safe_send_json(other_ws, {"type": "peer-left", "peer": role})
        logger.info("[signal] %s@%s disconnected", role, room_id)
