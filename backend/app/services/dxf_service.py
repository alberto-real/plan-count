from __future__ import annotations

import logging
from pathlib import Path

import ezdxf
import ezdxf.colors as ezcolors
import ezdxf.lldxf.const
from ezdxf.document import Drawing

logger = logging.getLogger(__name__)

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

    # Layers with zero measurable entities are excluded entirely (nothing
    # to report) — this also covers a zero-length LINE, or any other
    # combination of entities that sums to exactly zero on a layer.
    return {layer: total for layer, total in lengths.items() if total != 0.0}


def _entity_length(entity) -> float | None:
    dxftype = entity.dxftype()

    if dxftype == "LINE":
        return _distance(entity.dxf.start, entity.dxf.end)

    if dxftype == "LWPOLYLINE":
        points = list(entity.get_points("xy"))
        if len(points) < 2:
            return None
        total = 0.0
        for i in range(len(points) - 1):
            total += _distance(points[i], points[i + 1])
        if entity.closed:
            total += _distance(points[-1], points[0])
        return total

    return None


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


StyleKey = tuple[str, str, int]


def _safe_layer(doc: Drawing, name: str):
    """`doc.layers.get(name)` raises `DXFTableEntryError` (not `None`) for a
    layer name that isn't in the layers table — a common situation in real
    architect DXF exports, where entities sit on layers absent from that
    file's layer table. Callers here want the same "no layer found" fallback
    they'd get from a lookup that returns `None`."""
    try:
        return doc.layers.get(name)
    except ezdxf.lldxf.const.DXFTableEntryError:
        return None


def iter_with_blocks(entities, depth: int = 0, max_depth: int = 3):
    """Yield every entity in `entities`, plus (recursively, up to
    `max_depth`) the contents of any `INSERT` found, transformed into
    world coordinates via `virtual_entities()`.

    Real architectural DXF exports commonly keep all measurable geometry
    inside a single bound-XREF `INSERT` rather than loose in the
    modelspace — iterating `msp` alone misses it entirely.
    """
    for entity in entities:
        yield entity
        if entity.dxftype() == "INSERT" and depth < max_depth:
            try:
                nested = list(entity.virtual_entities())
            except Exception:
                logger.warning(
                    "virtual_entities() failed for INSERT %r; nested geometry skipped",
                    entity.dxf.handle,
                    exc_info=True,
                )
                nested = []
            yield from iter_with_blocks(nested, depth + 1, max_depth)


def _effective_color_hex(entity, doc: Drawing) -> str:
    true_color = entity.dxf.get("true_color", None)
    if true_color is not None:
        r, g, b = ezcolors.int2rgb(true_color)
        return "#%02x%02x%02x" % (r, g, b)

    aci = entity.dxf.color  # 256 = BYLAYER, 0 = BYBLOCK, 1-255 = explicit ACI
    if aci == 256:
        layer = _safe_layer(doc, entity.dxf.layer)
        aci = layer.color if layer else 7
    elif aci == 0:
        aci = 7
    return "#%02x%02x%02x" % ezcolors.aci2rgb(aci)


def _effective_linetype(entity, doc: Drawing) -> str:
    linetype = entity.dxf.linetype
    if linetype == "BYLAYER":
        layer = _safe_layer(doc, entity.dxf.layer)
        linetype = layer.dxf.linetype if layer else "CONTINUOUS"
    return linetype.upper()


def _effective_lineweight(entity, doc: Drawing) -> int:
    lineweight = entity.dxf.lineweight
    if lineweight == -1:  # BYLAYER
        layer = _safe_layer(doc, entity.dxf.layer)
        return layer.dxf.lineweight if layer else -3
    return lineweight


def group_measurable_geometry_by_style(doc: Drawing) -> dict[StyleKey, float]:
    """Sum linear meters per `(colorHex, linetype, lineweight)` across every
    measurable `LINE`/`LWPOLYLINE` in the document's modelspace, including
    ones nested inside `INSERT` block references.

    This is the material-relevant primitive for this sub-project — it
    replaces per-layer grouping (`compute_layer_lengths_from_doc`, still
    kept for its existing tests/callers) as what actually distinguishes
    materials in real files, where layer names are drafting conventions
    and the visual style is what the legend keys off.
    """
    msp = doc.modelspace()
    totals: dict[StyleKey, float] = {}

    for entity in iter_with_blocks(msp):
        length = _entity_length(entity)
        if length is None:
            continue
        style: StyleKey = (
            _effective_color_hex(entity, doc),
            _effective_linetype(entity, doc),
            _effective_lineweight(entity, doc),
        )
        totals[style] = totals.get(style, 0.0) + length

    return {style: total for style, total in totals.items() if total != 0.0}
