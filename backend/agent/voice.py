"""Gemini Live voice bridge — the /voice WebSocket connects the browser mic to
the Gemini Live API for real-time speech-to-speech with barge-in and mid-
conversation tool calls (still routed through the safety gate via the same
tool registry). Sessions end when the mic closes or the master toggle goes
OFF. The free tier caps sessions around 15 minutes; the frontend transparently
reopens. If USE_ELEVENLABS=true and a key is set, spoken output is re-voiced
through ElevenLabs instead of Gemini's native audio."""
import asyncio
import base64
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from config import get_settings
from tools.registry import dispatch, gemini_declarations

logger = logging.getLogger("jarvis.voice")

INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000


async def run_voice_session(ws: WebSocket) -> None:
    """Bridge one browser WebSocket <-> one Gemini Live session."""
    s = get_settings()
    if not s.gemini_api_key:
        await ws.send_json({"type": "error", "message": "GEMINI_API_KEY not configured"})
        await ws.close()
        return

    from google import genai
    from google.genai import types
    from agent.brain import _build_system_prompt

    client = genai.Client(api_key=s.gemini_api_key)
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=_build_system_prompt(),
        tools=[types.Tool(function_declarations=gemini_declarations())],
        # live transcripts of both sides — the HUD chat doubles as the
        # running transcript of every voice session
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )

    try:
        async with client.aio.live.connect(model=s.gemini_live_model, config=config) as session:
            await ws.send_json({"type": "ready"})

            async def browser_to_gemini():
                while True:
                    msg = await ws.receive_text()
                    data = json.loads(msg)
                    if data.get("type") == "audio":
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=base64.b64decode(data["data"]),
                                mime_type=f"audio/pcm;rate={INPUT_SAMPLE_RATE}",
                            )
                        )
                    elif data.get("type") == "end":
                        return

            async def gemini_to_browser():
                from agent.memory import remember_turn
                user_buf, jarvis_buf = [], []
                while True:
                    async for response in session.receive():
                        server = response.server_content
                        if server and server.input_transcription and server.input_transcription.text:
                            user_buf.append(server.input_transcription.text)
                            await ws.send_json({"type": "transcript", "role": "user",
                                                "text": server.input_transcription.text,
                                                "final": False})
                        if server and server.output_transcription and server.output_transcription.text:
                            jarvis_buf.append(server.output_transcription.text)
                            await ws.send_json({"type": "transcript", "role": "assistant",
                                                "text": server.output_transcription.text,
                                                "final": False})
                        if server and server.interrupted:
                            await ws.send_json({"type": "interrupted"})  # barge-in
                        if server and server.model_turn:
                            for part in server.model_turn.parts or []:
                                if part.inline_data and part.inline_data.data:
                                    audio = _maybe_elevenlabs(part.inline_data.data)
                                    await ws.send_json({
                                        "type": "audio",
                                        "rate": OUTPUT_SAMPLE_RATE,
                                        "data": base64.b64encode(audio).decode(),
                                    })
                        if response.tool_call:
                            responses = []
                            for fc in response.tool_call.function_calls:
                                result = dispatch(fc.name, dict(fc.args or {}))
                                responses.append(types.FunctionResponse(
                                    id=fc.id, name=fc.name, response={"result": result}))
                            await session.send_tool_response(function_responses=responses)
                        if server and server.turn_complete:
                            # persist the finished voice turns to memory
                            if user_buf:
                                remember_turn("user", "".join(user_buf), modality="voice")
                                user_buf.clear()
                            if jarvis_buf:
                                remember_turn("assistant", "".join(jarvis_buf), modality="voice")
                                jarvis_buf.clear()
                            await ws.send_json({"type": "turn_complete"})

            up = asyncio.create_task(browser_to_gemini())
            down = asyncio.create_task(gemini_to_browser())
            done, pending = await asyncio.wait({up, down}, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
    except WebSocketDisconnect:
        logger.info("voice websocket closed by client")
    except Exception as exc:
        logger.exception("voice session error")
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


def _maybe_elevenlabs(pcm_audio: bytes) -> bytes:
    """Optional premium-voice hook. Native Gemini audio passes through by
    default; ElevenLabs re-voicing would need text output + TTS, which is a
    Phase-8 polish item — keep the flag wired but pass audio through."""
    return pcm_audio
