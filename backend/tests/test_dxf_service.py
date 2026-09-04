import ezdxf
import ezdxf.colors as ezcolors
import pytest

from app.services.dxf_service import (
    compute_layer_lengths,
    compute_layer_lengths_from_doc,
    detect_unit,
    group_measurable_geometry_by_style,
    iter_with_blocks,
)


def _doc_with_line(layer: str, start: tuple[float, float], end: tuple[float, float]):
    doc = ezdxf.new()
    doc.layers.add(layer) if layer not in doc.layers else None
    msp = doc.modelspace()
    msp.add_line(start, end, dxfattribs={"layer": layer})
    return doc


def test_single_line_length():
    doc = _doc_with_line("WALLS", (0, 0), (3, 4))  # 3-4-5 triangle
    lengths = compute_layer_lengths_from_doc(doc)
    assert lengths == {"WALLS": pytest.approx(5.0)}


def test_open_lwpolyline_length():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_lwpolyline(
        [(0, 0), (6, 0), (6, 8)], dxfattribs={"layer": "EXT_WALL"}
    )
    lengths = compute_layer_lengths_from_doc(doc)
    # (0,0)->(6,0) = 6, (6,0)->(6,8) = 8, not closed: no closing segment
    assert lengths == {"EXT_WALL": pytest.approx(14.0)}


def test_closed_lwpolyline_includes_closing_segment():
    doc = ezdxf.new()
    msp = doc.modelspace()
    pl = msp.add_lwpolyline(
        [(0, 0), (4, 0), (4, 3)], dxfattribs={"layer": "ROOM"}
    )
    pl.closed = True
    lengths = compute_layer_lengths_from_doc(doc)
    # 4 + 3 + closing segment (4,3)->(0,0) = 5 => 4-3-5 triangle perimeter = 12
    assert lengths == {"ROOM": pytest.approx(12.0)}


def test_multiple_entities_on_same_layer_sum():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_line((0, 0), (10, 0), dxfattribs={"layer": "WALLS"})
    msp.add_line((10, 0), (10, 5), dxfattribs={"layer": "WALLS"})
    lengths = compute_layer_lengths_from_doc(doc)
    assert lengths == {"WALLS": pytest.approx(15.0)}


def test_non_geometry_entities_are_ignored():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_text("hello", dxfattribs={"layer": "LABELS"})
    msp.add_circle((0, 0), radius=5, dxfattribs={"layer": "CIRCLES"})
    lengths = compute_layer_lengths_from_doc(doc)
    assert lengths == {}


def test_compute_layer_lengths_reads_from_file(tmp_path):
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_line((0, 0), (3, 4), dxfattribs={"layer": "WALLS"})
    file_path = tmp_path / "sample.dxf"
    doc.saveas(file_path)

    lengths = compute_layer_lengths(file_path)
    assert lengths == {"WALLS": pytest.approx(5.0)}


def test_degenerate_lwpolyline_not_in_result():
    doc = ezdxf.new()
    msp = doc.modelspace()
    # Single-point LWPOLYLINE has no length-bearing geometry
    msp.add_lwpolyline([(0, 0)], dxfattribs={"layer": "DEGENERATE"})
    lengths = compute_layer_lengths_from_doc(doc)
    # Layer should not appear in result, not even with 0.0
    assert lengths == {}


def test_zero_length_line_not_in_result():
    doc = ezdxf.new()
    msp = doc.modelspace()
    # A LINE whose start and end coincide has zero length.
    msp.add_line((5, 5), (5, 5), dxfattribs={"layer": "ZERO_LENGTH"})
    lengths = compute_layer_lengths_from_doc(doc)
    # Layer should not appear in result, not even with 0.0
    assert lengths == {}


def test_style_grouping_separates_by_color():
    doc = ezdxf.new()
    msp = doc.modelspace()
    msp.add_line((0, 0), (3, 4), dxfattribs={"layer": "0", "color": 1})  # red, 3-4-5
    msp.add_line((0, 0), (6, 8), dxfattribs={"layer": "0", "color": 5})  # blue, 6-8-10
    groups = group_measurable_geometry_by_style(doc)
    red_rgb = "#%02x%02x%02x" % ezcolors.aci2rgb(1)
    blue_rgb = "#%02x%02x%02x" % ezcolors.aci2rgb(5)
    assert groups[(red_rgb, "CONTINUOUS", -3)] == pytest.approx(5.0)
    assert groups[(blue_rgb, "CONTINUOUS", -3)] == pytest.approx(10.0)


