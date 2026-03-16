import asyncio
import inspect
from google import genai
from google.genai import types

def _env(name: str, default: str = "") -> str:
    import os
    return (os.environ.get(name) or default).strip()

LANGUAGE_LABEL: dict[str, str] = {
    "en": "English",
    "en-US": "English",
    "en-IN": "English (India)",
    "af": "Afrikaans",
    "sq": "Albanian",
    "am": "Amharic",
    "ar": "Arabic",
    "hy": "Armenian",
    "as": "Assamese",
    "az": "Azerbaijani",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "zh": "Chinese",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "nl": "Dutch",
    "et": "Estonian",
    "fil": "Filipino",
    "fi": "Finnish",
    "fr": "French",
    "fr-FR": "French",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "de-DE": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "iw": "Hebrew",
    "hi": "Hindi",
    "hi-IN": "Hindi (India)",
    "hu": "Hungarian",
    "is": "Icelandic",
    "id": "Indonesian",
    "id-ID": "Indonesian",
    "it": "Italian",
    "it-IT": "Italian",
    "ja": "Japanese",
    "ja-JP": "Japanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "km": "Khmer",
    "ko": "Korean",
    "ko-KR": "Korean",
    "lo": "Lao",
    "lv": "Latvian",
    "lt": "Lithuanian",
    "mk": "Macedonian",
    "ms": "Malay",
    "ml": "Malayalam",
    "mr": "Marathi",
    "mr-IN": "Marathi (India)",
    "mn": "Mongolian",
    "ne": "Nepali",
    "no": "Norwegian",
    "or": "Odia",
    "pl": "Polish",
    "pl-PL": "Polish",
    "pt": "Portuguese",
    "pt-BR": "Portuguese (Brazil)",
    "pa": "Punjabi",
    "ro": "Romanian",
    "ro-RO": "Romanian",
    "ru": "Russian",
    "ru-RU": "Russian",
    "sr": "Serbian",
    "sk": "Slovak",
    "sl": "Slovenian",
    "es": "Spanish",
    "es-US": "Spanish",
    "sw": "Swahili",
    "sv": "Swedish",
    "ta": "Tamil",
    "ta-IN": "Tamil (India)",
    "te": "Telugu",
    "te-IN": "Telugu (India)",
    "th": "Thai",
    "th-TH": "Thai",
    "tr": "Turkish",
    "tr-TR": "Turkish",
    "uk": "Ukrainian",
    "uk-UA": "Ukrainian",
    "ur": "Urdu",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "vi-VN": "Vietnamese",
    "zu": "Zulu",
}


def _language_label(code_or_name: str) -> str:
    """Return display name for system instruction; accept BCP-47 or legacy name."""
    s = (code_or_name or "").strip()
    return LANGUAGE_LABEL.get(s, s) if s else "English"


