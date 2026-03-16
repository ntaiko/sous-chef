import asyncio
import secrets
import time
from typing import Any

from google.genai import types


def _format_duration(seconds: float) -> str:
    """Format seconds as 'X hour(s) Y minute(s) Z second(s)' (omits zero parts)."""
    secs = max(0, int(round(seconds)))
    if secs == 0:
        return "0 seconds"
    parts: list[str] = []
    hours, secs = divmod(secs, 3600)
    minutes, secs = divmod(secs, 60)
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if minutes:
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    if secs:
        parts.append(f"{secs} second{'s' if secs != 1 else ''}")
    return " ".join(parts)


def get_timer_tool_declarations() -> list[types.FunctionDeclaration]:
    """Tool declarations for the Live API config."""
    return [
        # Function Declaration to start the cooking assistant timer.
        types.FunctionDeclaration(
            name="start_timer",
            description="Starts a new cooking timer with a given duration in minutes and optional title.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "duration_minutes": types.Schema(
                        type=types.Type.NUMBER,
                        description="Duration in minutes. Use 60 for 1 hour, 90 for 1h30, etc. (e.g. 5, 10, 60, 0.5 for 30 seconds).",
                    ),
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Optional timer title, e.g. 'Baking cookies'.",
                    ),
                },
                required=["duration_minutes"],
            ),
        ),
        # Function Declaration to add time to the cooking assistant timer.
        types.FunctionDeclaration(
            name="add_time_to_timer",
            description="Adds a specified number of minutes to an existing timer.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "minutes": types.Schema(type=types.Type.NUMBER, description="Minutes to add."),
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label/name to target when multiple exist, e.g. 'dough prep', 'baking cookies'.",
                    ),
                },
                required=["minutes"],
            ),
        ),
        # Function Declaration to remove time from the cooking assistant timer.
        types.FunctionDeclaration(
            name="remove_time_from_timer",
            description="Removes a specified number of minutes from an existing timer.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "minutes": types.Schema(type=types.Type.NUMBER, description="Minutes to remove."),
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label/name to target when multiple exist, e.g. 'dough prep', 'baking cookies'.",
                    ),
                },
                required=["minutes"],
            ),
        ),
        # Function Declaration to give the status of the cooking assistant timer.
        types.FunctionDeclaration(
            name="get_timer_status",
            description="Returns the status and remaining time of a timer.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label/name when multiple exist, e.g. 'dough prep'.",
                    )
                },
                required=[],
            ),
        ),
        # Function Declaration to cancel the cooking assistant timer.   
        types.FunctionDeclaration(
            name="cancel_timer",
            description="Cancels an existing timer, optionally by title when multiple timers exist.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label/name to cancel when multiple exist.",
                    )
                },
                required=[],
            ),
        ),
        # Function Declaration to pause the cooking assistant timer.
        types.FunctionDeclaration(
            name="pause_timer",
            description="Pauses an existing timer, optionally by title when multiple timers exist.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label/name to pause when multiple exist.",
                    )
                },
                required=[],
            ),
        ),
        # Function Declaration to resume the paused the cooking assistant timer.
        types.FunctionDeclaration(
            name="resume_timer",
            description="Resumes a paused timer, optionally by title when multiple timers exist.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label/name to resume when multiple exist.",
                    )
                },
                required=[],
            ),
        ),
        # Function Declaration to update the title the cooking assistant timer.
        types.FunctionDeclaration(
            name="update_timer_title",
            description="Changes the label or title of an existing timer.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="New timer label, e.g. 'Baking cookies'.",
                    ),
                    "target_title": types.Schema(
                        type=types.Type.STRING,
                        description="Current timer label when multiple exist, e.g. 'dough prep'.",
                    ),
                },
                required=["title"],
            ),
        ),
        # Function Declaration to reset or restart the cooking assistant timer.
        types.FunctionDeclaration(
            name="reset_timer",
            description="Resets or restarts an existing timer with an optional new duration.",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "duration_minutes": types.Schema(
                        type=types.Type.NUMBER,
                        description="Optional new duration in minutes. If omitted, the timer restarts with its current remaining time.",
                    ),
                    "title": types.Schema(
                        type=types.Type.STRING,
                        description="Timer label when multiple exist, e.g. 'dough prep'.",
                    ),
                },
                required=[],
            ),
        ),
    ]


