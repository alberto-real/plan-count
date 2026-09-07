from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from ezdxf.document import Drawing

from app.models import LegendEntry
from app.services.dxf_service import StyleKey, is_dashed_linetype, iter_measurable_styles_with_position, iter_with_blocks

_KEY_PATTERN = re.compile(r"^[A-Za-zÀ-ÿ]{0,3}\d{1,3}\*?$")
_MAX_KEY_LENGTH = 6
_BOLD_MARKER = re.compile(r"\|b1\|")

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _TextCandidate:
    text: str
    position: tuple[float, float]
    is_key: bool


def _is_bold_mtext(entity) -> bool:
    return bool(_BOLD_MARKER.search(entity.dxf.text))


def _matches_key_pattern(text: str) -> bool:
    return len(text) <= _MAX_KEY_LENGTH and bool(_KEY_PATTERN.match(text))


def _extract_text_candidates(doc: Drawing) -> list[_TextCandidate]:
    """Every non-blank `TEXT`/`MTEXT` in the modelspace, classified as a
    `key` candidate (short alphanumeric code, bold when boldness is knowable)
    or a `label` candidate (everything else).

    Boldness only matters for `MTEXT`, which alone carries inline formatting
    codes (`|b1|` for bold) in its raw `dxf.text`. A plain `TEXT` entity has
    no such concept, so the pattern/length check decides on its own for
    those. An `MTEXT` that matches the pattern but is *not* bold is a label
    candidate, not a key — this is what makes boldness load-bearing rather
    than decorative (see spec §Decisions).
    """
    candidates: list[_TextCandidate] = []
    for entity in iter_with_blocks(doc.modelspace()):
        if entity.dxftype() not in ("TEXT", "MTEXT"):
            continue

        if entity.dxftype() == "MTEXT":
            text = entity.plain_text().strip()
            is_bold_capable = True
            is_bold = _is_bold_mtext(entity)
            position = (entity.dxf.insert[0], entity.dxf.insert[1])
        else:
            text = entity.dxf.text.strip()
            is_bold_capable = False
            is_bold = False
            placement_point = entity.get_placement()[1]
            position = (placement_point[0], placement_point[1])

        if not text:
            continue

        is_key = _matches_key_pattern(text) and (is_bold or not is_bold_capable)
        candidates.append(_TextCandidate(text=text, position=position, is_key=is_key))

    return candidates


def _truncate_label(raw_text: str) -> str:
    """A label's full multi-paragraph description, cut down to its short
    human-readable name: everything before the first `":"` or `"\\n"`
    (whichever comes first), stripped of surrounding whitespace."""
    colon_index = raw_text.find(":")
    newline_index = raw_text.find("\n")
    cut_points = [i for i in (colon_index, newline_index) if i != -1]
    cut = min(cut_points) if cut_points else len(raw_text)
    return raw_text[:cut].strip()


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def _median_nearest_key_distance(keys: list[_TextCandidate]) -> float:
    distances: list[float] = []
    for i, key in enumerate(keys):
        others = [_distance(key.position, other.position) for j, other in enumerate(keys) if j != i]
        if others:
            distances.append(min(others))
    if not distances:
        return 1.0
    distances.sort()
    mid = len(distances) // 2
    if len(distances) % 2 == 1:
        return distances[mid]
    return (distances[mid - 1] + distances[mid]) / 2


def _match_threshold(keys: list[_TextCandidate]) -> float:
    if len(keys) < 2:
        return 1.0
    return 2 * _median_nearest_key_distance(keys)


def _nearest_within(
    position: tuple[float, float], candidates: list[_TextCandidate], threshold: float
) -> _TextCandidate | None:
    best: _TextCandidate | None = None
    best_distance = threshold
    for candidate in candidates:
        distance = _distance(position, candidate.position)
        if distance <= best_distance:
            best, best_distance = candidate, distance
    return best


def extract_legend_entries(doc: Drawing) -> list[LegendEntry]:
    """Read every legend row's `key`/`label`/style directly from the DXF's
    real geometry and text — no rendering, no external model. See
    `docs/superpowers/specs/2026-09-04-geometric-legend-reading-design.md`
    for the full rationale and matching rules.

    Known limitation: any measurable `LINE`/`LWPOLYLINE` within the matching
    threshold of a key — not just its intended swatch — becomes a row (e.g.
    a table border or leader line drawn near a key). The de-duplication
    below only collapses entries that end up with an *identical*
    `(key, style)` pair; a spurious entity with a different style near the
    same key still produces its own, wrong row. Filtering by swatch length
    or a frontend "remove row" control are the follow-up mitigations for
    this, not yet implemented.
    """
    text_candidates = _extract_text_candidates(doc)
    keys = [c for c in text_candidates if c.is_key]
    labels = [c for c in text_candidates if not c.is_key]
    threshold = _match_threshold(keys)

    swatches: list[tuple[StyleKey, tuple[float, float]]] = iter_measurable_styles_with_position(doc)

    matches: list[tuple[_TextCandidate, StyleKey]] = []
    for style, position in swatches:
        key_candidate = _nearest_within(position, keys, threshold)
        if key_candidate is None:
            logger.warning("legend swatch %r has no key text within threshold; dropped", style)
            continue
        matches.append((key_candidate, style))

    deduped_matches: list[tuple[_TextCandidate, StyleKey]] = []
    seen: set[tuple[str, StyleKey]] = set()
    for key_candidate, style in matches:
        dedup_key = (key_candidate.text, style)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        deduped_matches.append((key_candidate, style))
    matches = deduped_matches

    if not matches:
        return []

    label_by_key: dict[str, str] = {}
    for key_candidate in {key for key, _ in matches}:
        label_candidate = _nearest_within(key_candidate.position, labels, threshold)
        label_by_key[key_candidate.text] = _truncate_label(label_candidate.text) if label_candidate else ""

    for key_text in list(label_by_key):
        if key_text.endswith("*"):
            base_key = key_text.rstrip("*")
            if base_key in label_by_key:
                label_by_key[key_text] = label_by_key[base_key]

    return [
        LegendEntry(
            key=key_candidate.text,
            label=label_by_key[key_candidate.text],
            colorHex=style[0],
            linetype=style[1],
            lineweight=style[2],
            isDashed=is_dashed_linetype(style[1]),
        )
        for key_candidate, style in matches
    ]