def _build_system_instruction(
    assistant_name: str,
    personality: str,
    response_type: str,
    language: str,
    *,
    user_lat: float | None = None,
    user_lng: float | None = None,
) -> str:
    """Gemini Live API best practices"""
    lang_upper = _language_label(language)
    location_note = ""
    if user_lat is not None and user_lng is not None:
        location_note = (
            f"\n\nThe user has shared their location (latitude {user_lat}, longitude {user_lng}). "
            "When they ask for stores or places 'near me', 'nearby', or 'around here', use the "
            "search_places tool with location 'near me' so results are biased to their area. When they say "
            "'hide the stores', 'close the stores', or 'get rid of the stores', call hide_stores.\n\n"
        )
    language_directive = (
        f"RESPOND IN {lang_upper}. YOU MUST RESPOND UNMISTAKABLY IN {lang_upper}."
        if "english" not in lang_upper.lower()
        else f"You only speak in {lang_upper}."
    )
    return (
        f"**Persona:**\n"
        f"You are {assistant_name}, a {personality} cooking assistant. You help users with recipes, meal ideas, techniques, and kitchen questions. You give {response_type} responses. {language_directive} If the user speaks another language, you may understand them but still respond in {lang_upper}.{location_note}"
        "**Conversational rules:**\n\n"
        "1. **Greet the user:** When the conversation starts, give a short, warm greeting and offer help with cooking or recipes.\n\n"
        "2. **Ongoing loop:** The user can ask for recipes, substitutions, tips, or discuss what they're cooking. Move between topics as the user wants. Keep answers focused and practical. If they describe what they have on hand, suggest a recipe or next step. If they ask for a recipe, give clear steps and ingredients.\n\n"
        "3. **One-off details:** If the user shares dietary restrictions, allergies, or preferences, remember them for the rest of the conversation and tailor suggestions accordingly.\n\n"
        "4. **Cooking timer:** You have tools to start, reset, add time, remove time, pause, resume, check status, cancel, and update_timer_title. Use start_timer only when the user asks to SET or START a **new** timer (and no existing timer is being referred to). For duration: use duration_minutes (e.g. 60 for 1 hour, 90 for 1 hour 30 minutes, 120 for 2 hours). When they say 'reset the timer', 'restart the timer', or 'reset it', use reset_timer so the existing timer is restarted—do NOT use start_timer (that would create a duplicate). When they say 'update the timer', 'change the label', or 'rename it to X', use update_timer_title. When the user asks to resume a paused timer (e.g. 'resume the timer', 'resume the dough timer', 'unpause'), use resume_timer so the countdown continues from the remaining time—do NOT use reset_timer. To change duration use add_time_to_timer or remove_time_from_timer. When the timer ends, you will be notified and should tell the user.\n\n"
        "5. **Google Maps (places):** You have search_places and hide_stores. When the user asks where to buy ingredients, find a store, or get a nearby grocery (e.g. 'where can I buy fresh basil?', 'find a grocery store in Athens'), call search_places with a query and location. If they say 'near me' and no location was given, ask for their city or use a reasonable default. When they say 'hide the stores', 'close the stores', or 'get rid of the stores', call hide_stores. Summarize search results in a short, helpful way.\n\n"
        "6. **Camera:** You have open_camera and close_camera tools. When the user says 'open camera', 'turn on the camera', 'start the camera', or similar, call open_camera. When they say 'close camera', 'turn off the camera', or 'stop the camera', call close_camera. Then confirm briefly (e.g. 'Opening the camera' or 'Turning the camera off').\n\n"
        "7. **Recipes:** You have write_recipe, edit_recipe, and save_recipe tools. When the user asks for a recipe, provide it and call write_recipe with a clear title, list of ingredients, and list of steps so it appears on screen. If they ask to change the recipe (e.g. 'use less salt', 'add garlic'), call edit_recipe with the updated fields. If they say 'save this recipe' or 'save it', call save_recipe. Then confirm briefly.\n\n"
        "8. **Saved and last recipe:** You have list_saved_recipes and show_saved_recipe. The user's saved recipes and their last viewed recipe are sent at session start; do NOT show them automatically. Only when the user explicitly asks (e.g. 'show my saved recipes', 'I want to search from the saved recipes', 'what did I have open last time?', 'show my last recipe', 'open the carbonara recipe') call list_saved_recipes to see titles, then show_saved_recipe with that title (or use title 'last' for the previous recipe). Do not call show_saved_recipe on greeting or general conversation.\n\n"
        "9. **Tool use—one response:** When you use any tool (timer, recipe, search, camera, etc.), do NOT speak before calling the tool. Call the tool first, then after you receive the result give a single brief confirmation (e.g. 'Done.' or 'I removed 5 minutes.'). Never say something like 'One moment' then call the tool then say 'Done'—only one short confirmation after the tool result. Do not acknowledge twice or repeat the same confirmation.\n\n"
        "**Guardrails:** Do not give medical or safety advice beyond basic food safety. Do not make up exact nutrition numbers unless you state they are estimates. If unsure, say so."
    ).strip()


