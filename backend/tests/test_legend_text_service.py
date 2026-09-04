import ezdxf
import ezdxf.colors as ezcolors

from app.services.legend_text_service import (
    _extract_text_candidates,
    _truncate_label,
    extract_legend_entries,
)


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


def _add_label(msp, text: str, position: tuple[float, float]):
    return msp.add_mtext(text, dxfattribs={"insert": (position[0], position[1], 0)})


def _add_swatch(msp, color_aci: int, linetype: str, position: tuple[float, float]):
    return msp.add_lwpolyline(
        [position, (position[0] + 0.4, position[1])],
        dxfattribs={"layer": "0", "color": color_aci, "linetype": linetype},
    )


def test_extract_legend_entries_happy_path():
    doc = ezdxf.new()
    doc.linetypes.add("DASHED2", pattern=[0.5, 0.25, -0.25])
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R1", (0, 10))
    _add_label(msp, "FAÇANA SATE (32 cm) : 20+100+140", (0.4, 10.1))
    _add_swatch(msp, color_aci=30, linetype="CONTINUOUS", position=(0, 9.8))

    entries = extract_legend_entries(doc)

    orange_rgb = "#%02x%02x%02x" % ezcolors.aci2rgb(30)
    assert len(entries) == 1
    assert entries[0].key == "R1"
    assert entries[0].label == "FAÇANA SATE (32 cm)"
    assert entries[0].colorHex == orange_rgb
    assert entries[0].linetype == "CONTINUOUS"
    assert entries[0].lineweight == -3


def test_extract_legend_entries_two_swatches_share_one_key():
    doc = ezdxf.new()
    doc.linetypes.add("DASHED2", pattern=[0.5, 0.25, -0.25])
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R3", (0, 10))
    _add_label(msp, "TRASDOSSAT AUTOPÒRTANT (6,1 cm): 15+48LR.", (0.4, 10.1))
    _add_swatch(msp, color_aci=152, linetype="CONTINUOUS", position=(0, 9.9))
    _add_swatch(msp, color_aci=152, linetype="DASHED2", position=(0, 9.5))

    entries = extract_legend_entries(doc)

    assert len(entries) == 2
    assert {e.key for e in entries} == {"R3"}
    assert {e.label for e in entries} == {"TRASDOSSAT AUTOPÒRTANT (6,1 cm)"}
    assert {e.linetype for e in entries} == {"CONTINUOUS", "DASHED2"}


def test_extract_legend_entries_asterisk_key_inherits_base_label():
    doc = ezdxf.new()
    doc.linetypes.add("DASHED2", pattern=[0.5, 0.25, -0.25])
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R3", (0, 10))
    _add_label(msp, "TRASDOSSAT AUTOPÒRTANT (6,1 cm): 15+48LR.\n \n* (+ porcel·lànic)", (0.4, 10.1))
    _add_swatch(msp, color_aci=152, linetype="CONTINUOUS", position=(0, 9.9))
    _add_bold_mtext(msp, "R3*", (0, 9.6))
    # A distractor label placed nearer to R3* than R3's real label is --
    # without the asterisk-overwrite behavior, plain nearest-neighbor
    # matching would pick this wrong text as R3*'s label instead of R3's.
    _add_label(msp, "NO RELACIONAT AMB R3", (-0.5, 9.5))
    # No dedicated, row-aligned label for R3* -- the nearest text candidate
    # to it is R3's own (multi-paragraph) label, which is exactly the
    # situation this behavior exists for.
    _add_swatch(msp, color_aci=152, linetype="DASHED2", position=(0, 9.5))

    entries = extract_legend_entries(doc)

    by_key = {e.key: e for e in entries}
    assert by_key["R3"].label == "TRASDOSSAT AUTOPÒRTANT (6,1 cm)"
    assert by_key["R3*"].label == "TRASDOSSAT AUTOPÒRTANT (6,1 cm)"
    assert by_key["R3*"].linetype == "DASHED2"


def test_extract_legend_entries_drops_swatch_with_no_key_nearby():
    doc = ezdxf.new()
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R1", (0, 10))
    _add_label(msp, "FAÇANA SATE (32 cm)", (0.4, 10.1))
    _add_swatch(msp, color_aci=30, linetype="CONTINUOUS", position=(0, 9.8))
    _add_swatch(msp, color_aci=1, linetype="CONTINUOUS", position=(500, 500))  # nowhere near any key

    entries = extract_legend_entries(doc)

    assert len(entries) == 1
    assert entries[0].key == "R1"


def test_extract_legend_entries_key_with_no_label_gets_empty_string():
    doc = ezdxf.new()
    msp = doc.modelspace()
    _add_bold_mtext(msp, "R1", (0, 10))
    _add_swatch(msp, color_aci=30, linetype="CONTINUOUS", position=(0, 9.8))

    entries = extract_legend_entries(doc)

    assert entries[0].label == ""


def test_extract_legend_entries_realistic_multi_row_layout():
    # Mirrors colab/CleanLegend.dxf's row spacing/offsets: several rows,
    # each with a bold key, a label a bit to the right and slightly above
    # its key, and a swatch a bit below its key -- as an integration check
    # of threshold derivation across more than one row.
    doc = ezdxf.new()
    doc.linetypes.add("DASHED2", pattern=[0.5, 0.25, -0.25])
    msp = doc.modelspace()
    rows = [
        ("R1", "FAÇANA SATE (32 cm) : 20+100", 1278.3, 30, "CONTINUOUS"),
        ("R2", "FAÇANA SATE + PORCELÀNIC (32 cm) : 20+100", 1276.8, 30, "DASHED2"),
        ("R5", "PARET D'OBRA DE FÀBRICA (15 cm)\nMaó calat", 1271.2, 114, "CONTINUOUS"),
        ("R6", "TRASDOSSAT PILARS (3 cm)\nTrasdossat directe", 1270.4, 217, "CONTINUOUS"),
        ("R7", "Arrebossat amb morter i pintat", 1269.6, 31, "DASHED2"),
    ]
    for key, label, y, color_aci, linetype in rows:
        _add_bold_mtext(msp, key, (3160.1, y))
        _add_label(msp, label, (3160.5, y - 0.1))
        _add_swatch(msp, color_aci=color_aci, linetype=linetype, position=(3159.95, y - 0.2))

    entries = extract_legend_entries(doc)

    by_key = {e.key: e for e in entries}
    assert len(entries) == 5
    assert by_key["R1"].label == "FAÇANA SATE (32 cm)"
    assert by_key["R7"].label == "Arrebossat amb morter i pintat"
    assert by_key["R6"].colorHex == "#%02x%02x%02x" % ezcolors.aci2rgb(217)
