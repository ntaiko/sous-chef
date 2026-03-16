import asyncio
import json
import os
import urllib.request
from typing import Any

from google.genai import types

PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri,places.photos"

# Radius in meters for "near me" bias (50 km).
NEAR_ME_RADIUS_METERS = 50_000


def _get_api_key() -> str:
    return (os.environ.get("GOOGLE_MAPS_API_KEY") or "").strip()


def _search_places_sync(
    text_query: str,
    api_key: str,
    *,
    location_bias: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Synchronous Places API Text Search. Run in executor to avoid blocking."""
    if not api_key:
        return {"error": "GOOGLE_MAPS_API_KEY is not set. Configure it to enable place search."}
    payload: dict[str, Any] = {"textQuery": text_query}
    if location_bias:
        payload["locationBias"] = location_bias
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        PLACES_TEXT_SEARCH_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
            return {"error": f"Places API error: {e.code} - {err_body[:200]}"}
        except Exception:
            return {"error": f"Places API error: {e.code}"}
    except Exception as e:
        return {"error": str(e)}


def _place_display_name(place: dict[str, Any]) -> str:
    """Extract display name from a Place object."""
    if "displayName" in place and isinstance(place["displayName"], dict):
        return place["displayName"].get("text", "Unknown")
    if isinstance(place.get("displayName"), str):
        return place["displayName"]
    return "Unknown"


def _places_for_client(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Build a simple list of {name, formattedAddress, rating, websiteUri, photoName} for the frontend."""
    if "error" in data:
        return []
    places = data.get("places") or []
    result = []
    for p in places[:10]:
        photos = p.get("photos") or []
        first_photo = photos[0] if photos else None
        photo_name = first_photo.get("name") if isinstance(first_photo, dict) else None
        result.append({
            "name": _place_display_name(p),
            "formattedAddress": p.get("formattedAddress") or "",
            "rating": p.get("rating"),
            "websiteUri": p.get("websiteUri") or None,
            "googleMapsUri": p.get("googleMapsUri") or None,
            "photoName": photo_name,
        })
    return result


def _format_places_result(data: dict[str, Any]) -> str:
    """Turn Places API response into a short summary for the agent to speak."""
    if "error" in data:
        return data["error"]
    places = data.get("places") or []
    if not places:
        return "No places found for that search."
    parts = []
    for i, place in enumerate(places[:5], 1):
        name = _place_display_name(place)
        addr = place.get("formattedAddress") or "Address not available"
        rating = place.get("rating")
        rating_str = f", rating {rating}" if rating is not None else ""
        url = place.get("websiteUri")
        url_str = f", website {url}" if url else ""
        maps_url = place.get("googleMapsUri")
        maps_str = ", Google Maps link available" if maps_url else ""
        parts.append(f"{i}. {name} — {addr}{rating_str}{url_str}{maps_str}")
    return "Found the following places:\n" + "\n".join(parts)


def get_maps_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations for the Live API config."""
    return [
        types.FunctionDeclaration(
            name="search_places",
            description="Searches for places such as grocery stores, markets, or specialty food stores near a given location.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description="What to search for, e.g. 'grocery store', 'farmers market', 'butcher'.",
                    ),
                    "location": types.Schema(
                        type=types.Type.STRING,
                        description="Location for the search, e.g. 'Austin, TX', 'Brooklyn, NY', or 'San Francisco'.",
                    ),
                },
                required=["query", "location"],
            ),
        ),
        types.FunctionDeclaration(
            name="hide_stores",
            description="Hides or closes the stores list on screen.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={},
                required=[],
            ),
        ),
    ]


def make_maps_tool_mapping(
    *,
    to_client: asyncio.Queue,
    user_lat: float | None = None,
    user_lng: float | None = None,
) -> dict[str, Any]:
    """
    Create the maps tool implementations. When user_lat/user_lng are provided,
    a search with location "near me" or "nearby" uses locationBias around that point.
    Sends a places_result event to the client so the UI can show the list.
    """

    def send_places_result(places: list[dict[str, Any]]) -> None:
        try:
            to_client.put_nowait(("event", {"type": "places_result", "places": places}))
        except asyncio.QueueFull:
            pass

    async def search_places(query: str, location: str) -> str:
        location_clean = (location or "").strip().lower()
        use_near_me = location_clean in ("near me", "nearby", "my location", "") and (
            user_lat is not None and user_lng is not None
        )
        if use_near_me:
            text_query = query.strip() or "grocery store"
            location_bias = {
                "circle": {
                    "center": {"latitude": user_lat, "longitude": user_lng},
                    "radius": NEAR_ME_RADIUS_METERS,
                }
            }
        else:
            text_query = f"{query} in {location}".strip()
            location_bias = None

        api_key = _get_api_key()
        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(
            None,
            lambda: _search_places_sync(text_query, api_key, location_bias=location_bias),
        )
        places_for_ui = _places_for_client(data)
        if places_for_ui:
            send_places_result(places_for_ui)
        return _format_places_result(data)

    def hide_stores() -> str:
        return "Stores list hidden."

    return {"search_places": search_places, "hide_stores": hide_stores}
