from __future__ import annotations

import re
from dataclasses import dataclass

from ezdxf.document import Drawing

_KEY_PATTERN = re.compile(r"^[A-Za-zÀ-ÿ]{0,3}\d{1,3}\*?$")
_MAX_KEY_LENGTH = 6
_BOLD_MARKER = re.compile(r"\|b1\|")


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
    for entity in doc.modelspace().query("TEXT MTEXT"):
        if entity.dxftype() == "MTEXT":
            text = entity.plain_text().strip()
            is_bold_capable = True
            is_bold = _is_bold_mtext(entity)
        else:
            text = entity.dxf.text.strip()
            is_bold_capable = False
            is_bold = False

        if not text:
            continue

        is_key = _matches_key_pattern(text) and (is_bold or not is_bold_capable)
        position = (entity.dxf.insert[0], entity.dxf.insert[1])
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
