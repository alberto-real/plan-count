# PlanCount Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stateless FastAPI backend that parses an uploaded `.dxf` file with `ezdxf`, computes linear meters per layer, maps layer names to material names via a swappable (stubbed) naming service, and returns a single JSON response — no auth, no DB, no DWG support, no frontend/docker work.

**Architecture:** A single unauthenticated `POST /api/upload` endpoint. `dxf_service.py` does all geometry math (the only math in the system). `llm_service.py` defines an abstract `LayerNamingService` with a deterministic `StubLayerNamingService` standing in for the future OpenRouter-backed implementation. The endpoint combines both, falling back to the raw layer name (and listing it in `undeterminedLayers`) whenever naming can't determine a material — a layer's length data is never dropped, and a naming failure never blocks the measurement result.

**Tech Stack:** Python 3.11+, FastAPI, `ezdxf`, Pydantic v2 / `pydantic-settings`, `pytest` + FastAPI `TestClient`.

**Spec:** [docs/superpowers/specs/2026-08-28-backend-core-design.md](../specs/2026-08-28-backend-core-design.md)

## Global Constraints

- Python 3.11+ (per spec section 3 of PROMPT.md).
- `ezdxf` performs the only mathematical/geometric calculation in the system (spec §2). The LLM/naming layer must never compute lengths or invent a name for a layer it can't confidently resolve — it omits that layer from its returned map instead (spec §2, §5).
- The service is stateless: no database, no session/job store, one request in, one response out (spec §5).
- DXF-only for this pass — no `.dwg` / ODA File Converter integration (spec §1).
- The naming service is a stub for this pass — no real OpenRouter/network calls (spec §1, §5).
- No authentication on this endpoint for this pass (spec §1).
- No frontend, Docker (beyond a stub `Dockerfile`), or nginx work — those are separate sub-projects (spec §1).
- Response contract is exact and fixed (spec §3): `layers[]` includes **every** measured layer with `rawLayerName`, `materialName` (LLM name, or raw name as fallback), `linearMeters`; `undeterminedLayers[]` is a top-level array of raw names that fell back. A naming-service failure degrades gracefully to "all layers undetermined" rather than raising an error — the endpoint must still return `200` with measurement data intact (spec §3, resolving the informal "502" language in the spec to concrete behavior: no HTTP error is actually raised for a naming failure, only for the upload/file errors below).
- File validation: reject non-`.dxf` filenames and unparseable DXF content with `400`; reject files over `MAX_UPLOAD_SIZE_MB` (default 20) with `413` (spec §3).

---

## Task 1: Backend Scaffold, Config, and App Entrypoint

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/Dockerfile`
- Create: `backend/.env.example`
- Create: `backend/conftest.py`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/services/__init__.py`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Produces: `app.config.settings` — a `Settings` instance with `.openrouter_api_key: str` and `.max_upload_size_mb: int`, importable by later tasks.
- Produces: `app.main.app` — the FastAPI application instance that Task 4 mounts its router onto.

- [ ] **Step 1: Create the directory layout and empty package markers**

```bash
mkdir -p backend/app/api backend/app/services backend/tests/fixtures
touch backend/app/__init__.py backend/app/api/__init__.py backend/app/services/__init__.py
```

- [ ] **Step 2: Write `backend/requirements.txt`**

```text
fastapi>=0.115,<1.0
uvicorn[standard]>=0.30,<1.0
ezdxf>=1.3,<2.0
pydantic>=2.7,<3.0
pydantic-settings>=2.3,<3.0
python-multipart>=0.0.9
httpx>=0.27,<1.0
pytest>=8.0,<9.0
```

- [ ] **Step 3: Write `backend/.env.example`**

```text
OPENROUTER_API_KEY=stub-key
MAX_UPLOAD_SIZE_MB=20
```

- [ ] **Step 4: Write `backend/app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    openrouter_api_key: str = "stub-key"
    max_upload_size_mb: int = 20


settings = Settings()
```

- [ ] **Step 5: Write `backend/conftest.py`**

Empty file. Its presence in `backend/` makes pytest add `backend/` to `sys.path`, so tests can `import app...` regardless of which directory pytest is invoked from.

```python
# Intentionally empty. Presence of this file anchors pytest's import
# root at backend/, so `import app...` works from any test location.
```

- [ ] **Step 6: Write a minimal `backend/app/main.py` with a health check**

```python
from fastapi import FastAPI

app = FastAPI(title="PlanCount Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Write the failing test for the health check**

`backend/tests/test_main.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 8: Install dependencies and run the test**

```bash
cd backend
pip install -r requirements.txt
pytest tests/test_main.py -v
```

Expected: `PASS` (this endpoint is trivial, so red/green happens in one pass — install first if `ModuleNotFoundError: fastapi` appears, then rerun).

- [ ] **Step 9: Write the stub `backend/Dockerfile`**

```dockerfile
# Stub Dockerfile — full build/runtime configuration defined in the
# Infra + Deploy sub-project. This is enough to build a working image
# for local testing now.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 10: Commit**

```bash
cd ..
git add backend/requirements.txt backend/Dockerfile backend/.env.example backend/conftest.py \
        backend/app/__init__.py backend/app/config.py backend/app/main.py \
        backend/app/api/__init__.py backend/app/services/__init__.py backend/tests/test_main.py
