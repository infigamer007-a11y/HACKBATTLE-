import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import debug as debug_api
from app.api.report import router as report_router
from app.api.rooms import router as rooms_router
from app.config import log_key_presence, settings
from app.test_page import router as test_page_router
from app.ws.audio import router as audio_router
from app.ws.dashboard import router as dashboard_router
from app.ws.signaling import router as signaling_router

logger = logging.getLogger("truevoice")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="TrueVoice backend")

all_origins = list(set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    *settings.allowed_origins,
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=all_origins,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router)
app.include_router(audio_router)
app.include_router(dashboard_router)
app.include_router(signaling_router)
app.include_router(report_router)
app.include_router(test_page_router)

if debug_api.is_enabled():
    app.include_router(debug_api.router)
    logger.warning("DEBUG ROUTES ENABLED — do not expose to the internet")


@app.on_event("startup")
def _log_startup() -> None:
    logger.info("TrueVoice backend starting")
    logger.info("Allowed origins: %s", settings.allowed_origins)
    for name, masked in log_key_presence(settings).items():
        logger.info("%s loaded: %s", name, masked)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.websocket("/ws/echo")
async def ws_echo(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                return
            if "text" in msg and msg["text"] is not None:
                await ws.send_text(msg["text"])
            elif "bytes" in msg and msg["bytes"] is not None:
                await ws.send_bytes(msg["bytes"])
    except WebSocketDisconnect:
        return
