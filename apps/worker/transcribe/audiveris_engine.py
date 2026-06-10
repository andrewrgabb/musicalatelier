"""Audiveris engine — an alternative OMR engine (Java + Tesseract).

Audiveris is a Java desktop OMR application that also runs headless from the
command line. Like homr, there's no in-process API we use here, so we drive its
batch CLI as a subprocess and read the result back — which also isolates its
heavy/native work (a whole JVM) from the worker loop.

Invocation (batch, no GUI, export MusicXML to a folder we control):

    Audiveris -batch -export -output <out-dir> -- <input-file>

`-export` implies transcription. Audiveris handles **images and PDFs** natively
(homr is images-only), so no extra normalisation is needed upstream.

Output: by default Audiveris writes a *compressed* MusicXML file — a `.mxl`,
which is a zip containing the actual `.xml` plus a `META-INF/container.xml` that
points at it. We unzip and return the inner XML as a string. (We accept an
uncompressed `.xml`/`.musicxml` too, in case compression is disabled.)

Finding the launcher (in order):
  1. AUDIVERIS_CMD env var — the launcher path, optionally with args
     (e.g. "/opt/audiveris/bin/Audiveris"). The Docker image sets this.
  2. `Audiveris` / `audiveris` on PATH (a local install).

License note: Audiveris is AGPL-3.0 (same as homr) — its network-use clause
applies to a hosted service.
"""

import os
import shlex
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree


def _audiveris_cmd() -> list[str]:
    configured = os.environ.get("AUDIVERIS_CMD")
    if configured:
        return shlex.split(configured)

    exe = shutil.which("Audiveris") or shutil.which("audiveris")
    if exe:
        return [exe]

    raise RuntimeError(
        "Audiveris launcher not found. Set AUDIVERIS_CMD to its path "
        "(e.g. /opt/audiveris/bin/Audiveris) or put 'Audiveris' on PATH."
    )


def _read_mxl(mxl_path: Path) -> str:
    """Read the inner MusicXML out of a compressed .mxl (a zip archive)."""
    with zipfile.ZipFile(mxl_path) as zf:
        # The standard way: META-INF/container.xml names the rootfile.
        try:
            with zf.open("META-INF/container.xml") as f:
                container = ElementTree.parse(f).getroot()
            # <container><rootfiles><rootfile full-path="score.xml"/>...
            for rootfile in container.iter():
                full_path = rootfile.attrib.get("full-path")
                if full_path:
                    return zf.read(full_path).decode("utf-8")
        except KeyError:
            pass  # no container.xml — fall back to a heuristic

        # Fallback: the first .xml entry that isn't metadata.
        for name in zf.namelist():
            if name.startswith("META-INF/"):
                continue
            if name.lower().endswith((".xml", ".musicxml")):
                return zf.read(name).decode("utf-8")

    raise RuntimeError(f"no MusicXML entry found inside {mxl_path.name}")


def _find_output(out_dir: Path) -> str:
    """Locate and read the MusicXML Audiveris produced under `out_dir`."""
    mxls = sorted(out_dir.rglob("*.mxl"))
    if mxls:
        return _read_mxl(mxls[0])

    for pattern in ("*.musicxml", "*.xml"):
        for path in sorted(out_dir.rglob(pattern)):
            if "META-INF" in path.parts:
                continue
            return path.read_text(encoding="utf-8")

    raise RuntimeError(f"Audiveris produced no MusicXML under {out_dir}")


def transcribe(input_path: str) -> str:
    """Run Audiveris on `input_path` and return the MusicXML it produces."""
    cmd = _audiveris_cmd()
    out_dir = Path(tempfile.mkdtemp(prefix="audiveris-"))

    try:
        proc = subprocess.run(
            [*cmd, "-batch", "-export", "-output", str(out_dir), "--", input_path],
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("AUDIVERIS_TIMEOUT_SECONDS", "600")),
        )
        if proc.returncode != 0:
            # Surface the tail of stderr so the failure is diagnosable in the
            # scores row / logs.
            raise RuntimeError(
                f"Audiveris failed (exit {proc.returncode}): {proc.stderr[-1500:]}"
            )

        return _find_output(out_dir)
    finally:
        # Audiveris also drops a .omr project file in here; clean the whole dir.
        shutil.rmtree(out_dir, ignore_errors=True)