git commit -m "feat(backend): scaffold FastAPI app, config, and health check"
```

---

## Task 2: DXF Parsing Service (Linear Meters per Layer)

**Files:**
- Create: `backend/app/services/dxf_service.py`
- Test: `backend/tests/test_dxf_service.py`

**Interfaces:**
- Consumes: nothing from other tasks — depends only on `ezdxf`.
- Produces:
  - `compute_layer_lengths_from_doc(doc: ezdxf.document.Drawing) -> dict[str, float]` — used directly by Task 4's tests and reused internally.
  - `compute_layer_lengths(dxf_path: str | pathlib.Path) -> dict[str, float]` — the function Task 4's endpoint calls. Raises `ezdxf.DXFStructureError` or `OSError` for unreadable/invalid files (Task 4 catches these).

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_dxf_service.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_dxf_service.py -v
```

Expected: `FAIL` — `ModuleNotFoundError: No module named 'app.services.dxf_service'`.

- [ ] **Step 3: Implement `backend/app/services/dxf_service.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_dxf_service.py -v
```

Expected: `PASS` for all 6 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/app/services/dxf_service.py backend/tests/test_dxf_service.py
git commit -m "feat(backend): compute linear meters per layer from DXF LINE/LWPOLYLINE entities"
```

---

## Task 3: Layer Naming Service (Interface + Stub)

**Files:**
- Create: `backend/app/services/llm_service.py`
- Test: `backend/tests/test_llm_service.py`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `LayerNamingService` (ABC) with abstract method `map_layer_names(self, raw_names: list[str]) -> dict[str, str]`.
  - `StubLayerNamingService(LayerNamingService)` — concrete implementation Task 4 instantiates and calls.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_llm_service.py`:

```python
from app.services.llm_service import LayerNamingService, StubLayerNamingService


def test_stub_is_a_layer_naming_service():
    assert isinstance(StubLayerNamingService(), LayerNamingService)


def test_known_layer_names_are_mapped():
    service = StubLayerNamingService()
    result = service.map_layer_names(["LAY_0725_EXT"])
    assert result == {"LAY_0725_EXT": "Yellowish Green Interior"}


def test_unknown_layer_names_are_omitted_not_guessed():
    service = StubLayerNamingService()
    result = service.map_layer_names(["LAY_9999_MYSTERY"])
    assert result == {}


def test_mixed_known_and_unknown_returns_partial_map():
    service = StubLayerNamingService()
    result = service.map_layer_names(["LAY_0725_EXT", "LAY_9999_MYSTERY"])
    assert result == {"LAY_0725_EXT": "Yellowish Green Interior"}


def test_empty_input_returns_empty_map():
    service = StubLayerNamingService()
    assert service.map_layer_names([]) == {}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_llm_service.py -v
```

Expected: `FAIL` — `ModuleNotFoundError: No module named 'app.services.llm_service'`.

- [ ] **Step 3: Implement `backend/app/services/llm_service.py`**

```python
from abc import ABC, abstractmethod


class LayerNamingService(ABC):
    """Maps raw CAD layer names to human-readable material names.

    Implementations perform semantic interpretation only — they must
    never compute lengths, areas, or any other measurement. A layer
    name the implementation cannot confidently resolve MUST simply be
    omitted from the returned dict rather than guessed at; callers
    treat any omitted name as undetermined and fall back to the raw
    name themselves.
    """

    @abstractmethod
    def map_layer_names(self, raw_names: list[str]) -> dict[str, str]:
        """Return a partial mapping of ``{raw_name: material_name}``.

        Only names this implementation can confidently resolve appear
        as keys in the result. The result may be empty.
        """


class StubLayerNamingService(LayerNamingService):
    """Deterministic stand-in for the future OpenRouter/Gemini-backed
    service.

    Recognizes a small hardcoded table of layer names so callers and
    tests can exercise both the "determined" and "undetermined" paths
    without any network access. A real implementation can replace this
    one later without any change to code that consumes
    `LayerNamingService` — only the class instantiated in
    `api/endpoints.py` changes.
    """

    _KNOWN_MATERIALS: dict[str, str] = {
        "LAY_0725_EXT": "Yellowish Green Interior",
        "WALL_YEL_0923": "Yellow Wall Paint",
    }

    def map_layer_names(self, raw_names: list[str]) -> dict[str, str]:
        return {
            name: self._KNOWN_MATERIALS[name]
            for name in raw_names
            if name in self._KNOWN_MATERIALS
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_llm_service.py -v
```

Expected: `PASS` for all 5 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/app/services/llm_service.py backend/tests/test_llm_service.py
git commit -m "feat(backend): add LayerNamingService interface and deterministic stub"
```

---

## Task 4: Upload Endpoint (Models, Route, Fixture, Integration Tests)

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/api/endpoints.py`
- Modify: `backend/app/main.py` (mount the router)
- Test: `backend/tests/test_endpoints.py`
- Create (generated, then committed): `backend/tests/fixtures/sample_two_layers.dxf`

