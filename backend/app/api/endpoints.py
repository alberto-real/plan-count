from __future__ import annotations

import json
import tempfile
from pathlib import Path

from ezdxf import DXFStructureError
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import TypeAdapter, ValidationError
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models import LegendEntry, LegendProposalResponse, StyleGroup, UploadResponse
from app.services.auth_service import verify_token
from app.services.dxf_service import detect_unit, group_measurable_geometry_by_style
from app.services.legend_matching_service import match_geometry_to_legend
from app.services.legend_service import render_preview_png
from app.services.llm_service import LegendReadingService, OpenRouterLegendReader

import ezdxf

router = APIRouter()

_legend_reader: LegendReadingService = OpenRouterLegendReader(
    api_key=settings.openrouter_api_key, model=settings.legend_model
)

_LEGEND_LIST_ADAPTER = TypeAdapter(list[LegendEntry])


@router.post("/legend", response_model=LegendProposalResponse, dependencies=[Depends(verify_token)])
async def read_legend(file: UploadFile = File(...)) -> LegendProposalResponse:
    doc = await _read_dxf_upload(file)

    style_groups = group_measurable_geometry_by_style(doc)
    if not style_groups:
        raise HTTPException(status_code=400, detail="No measurable geometry found in legend DXF")

    candidates = [
        StyleGroup(colorHex=color, linetype=linetype, lineweight=lineweight, linearMeters=round(total, 3))
        for (color, linetype, lineweight), total in style_groups.items()
    ]
    try:
        image_png = await run_in_threadpool(render_preview_png, doc)
        entries = await run_in_threadpool(_legend_reader.read_legend, image_png, candidates)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Legend reading service failed") from exc

    return LegendProposalResponse(entries=entries)


@router.post("/upload", response_model=UploadResponse, dependencies=[Depends(verify_token)])
async def upload_dxf(file: UploadFile = File(...), legend: str = Form(...)) -> UploadResponse:
    try:
        legend_entries = _LEGEND_LIST_ADAPTER.validate_python(json.loads(legend))
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid legend payload") from exc

    doc = await _read_dxf_upload(file)
    style_groups = group_measurable_geometry_by_style(doc)
    matched, undetermined = match_geometry_to_legend(style_groups, legend_entries, settings.color_match_tolerance)

    return UploadResponse(matched=matched, undetermined=undetermined, detectedUnit=detect_unit(doc))


async def _read_dxf_upload(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".dxf"):
        raise HTTPException(status_code=400, detail="Only .dxf files are supported")

    contents = await file.read()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413, detail=f"File exceeds maximum size of {settings.max_upload_size_mb}MB"
        )

    tmp_path = _write_temp_dxf(contents)
    try:
        return ezdxf.readfile(str(tmp_path))
    except (DXFStructureError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid DXF") from exc
    finally:
        tmp_path.unlink(missing_ok=True)


def _write_temp_dxf(contents: bytes) -> Path:
    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tmp:
        tmp.write(contents)
        return Path(tmp.name)
