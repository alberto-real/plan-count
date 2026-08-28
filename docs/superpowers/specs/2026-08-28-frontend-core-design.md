# PlanCount — Frontend Core Design

Status: Approved (sub-project 2 of 4)
Related: [PROMPT.md](../../../PROMPT.md), [backend-core-design.md](2026-08-28-backend-core-design.md)

## 1. Scope

This is the **second of four sub-projects** decomposed from the full PlanCount spec:

1. Backend core (done — merged to `main`)
2. **Frontend core** (this document)
3. Auth + i18n (Keycloak OIDC, navbar with login/user, public landing page, ca/es/en translations)
4. Infra + Deploy (docker-compose, nginx, GitHub Actions to OCI)

**Explicitly out of scope for this sub-project** (deferred to sub-project 3):
- Authentication / OIDC — the app has one open, unauthenticated route
- Navbar, login component, landing/home page, post-login redirect
- i18n (`@ngx-translate`/Transloco) — all copy is hardcoded, single language for now
- Any backend changes — this consumes the existing `POST /api/upload` contract as-is
- Docker/nginx real build (only a stub `Dockerfile`, matching the backend sub-project's precedent)

**In scope:** a single working screen — upload a `.dxf`, see per-layer measurements, assign materials to layers the backend couldn't determine, enter a height and see computed area per layer, all client-side after one backend call.

## 2. Backend Contract This Consumes (unchanged, for reference)

`POST /api/upload`, `multipart/form-data`, field name `file`.

Success (`200`):
```json
{
  "layers": [
    { "rawLayerName": "LAY_0725_EXT", "materialName": "Yellowish Green Interior", "linearMeters": 42.7 }
  ],
  "undeterminedLayers": ["LAY_0899_XYZ"]
}
```
A layer in `undeterminedLayers` still has a full entry in `layers[]`, with `materialName` equal to its own raw name (see backend-core-design.md §3).

Errors: `400` (bad extension / unparseable DXF / missing file field) and `413` (oversized) both return `{"detail": "<message>"}`; the frontend surfaces `detail` verbatim when present.

## 3. Responsibility Split (frontend's share)

- **Backend**: the only source of `linearMeters` and the only judge of what's a valid DXF. The frontend never re-validates DXF content and never re-derives lengths.
- **Frontend**: everything downstream of the backend response — computing area (`linearMeters × height`), letting the user name materials the backend couldn't, and presenting it all. No math beyond that one multiplication, and it happens entirely client-side; there is no `/api/calculate` endpoint and none is added.

## 4. Architecture

Angular 22 standalone app, scaffolded with `ng new` (Angular CLI) rather than hand-written config, to guarantee current defaults (standalone by default, `OnPush` by default, no `NgModule`). No routing yet — the root component renders the one feature directly; sub-project 3 introduces the router, navbar, and guards.

Per Angular's current best practices (confirmed via the Angular CLI MCP's best-practices guide for this workspace):
- Standalone components, no explicit `standalone: true`, no explicit `ChangeDetectionStrategy.OnPush` (both are v22 defaults)
- `input()`/`output()` functions, `computed()` for derived state, `inject()` for DI
- `@Service` decorator (not `@Injectable({providedIn: 'root'})`) for the new singleton service
- Native control flow (`@if`/`@for`), no `ngClass`/`ngStyle`
- The height input uses a plain `signal()` with direct `[value]`/`(input)` binding rather than Signal Forms — a deliberate, discussed simplification: Signal Forms are recommended for "new forms" generally, but this is a single unvalidated numeric field, and the overhead isn't justified (YAGNI)

## 5. File Structure

```text
frontend/
├── Dockerfile                          # stub for now (real build in sub-project 4)
├── angular.json
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.ts
    ├── styles.css                      # Tailwind directives
    └── app/
        ├── app.config.ts               # provideHttpClient(), etc.
        ├── app.ts / app.html           # root component, renders <app-plan-calculator>
        └── features/
            └── plan-calculator/
                ├── models.ts                    # LayerResult, UploadResponse (mirrors backend contract)
                ├── upload.service.ts             # @Service — upload(file) -> Observable<UploadResponse>
                ├── plan-calculator.ts             # component logic (signals, computed rows)
                └── plan-calculator.html           # template
```

`core/` and `shared/` from the PROMPT.md tree are not created yet — nothing in this sub-project needs them (no auth interceptor, no shared UI components used by more than one feature). Sub-project 3 introduces them when the navbar/auth need cross-feature code.

