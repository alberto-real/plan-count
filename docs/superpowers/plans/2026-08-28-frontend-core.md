# PlanCount Frontend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Angular 22 frontend screen that uploads a `.dxf` to the existing backend's `POST /api/upload`, displays per-layer measurements in a table, lets the user assign a material to layers the backend couldn't determine, and computes area (`linearMeters × height`) entirely client-side from a height input in centimeters. No auth, no navbar, no i18n, no routing — those are later sub-projects.

**Architecture:** Angular 22 standalone app (`frontend/`), scaffolded via the `angular-new-app` skill, styled with Tailwind v3. A single feature, `plan-calculator`: `models.ts` (types mirroring the backend response), `upload.service.ts` (a `@Service`-decorated singleton wrapping one `HttpClient.post` call), and `PlanCalculator` (the component: file/height inputs, signals for upload state and the backend result, `computed()` derivations for display rows and known-material options, and inline editing for undetermined layers). The root `App` component renders `PlanCalculator` directly — no router yet.

**Tech Stack:** Angular 22 (standalone components, signals, `@Service`, native control flow), TypeScript strict mode, Tailwind CSS v3, RxJS (for the one HTTP call), Angular's built-in testing tools (`TestBed`, `HttpTestingController`) — whichever test runner `ng new` configures for this CLI version (Karma/Jest/Vitest); every command below uses the runner-agnostic `ng test` / `ng build` CLI targets, never a runner-specific binary.

**Spec:** [docs/superpowers/specs/2026-08-28-frontend-core-design.md](../specs/2026-08-28-frontend-core-design.md)

## Global Constraints

- Angular 22, standalone components only — no `NgModule`, no explicit `standalone: true` (default), no explicit `ChangeDetectionStrategy.OnPush` (default in v22+).
- Signals for all component state; `computed()` for derived state; `inject()` for DI (spec §4).
- Services use the `@Service()` decorator from `@angular/core` (NOT `@Injectable({providedIn: 'root'})`) — confirmed via the Angular CLI MCP's documentation search for this workspace's version: `import {Service} from '@angular/core'; @Service() export class Foo {}`.
- Native control flow (`@if`/`@for`) in templates — never `*ngIf`/`*ngFor`/`ngClass`/`ngStyle`; use `[class.foo]="cond"` bindings instead.
- The height input is a plain `signal<number>` bound directly via `[value]`/`(input)` — NOT Signal Forms. This was a deliberate, discussed simplification for a single unvalidated numeric field (spec §4); do not "upgrade" it to Signal Forms.
- No routing, no navbar, no login, no i18n, no auth of any kind (spec §1) — the app has exactly one screen, rendered directly by the root component.
- The frontend never re-validates DXF content and never re-derives `linearMeters` — that data comes only from the backend response, used as-is (spec §3).
- Area is computed client-side only: `areaM2 = linearMeters * (heightCm / 100)`. There is no `/api/calculate` endpoint and none is added anywhere in this plan.
- Backend contract (unchanged, spec §2): `POST /api/upload` with `multipart/form-data` field `file`; success `200` returns `{ layers: [{ rawLayerName, materialName, linearMeters }], undeterminedLayers: [] }`; errors return `{ "detail": "<message>" }` with status `400`/`413`. The frontend surfaces `detail` verbatim when present, otherwise a generic fallback message.
- `materialOverrides` (the map of manually-assigned material names for undetermined layers) resets to `{}` every time a new upload succeeds — it belongs to the current file's result, not the session (spec §6).
- A manual material override changes the *displayed* material name only; it never changes `isUndetermined` for that row — the backend's determination is a separate fact from the user's display choice (spec §6).
- Only undetermined rows are editable. A determined row's material is plain, non-editable text (spec §7).
- `Dockerfile` in this pass is a stub only, matching the backend sub-project's precedent — no real multi-stage build (spec §1).
- No test-framework-specific spy/mock APIs (e.g. no `jasmine.createSpyObj`, no `spyOn`) in any test in this plan — use plain fake objects and RxJS `of`/`throwError`, so tests remain valid regardless of which runner `ng new` configures.

---

