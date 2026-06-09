"""Stub engine — returns a fixed MusicXML document.

Lets you exercise the whole pipeline (upload → queue → worker → result →
preview) instantly, without downloading models or hitting the network. Select
it with TRANSCRIBE_ENGINE=stub.
"""

# A minimal but valid MusicXML 3.1 document: one measure, a single whole note
# (middle C).
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
    """STUB: ignore the input and return a fixed MusicXML document."""
    return _STUB_MUSICXML