## 6. State (all in `PlanCalculatorComponent`, via signals)

- `selectedFile = signal<File | null>(null)`
- `status = signal<'idle' | 'uploading' | 'error' | 'success'>('idle')`
- `errorMessage = signal<string | null>(null)`
- `result = signal<UploadResponse | null>(null)`
- `heightCm = signal<number>(250)` — default of 250cm is a placeholder reasonable wall height, not derived from anything
- `materialOverrides = signal<Record<string, string>>({})` — keyed by `rawLayerName`; reset to `{}` every time a new `result` arrives (a fresh upload discards prior manual assignments, since they applied to the previous file's layers)

Derived:
- `rows = computed(...)`: one row per entry in `result().layers`, with:
  - `rawLayerName`, `linearMeters` (untouched, straight from backend)
  - `effectiveMaterial = materialOverrides()[rawLayerName] ?? layer.materialName`
  - `isUndetermined = result().undeterminedLayers.includes(rawLayerName)` (still true even after a manual override — the backend's determination doesn't change; only the displayed name does)
  - `areaM2 = linearMeters * (heightCm() / 100)`
- `knownMaterials = computed(...)`: deduplicated, sorted list of every `effectiveMaterial` currently in use across `rows()`, for the "assign to existing" dropdown

## 7. UI

Single screen, Tailwind utility classes, no custom design system yet (explicitly deferred — this pass is "functional and clean", visual direction work happens once sub-project 3 introduces the navbar/brand):

- File input (`accept=".dxf"`) + "Analitza" button, disabled while `status() === 'uploading'` or no file selected
- Numeric height input (label "Alçada (cm)", `type="number"`, `step="0.1"`, `min="0"`) bound to `heightCm`
- While `status() === 'uploading'`: a simple loading indicator, submit controls disabled
- On `status() === 'error'`: a dismissible error banner showing `errorMessage()`
- On `status() === 'success'`: the results table — columns Capa (raw name, monospace), Material, Metres lineals, Àrea (m²)
  - A row where `isUndetermined` is true gets a visual flag (amber left border or badge) and its Material cell is a `<select>` populated from `knownMaterials()` plus a literal "+ Nou material" option; choosing that option reveals an inline text input that, on blur/enter, writes into `materialOverrides`
  - A determined row's Material cell is plain text (not editable in this pass — only undetermined rows are editable, matching the earlier product decision that overrides exist to resolve ambiguity, not to relabel confident results)

## 8. Error Handling

`UploadService.upload()` returns an `Observable<UploadResponse>` that can error. The component's submit handler:
- Sets `status` to `'uploading'`, clears `errorMessage`
- On success: sets `result`, resets `materialOverrides` to `{}`, sets `status` to `'success'`
- On error: sets `status` to `'error'` and `errorMessage` to the HTTP error response body's `detail` field when present (an `HttpErrorResponse` whose `error` is a JSON object with a `detail` string), otherwise a generic fallback string (`"S'ha produït un error inesperat."`)

No retry logic, no offline handling — out of scope for this pass.

## 9. Testing

- `upload.service.spec.ts`: using `HttpTestingController`, verify `upload(file)` issues a `POST` to `/api/upload` with a `FormData` body containing the file under the `file` field, and that the returned observable emits the mocked response / propagates a mocked error.
- `plan-calculator.spec.ts`: component-level tests against the `rows` and `knownMaterials` computed signals — given a fake `result` and various `heightCm`/`materialOverrides` values, assert correct `areaM2`, correct `effectiveMaterial` fallback vs override, correct `isUndetermined` flagging, and correct deduplication in `knownMaterials`. No need to spin up a real HTTP call in these tests — inject a fake/stubbed `UploadService`.
- No E2E tests in this pass (no test runner for that decided yet; out of scope).

## 10. Open Items For Later Sub-Projects (explicitly not decided here)

- Visual design direction (typography, color, layout system) — deferred until the navbar/brand exists in sub-project 3.
- i18n of all UI copy — currently hardcoded Catalan/Spanish/English mix is NOT acceptable long-term; this pass hardcodes one language (Catalan, matching this conversation) as a placeholder, to be replaced wholesale by the i18n sub-project, not incrementally.
- Persisting material overrides anywhere (currently pure client-side, lost on refresh) — no requirement surfaced yet to persist them; revisit if/when the product needs saved projects.
- Height input UX (numeric field chosen over a slider per earlier product decision) may get a redesign pass once real visual design happens.
