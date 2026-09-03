import pytest

from app.models import LegendEntry
from app.services.legend_matching_service import match_geometry_to_legend


def test_exact_color_and_style_match():
    style_groups = {("#ff0000", "CONTINUOUS", 25): 10.0}
    legend = [LegendEntry(key="R1", label="Wall A", colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25)]
    matched, undetermined = match_geometry_to_legend(style_groups, legend, color_tolerance=30.0)
    assert [m.model_dump() for m in matched] == [
        {"key": "R1", "label": "Wall A", "colorHex": "#ff0000", "linearMeters": 10.0}
    ]
    assert [u.model_dump() for u in undetermined] == []


def test_match_within_color_tolerance():
    style_groups = {("#fe0101", "CONTINUOUS", 25): 5.0}  # 1 unit off in R and B channels
    legend = [LegendEntry(key="R1", label="Wall A", colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25)]
    matched, undetermined = match_geometry_to_legend(style_groups, legend, color_tolerance=30.0)
    assert len(matched) == 1
    assert matched[0].key == "R1"
    assert [u.model_dump() for u in undetermined] == []


def test_no_match_when_color_outside_tolerance():
    style_groups = {("#00ff00", "CONTINUOUS", 25): 5.0}
    legend = [LegendEntry(key="R1", label="Wall A", colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25)]
    matched, undetermined = match_geometry_to_legend(style_groups, legend, color_tolerance=30.0)
    assert [m.model_dump() for m in matched] == []
    assert [u.model_dump() for u in undetermined] == [
        {"colorHex": "#00ff00", "linetype": "CONTINUOUS", "lineweight": 25, "linearMeters": 5.0}
    ]


def test_same_color_different_linetype_stays_separate():
    """The R3/R3* case: identical color, distinguished only by linetype."""
    style_groups = {
        ("#0000ff", "CONTINUOUS", 25): 8.7,
        ("#0000ff", "DASHED2", 25): 20.275,
    }
    legend = [
        LegendEntry(key="R3", label="Trasdossat", colorHex="#0000ff", linetype="CONTINUOUS", lineweight=25),
        LegendEntry(key="R3*", label="Trasdossat humit", colorHex="#0000ff", linetype="DASHED2", lineweight=25),
    ]
    matched, undetermined = match_geometry_to_legend(style_groups, legend, color_tolerance=30.0)
    totals = {row.key: row.linearMeters for row in matched}
    assert totals == {"R3": pytest.approx(8.7), "R3*": pytest.approx(20.275)}
    assert [u.model_dump() for u in undetermined] == []


def test_no_match_when_linetype_differs_despite_identical_color():
    style_groups = {("#0000ff", "HIDDEN", 25): 3.0}
    legend = [LegendEntry(key="R3", label="Trasdossat", colorHex="#0000ff", linetype="CONTINUOUS", lineweight=25)]
    matched, undetermined = match_geometry_to_legend(style_groups, legend, color_tolerance=30.0)
    assert [m.model_dump() for m in matched] == []
    assert undetermined[0].linetype == "HIDDEN"


def test_multiple_style_groups_matching_same_key_are_summed():
    style_groups = {
        ("#ff0000", "CONTINUOUS", 25): 4.0,
        ("#fe0000", "CONTINUOUS", 25): 6.0,  # slightly different but within tolerance
    }
    legend = [LegendEntry(key="R1", label="Wall A", colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25)]
    matched, undetermined = match_geometry_to_legend(style_groups, legend, color_tolerance=30.0)
    assert [m.model_dump() for m in matched] == [
        {"key": "R1", "label": "Wall A", "colorHex": "#ff0000", "linearMeters": 10.0}
    ]


def test_empty_style_groups_returns_empty_results():
    legend = [LegendEntry(key="R1", label="Wall A", colorHex="#ff0000", linetype="CONTINUOUS", lineweight=25)]
    matched, undetermined = match_geometry_to_legend({}, legend, color_tolerance=30.0)
    assert [m.model_dump() for m in matched] == []
    assert [u.model_dump() for u in undetermined] == []
