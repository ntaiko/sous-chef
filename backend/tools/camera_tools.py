import asyncio
from typing import Any

from google.genai import types


def get_camera_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations for the Live API config."""
    return [
        types.FunctionDeclaration(
            name="open_camera",
            description="Turns on the user's camera so the assistant can see their kitchen or cooking.",
            parameters=types.Schema(type=types.Type.OBJECT),
        ),
        types.FunctionDeclaration(
            name="close_camera",
            description="Turns off the user's camera.",
            parameters=types.Schema(type=types.Type.OBJECT),
        ),
    ]


def make_camera_tool_mapping(*, to_client: asyncio.Queue) -> dict[str, Any]:
    """Create camera tool implementations that send camera_command events to the client."""

    def send_camera_command(action: str) -> None:
        try:
            to_client.put_nowait(("event", {"type": "camera_command", "action": action}))
        except asyncio.QueueFull:
            pass

    def open_camera() -> str:
        send_camera_command("open")
        return "Requested to open the camera. The user's app will turn the camera on so you can see their kitchen."

    def close_camera() -> str:
        send_camera_command("close")
        return "Requested to close the camera. The user's app will turn the camera off."

    return {"open_camera": open_camera, "close_camera": close_camera}
