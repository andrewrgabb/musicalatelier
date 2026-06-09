"""homr engine — the shipped OMR engine (real transcription).

homr exposes a CLI (`homr <image>`) that writes `<image-basename>.musicxml`
next to the input. There's no documented in-process Python API, so we invoke
that console script as a subprocess and read the result back. The subprocess
also conveniently isolates homr's heavy/native work from the worker loop.

First run downloads the ONNX model weights from homr's GitHub releases into its
cache dir (slow, needs network); subsequent runs are fast. In production we
pre-bake the weights into the Docker image (see Phase 8).

homr focuses on pitch/rhythm on the treble/bass clef and omits dynamics,
articulation, and double accidentals — accuracy varies with image quality.
"""

import os
import shutil
import subprocess


def _homr_executable() -> str:
    exe = shutil.which("homr")
    if not exe:
        raise RuntimeError(
            "homr CLI not found on PATH. Install it (uv sync) and run the worker "
            "via `uv run` (or with the venv's bin on PATH)."
        )
    return exe


def transcribe(input_path: str) -> str:
    """Run homr on `input_path` and return the MusicXML it produces."""
    output_path = os.path.splitext(input_path)[0] + ".musicxml"

    proc = subprocess.run(
        [_homr_executable(), input_path],
        capture_output=True,
        text=True,
        timeout=int(os.environ.get("HOMR_TIMEOUT_SECONDS", "600")),
    )
    if proc.returncode != 0:
        # Surface the tail of stderr so the failure is diagnosable in the
        # scores row / logs.
        raise RuntimeError(f"homr failed (exit {proc.returncode}): {proc.stderr[-1500:]}")

    if not os.path.exists(output_path):
        raise RuntimeError(
            "homr completed but produced no MusicXML "
            f"(expected {output_path}). stderr: {proc.stderr[-500:]}"
        )

    try:
        with open(output_path, "r", encoding="utf-8") as f:
            return f.read()
    finally:
        # Clean up the file homr wrote next to our temp input.
        try:
            os.remove(output_path)
        except OSError:
            pass
