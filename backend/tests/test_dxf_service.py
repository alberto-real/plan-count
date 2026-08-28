import ezdxf
import pytest

from app.services.dxf_service import compute_layer_lengths, compute_layer_lengths_from_doc


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
