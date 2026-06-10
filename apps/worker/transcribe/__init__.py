"""The transcription engine adapter — the swappable boundary.

The rest of the worker calls `transcribe(engine, input_path, options) -> MusicXML`.
Two engines ship and the caller (ultimately the user, per attempt) picks which:

  audiveris — Java + Tesseract, via its batch CLI; handles PDFs; tunable options.
  homr      — ONNX/Python; more tolerant of low-res images; no options.

The matching module is imported **lazily** so an engine's heavy dependencies are
only loaded when it's actually used. Each engine module exposes a matching
`transcribe(input_path, options) -> str`.
"""

VALID_ENGINES = ("audiveris", "homr")
DEFAULT_ENGINE = "audiveris"


def transcribe(engine: str, input_path: str, options: dict | None = None) -> str:
    """Run the chosen OMR engine on `input_path` and return the MusicXML."""
    engine = (engine or DEFAULT_ENGINE).strip().lower()

    if engine == "audiveris":
        from .audiveris_engine import transcribe as _engine
    elif engine == "homr":
        from .homr_engine import transcribe as _engine
    else:
        raise RuntimeError(
            f"Unknown OMR engine {engine!r}. Valid values: {', '.join(VALID_ENGINES)}."
        )

    return _engine(input_path, options)


__all__ = ["transcribe", "VALID_ENGINES", "DEFAULT_ENGINE"]