**Interfaces:**
- Consumes:
  - `app.services.dxf_service.compute_layer_lengths(path) -> dict[str, float]` (Task 2)
  - `app.services.llm_service.StubLayerNamingService().map_layer_names(names) -> dict[str, str]` (Task 3)
  - `app.config.settings.max_upload_size_mb` (Task 1)
- Produces: `POST /api/upload` — the complete public contract described in the spec §3. Nothing later in this plan depends on this task; it's the final integration point.

- [ ] **Step 1: Generate the fixture DXF file**

Run this from the repo root — it builds a small DXF with one layer the stub service recognizes (`LAY_0725_EXT`, as an open `LWPOLYLINE`) and one it doesn't (`WALL_UNKNOWN_042`, as a `LINE`), then saves it:

```bash
python3 - <<'EOF'
import ezdxf

doc = ezdxf.new()
msp = doc.modelspace()

# Recognized by StubLayerNamingService -> "Yellowish Green Interior"
# (0,0)->(6,0) = 6.0, (6,0)->(6,8) = 8.0, open polyline => total 14.0
msp.add_lwpolyline([(0, 0), (6, 0), (6, 8)], dxfattribs={"layer": "LAY_0725_EXT"})

# NOT recognized by the stub -> stays undetermined
# 3-4-5 triangle leg => length 5.0
msp.add_line((0, 0), (3, 4), dxfattribs={"layer": "WALL_UNKNOWN_042"})

doc.saveas("backend/tests/fixtures/sample_two_layers.dxf")
print("fixture written")
EOF
```

Expected output: `fixture written`, and `backend/tests/fixtures/sample_two_layers.dxf` now exists.

- [ ] **Step 2: Write `backend/app/models.py`**

```python
from pydantic import BaseModel


class LayerResult(BaseModel):
    rawLayerName: str
    materialName: str
    linearMeters: float


class UploadResponse(BaseModel):
    layers: list[LayerResult]
    undeterminedLayers: list[str]
```

- [ ] **Step 3: Write the failing integration tests**

`backend/tests/test_endpoints.py`:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
FIXTURE = Path(__file__).parent / "fixtures" / "sample_two_layers.dxf"


def test_upload_returns_layers_and_flags_undetermined():
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
        )

    assert response.status_code == 200
    body = response.json()

    layers_by_name = {layer["rawLayerName"]: layer for layer in body["layers"]}
    assert set(layers_by_name.keys()) == {"LAY_0725_EXT", "WALL_UNKNOWN_042"}

    determined = layers_by_name["LAY_0725_EXT"]
    assert determined["materialName"] == "Yellowish Green Interior"
    assert determined["linearMeters"] == 14.0

    undetermined = layers_by_name["WALL_UNKNOWN_042"]
    assert undetermined["materialName"] == "WALL_UNKNOWN_042"
    assert undetermined["linearMeters"] == 5.0

    assert body["undeterminedLayers"] == ["WALL_UNKNOWN_042"]


def test_upload_rejects_non_dxf_extension():
    response = client.post(
        "/api/upload",
        files={"file": ("notes.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 400


def test_upload_rejects_unparseable_dxf_content():
    response = client.post(
        "/api/upload",
        files={"file": ("broken.dxf", b"this is not a real dxf file", "application/dxf")},
    )
    assert response.status_code == 400


def test_upload_rejects_oversized_file(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_size_mb", 0)  # 0 MB => anything is too big
    with open(FIXTURE, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": ("sample_two_layers.dxf", f, "application/dxf")},
        )
    assert response.status_code == 413
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_endpoints.py -v
```

Expected: `FAIL` — `404 Not Found` (no `/api/upload` route yet) or import errors.

- [ ] **Step 5: Implement `backend/app/api/endpoints.py`**

```python
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
```

- [ ] **Step 6: Mount the router in `backend/app/main.py`**

Replace the full file contents with:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints import router as api_router

app = FastAPI(title="PlanCount Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pytest tests/test_endpoints.py -v
```

Expected: `PASS` for all 4 tests.

- [ ] **Step 8: Run the full backend test suite**

```bash
pytest -v
```

Expected: all tests across Tasks 1–4 `PASS` (health check, DXF service, naming service, endpoints).

- [ ] **Step 9: Commit**

```bash
cd ..
git add backend/app/models.py backend/app/api/endpoints.py backend/app/main.py \
        backend/tests/test_endpoints.py backend/tests/fixtures/sample_two_layers.dxf
git commit -m "feat(backend): add POST /api/upload combining DXF measurement and layer naming"
```

---

## Manual Smoke Test (Optional, After Task 4)

To see it working end-to-end outside pytest:

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
curl -F "file=@tests/fixtures/sample_two_layers.dxf" http://localhost:8000/api/upload
```

Expected JSON: two layers, `LAY_0725_EXT` with `materialName: "Yellowish Green Interior"` and `linearMeters: 14.0`, `WALL_UNKNOWN_042` with `materialName` equal to its own raw name and `linearMeters: 5.0`, and `undeterminedLayers: ["WALL_UNKNOWN_042"]`.
