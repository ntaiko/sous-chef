# Sous Chef tools – function calling reference

This folder contains all **function-calling tools** used by the Sous Chef Gemini Live agent.  
Each file exposes:

- `get_*_tool_declarations()` – returns `google.genai.types.FunctionDeclaration` objects for Gemini Live.
- `make_*_tool_mapping(...)` – returns a Python dict mapping function names to implementations.

The tools are wired into the Live session in:

- `backend/main.py` – WebSocket `/api/live`, creates queues and shared state.
- `backend/gemini_live.py` – `GeminiLive` class, LiveConnectConfig, tool list + mapping.

---

## Timer tools

**File:** `backend/tools/timer_tools.py`  
**Declarations:** `get_timer_tool_declarations()`  
**Mapping:** `make_timer_tool_mapping(text_in, to_client, timer_state)`

Function-calling names:

- **`start_timer`** – Starts a new cooking timer with a given duration in minutes and optional title.  
  - Example utterances: “Set a timer for 10 minutes”, “Start a 1 hour timer for the bread”.

- **`add_time_to_timer`** – Adds a specified number of minutes to an existing timer.  
  - Example: “Add 5 minutes to the cookie timer”.

- **`remove_time_from_timer`** – Removes a specified number of minutes from an existing timer.  
  - Example: “Remove 2 minutes from the dough timer”.

- **`get_timer_status`** – Returns the status and remaining time of a timer.  
  - Example: “How much time is left on the pasta timer?”.

- **`cancel_timer`** – Cancels an existing timer, optionally by title when multiple timers exist.  
  - Example: “Cancel the pasta timer”, “Cancel the timer”.

- **`pause_timer`** – Pauses an existing timer, optionally by title when multiple timers exist.  
  - Example: “Pause the timer”, “Pause the cookie timer”.

- **`resume_timer`** – Resumes a paused timer, optionally by title when multiple timers exist.  
  - Example: “Resume the timer”, “Unpause the dough timer”.

- **`update_timer_title`** – Changes the label or title of an existing timer.  
  - Example: “Rename the timer to oven timer”.

- **`reset_timer`** – Resets or restarts an existing timer with an optional new duration.  
  - Example: “Reset the timer to 5 minutes”, “Restart the pasta timer”.

These functions also send timer events (`timer_started`, `timer_updated`, `timer_paused`, `timer_ended`, etc.) to the frontend via `to_client`.

---

## Recipe tools

**File:** `backend/tools/recipe_tools.py`  
**Declarations:** `get_recipe_tool_declarations()`  
**Mapping:** `make_recipe_tool_mapping(to_client, recipe_state)`

Shared state:

- `recipe_state["current"]` – current recipe on screen.
- `recipe_state["saved_recipes"]` – list of saved recipes.
- `recipe_state["last_recipe"]` – last viewed recipe (for “last/previous”).

Function-calling names:

- **`write_recipe`** – Displays a recipe to the user with a title, list of ingredients, and list of steps.  
  - Example: “Give me a lasagna recipe”.

- **`edit_recipe`** – Updates the currently displayed recipe with a new title, ingredients, or steps.  
  - Example: “Use less salt”, “Add garlic to the sauce”.

- **`save_recipe`** – Saves the currently displayed recipe to the user’s saved list.  
  - Example: “Save this recipe”, “Save it”.

- **`list_saved_recipes`** – Returns the list of the user’s saved recipe titles, and mentions the last recipe if present.  
  - Example: “What recipes do I have saved?”, “Show my saved recipes”.

- **`show_saved_recipe`** – Displays a saved or previously viewed recipe on screen by its title, or `'last'` / `'previous'` for the last recipe.  
  - Example: “Show the carbonara recipe”, “Show my last recipe”.

All recipe tools send `recipe_result`, `recipe_saved`, and `ingredient_added` events via `to_client` so the Angular UI can update.

---

## Maps / stores tools (Google Places)

**File:** `backend/tools/maps_tools.py`  
**Declarations:** `get_maps_tool_declarations()`  
**Mapping:** `make_maps_tool_mapping(to_client, user_lat, user_lng)`

Environment:

- Requires `GOOGLE_MAPS_API_KEY` to be set (Maps/Places API key).

Function-calling names:

- **`search_places`** – Searches for places such as grocery stores, markets, or specialty food stores near a given location (via Places Text Search).  
  - Example: “Where can I buy fresh basil?”, “Find a grocery store near me”, “Farmers market in Athens”.

- **`hide_stores`** – Hides or closes the stores list on screen.  
  - Example: “Hide the stores”, “Close the stores panel”.

These tools send `places_result` (with a simplified list of places) and `stores_hidden` events via `to_client`.

---

## Camera tools

**File:** `backend/tools/camera_tools.py`  
**Declarations:** `get_camera_tool_declarations()`  
**Mapping:** `make_camera_tool_mapping(to_client)`

Function-calling names:

- **`open_camera`** – Turns on the user’s camera so the assistant can see their kitchen or cooking.  
  - Example: “Open the camera”, “Turn on the camera”.

- **`close_camera`** – Turns off the user’s camera.  
  - Example: “Close the camera”, “Turn off the camera”.

These tools send `camera_command` events (`action: 'open' | 'close'`) for the frontend to start/stop video capture.

---

## Where tools are attached to Gemini Live

- **`backend/main.py`**  
  - WebSocket endpoint `/api/live` creates queues and shared state.  
  - Calls `get_*_tool_declarations()` to build `google.genai.types.Tool` objects.  
  - Calls `make_*_tool_mapping()` and merges them into a single `tool_mapping` dict.

- **`backend/gemini_live.py`**  
  - `GeminiLive` receives `tools=[...]` and `tool_mapping={...}`.  
  - The Live API returns function calls; `receive_loop()` looks up each function name in `tool_mapping` and executes it.  
  - Tool results are returned to Gemini via `types.FunctionResponse` and also sent to the frontend as events.

