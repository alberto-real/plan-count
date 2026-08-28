# PlanCount — Backend Core Design

Status: Approved (sub-project 1 of 4)
Related: [PROMPT.md](../../../PROMPT.md)

## 1. Scope

This is the **first of four sub-projects** decomposed from the full PlanCount spec
(PROMPT.md):

1. **Backend core** (this document)
2. Frontend core (Angular upload UI + results table, no auth)
3. Auth + i18n (Keycloak OIDC, ca/es/en translations)
4. Infra + Deploy (docker-compose, nginx, GitHub Actions to OCI)

Each sub-project gets its own spec → implementation plan → implementation cycle.
This document covers only the backend DXF-processing service.

**Explicitly out of scope for this sub-project:**
- `.dwg` → `.dxf` conversion (ODA File Converter) — DXF-only for now
- Real LLM calls to OpenRouter — a stub implementation is used behind an interface
- Authentication — the API is unauthenticated for this pass
- Any frontend, Docker, or nginx work
- Persistence/database — the service is stateless

## 2. Responsibility Split (unchanged from PROMPT.md)

- **Python (`ezdxf`)**: the only component that reads geometry and computes linear
  meters. This is the sole mathematical calculation performed by the system.
- **LLM (behind a stub for now)**: maps raw CAD layer names to human-readable
  material names. Never performs math. When it cannot confidently determine a
  material for a layer, it simply omits that layer from its output map — it does
  not fabricate a name.
- **Frontend** (future sub-project 2): multiplies linear meters × height (entered
  as a decimal, in centimeters, via a numeric input) to get area. This
  computation happens client-side; the backend is not involved in it and has no
  endpoint for it.

## 3. API

### `POST /api/upload`

**Request**: `multipart/form-data` with a single `.dxf` file field named `file`.

**Response** (`200 OK`):

```json
{
  "layers": [
    {
      "rawLayerName": "LAY_0725_EXT",
      "materialName": "Yellowish Green Interior",
      "linearMeters": 42.7
    },
    {
      "rawLayerName": "LAY_0899_XYZ",
      "materialName": "LAY_0899_XYZ",
      "linearMeters": 11.3
    }
  ],
  "undeterminedLayers": ["LAY_0899_XYZ"]
}
```

Rules:
- `layers` contains **every** layer found in the DXF that has at least one
  `LINE`/`LWPOLYLINE` entity, with its computed `linearMeters`. No layer's
  length data is ever dropped.
- For a layer the LLM could map, `materialName` is the LLM's human-readable
  name.
- For a layer the LLM could **not** map, `materialName` falls back to the raw
  layer name (so the field is never null and the row is never lost), **and**
  the raw layer name is additionally listed in `undeterminedLayers` — a
  top-level array (there may be more than one) so the frontend can flag all of
  them at once and let the user assign each to an existing legend material or
  create a new one.
- Layers with zero measurable entities are excluded entirely (nothing to
  report).

**Error responses**:
- `400` — uploaded file is not a valid DXF / not parseable by `ezdxf`, or the
  file field is missing / wrong content type.
- `413` — file exceeds a configured max upload size (config value, default
  20 MB).
- `502` — the LLM naming call failed unexpectedly (network/provider error).
  In this case the endpoint still succeeds in spirit: the response degrades to
  treating **all** layers as undetermined (raw name fallback for everyone)
  rather than failing the whole upload — a naming outage must never block a
  measurement result.

## 4. Module Layout

```text
backend/
├── Dockerfile                     # stub for now (real build in sub-project 4)
├── requirements.txt
└── app/
    ├── main.py                    # FastAPI app, CORS, router mount
    ├── config.py                  # Pydantic Settings (env vars incl. stubbed OPENROUTER_API_KEY)
    ├── models.py                  # Pydantic request/response models
    ├── services/
    │   ├── dxf_service.py         # ezdxf parsing → per-layer linear meters
    │   └── llm_service.py         # LayerNamingService ABC + StubLayerNamingService
    └── api/
        └── endpoints.py           # POST /api/upload
tests/
├── fixtures/
│   └── sample_two_layers.dxf      # small fixture: 2 layers, LINE + LWPOLYLINE
├── test_dxf_service.py
└── test_endpoints.py
```

## 5. Key Design Decisions

- **Statelessness**: no DB, no session/job store. Upload → parse → respond, all
  in one request. This is deliberately simple for now; if large files later
  need async processing, that becomes its own future sub-project.
- **`LayerNamingService` is an abstract interface** (`map(raw_names: list[str])
  -> dict[str, str]`) with one concrete implementation, `StubLayerNamingService`,
  for this pass. It returns a mapping only for names it "recognizes" via a small
  hardcoded lookup table (to make tests meaningful) and omits the rest — mirroring
  how the real OpenRouter-backed implementation will behave (partial map back,
  omitting anything it can't confidently name). Swapping in the real
  implementation later requires no change to `endpoints.py` or `dxf_service.py`.
- **Length calculation**: `LINE` → straight-line distance between start/end
  points. `LWPOLYLINE` → sum of segment lengths between consecutive vertices,
  including the closing segment when the polyline is closed. Entities on
  layers with no length-bearing geometry are ignored (e.g. text, blocks).
- **Config via `pydantic-settings`**: `OPENROUTER_API_KEY` (stub value ok),
  `MAX_UPLOAD_SIZE_MB` (default 20). No secrets committed; `.env.example`
  documents the vars.

## 6. Testing

- `test_dxf_service.py`: unit tests against the fixture DXF — asserts exact
  linear-meter totals per layer for known geometry.
- `test_endpoints.py`: integration test via FastAPI `TestClient` — uploads the
  fixture, asserts response shape, asserts a deliberately "unrecognized" layer
  name in the fixture ends up in `undeterminedLayers` with its raw name as
  `materialName` and its `linearMeters` preserved.
- Invalid/non-DXF upload → asserts `400`.

## 7. Open Items For Later Sub-Projects (explicitly not decided here)

- Real OpenRouter/Gemini call shape, retry/timeout policy.
- Max concurrent uploads / rate limiting.
- CORS origins (will depend on sub-project 2/4 deployment domains).
