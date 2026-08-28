from __future__ import annotations

from pathlib import Path

import ezdxf
from ezdxf.document import Drawing

_LENGTH_ENTITY_TYPES = {"LINE", "LWPOLYLINE"}


def compute_layer_lengths(dxf_path: str | Path) -> dict[str, float]:
    """Read a DXF file and return total linear meters per layer.

    Delegates to `compute_layer_lengths_from_doc` after opening the
    file. Raises `ezdxf.DXFStructureError` or `OSError` if the file
    cannot be read or parsed as DXF — callers are expected to catch
    these and translate them into a client-facing error.
    """
    doc = ezdxf.readfile(str(dxf_path))
    return compute_layer_lengths_from_doc(doc)


def compute_layer_lengths_from_doc(doc: Drawing) -> dict[str, float]:
    """Sum linear meters per layer across LINE and LWPOLYLINE entities.

    Only `LINE` and `LWPOLYLINE` entities contribute length. Any other
    entity type (TEXT, CIRCLE, BLOCK references, etc.) is ignored. A
    layer with no length-bearing geometry does not appear in the
    result at all.
    """
    msp = doc.modelspace()
    lengths: dict[str, float] = {}

    for entity in msp:
        length = _entity_length(entity)
        if length is None:
            continue
        layer = entity.dxf.layer
        lengths[layer] = lengths.get(layer, 0.0) + length

    return lengths


def _entity_length(entity) -> float | None:
    dxftype = entity.dxftype()

    if dxftype == "LINE":
        return _distance(entity.dxf.start, entity.dxf.end)

    if dxftype == "LWPOLYLINE":
        points = list(entity.get_points("xy"))
        if len(points) < 2:
            return 0.0
        total = 0.0
        for i in range(len(points) - 1):
            total += _distance(points[i], points[i + 1])
        if entity.closed:
            total += _distance(points[-1], points[0])
        return total

    return None


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
