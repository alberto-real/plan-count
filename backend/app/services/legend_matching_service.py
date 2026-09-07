from __future__ import annotations

from app.models import LegendEntry, MatchedEntry, StyleGroup
from app.services.dxf_service import is_dashed_linetype


def _hex_to_rgb(color_hex: str) -> tuple[int, int, int]:
    color_hex = color_hex.lstrip("#")
    return int(color_hex[0:2], 16), int(color_hex[2:4], 16), int(color_hex[4:6], 16)


def _rgb_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def _find_matching_entry(
    style: tuple[str, str, int], legend: list[LegendEntry], color_tolerance: float
) -> LegendEntry | None:
    color_hex, linetype, _lineweight = style
    group_rgb = _hex_to_rgb(color_hex)

    best: LegendEntry | None = None
    best_distance = color_tolerance
    for entry in legend:
        if entry.linetype != linetype:
            continue
        distance = _rgb_distance(group_rgb, _hex_to_rgb(entry.colorHex))
        if distance <= best_distance:
            best, best_distance = entry, distance
    return best


def match_geometry_to_legend(
    style_groups: dict[tuple[str, str, int], float],
    legend: list[LegendEntry],
    color_tolerance: float,
) -> tuple[list[MatchedEntry], list[StyleGroup]]:
    """Match every measured style group to the closest legend entry.

    A style group matches an entry only if its linetype is exactly equal to
    the entry's, and its color is within `color_tolerance` (Euclidean RGB
    distance) of the entry's color — color alone is deliberately not
    sufficient (two legend rows may share a color and differ only in
    linetype, e.g. the R3/R3* continuous/dashed pair). `lineweight` is not a
    matching criterion: real DXF exports commonly resolve a legend row's
    lineweight differently from the same-material geometry's (e.g. one
    `BYLAYER`-resolved on a different layer than the other), so requiring it
    to match exactly silently dropped otherwise-correct matches into
    `undetermined`. A group matching no entry is returned in `undetermined`
    instead of being dropped.
    """
    totals_by_key: dict[str, float] = {}
    label_by_key: dict[str, str] = {}
    color_by_key: dict[str, str] = {}
    is_dashed_by_key: dict[str, bool] = {}
    undetermined: list[StyleGroup] = []

    for style, linear_meters in style_groups.items():
        entry = _find_matching_entry(style, legend, color_tolerance)
        if entry is None:
            color_hex, linetype, lineweight = style
            undetermined.append(
                StyleGroup(
                    colorHex=color_hex,
                    linetype=linetype,
                    lineweight=lineweight,
                    linearMeters=linear_meters,
                    isDashed=is_dashed_linetype(linetype),
                )
            )
            continue
        totals_by_key[entry.key] = totals_by_key.get(entry.key, 0.0) + linear_meters
        label_by_key[entry.key] = entry.label
        color_by_key[entry.key] = entry.colorHex
        is_dashed_by_key[entry.key] = entry.isDashed

    matched = [
        MatchedEntry(
            key=key,
            label=label_by_key[key],
            colorHex=color_by_key[key],
            linearMeters=round(total, 3),
            isDashed=is_dashed_by_key[key],
        )
        for key, total in totals_by_key.items()
    ]
    return matched, undetermined
