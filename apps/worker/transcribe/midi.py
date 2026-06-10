"""MusicXML -> MIDI conversion.

The OMR engine produces MusicXML; this turns that into a standard MIDI file so
users can download/play the result. It's engine-agnostic — it only needs the
MusicXML string.

We use music21 (a well-established Python music toolkit). Conversion is purely
in-memory except for music21's MIDI writer, which wants a file path, so we round
-trip through a temp file and return the bytes.
"""

import tempfile
from pathlib import Path


def musicxml_to_midi(musicxml: str) -> bytes:
    """Convert a MusicXML document (string) to MIDI bytes."""
    # Imported lazily so the (heavyish) music21 import only happens on real jobs.
    from music21 import converter

    score = converter.parseData(musicxml, format="musicxml")

    tmp = Path(tempfile.mkdtemp(prefix="midi-")) / "score.mid"
    try:
        score.write("midi", fp=str(tmp))
        return tmp.read_bytes()
    finally:
        tmp.unlink(missing_ok=True)
        tmp.parent.rmdir()
