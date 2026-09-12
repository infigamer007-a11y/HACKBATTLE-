from fastapi import APIRouter

from app.models import RoomCreateResponse, RoomExistsResponse
from app.rooms import rooms

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.post("", response_model=RoomCreateResponse)
def create_room() -> RoomCreateResponse:
    room = rooms.create()
    return RoomCreateResponse(room_id=room.room_id, created_at_ms=room.created_at_ms)


@router.get("/{room_id}", response_model=RoomExistsResponse)
def get_room(room_id: str) -> RoomExistsResponse:
    room = rooms.get_or_create(room_id)
    return RoomExistsResponse(exists=True, created_at_ms=room.created_at_ms)
