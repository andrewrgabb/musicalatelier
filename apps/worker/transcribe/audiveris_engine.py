"""Audiveris engine — the OMR engine (Java + Tesseract).

Audiveris is a Java desktop OMR application that also runs headless from the
command line. There's no in-process API we use here, so we drive its batch CLI
as a subprocess and read the result back — which also isolates its heavy/native
work (a whole JVM) from the worker loop.

Invocation (batch, no GUI, export MusicXML to a folder we control):

    Audiveris [-constant key=value …] -batch -export -output <out-dir> -- <input>

`-export` implies transcription. Audiveris handles **images and PDFs** natively.

Output: by default Audiveris writes a *compressed* MusicXML file — a `.mxl`,
which is a zip containing the actual `.xml` plus a `META-INF/container.xml` that
points at it. We unzip and return the inner XML as a string. (We accept an
uncompressed `.xml`/`.musicxml` too, in case compression is disabled.)

Options: the curated `TranscriptionOptions` (see packages/contracts) are mapped
to Audiveris **application constants** passed as `-constant` flags. The constant
keys below were verified against Audiveris 5.9.0 source.

Finding the launcher (in order):
  1. AUDIVERIS_CMD env var — the launcher path, optionally with args
     (e.g. "/opt/audiveris/bin/Audiveris"). The Docker image sets this.
  2. `Audiveris` / `audiveris` on PATH (a local install).

License note: Audiveris is AGPL-3.0 — its network-use clause applies to a hosted
service.
"""

import os
import shlex
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from .errors import TranscriptionInputError

# Curated option -> Audiveris application-constant key (verified vs 5.9.0 source).
_INPUT_QUALITY_KEY = "org.audiveris.omr.sheet.Profiles.defaultQuality"
_BINARIZATION_KIND_KEY = "org.audiveris.omr.image.FilterDescriptor.defaultKind"
_GLOBAL_THRESHOLD_KEY = "org.audiveris.omr.image.GlobalDescriptor.defaultThreshold"
_OCR_LANGUAGE_KEY = "org.audiveris.omr.text.Language.defaultSpecification"
_SWITCH_KEYS = {
    "smallHeads": "org.audiveris.omr.sheet.ProcessingSwitches.smallHeads",
    "crossHeads": "org.audiveris.omr.sheet.ProcessingSwitches.crossHeads",
    "lyrics": "org.audiveris.omr.sheet.ProcessingSwitches.lyrics",
    "articulations": "org.audiveris.omr.sheet.ProcessingSwitches.articulations",
    "implicitTuplets": "org.audiveris.omr.sheet.ProcessingSwitches.implicitTuplets",
}
# Friendly value -> the exact Java enum constant Audiveris expects.
_INPUT_QUALITY_VALUES = {"synthetic": "Synthetic", "standard": "Standard", "poor": "Poor"}
_BINARIZATION_VALUES = {"global": "GLOBAL", "adaptive": "ADAPTIVE"}


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


def _constant_args(options: dict | None) -> list[str]:
    """Translate curated options into Audiveris `-constant key=value` flags.

    Anything unrecognised or out of range is ignored, so a bad option can never
    break the command — it just isn't applied.
    """
    options = options or {}
    args: list[str] = []

    def add(key: str, value) -> None:
        args.extend(["-constant", f"{key}={value}"])

    quality = _INPUT_QUALITY_VALUES.get(str(options.get("inputQuality", "")).lower())
    if quality:
        add(_INPUT_QUALITY_KEY, quality)

    binarization = _BINARIZATION_VALUES.get(str(options.get("binarization", "")).lower())
    if binarization:
        add(_BINARIZATION_KIND_KEY, binarization)

    threshold = options.get("binarizationThreshold")
    if isinstance(threshold, (int, float)) and 0 <= threshold <= 255:
        add(_GLOBAL_THRESHOLD_KEY, int(threshold))

    language = options.get("ocrLanguage")
    if isinstance(language, str) and language.strip():
        add(_OCR_LANGUAGE_KEY, language.strip())

    switches = options.get("switches") or {}
    for name, key in _SWITCH_KEYS.items():
        value = switches.get(name)
        if isinstance(value, bool):
            add(key, "true" if value else "false")

    return args


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