def make_timer_tool_mapping(
    *,
    text_in: asyncio.Queue,
    to_client: asyncio.Queue,
    timer_state: dict[str, Any],
) -> dict[str, Any]:
    """
    timer_state must contain:
      timers: dict[timer_id, {title, end_time, paused_remaining, task}]
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()

    def send_timer_event(event_type: str, **kwargs: Any) -> None:
        try:
            to_client.put_nowait(("event", {"type": event_type, **kwargs}))
        except asyncio.QueueFull:
            pass

    def timers() -> dict[str, Any]:
        t = timer_state.get("timers")
        if not isinstance(t, dict):
            timer_state["timers"] = {}
        return timer_state["timers"]

    def normalize_title(s: str | None) -> str:
        return (s or "").strip()

    def choose_timer_id(
        timer_id: str | None = None,
        title: str | None = None,
    ) -> str | None:
        t = timers()
        if timer_id and timer_id in t:
            return timer_id
        key = (normalize_title(title) or "").strip().lower()
        if key:
            for tid, entry in t.items():
                entry_title = (entry.get("title") or "Timer").strip().lower()
                if entry_title == key or key in entry_title or entry_title in key:
                    return tid
        if len(t) == 1:
            return next(iter(t.keys()))
        return None

    def end_timer(timer_id: str) -> None:
        t = timers()
        entry = t.pop(timer_id, None)
        title = (entry or {}).get("title") or "Timer"
        try:
            text_in.put_nowait(
                f"The cooking timer '{title}' has just ended. Tell the user in one short sentence that time is up."
            )
        except asyncio.QueueFull:
            pass
        send_timer_event("timer_ended", timer_id=timer_id, title=title)

    async def run_timer_until(timer_id: str, end_time: float) -> None:
        delay = max(0.0, end_time - time.monotonic())
        await asyncio.sleep(delay)
        entry = timers().get(timer_id)
        if isinstance(entry, dict) and entry.get("end_time") == end_time and entry.get("task") is not None:
            end_timer(timer_id)

    def start_timer(duration_minutes: float, title: str | None = None) -> str:
        try:
            duration = float(duration_minutes)
            if duration <= 0:
                return "Duration must be positive."
        except (TypeError, ValueError):
            return "Invalid duration."

        timer_id = secrets.token_hex(6)
        timer_title = normalize_title(title) or "Timer"
        seconds = duration * 60.0
        end_time = time.monotonic() + seconds
        task = loop.create_task(run_timer_until(timer_id, end_time))
        timers()[timer_id] = {
            "title": timer_title,
            "end_time": end_time,
            "paused_remaining": None,
            "task": task,
        }
        send_timer_event("timer_started", timer_id=timer_id, title=timer_title, duration_seconds=round(seconds))
        label = f"{timer_title} timer" if timer_title.lower() != "timer" else "Timer"
        return f"{label} set for {_format_duration(seconds)}."

    def add_time_to_timer(minutes: float, title: str | None = None) -> str:
        try:
            add = float(minutes)
            if add <= 0:
                return "Minutes to add must be positive."
        except (TypeError, ValueError):
            return "Invalid minutes."

        tid = choose_timer_id(title=title)
        if not tid:
            return "Which timer? Pass title with the timer's label (e.g. 'dough prep') when multiple exist."
        entry = timers().get(tid) or {}
        entry_title = entry.get("title") or "Timer"

        paused = entry.get("paused_remaining")
        if paused is not None:
            remaining = max(0.0, float(paused) + add * 60)
            entry["paused_remaining"] = remaining
            timers()[tid] = entry
            send_timer_event("timer_updated", timer_id=tid, title=entry_title, remaining_seconds=round(remaining))
            return f"Added {_format_duration(add * 60)}. '{entry_title}' has {_format_duration(remaining)} left (paused)."

        end_time = entry.get("end_time")
        task = entry.get("task")
        if end_time is None or task is None:
            return "That timer is not currently running."

        new_end = float(end_time) + add * 60
        task.cancel()
        try:
            task.result()
        except (asyncio.CancelledError, Exception):
            pass
        new_task = loop.create_task(run_timer_until(tid, new_end))
        entry["end_time"] = new_end
        entry["task"] = new_task
        timers()[tid] = entry
        remaining = max(0.0, new_end - time.monotonic())
        send_timer_event("timer_updated", timer_id=tid, title=entry_title, remaining_seconds=round(remaining))
        return f"Added {_format_duration(add * 60)}. '{entry_title}' has {_format_duration(remaining)} remaining."

    def remove_time_from_timer(minutes: float, title: str | None = None) -> str:
        try:
            remove = float(minutes)
            if remove <= 0:
                return "Minutes to remove must be positive."
        except (TypeError, ValueError):
            return "Invalid minutes."

        tid = choose_timer_id(title=title)
        if not tid:
            return "Which timer? Pass title with the timer's label (e.g. 'dough prep') when multiple exist."
        entry = timers().get(tid) or {}
        title = entry.get("title") or "Timer"

        paused = entry.get("paused_remaining")
        if paused is not None:
            new_remaining = float(paused) - remove * 60
            if new_remaining <= 0:
                timers().pop(tid, None)
                send_timer_event("timer_ended", timer_id=tid, title=title)
                return f"Removed the time. '{title}' has ended."
            entry["paused_remaining"] = new_remaining
            timers()[tid] = entry
            send_timer_event("timer_updated", timer_id=tid, title=title, remaining_seconds=round(new_remaining))
            return f"Removed {_format_duration(remove * 60)}. '{title}' has {_format_duration(new_remaining)} left (paused)."

        end_time = entry.get("end_time")
        task = entry.get("task")
        if end_time is None or task is None:
            return "That timer is not currently running."

        remaining_before = max(0.0, float(end_time) - time.monotonic())
        new_remaining = remaining_before - remove * 60
        if new_remaining <= 0:
            task.cancel()
            try:
                task.result()
            except (asyncio.CancelledError, Exception):
                pass
            timers().pop(tid, None)
            send_timer_event("timer_ended", timer_id=tid, title=title)
            return f"Removed the time. '{title}' has ended."

        new_end = time.monotonic() + new_remaining
        task.cancel()
        try:
            task.result()
        except (asyncio.CancelledError, Exception):
            pass
        new_task = loop.create_task(run_timer_until(tid, new_end))
        entry["end_time"] = new_end
        entry["task"] = new_task
        timers()[tid] = entry
        send_timer_event("timer_updated", timer_id=tid, title=title, remaining_seconds=round(new_remaining))
        return f"Removed {_format_duration(remove * 60)}. '{title}' has {_format_duration(new_remaining)} remaining."

    def get_timer_status(title: str | None = None) -> str:
        t = timers()
        if not t:
            return "No timers are set."
        tid = choose_timer_id(title=title)
        now = time.monotonic()
        if not tid:
            parts: list[str] = []
            for _, entry in list(t.items())[:10]:
                title = (entry.get("title") or "Timer").strip()
                paused = entry.get("paused_remaining")
                if paused is not None:
                    rem = max(0.0, float(paused))
                    parts.append(f"'{title}' (paused): {_format_duration(rem)} left.")
                else:
                    end_time = entry.get("end_time")
                    if end_time is None:
                        continue
                    rem = max(0.0, float(end_time) - now)
                    parts.append(f"'{title}': {_format_duration(rem)} left.")
            return "Current timers: " + " ".join(parts)
        entry = t.get(tid) or {}
        title = entry.get("title") or "Timer"
        paused = entry.get("paused_remaining")
        if paused is not None:
            rem = max(0.0, float(paused))
            return f"'{title}' is paused with {_format_duration(rem)} left."
        end_time = entry.get("end_time")
        if end_time is None:
            return f"'{title}' is not running."
        rem = max(0.0, float(end_time) - now)
        return f"'{title}' has {_format_duration(rem)} remaining."

    def cancel_timer(title: str | None = None) -> str:
        t = timers()
        if not t:
            return "No timers to cancel."
        tid = choose_timer_id(title=title)
        if not tid:
            return "Which timer? Pass title with the timer's label (e.g. 'dough prep') when multiple exist."
        entry = t.get(tid) or {}
        title = entry.get("title") or "Timer"
        task = entry.get("task")
        if task is not None:
            task.cancel()
            try:
                task.result()
            except (asyncio.CancelledError, Exception):
                pass
        t.pop(tid, None)
        send_timer_event("timer_cancelled", timer_id=tid, title=title)
        return f"Cancelled '{title}'."

    def pause_timer(title: str | None = None) -> str:
        t = timers()
        if not t:
            return "No timer is running."
        tid = choose_timer_id(title=title)
        if not tid:
            return "Which timer? Pass title with the timer's label (e.g. 'dough prep') when multiple exist."
        entry = t.get(tid) or {}
        title = entry.get("title") or "Timer"
        if entry.get("paused_remaining") is not None:
            return f"'{title}' is already paused."
        end_time = entry.get("end_time")
        task = entry.get("task")
        if end_time is None or task is None:
            return "That timer is not currently running."
        remaining = max(0.0, float(end_time) - time.monotonic())
        task.cancel()
        try:
            task.result()
        except (asyncio.CancelledError, Exception):
            pass
        entry["paused_remaining"] = remaining
        entry["end_time"] = end_time
        entry["task"] = None
        t[tid] = entry
        send_timer_event("timer_paused", timer_id=tid, title=title, remaining_seconds=round(remaining))
        return f"Paused '{title}'."

    def resume_timer(title: str | None = None) -> str:
        t = timers()
        if not t:
            return "No timer is running."
        tid = choose_timer_id(title=title)
        if not tid:
            return "Which timer? Pass title with the timer's label (e.g. 'dough prep') when multiple exist."
        entry = t.get(tid) or {}
        title = entry.get("title") or "Timer"
        paused = entry.get("paused_remaining")
        if paused is None or float(paused) <= 0:
            return f"'{title}' is not paused."
        remaining = max(0.0, float(paused))
        end_time = time.monotonic() + remaining
        task = loop.create_task(run_timer_until(tid, end_time))
        entry["paused_remaining"] = None
        entry["end_time"] = end_time
        entry["task"] = task
        t[tid] = entry
        send_timer_event("timer_updated", timer_id=tid, title=title, remaining_seconds=round(remaining))
        return f"Resumed '{title}'."

    def update_timer_title(title: str, target_title: str | None = None) -> str:
        t = timers()
        if not t:
            return "No timer to rename."
        tid = choose_timer_id(title=target_title)
        if not tid:
            return "Which timer? Pass target_title with the timer's current label (e.g. 'dough prep') when multiple exist."
        entry = t.get(tid) or {}
        old_title = entry.get("title") or "Timer"
        new_title = normalize_title(title) or old_title
        entry["title"] = new_title
        t[tid] = entry
        now = time.monotonic()
        paused = entry.get("paused_remaining")
        if paused is not None:
            remaining = max(0.0, float(paused))
        else:
            end_time = entry.get("end_time")
            remaining = max(0.0, float(end_time or 0) - now)
        send_timer_event("timer_updated", timer_id=tid, title=new_title, remaining_seconds=round(remaining))
        return f"Renamed timer to '{new_title}'."

    def reset_timer(duration_minutes: float | None = None, title: str | None = None) -> str:
        t = timers()
        if not t:
            return "No timer to reset. Say 'set a timer for X minutes' to start one."
        tid = choose_timer_id(title=title)
        if not tid:
            return "Which timer? Pass title with the timer's label (e.g. 'dough prep') when multiple exist."
        entry = t.get(tid) or {}
        entry_title = entry.get("title") or "Timer"
        now = time.monotonic()
        paused = entry.get("paused_remaining")
        if paused is not None:
            current_remaining = max(0.0, float(paused))
        else:
            end_time = entry.get("end_time")
            current_remaining = max(0.0, float(end_time or 0) - now)

        if duration_minutes is not None:
            try:
                new_seconds = float(duration_minutes) * 60.0
                if new_seconds <= 0:
                    return "Duration must be positive."
            except (TypeError, ValueError):
                return "Invalid duration."
        else:
            new_seconds = current_remaining

        task = entry.get("task")
        if task is not None:
            task.cancel()
            try:
                task.result()
            except (asyncio.CancelledError, Exception):
                pass
        new_end = now + new_seconds
        new_task = loop.create_task(run_timer_until(tid, new_end))
        entry["end_time"] = new_end
        entry["paused_remaining"] = None
        entry["task"] = new_task
        t[tid] = entry
        send_timer_event("timer_updated", timer_id=tid, title=entry_title, remaining_seconds=round(new_seconds))
        if duration_minutes is not None:
            return f"Reset '{entry_title}' to {_format_duration(new_seconds)}."
        return f"Reset '{entry_title}' with {_format_duration(new_seconds)} remaining."

    return {
        "start_timer": start_timer,
        "add_time_to_timer": add_time_to_timer,
        "remove_time_from_timer": remove_time_from_timer,
        "get_timer_status": get_timer_status,
        "cancel_timer": cancel_timer,
        "pause_timer": pause_timer,
        "resume_timer": resume_timer,
        "update_timer_title": update_timer_title,
        "reset_timer": reset_timer,
    }
