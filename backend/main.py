import asyncio
import base64
import json
import os
from contextlib import asynccontextmanager

import urllib.error
import urllib.request
from urllib.request import HTTPRedirectHandler, build_opener

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

load_dotenv()

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1").strip()
LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-live-2.5-flash-native-audio").strip()
LIVE_SAMPLE_RATE = 16000


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure we can create a client (lazy on first request is also fine)
    yield
    # Shutdown
    pass


app = FastAPI(title="Sous-Chef API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None 

@app.get("/api/place-photo", response_class=RedirectResponse)
def place_photo(name: str = ""):
    """Redirect to the Google Places photo image for a given photo resource name (keeps API key server-side)."""
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    api_key = (os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Place photos not configured (GOOGLE_MAPS_API_KEY)")
    url = f"https://places.googleapis.com/v1/{name}/media?key={api_key}&maxWidthPx=400"
    try:
        req = urllib.request.Request(url, method="GET")
        req.add_header("X-Goog-Api-Key", api_key)
        opener = build_opener(_NoRedirectHandler)
        resp = opener.open(req, timeout=10)
        redirect_url = resp.getheader("Location") or getattr(resp, "url", None)
        if redirect_url:
            return RedirectResponse(url=redirect_url, status_code=302)
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            redirect_url = e.headers.get("Location")
            if redirect_url:
                return RedirectResponse(url=redirect_url, status_code=302)
        raise HTTPException(status_code=min(e.code, 502), detail="Place photo unavailable")
    except Exception as e:
        raise HTTPException(status_code=502, detail="Place photo unavailable")
    raise HTTPException(status_code=502, detail="Place photo unavailable")


@app.websocket("/api/live")
async def websocket_live(websocket: WebSocket):

    await websocket.accept()
    if not PROJECT_ID:
        await websocket.send_json({"type": "error", "error": "GOOGLE_CLOUD_PROJECT is not set"})
        await websocket.close()
        return

    params = websocket.query_params
    assistant_name = (params.get("assistant_name") or "").strip() or (os.getenv("GEMINI_ASSISTANT_NAME") or "Sous Chef").strip()
    language = (params.get("language") or "").strip() or (os.getenv("GEMINI_LANGUAGE") or "en-US").strip()
    personality = (params.get("personality") or "").strip() or (os.getenv("GEMINI_PERSONALITY") or "friendly").strip()
    response_type = (params.get("response_type") or "").strip() or (os.getenv("GEMINI_RESPONSE_TYPE") or "concise").strip()
    voice_name = (params.get("voice_name") or "").strip() or (os.getenv("GEMINI_VOICE_NAME") or "Aoede").strip()
    user_lat = None
    user_lng = None
    try:
        if params.get("user_lat") is not None and params.get("user_lng") is not None:
            user_lat = float(params.get("user_lat"))
            user_lng = float(params.get("user_lng"))
    except (TypeError, ValueError):
        pass

    audio_in = asyncio.Queue()
    video_in = asyncio.Queue()
    text_in = asyncio.Queue()
    to_client = asyncio.Queue()
    recipe_state = {"current": None, "saved_recipes": [], "last_recipe": None}


    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
        if msg.get("type") == "init":
            saved = msg.get("saved_recipes")
            if isinstance(saved, list):
                recipe_state["saved_recipes"] = [
                    r for r in saved
                    if isinstance(r, dict) and isinstance(r.get("ingredients"), list) and isinstance(r.get("steps"), list)
                ]
            last = msg.get("last_recipe")
            if last is not None and isinstance(last, dict) and isinstance(last.get("ingredients"), list) and isinstance(last.get("steps"), list):
                recipe_state["last_recipe"] = last
        else:
            
            t = msg.get("type")
            if t == "audio" and msg.get("data"):
                try:
                    raw_audio = base64.b64decode(msg["data"])
                    if len(raw_audio) >= 2 and len(raw_audio) % 2 == 0:
                        audio_in.put_nowait(raw_audio)
                except Exception:
                    pass
            elif t == "video" and msg.get("data"):
                try:
                    video_in.put_nowait(base64.b64decode(msg["data"]))
                except Exception:
                    pass
    except (WebSocketDisconnect, json.JSONDecodeError, KeyError):
        pass

    def audio_out_callback(data: bytes) -> None:
        try:
            to_client.put_nowait(("audio", data))
        except asyncio.QueueFull:
            pass

    async def run_session():
        from gemini_live import GeminiLive
        from tools.timer_tools import get_timer_tool_declarations, make_timer_tool_mapping
        from tools.maps_tools import get_maps_tool_declarations, make_maps_tool_mapping
        from tools.camera_tools import get_camera_tool_declarations, make_camera_tool_mapping
        from tools.recipe_tools import get_recipe_tool_declarations, make_recipe_tool_mapping
        from google.genai import types as genai_types

        timer_state = {"timers": {}}
        timer_tool = genai_types.Tool(function_declarations=get_timer_tool_declarations())
        timer_tool_mapping = make_timer_tool_mapping(
            text_in=text_in, to_client=to_client, timer_state=timer_state
        )
        maps_tool = genai_types.Tool(function_declarations=get_maps_tool_declarations())
        maps_tool_mapping = make_maps_tool_mapping(
            to_client=to_client,
            user_lat=user_lat,
            user_lng=user_lng,
        )
        camera_tool = genai_types.Tool(function_declarations=get_camera_tool_declarations())
        camera_tool_mapping = make_camera_tool_mapping(to_client=to_client)
        recipe_tool = genai_types.Tool(function_declarations=get_recipe_tool_declarations())
        recipe_tool_mapping = make_recipe_tool_mapping(
            to_client=to_client, recipe_state=recipe_state
        )
        live = GeminiLive(
            PROJECT_ID,
            LOCATION,
            LIVE_MODEL,
            LIVE_SAMPLE_RATE,
            tools=[timer_tool, maps_tool, camera_tool, recipe_tool],
            tool_mapping={
                **timer_tool_mapping,
                **maps_tool_mapping,
                **camera_tool_mapping,
                **recipe_tool_mapping,
            },
            voice_name=voice_name,
            personality=personality,
            response_type=response_type,
            language=language,
            assistant_name=assistant_name,
            user_lat=user_lat,
            user_lng=user_lng,
        )
        try:
            async for event in live.start_session(
                audio_in, video_in, text_in, audio_out_callback, audio_interrupt_callback=None
            ):
                if event is None:
                    continue
                if isinstance(event, dict):
                    to_client.put_nowait(("event", event))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            to_client.put_nowait(("event", {"type": "error", "error": str(e)}))
        finally:
            if timer_state.get("task") is not None:
                timer_state["task"].cancel()
                try:
                    timer_state["task"].result()
                except (asyncio.CancelledError, Exception):
                    pass
                timer_state["task"] = None
            to_client.put_nowait(("done", None))

    session_task = asyncio.create_task(run_session())

    async def send_to_client():
        try:
            while True:
                kind, payload = await to_client.get()
                if kind == "done":
                    break
                if kind == "audio":
                    await websocket.send_json({"type": "audio", "data": base64.b64encode(payload).decode()})
                else:
                    await websocket.send_json(payload)
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass

    send_task = asyncio.create_task(send_to_client())

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            t = msg.get("type")
            if t == "audio":
                data = msg.get("data")
                if data:
                    try:
                        raw_audio = base64.b64decode(data)
                        if len(raw_audio) >= 2 and len(raw_audio) % 2 == 0:
                            audio_in.put_nowait(raw_audio)
                    except Exception:
                        pass
            elif t == "video":
                data = msg.get("data")
                if data:
                    video_in.put_nowait(base64.b64decode(data))
    except WebSocketDisconnect:
        pass
    except json.JSONDecodeError:
        pass
    finally:
        session_task.cancel()
        send_task.cancel()
        try:
            await session_task
        except asyncio.CancelledError:
            pass
        try:
            await send_task
        except asyncio.CancelledError:
            pass
        try:
            await websocket.close(code=1000, reason="Session ended")
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
