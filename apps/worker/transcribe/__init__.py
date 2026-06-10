"""The transcription engine adapter — the swappable boundary.

The rest of the worker only ever calls `transcribe(input_path) -> MusicXML`.
Which engine runs is chosen at runtime by the `OMR_ENGINE` env var:

  OMR_ENGINE=homr        -> homr (the shipped default; ONNX, Python)
  OMR_ENGINE=audiveris   -> Audiveris (Java + Tesseract, via its batch CLI)

The matching module is imported **lazily** so we only pull in an engine's heavy
dependencies when it's actually selected (homr's ONNX stack vs. Audiveris's Java
launcher). Each engine module exposes a matching `transcribe(input_path) -> str`,
so nothing else in the worker changes when you switch.
"""

import os

_VALID_ENGINES = ("homr", "audiveris")


def transcribe(input_path: str) -> str:
    """Run the configured OMR engine on `input_path` and return the MusicXML."""
    engine = os.environ.get("OMR_ENGINE", "homr").strip().lower()

    if engine == "homr":
        from .homr_engine import transcribe as _engine
    elif engine == "audiveris":
        from .audiveris_engine import transcribe as _engine
    else:
        raise RuntimeError(
            f"Unknown OMR_ENGINE={engine!r}. Valid values: {', '.join(_VALID_ENGINES)}."
        )

    return _engine(input_path)


__all__ = ["transcribe"]
