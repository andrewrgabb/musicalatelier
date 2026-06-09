"""The transcription engine adapter — the swappable boundary.

The rest of the worker only ever calls `transcribe(input_path) -> MusicXML`.
The shipped engine is **homr**. To use a different engine (oemer, Audiveris, a
vision LLM, …) you change the one import below and add a sibling module with a
matching `transcribe(input_path) -> str` — nothing else in the worker changes.
"""

from .homr_engine import transcribe

__all__ = ["transcribe"]
