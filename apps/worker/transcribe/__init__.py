"""The transcription engine adapter — the swappable boundary.

The rest of the worker only ever calls `transcribe(input_path) -> MusicXML`.
Which engine actually runs is chosen by the TRANSCRIBE_ENGINE env var:

    homr  (default) -> the shipped OMR engine (real transcription)
    stub            -> a fixed MusicXML document (fast; no models, no network)

Use `stub` for quick local iteration on the pipeline; use `homr` for real
results. Adding another engine (oemer, Audiveris, a vision LLM, …) means
dropping a new module here and one line below — nothing else in the worker
changes.
"""

import os


def transcribe(input_path: str) -> str:
    """Turn an input image/PDF at `input_path` into a MusicXML string."""
    engine = os.environ.get("TRANSCRIBE_ENGINE", "homr").lower()
    if engine == "stub":
        from .stub import transcribe as run
    elif engine == "homr":
        from .homr_engine import transcribe as run
    else:
        raise ValueError(f"Unknown TRANSCRIBE_ENGINE: {engine!r} (use 'homr' or 'stub')")
    return run(input_path)
