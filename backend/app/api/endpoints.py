from __future__ import annotations

import tempfile
from pathlib import Path

from ezdxf import DXFStructureError
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.config import settings
from app.models import LayerResult, UploadResponse
from app.services.dxf_service import compute_layer_lengths
from app.services.llm_service import LayerNamingService, StubLayerNamingService

router = APIRouter()

_naming_service: LayerNamingService = StubLayerNamingService()


@router.post("/upload", response_model=UploadResponse)
async def upload_dxf(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".dxf"):
        raise HTTPException(status_code=400, detail="Only .dxf files are supported")

    contents = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.max_upload_size_mb}MB",
        )

    tmp_path = _write_temp_dxf(contents)
    try:
        lengths = compute_layer_lengths(tmp_path)
    except (DXFStructureError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid DXF file: {exc}") from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    return _build_response(lengths)


def _write_temp_dxf(contents: bytes) -> Path:
    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
        tmp.write(contents)
        return Path(tmp.name)


def _build_response(lengths: dict[str, float]) -> UploadResponse:
    raw_names = list(lengths.keys())

    try:
        material_map = _naming_service.map_layer_names(raw_names)
    except Exception:
        # A naming-service failure must never block the measurement
        # result: degrade to "everything undetermined" instead of
        # raising, since the linear-meter data is still valid.
        material_map = {}

    layers: list[LayerResult] = []
    undetermined: list[str] = []

    for raw_name, meters in lengths.items():
        material_name = material_map.get(raw_name)
        if material_name is None:
            material_name = raw_name
            undetermined.append(raw_name)
        layers.append(
            LayerResult(
                rawLayerName=raw_name,
                materialName=material_name,
                linearMeters=round(meters, 3),
            )
        )

    return UploadResponse(layers=layers, undeterminedLayers=undetermined)
