"""The transcription engine adapter.

The rest of the worker only ever calls `transcribe(input_path, options) -> MusicXML`.
The engine is **Audiveris** (Java + Tesseract, driven via its batch CLI). Keeping
this one-line indirection means the worker loop never imports the engine module
directly, so swapping engines later is a single edit here.
"""

from .audiveris_engine import transcribe

__all__ = ["transcribe"]