def test_style_grouping_separates_same_color_different_linetype():
    doc = ezdxf.new()
    doc.linetypes.add("DASHED2", pattern=[0.5, 0.25, -0.25])
    msp = doc.modelspace()
    msp.add_line((0, 0), (10, 0), dxfattribs={"layer": "0", "color": 5, "linetype": "CONTINUOUS"})
    msp.add_line((0, 0), (0, 20), dxfattribs={"layer": "0", "color": 5, "linetype": "DASHED2"})
    groups = group_measurable_geometry_by_style(doc)
    blue_rgb = "#%02x%02x%02x" % ezcolors.aci2rgb(5)
    assert groups[(blue_rgb, "CONTINUOUS", -3)] == pytest.approx(10.0)
    assert groups[(blue_rgb, "DASHED2", -3)] == pytest.approx(20.0)


def test_style_grouping_resolves_bylayer_color_and_linetype():
    doc = ezdxf.new()
    doc.linetypes.add("DASHED2", pattern=[0.5, 0.25, -0.25])
    layer = doc.layers.add("WALLS", color=3, linetype="DASHED2")
    layer.dxf.lineweight = 35
    msp = doc.modelspace()
    # color=256 (BYLAYER) and linetype="BYLAYER" is the ezdxf/DXF default
    # for a new entity unless overridden explicitly.
    msp.add_line((0, 0), (5, 0), dxfattribs={"layer": "WALLS"})
    groups = group_measurable_geometry_by_style(doc)
    green_rgb = "#%02x%02x%02x" % ezcolors.aci2rgb(3)
    assert groups == {(green_rgb, "DASHED2", 35): pytest.approx(5.0)}


def test_style_grouping_recurses_into_insert_blocks():
    doc = ezdxf.new()
    block = doc.blocks.new(name="WALL_UNIT")
    block.add_line((0, 0), (4, 0), dxfattribs={"color": 1})
    msp = doc.modelspace()
    msp.add_blockref("WALL_UNIT", (0, 0))
    groups = group_measurable_geometry_by_style(doc)
    red_rgb = "#%02x%02x%02x" % ezcolors.aci2rgb(1)
    assert groups[(red_rgb, "CONTINUOUS", -3)] == pytest.approx(4.0)


def test_detect_unit_millimeters():
    doc = ezdxf.new()
    doc.header["$INSUNITS"] = 4
    assert detect_unit(doc) == "mm"


def test_detect_unit_centimeters():
    doc = ezdxf.new()
    doc.header["$INSUNITS"] = 5
    assert detect_unit(doc) == "cm"


def test_detect_unit_meters():
    doc = ezdxf.new()
    doc.header["$INSUNITS"] = 6
    assert detect_unit(doc) == "m"


def test_detect_unit_defaults_to_meters_when_unitless():
    doc = ezdxf.new()
    doc.header["$INSUNITS"] = 0
    assert detect_unit(doc) == "m"


def test_detect_unit_defaults_to_meters_for_unsupported_unit():
    doc = ezdxf.new()
    doc.header["$INSUNITS"] = 1  # inches -- not one of mm/cm/m
    assert detect_unit(doc) == "m"


def test_iter_with_blocks_yields_top_level_and_nested_entities():
    doc = ezdxf.new()
    block = doc.blocks.new(name="UNIT")
    block.add_line((0, 0), (1, 0))
    msp = doc.modelspace()
    top_level = msp.add_circle((0, 0), radius=1)
    msp.add_blockref("UNIT", (5, 5))
    entities = list(iter_with_blocks(msp))
    dxftypes = [e.dxftype() for e in entities]
    assert dxftypes.count("CIRCLE") == 1
    assert dxftypes.count("LINE") == 1
    assert dxftypes.count("INSERT") == 1
    assert top_level in entities
