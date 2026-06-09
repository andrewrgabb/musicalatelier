"""The transcription engine adapter — the swappable boundary.

The rest of the worker only ever calls `transcribe(input_path) -> MusicXML`.
Today this is a STUB that returns a fixed MusicXML document, which lets us build
and verify the entire pipeline (upload → queue → worker → result → download)
without the slow, finicky ML engine. In Phase 6 we replace the body of
`transcribe()` with homr — and nothing else in the worker changes.

Alternatives you could drop in here: oemer (MIT), Audiveris (subprocess), or a
vision LLM. That's the whole point of keeping this behind one function.
"""

# A minimal but valid MusicXML 3.1 document: one measure, a single whole note
# (middle C). Real engines return a full transcription; the stub returns this.
_STUB_MUSICXML = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Musical Atelier (stub transcription)</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>
"""


def transcribe(input_path: str) -> str:
    """Turn an input image/PDF at `input_path` into a MusicXML string.

    STUB: ignores the input and returns a fixed document. Replaced by homr in
    Phase 6 behind this exact signature.
    """
    return _STUB_MUSICXML