class GeminiLive:

    def __init__(
        self,
        project_id,
        location,
        model,
        input_sample_rate,
        tools=None,
        tool_mapping=None,
        *,
        # Keywords only
        voice_name: str | None = None,
        personality: str | None = None,
        response_type: str | None = None,
        language: str | None = None,
        assistant_name: str | None = None,
        user_lat: float | None = None,
        user_lng: float | None = None,
    ):
        self.project_id = project_id
        self.location = location
        self.model = model
        self.input_sample_rate = input_sample_rate
        self.client = genai.Client(vertexai=True, project=project_id, location=location)
        self.tools = tools or []
        self.tool_mapping = tool_mapping or {}
        self.voice_name = voice_name or _env("GEMINI_VOICE_NAME", "Aoede")
        self.personality = personality or _env("GEMINI_PERSONALITY", "friendly")
        self.response_type = response_type or _env("GEMINI_RESPONSE_TYPE", "concise")
        self.language = language or _env("GEMINI_LANGUAGE", "en-US")
        self.assistant_name = assistant_name or _env("GEMINI_ASSISTANT_NAME", "Sous Chef")
        self.user_lat = user_lat
        self.user_lng = user_lng

    async def start_session(self, audio_input_queue, video_input_queue, text_input_queue, audio_output_callback, audio_interrupt_callback=None):
        system_text = _build_system_instruction(
            self.assistant_name,
            self.personality,
            self.response_type,
            self.language,
            user_lat=self.user_lat,
            user_lng=self.user_lng,
        )
        tools_list = list(self.tools) if self.tools else []
        if _env("GEMINI_GOOGLE_SEARCH", "").lower() in ("1", "true", "yes"):
            tools_list.append({"google_search": {}})
        speech_config_kw: dict = {
            "voice_config": types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=self.voice_name
                )
            ),
        }
        if self.language and "-" in self.language:
            speech_config_kw["language_code"] = self.language
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            speech_config=types.SpeechConfig(**speech_config_kw),
            system_instruction=types.Content(parts=[types.Part(text=system_text)]),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            proactivity=types.ProactivityConfig(proactive_audio=True),
            enable_affective_dialog=_env("GEMINI_AFFECTIVE_DIALOG", "true").lower() in ("1", "true", "yes"),
            tools=tools_list,
        )

        async with self.client.aio.live.connect(model=self.model, config=config) as session:
            async def send_audio():
                try:
                    while True:
                        chunk = await audio_input_queue.get()
                        await session.send_realtime_input(
                            audio=types.Blob(data=chunk, mime_type=f"audio/pcm;rate={self.input_sample_rate}")
                        )
                except asyncio.CancelledError:
                    pass

            async def send_video():
                try:
                    while True:
                        chunk = await video_input_queue.get()
                        await session.send_realtime_input(
                            video=types.Blob(data=chunk, mime_type="image/jpeg")
                        )
                except asyncio.CancelledError:
                    pass

            async def send_text():
                try:
                    while True:
                        text = await text_input_queue.get()
                        await session.send(input=text, end_of_turn=True)
                except asyncio.CancelledError:
                    pass

            event_queue = asyncio.Queue()
            responded_tool_call_ids = set()

            async def receive_loop():
                try:
                    while True:
                        async for response in session.receive():
                            server_content = response.server_content
                            tool_call = response.tool_call
                            
                            if server_content:
                                if server_content.model_turn:
                                    for part in server_content.model_turn.parts:
                                        if part.inline_data:
                                            if inspect.iscoroutinefunction(audio_output_callback):
                                                await audio_output_callback(part.inline_data.data)
                                            else:
                                                audio_output_callback(part.inline_data.data)

                                # Forward transcriptions as lightweight events for the frontend
                                if server_content.input_transcription and server_content.input_transcription.text:
                                    await event_queue.put(
                                        {"type": "user", "text": server_content.input_transcription.text}
                                    )

                                if server_content.output_transcription and server_content.output_transcription.text:
                                    await event_queue.put(
                                        {"type": "gemini", "text": server_content.output_transcription.text}
                                    )

                                if server_content.turn_complete:
                                    await event_queue.put({"type": "turn_complete"})

                                if server_content.interrupted:
                                    if audio_interrupt_callback:
                                        if inspect.iscoroutinefunction(audio_interrupt_callback):
                                            await audio_interrupt_callback()
                                        else:
                                            audio_interrupt_callback()
                                    await event_queue.put({"type": "interrupted"})

                            if tool_call:
                                fc_ids = [fc.id for fc in tool_call.function_calls if fc.id]
                                already_responded = fc_ids and all(fid in responded_tool_call_ids for fid in fc_ids)
                                if already_responded:
                                    continue
                                function_responses = []
                                for fc in tool_call.function_calls:
                                    func_name = fc.name
                                    args = fc.args or {}
                                    
                                    if func_name in self.tool_mapping:
                                        try:
                                            tool_func = self.tool_mapping[func_name]
                                            if inspect.iscoroutinefunction(tool_func):
                                                result = await tool_func(**args)
                                            else:
                                                loop = asyncio.get_running_loop()
                                                result = await loop.run_in_executor(None, lambda: tool_func(**args))
                                        except Exception as e:
                                            result = f"Error: {e}"
                                        
                                        function_responses.append(types.FunctionResponse(
                                            name=func_name,
                                            id=fc.id,
                                            response={"result": result}
                                        ))
                                        await event_queue.put({"type": "tool_call", "name": func_name, "args": args, "result": result})
                                        if func_name == "hide_stores":
                                            await event_queue.put({"type": "stores_hidden"})
                                        if fc.id:
                                            responded_tool_call_ids.add(fc.id)
                                
                                if function_responses:
                                    await session.send_tool_response(function_responses=function_responses)

                except Exception as e:
                    await event_queue.put({"type": "error", "error": str(e)})
                finally:
                    await event_queue.put(None)

            send_audio_task = asyncio.create_task(send_audio())
            send_video_task = asyncio.create_task(send_video())
            send_text_task = asyncio.create_task(send_text())
            receive_task = asyncio.create_task(receive_loop())

            yield {"type": "ready"}

            try:
                while True:
                    event = await event_queue.get()
                    if event is None:
                        break
                    if isinstance(event, dict) and event.get("type") == "error":
                        yield event
                        break 
                    yield event
            finally:
                send_audio_task.cancel()
                send_video_task.cancel()
                send_text_task.cancel()
                receive_task.cancel()