# Auto-upscale config. Audiveris needs a staff interline of ~15–20 px; small
# images (screenshots, web images) come in well below that. If a run fails with
# the low-resolution signature we upscale the image so its long edge reaches the
# target, capped by a max factor so we never hand the JVM a giant bitmap.
_UPSCALE_TARGET_LONG_EDGE = 3000
_UPSCALE_MAX_FACTOR = 4.0


def _run_audiveris(cmd: list[str], constants: list[str], input_path: str) -> tuple[str | None, str]:
    """Run Audiveris once. Returns (musicxml | None, log_tail).

    Returns None when Audiveris exits cleanly but exports nothing (e.g. no staff
    found). Raises RuntimeError on a non-zero exit (treated as retryable).
    """
    out_dir = Path(tempfile.mkdtemp(prefix="audiveris-"))
    argv = [*cmd, *constants, "-batch", "-export", "-output", str(out_dir), "--", input_path]
    print(f"[audiveris] {' '.join(shlex.quote(a) for a in argv)}")
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=int(os.environ.get("AUDIVERIS_TIMEOUT_SECONDS", "600")),
        )
        # Audiveris logs everything to stdout; keep the tail for diagnostics.
        log_tail = ((proc.stdout or "") + (proc.stderr or ""))[-2000:]
        if proc.returncode != 0:
            raise RuntimeError(f"Audiveris failed (exit {proc.returncode}): {log_tail}")
        try:
            return _find_output(out_dir), log_tail
        except RuntimeError:
            return None, log_tail
    finally:
        # Audiveris also drops a .omr project file in here; clean the whole dir.
        shutil.rmtree(out_dir, ignore_errors=True)


def _looks_low_res(log_tail: str) -> bool:
    low = log_tail.lower()
    return (
        "interline" in low
        or "resolution is too low" in low
        or "flagged as invalid" in low
    )


def _upscale_image(input_path: str) -> str | None:
    """Upscale a too-small raster so Audiveris can detect its staves.

    Returns the path to a new temp PNG, or None if upscaling can't help (PDF,
    already large enough, or Pillow/the image is unavailable).
    """
    if Path(input_path).suffix.lower() == ".pdf":
        return None  # Audiveris rasterises PDFs itself; Pillow can't open them.
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        im = Image.open(input_path)
    except Exception:  # noqa: BLE001 — unreadable image; let Audiveris report it
        return None

    long_edge = max(im.size)
    if long_edge >= _UPSCALE_TARGET_LONG_EDGE:
        return None  # already big enough — upscaling wouldn't change the verdict

    factor = min(_UPSCALE_MAX_FACTOR, _UPSCALE_TARGET_LONG_EDGE / long_edge)
    new_size = (round(im.width * factor), round(im.height * factor))
    fd, out_path = tempfile.mkstemp(suffix=".png", prefix="upscaled-")
    os.close(fd)
    im.convert("RGB").resize(new_size, Image.LANCZOS).save(out_path)
    print(f"[audiveris] upscaled {im.size} -> {new_size} (x{factor:.1f}) and retrying")
    return out_path


def transcribe(input_path: str, options: dict | None = None) -> str:
    """Run Audiveris on `input_path` with `options` and return the MusicXML.

    If the first run fails because the image is too low-resolution for staff
    detection, upscale it once and retry — small images then transcribe without
    the user having to pre-process them.
    """
    cmd = _audiveris_cmd()
    constants = _constant_args(options)

    musicxml, log_tail = _run_audiveris(cmd, constants, input_path)
    if musicxml is not None:
        return musicxml

    if _looks_low_res(log_tail):
        upscaled = _upscale_image(input_path)
        if upscaled is not None:
            try:
                musicxml, log_tail = _run_audiveris(cmd, constants, upscaled)
                if musicxml is not None:
                    return musicxml
            finally:
                os.unlink(upscaled)

    # Still nothing — a deterministic input problem, so don't retry.
    if _looks_low_res(log_tail):
        hint = (
            "Audiveris couldn't detect a staff — the image resolution is too low "
            "even after upscaling. Use a clearer scan/photo (around 300 DPI)."
        )
    else:
        hint = "Audiveris completed but exported no MusicXML."
    raise TranscriptionInputError(f"{hint} Audiveris log:\n{log_tail}")