## Task 1: Scaffold Angular Workspace + Tailwind v3

**Files:**
- Create: `frontend/` (entire Angular CLI-generated workspace — exact file list depends on the installed CLI version; do not hand-write these)
- Modify: `frontend/tailwind.config.js` (content globs)
- Modify: `frontend/src/styles.css` (Tailwind directives)

**Interfaces:**
- Produces: a working Angular 22 standalone app at `frontend/`, buildable via `ng build` and testable via `ng test`, with Tailwind v3 utility classes usable in any component template from Task 3 onward.

- [ ] **Step 1: Scaffold the Angular app using the `angular-new-app` skill**

Invoke the `angular-new-app` skill (via the `Skill` tool, skill name `angular-new-app`) to create a new Angular application. Requirements to give it: application name/directory `frontend`, created at the repository root (so the result is `frontend/angular.json`, `frontend/src/...`, matching this monorepo's existing `backend/` sibling), standalone components (the current default — do not add a routing module), CSS stylesheets (Tailwind is layered on manually in Step 3, not via any Angular CLI Tailwind flag), and do not initialize a new git repository (this repository already is one — the CLI may ask about this, answer no / pass whatever flag skips it).

Let the skill determine the exact `ng new`/CLI invocation appropriate for the installed Angular CLI version — do not guess at flags yourself if the skill's own process already covers this.

- [ ] **Step 2: Verify the scaffold builds and its own default tests pass**

```bash
cd frontend
ng build
ng test --watch=false
```

Expected: both succeed with the CLI's own generated default app and its default test(s). If `ng test --watch=false` errors because the configured runner doesn't recognize `--watch=false` (this varies by runner), drop that flag and use whatever the runner's `ng test` needs for a single non-interactive run instead — the goal is one clean, non-hanging test run, not this exact flag.

- [ ] **Step 3: Install and configure Tailwind v3**

```bash
cd frontend
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

This generates `tailwind.config.js` and `postcss.config.js`. Edit `tailwind.config.js`'s `content` array to:

```javascript
content: ['./src/**/*.{html,ts}'],
```

Edit `frontend/src/styles.css` (create it if the scaffold didn't generate one, and ensure it's referenced in `angular.json`'s build `styles` array) to start with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Verify Tailwind is wired up**

Temporarily add a Tailwind utility class (e.g. `class="text-red-500"`) to the root app component's template, run:

```bash
cd frontend
ng build
```

Confirm the build succeeds and the compiled CSS output (check the `dist/` output or the dev-server-served CSS) contains the corresponding Tailwind-generated rule (e.g. grep the built CSS file for `red-500` or the color value it maps to). Then remove the temporary class — this step only proves the pipeline works, it is not meant to leave test markup behind.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Angular 22 app with Tailwind v3"
```

---

## Task 2: Data Models and Upload Service

**Files:**
- Create: `frontend/src/app/features/plan-calculator/models.ts`
- Create: `frontend/src/app/features/plan-calculator/upload.service.ts`
- Test: `frontend/src/app/features/plan-calculator/upload.service.spec.ts`
- Modify: `frontend/src/app/app.config.ts` (add `provideHttpClient()`)

**Interfaces:**
- Produces: `LayerResult` and `UploadResponse` interfaces (exact shape of the backend's JSON response) and `UploadService.upload(file: File): Observable<UploadResponse>`, both importable by Task 3's component.

- [ ] **Step 1: Write `models.ts`**

```typescript
export interface LayerResult {
  rawLayerName: string;
  materialName: string;
  linearMeters: number;
}

export interface UploadResponse {
  layers: LayerResult[];
  undeterminedLayers: string[];
}
```

- [ ] **Step 2: Add `provideHttpClient()` to `frontend/src/app/app.config.ts`**

Open the file as generated by Task 1's scaffold. Add `provideHttpClient` to the imports from `@angular/common/http`, and add `provideHttpClient()` to the existing `providers` array — do not remove or reorder any providers already there (e.g. zoneless change detection or error-listener providers the scaffold may have generated). The result should look like the existing file, plus:

```typescript
import { provideHttpClient } from '@angular/common/http';
// ...alongside whatever else is already imported

// inside the existing providers: [...] array, add:
provideHttpClient(),
```

- [ ] **Step 3: Write the failing test for `UploadService`**

`frontend/src/app/features/plan-calculator/upload.service.spec.ts`:

```typescript
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UploadResponse } from './models';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), UploadService],
    });
    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts the file as FormData under the "file" field to /api/upload', () => {
    const file = new File(['dummy content'], 'sample.dxf', { type: 'application/dxf' });
    const mockResponse: UploadResponse = {
      layers: [{ rawLayerName: 'WALLS', materialName: 'Brick', linearMeters: 10 }],
      undeterminedLayers: [],
    };

    let result: UploadResponse | undefined;
    service.upload(file).subscribe((res) => (result = res));

    const req = httpMock.expectOne('/api/upload');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);

    req.flush(mockResponse);
    expect(result).toEqual(mockResponse);
  });

  it('propagates an HTTP error to the caller', () => {
    const file = new File(['bad'], 'broken.dxf');
    let error: unknown;

    service.upload(file).subscribe({
      error: (err) => (error = err),
    });

    const req = httpMock.expectOne('/api/upload');
    req.flush({ detail: 'Uploaded file is not a valid DXF' }, { status: 400, statusText: 'Bad Request' });

    expect(error).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd frontend
ng test --watch=false
```

Expected: `FAIL` — `upload.service.ts` does not exist yet (module not found / compilation error).

- [ ] **Step 5: Implement `upload.service.ts`**

```typescript
import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UploadResponse } from './models';

@Service()
export class UploadService {
  private readonly http = inject(HttpClient);

  upload(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UploadResponse>('/api/upload', formData);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd frontend
ng test --watch=false
```

Expected: `PASS` for both tests in `upload.service.spec.ts` (and everything from Task 1 still passing).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/features/plan-calculator/models.ts \
        frontend/src/app/features/plan-calculator/upload.service.ts \
        frontend/src/app/features/plan-calculator/upload.service.spec.ts \
        frontend/src/app/app.config.ts
git commit -m "feat(frontend): add UploadResponse models and UploadService"
```

---

## Task 3: PlanCalculator Component (State, Template, Interaction)

**Files:**
- Create: `frontend/src/app/features/plan-calculator/plan-calculator.ts`
- Create: `frontend/src/app/features/plan-calculator/plan-calculator.html`
- Test: `frontend/src/app/features/plan-calculator/plan-calculator.spec.ts`

**Interfaces:**
- Consumes: `UploadService.upload(file) -> Observable<UploadResponse>` (Task 2), `LayerResult`/`UploadResponse` (Task 2).
- Produces: `PlanCalculator`, a standalone component with selector `app-plan-calculator`, that Task 4 renders from the root `App` component. Nothing later in this plan depends on any of its internals beyond the selector.

- [ ] **Step 1: Write `plan-calculator.ts`**

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { UploadResponse } from './models';
import { UploadService } from './upload.service';

type Status = 'idle' | 'uploading' | 'error' | 'success';

export interface PlanRow {
  rawLayerName: string;
  linearMeters: number;
  effectiveMaterial: string;
  isUndetermined: boolean;
  areaM2: number;
}

@Component({
  selector: 'app-plan-calculator',
  imports: [DecimalPipe],
  templateUrl: './plan-calculator.html',
})
export class PlanCalculator {
  private readonly uploadService = inject(UploadService);

  readonly NEW_MATERIAL_OPTION = '__new__';

  readonly selectedFile = signal<File | null>(null);
  readonly status = signal<Status>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly result = signal<UploadResponse | null>(null);
  readonly heightCm = signal<number>(250);
  readonly materialOverrides = signal<Record<string, string>>({});
  readonly newMaterialRowKey = signal<string | null>(null);

  readonly rows = computed<PlanRow[]>(() => {
    const current = this.result();
    if (!current) {
      return [];
    }
    const overrides = this.materialOverrides();
    const heightMeters = this.heightCm() / 100;
    return current.layers.map((layer) => ({
      rawLayerName: layer.rawLayerName,
      linearMeters: layer.linearMeters,
      effectiveMaterial: overrides[layer.rawLayerName] ?? layer.materialName,
      isUndetermined: current.undeterminedLayers.includes(layer.rawLayerName),
      areaM2: layer.linearMeters * heightMeters,
    }));
  });

  readonly knownMaterials = computed<string[]>(() => {
    const names = this.rows().map((row) => row.effectiveMaterial);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  onHeightChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    this.heightCm.set(Number.isFinite(value) ? value : 0);
  }

  onAssignMaterial(rawLayerName: string, materialName: string): void {
    const trimmed = materialName.trim();
    if (!trimmed) {
      return;
    }
    this.materialOverrides.update((current) => ({ ...current, [rawLayerName]: trimmed }));
  }

  onMaterialSelectChange(rawLayerName: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === this.NEW_MATERIAL_OPTION) {
      this.newMaterialRowKey.set(rawLayerName);
      return;
    }
    this.newMaterialRowKey.set(null);
    this.onAssignMaterial(rawLayerName, value);
  }

  onNewMaterialConfirmed(rawLayerName: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.onAssignMaterial(rawLayerName, value);
    this.newMaterialRowKey.set(null);
  }

  onSubmit(): void {
    const file = this.selectedFile();
    if (!file) {
      return;
    }

    this.status.set('uploading');
    this.errorMessage.set(null);

    this.uploadService.upload(file).subscribe({
      next: (response) => {
        this.result.set(response);
        this.materialOverrides.set({});
        this.newMaterialRowKey.set(null);
        this.status.set('success');
      },
      error: (err: unknown) => {
        this.status.set('error');
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  private extractErrorMessage(err: unknown): string {
    if (
      err &&
      typeof err === 'object' &&
      'error' in err &&
      err.error &&
      typeof err.error === 'object' &&
      'detail' in err.error &&
      typeof (err.error as { detail: unknown }).detail === 'string'
    ) {
      return (err.error as { detail: string }).detail;
    }
    return "S'ha produït un error inesperat.";
  }
}
```

- [ ] **Step 2: Write `plan-calculator.html`**

```html
<div class="max-w-4xl mx-auto p-6 space-y-6">
  <div class="flex flex-wrap items-end gap-4">
    <div>
      <label for="dxf-file" class="block text-sm font-medium text-gray-700">Fitxer DXF</label>
      <input
        id="dxf-file"
        type="file"
        accept=".dxf"
        (change)="onFileSelected($event)"
        class="mt-1 block w-full text-sm text-gray-700"
      />
    </div>
    <div>
      <label for="height-cm" class="block text-sm font-medium text-gray-700">Alçada (cm)</label>
      <input
        id="height-cm"
        type="number"
        step="0.1"
        min="0"
        [value]="heightCm()"
        (input)="onHeightChange($event)"
        class="mt-1 block w-32 rounded border border-gray-300 px-2 py-1 text-sm"
      />
    </div>
    <button
      type="button"
      (click)="onSubmit()"
      [disabled]="!selectedFile() || status() === 'uploading'"
      class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      Analitza
    </button>
  </div>

  @if (status() === 'uploading') {
    <p class="text-sm text-gray-500">Analitzant el fitxer...</p>
  }

  @if (status() === 'error') {
    <div class="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ errorMessage() }}
    </div>
  }

  @if (status() === 'success') {
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-gray-200">
          <th class="py-2 pr-4 font-medium text-gray-600">Capa</th>
          <th class="py-2 pr-4 font-medium text-gray-600">Material</th>
          <th class="py-2 pr-4 font-medium text-gray-600">Metres lineals</th>
          <th class="py-2 pr-4 font-medium text-gray-600">Àrea (m²)</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.rawLayerName) {
          <tr
            [class.border-l-4]="row.isUndetermined"
            [class.border-amber-400]="row.isUndetermined"
            class="border-b border-gray-100"
          >
            <td class="py-2 pr-4 font-mono text-xs">{{ row.rawLayerName }}</td>
            <td class="py-2 pr-4">
              @if (row.isUndetermined) {
                @if (newMaterialRowKey() === row.rawLayerName) {
                  <input
                    type="text"
                    placeholder="Nom del material nou"
                    (keydown.enter)="onNewMaterialConfirmed(row.rawLayerName, $event)"
                    (blur)="onNewMaterialConfirmed(row.rawLayerName, $event)"
                    class="rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                } @else {
                  <select
                    [value]="row.effectiveMaterial"
                    (change)="onMaterialSelectChange(row.rawLayerName, $event)"
                    class="rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    @for (material of knownMaterials(); track material) {
                      <option [value]="material">{{ material }}</option>
                    }
                    <option [value]="NEW_MATERIAL_OPTION">+ Nou material</option>
                  </select>
                }
              } @else {
                {{ row.effectiveMaterial }}
              }
            </td>
            <td class="py-2 pr-4">{{ row.linearMeters | number: '1.2-2' }}</td>
            <td class="py-2 pr-4">{{ row.areaM2 | number: '1.2-2' }}</td>
          </tr>
        }
      </tbody>
    </table>
  }
</div>
```

- [ ] **Step 3: Write `plan-calculator.spec.ts`**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { PlanCalculator } from './plan-calculator';
import { UploadResponse } from './models';
import { UploadService } from './upload.service';

class FakeUploadService {
  response: UploadResponse | null = null;
  errorPayload: unknown = null;

  upload(): Observable<UploadResponse> {
    if (this.errorPayload) {
      return throwError(() => this.errorPayload);
    }
    return of(this.response as UploadResponse);
  }
}

describe('PlanCalculator', () => {
  let fixture: ComponentFixture<PlanCalculator>;
  let component: PlanCalculator;
  let fakeService: FakeUploadService;

  beforeEach(() => {
    fakeService = new FakeUploadService();
    TestBed.configureTestingModule({
      imports: [PlanCalculator],
      providers: [{ provide: UploadService, useValue: fakeService }],
    });
    fixture = TestBed.createComponent(PlanCalculator);
    component = fixture.componentInstance;
  });

  function selectFile(): void {
    component.selectedFile.set(new File(['x'], 'sample.dxf'));
  }

  it('computes area as linearMeters times height in meters', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'WALLS', materialName: 'Brick', linearMeters: 10 }],
      undeterminedLayers: [],
    };
    component.heightCm.set(300);
    selectFile();
    component.onSubmit();

    expect(component.rows()).toEqual([
      {
        rawLayerName: 'WALLS',
        linearMeters: 10,
        effectiveMaterial: 'Brick',
        isUndetermined: false,
        areaM2: 30,
      },
    ]);
  });

  it('falls back to the raw name and flags undetermined layers', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 }],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();

    const [row] = component.rows();
    expect(row.isUndetermined).toBe(true);
    expect(row.effectiveMaterial).toBe('LAY_X');
  });

  it('applies a manual material override without clearing the undetermined flag', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 }],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();

    component.onAssignMaterial('LAY_X', 'Formigó');

    const [row] = component.rows();
    expect(row.effectiveMaterial).toBe('Formigó');
    expect(row.isUndetermined).toBe(true);
  });

  it('resets overrides when a new upload succeeds', () => {
    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_X', materialName: 'LAY_X', linearMeters: 5 }],
      undeterminedLayers: ['LAY_X'],
    };
    selectFile();
    component.onSubmit();
    component.onAssignMaterial('LAY_X', 'Formigó');

    fakeService.response = {
      layers: [{ rawLayerName: 'LAY_Y', materialName: 'LAY_Y', linearMeters: 8 }],
      undeterminedLayers: ['LAY_Y'],
    };
    selectFile();
    component.onSubmit();

    expect(component.rows()[0].effectiveMaterial).toBe('LAY_Y');
  });

  it('deduplicates and sorts knownMaterials from effective materials in use', () => {
    fakeService.response = {
      layers: [
        { rawLayerName: 'A', materialName: 'Zinc', linearMeters: 1 },
        { rawLayerName: 'B', materialName: 'Brick', linearMeters: 1 },
        { rawLayerName: 'C', materialName: 'Zinc', linearMeters: 1 },
      ],
      undeterminedLayers: [],
    };
    selectFile();
    component.onSubmit();

    expect(component.knownMaterials()).toEqual(['Brick', 'Zinc']);
  });

  it('surfaces the backend detail message on error', () => {
    fakeService.errorPayload = { error: { detail: 'Uploaded file is not a valid DXF' } };
    selectFile();
    component.onSubmit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('Uploaded file is not a valid DXF');
  });

  it('falls back to a generic error message when the backend gives no detail', () => {
    fakeService.errorPayload = { status: 0 };
    selectFile();
    component.onSubmit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe("S'ha produït un error inesperat.");
  });

  it('renders the error banner text in the DOM', () => {
    fakeService.errorPayload = { error: { detail: 'Some error' } };
    selectFile();
    component.onSubmit();
    fixture.detectChanges();

    const banner: HTMLElement | null = fixture.nativeElement.querySelector('div.text-red-700');
    expect(banner?.textContent).toContain('Some error');
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
ng test --watch=false
```

Expected: `PASS` for all tests in `plan-calculator.spec.ts` (8 tests), plus everything from Tasks 1-2 still passing.

- [ ] **Step 5: Verify the build still succeeds**

```bash
cd frontend
ng build
```

Expected: `PASS` — this component is not wired into `App` yet (Task 4 does that), so this build check simply confirms the new files compile cleanly on their own.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/features/plan-calculator/plan-calculator.ts \
        frontend/src/app/features/plan-calculator/plan-calculator.html \
        frontend/src/app/features/plan-calculator/plan-calculator.spec.ts
git commit -m "feat(frontend): add PlanCalculator component with upload, results table, and material overrides"
```

---

## Task 4: Wire Root Component and Final Verification

**Files:**
- Modify: `frontend/src/app/app.ts` (or whatever the scaffold named the root component class file)
- Modify: `frontend/src/app/app.html` (or the root component's template)
- Create: `frontend/Dockerfile` (stub)

**Interfaces:**
- Consumes: `PlanCalculator` (Task 3), selector `app-plan-calculator`.
- Produces: nothing further — this is the final integration point of the sub-project.

- [ ] **Step 1: Read the scaffold's actual root component files first**

Before editing, read `frontend/src/app/app.ts` and its template (inline or `app.html`, whichever Task 1's scaffold produced) to see the exact current generated content — file/class names can vary slightly by CLI version.

- [ ] **Step 2: Replace the root component's template with `<app-plan-calculator />`**

Modify the root component so its template is just:

```html
<app-plan-calculator />
```

And its `@Component` decorator's `imports` array includes `PlanCalculator` (import it from `./features/plan-calculator/plan-calculator`). Remove the scaffold's default placeholder content (logo, links, etc.) — this app has exactly one screen for this sub-project.

- [ ] **Step 3: Run the full test suite and build**

```bash
cd frontend
ng test --watch=false
ng build
```

Expected: `PASS` for both — all tests from Tasks 1-3 still green, and the app now builds with `PlanCalculator` actually rendered from the root.

- [ ] **Step 4: Manual smoke check via the dev server**

Start the dev server and confirm the page renders the upload screen (file input, height input, "Analitza" button) with no console errors. Use whatever mechanism is available (the Angular CLI MCP's `devserver_start` + `devserver_wait_for_build` tools, or `ng serve` directly) — either is fine, the goal is just visual confirmation that Task 3's component is now what the app actually shows. Stop the dev server afterward.

- [ ] **Step 5: Write the stub `frontend/Dockerfile`**

```dockerfile
# Stub Dockerfile — full multi-stage build (Angular build + nginx serve)
# defined in the Infra + Deploy sub-project. This is a placeholder so the
# monorepo tree matches the spec; it is not used for anything yet.
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npx", "ng", "serve", "--host", "0.0.0.0"]
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/app.ts frontend/src/app/app.html frontend/Dockerfile
git commit -m "feat(frontend): render PlanCalculator from the app root"
```

(Adjust the `git add` file list if Task 1's scaffold named the root template file differently, or used an inline template with no separate `.html` file — add whatever files actually changed.)
