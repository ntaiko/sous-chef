import asyncio
from typing import Any

from google.genai import types


def get_recipe_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations for the Live API config."""
    return [
        types.FunctionDeclaration(
            name="write_recipe",
            description="Displays a recipe to the user with a title, list of ingredients, and list of steps.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Recipe name (e.g. 'Classic Spaghetti Carbonara').",
                    ),
                    "ingredients": types.Schema(
                        type=types.Type.ARRAY,
                        description="List of ingredient lines.",
                        items=types.Schema(type=types.Type.STRING),
                    ),
                    "steps": types.Schema(
                        type=types.Type.ARRAY,
                        description="List of step instructions in order.",
                        items=types.Schema(type=types.Type.STRING),
                    ),
                },
                required=["title", "ingredients", "steps"],
            ),
        ),
        types.FunctionDeclaration(
            name="edit_recipe",
            description="Updates the currently displayed recipe with a new title, ingredients, or steps.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(type=types.Type.STRING, description="Updated recipe title."),
                    "ingredients": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(type=types.Type.STRING),
                        description="Updated full list of ingredients.",
                    ),
                    "steps": types.Schema(
                        type=types.Type.ARRAY,
                        items=types.Schema(type=types.Type.STRING),
                        description="Updated full list of steps.",
                    ),
                },
                required=[],
            ),
        ),
        types.FunctionDeclaration(
            name="save_recipe",
            description="Saves the currently displayed recipe to the user's saved list.",
            parameters=types.Schema(type=types.Type.OBJECT),
        ),
        types.FunctionDeclaration(
            name="show_saved_recipe",
            description="Displays a saved or previously viewed recipe on screen by its title.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description=(
                            "Recipe title to show. Use the exact title from the user's saved list, "
                            "or 'last' / 'previous' to show the last recipe they had open."
                        ),
                    ),
                },
                required=["title"],
            ),
        ),
        types.FunctionDeclaration(
            name="list_saved_recipes",
            description="Returns the list of the user's saved recipe titles.",
            parameters=types.Schema(type=types.Type.OBJECT),
        ),
    ]


def _normalize_title(s: str) -> str:
    return (s or "").strip().lower()


def make_recipe_tool_mapping(
    *,
    to_client: asyncio.Queue,
    recipe_state: dict[str, Any],
) -> dict[str, Any]:
    """
    Create recipe tool implementations. recipe_state must be a mutable dict with
    "current", "saved_recipes" (list of {title, ingredients, steps}), "last_recipe" (dict or None).
    """

    def send_recipe_event(event_type: str, payload: dict[str, Any]) -> None:
        try:
            to_client.put_nowait(("event", {"type": event_type, **payload}))
        except asyncio.QueueFull:
            pass

    def write_recipe(title: str, ingredients: list[str], steps: list[str]) -> str:
        if not title or not isinstance(ingredients, list) or not isinstance(steps, list):
            return "Recipe must have a title, a list of ingredients, and a list of steps."
        recipe = {
            "title": str(title).strip(),
            "ingredients": [str(x).strip() for x in ingredients if str(x).strip()],
            "steps": [str(x).strip() for x in steps if str(x).strip()],
        }
        recipe_state["current"] = recipe
        send_recipe_event("recipe_result", {"recipe": recipe})
        return f"Displayed recipe: {recipe['title']}. The user can see it on screen."

    def edit_recipe(
        title: str | None = None,
        ingredients: list[str] | None = None,
        steps: list[str] | None = None,
    ) -> str:
        current = recipe_state.get("current")
        if not current:
            return "There is no recipe displayed yet. Ask the user what recipe they want, then use write_recipe."
        updated = dict(current)
        if title is not None and str(title).strip():
            updated["title"] = str(title).strip()
        if ingredients is not None:
            updated["ingredients"] = [str(x).strip() for x in ingredients if str(x).strip()]
        if steps is not None:
            updated["steps"] = [str(x).strip() for x in steps if str(x).strip()]
        recipe_state["current"] = updated
        send_recipe_event("recipe_result", {"recipe": updated})
        return f"Updated recipe: {updated['title']}. The user can see the changes on screen."

    def save_recipe() -> str:
        current = recipe_state.get("current")
        if not current:
            return "There is no recipe to save. Provide a recipe first using write_recipe."
        send_recipe_event("recipe_saved", {"recipe": current})
        return f"Saved the recipe '{current['title']}' for the user."

    def list_saved_recipes() -> str:
        saved = recipe_state.get("saved_recipes") or []
        last = recipe_state.get("last_recipe")
        titles = [r.get("title") or "Untitled" for r in saved if isinstance(r, dict)]
        if not titles and not last:
            return "The user has no saved recipes and no previous recipe."
        lines = []
        if titles:
            lines.append("Saved recipes: " + ", ".join(titles))
        if last and isinstance(last, dict):
            lines.append("Last viewed recipe: " + (last.get("title") or "Untitled"))
        return " ".join(lines)

    def show_saved_recipe(title: str) -> str:
        key = (title or "").strip()
        if _normalize_title(key) in ("last", "previous"):
            last = recipe_state.get("last_recipe")
            if not last or not isinstance(last, dict):
                return "There is no previous recipe to show."
            recipe = {
                "title": str(last.get("title") or "").strip() or "Untitled",
                "ingredients": list(last.get("ingredients") or []),
                "steps": list(last.get("steps") or []),
            }
            recipe_state["current"] = recipe
            send_recipe_event("recipe_result", {"recipe": recipe})
            return f"Showing last viewed recipe: {recipe['title']}"
        saved = recipe_state.get("saved_recipes") or []
        key_lower = _normalize_title(key)
        for r in saved:
            if not isinstance(r, dict):
                continue
            t = (r.get("title") or "").strip()
            if _normalize_title(t) == key_lower or key_lower in _normalize_title(t):
                recipe = {
                    "title": t or "Untitled",
                    "ingredients": list(r.get("ingredients") or []),
                    "steps": list(r.get("steps") or []),
                }
                recipe_state["current"] = recipe
                send_recipe_event("recipe_result", {"recipe": recipe})
                return f"Showing saved recipe: {recipe['title']}"
        return f"No saved recipe found with that title. Use list_saved_recipes to see available titles."

    return {
        "write_recipe": write_recipe,
        "edit_recipe": edit_recipe,
        "save_recipe": save_recipe,
        "show_saved_recipe": show_saved_recipe,
        "list_saved_recipes": list_saved_recipes,
    }
