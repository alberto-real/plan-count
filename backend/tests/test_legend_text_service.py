import ezdxf

from app.services.legend_text_service import _extract_text_candidates, _truncate_label


def _add_bold_mtext(msp, text: str, position: tuple[float, float]):
    return msp.add_mtext(
        f"{{\\fArial|b1|i0|c0|p34;{text}}}", dxfattribs={"insert": (position[0], position[1], 0)}
    )


def test_bold_short_mtext_is_a_key_candidate():
    doc = ezdxf.new()
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R1", (0, 0))
    candidates = _extract_text_candidates(doc)
    assert len(candidates) == 1
    assert candidates[0].text == "R1"
    assert candidates[0].position == (0.0, 0.0)
    assert candidates[0].is_key is True


def test_bold_short_mtext_with_asterisk_is_a_key_candidate():
    doc = ezdxf.new()
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R3*", (0, 0))
    candidates = _extract_text_candidates(doc)
    assert candidates[0].is_key is True


def test_non_bold_short_mtext_is_not_a_key_candidate():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_mtext("R1", dxfattribs={"insert": (0, 0, 0)})  # no |b1| formatting code
    candidates = _extract_text_candidates(doc)
    assert candidates[0].text == "R1"
    assert candidates[0].is_key is False


def test_bold_long_mtext_is_not_a_key_candidate():
    doc = ezdxf.new()
    msp = doc.modelspace()
    _add_bold_mtext(msp, "FAÇANA SATE", (0, 0))
    candidates = _extract_text_candidates(doc)
    assert candidates[0].is_key is False


def test_plain_text_entity_short_pattern_is_a_key_candidate():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_text("R2", dxfattribs={"insert": (1, 2, 0)})
    candidates = _extract_text_candidates(doc)
    assert candidates[0].text == "R2"
    assert candidates[0].position == (1.0, 2.0)
    assert candidates[0].is_key is True


def test_plain_text_entity_long_text_is_not_a_key_candidate():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_text("Wall A", dxfattribs={"insert": (0, 0, 0)})
    candidates = _extract_text_candidates(doc)
    assert candidates[0].is_key is False


def test_blank_text_entity_is_excluded():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_text("   ", dxfattribs={"insert": (0, 0, 0)})
    assert _extract_text_candidates(doc) == []


def test_truncate_label_cuts_at_first_colon():
    assert _truncate_label("FAÇANA SATE (32 cm) : 20+100+140") == "FAÇANA SATE (32 cm)"


def test_truncate_label_cuts_at_first_newline_when_no_colon():
    assert _truncate_label("TRASDOSSAT PILARS (3 cm)\nTrasdossat directe...") == "TRASDOSSAT PILARS (3 cm)"


def test_truncate_label_prefers_whichever_delimiter_comes_first():
    assert _truncate_label("A\nB: C") == "A"
    assert _truncate_label("A: B\nC") == "A"


def test_truncate_label_returns_full_stripped_text_when_no_delimiter():
    assert _truncate_label("  Arrebossat amb morter i pintat  ") == "Arrebossat amb morter i pintat"
