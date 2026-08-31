# PlanCount — Auth + i18n Design

Status: Approved (sub-project 3 of 4)
Related: [PROMPT.md](../../../PROMPT.md), [backend-core-design.md](2026-08-28-backend-core-design.md), [frontend-core-design.md](2026-08-28-frontend-core-design.md)

## 1. Scope

This is the **third of four sub-projects** decomposed from the full PlanCount spec:

1. Backend core (done — merged to `main`)
2. Frontend core (done — merged to `main`)
3. **Auth + i18n** (this document)
4. Infra + Deploy (docker-compose, nginx, GitHub Actions to OCI)

**In scope:**
- Routing (`/`, `/login`, `/app`) via `provideRouter()`, no lazy-loading
- OIDC authentication against Keycloak using `angular-oauth2-oidc` (Authorization
  Code flow + PKCE), wrapped behind an `AuthService` boundary
- A functional route guard protecting `/app`
- `Navbar` component (login/logout state, language selector)
- `Login` component (triggers the OIDC redirect flow)
- `Landing`/home page for unauthenticated visitors
- Post-login redirect to `/app` (the existing `PlanCalculator`, i.e. "Architect
  workspace")
- Full i18n via Transloco: Catalan, Spanish, English, one JSON file per
  language, browser-language detection with English fallback
- Migrating all of `PlanCalculator`'s current hardcoded Catalan UI copy to
  translation keys

**Explicitly out of scope for this sub-project** (deferred to sub-project 4):
- Actually creating the Keycloak realm/client (documented as a prerequisite
  checklist below — the user runs it against their own already-deployed
  Keycloak instance whenever they choose to test the real flow)
- Docker/nginx real build, Cloudflare, OCI deployment
- Any backend changes — the backend remains unauthenticated for this pass;
  protecting `/api/upload` itself is not part of this sub-project

## 2. Prerequisite: Keycloak Realm/Client Setup (manual, not automated here)

The user has a Keycloak instance deployed but has not yet configured anything
for PlanCount. Before the real OIDC flow can be exercised end-to-end, this
manual setup is required (not performed by this sub-project's code):

1. Create a realm (suggested name: `plancount`, or reuse an existing one).
2. Create a client:
   - Client type: **OpenID Connect**
   - Client authentication: **Off** (public client — SPAs never hold a secret)
   - Standard flow: **On** (Authorization Code)
   - Direct access grants: **Off** (not needed)
3. Configure on that client:
   - Valid redirect URIs: `http://localhost:4200/*` for local dev (add the
     production domain once it exists, in sub-project 4)
   - Web origins: `http://localhost:4200` (and `+` if the Keycloak version
     supports the wildcard shortcut) for local dev
4. Note the **issuer URL** (`<keycloak-base>/realms/<realm-name>`) and
   **client ID** — these become `environment.ts` values (see §4).

Until this is done, `environment.ts` ships with placeholder values (see §4)
and the app will fail to complete a real login (redirecting to a
non-existent issuer) — this is acceptable for this sub-project, which is
about wiring the flow correctly, not about having a live realm.

## 3. Responsibility Split (unchanged principles, extended)

- **Backend**: unchanged — still the only source of `linearMeters`, still
  unauthenticated. No token is sent to it in this pass.
- **Keycloak**: sole source of truth for identity. The frontend never
  validates credentials itself.
- **Frontend**: owns the entire auth UX (redirect to Keycloak, handle the
  callback, store the resulting state in memory via `AuthService`, guard the
  protected route, expose login/logout, and switch language) and i18n
  (translation loading, language detection, exposing translated strings).

## 4. Architecture

Angular Router is introduced for the first time. Routes, no lazy-loading
(3 screens; lazy-loading would be premature complexity per YAGNI):

```text
/            → Landing (public)
/login       → Login (public)
/app         → PlanCalculator (protected by authGuard)
```

`AuthService` (`core/auth/auth.service.ts`, `@Service()`, singleton) wraps
`OAuthService` from `angular-oauth2-oidc`:
- `isAuthenticated = signal<boolean>(false)`
- `userProfile = signal<UserProfile | null>(null)` (`UserProfile` = a small
  interface with `name`/`email`, read from the ID token claims)
- `login(): void` — delegates to `OAuthService.initLoginFlow()`
- `logout(): void` — delegates to `OAuthService.logOut()`, resets signals
- Internally configures `OAuthService` with `AuthConfig` built from
  `environment.auth` (see below), using `oauthService.setupAutomaticSilentRefresh()`
  and `loadDiscoveryDocumentAndTryLogin()` on app init (via an app
  initializer / a call in `app.config.ts`).

No other code in the app talks to `OAuthService` directly — this mirrors the
`UploadService` boundary pattern from frontend-core, and exists so
`AuthService` can be faked in tests without pulling in the real OIDC library.

`environment.ts` / `environment.development.ts` gain:
```typescript
export const environment = {
  auth: {
    issuer: '',       // e.g. 'https://keycloak.example.com/realms/plancount'
    clientId: '',     // the public client's client_id
    redirectUri: window.location.origin + '/app',
  },
};
```
Empty strings are the explicit placeholder value until the user completes
§2. This mirrors the stubbed-credential pattern already used for
`OPENROUTER_API_KEY` in the backend.

`core/auth/auth.guard.ts` — a `CanActivateFn`: reads `authService.isAuthenticated()`;
if `false`, returns a `UrlTree` redirecting to `/login` with a `returnUrl`
query param; if `true`, returns `true`.

### i18n (Transloco)

- `provideTransloco({ config: { availableLangs: ['ca','es','en'], defaultLang: 'en', reRenderOnLangChange: true }, loader: TranslocoHttpLoader })`
  registered in `app.config.ts`.
- `TranslocoHttpLoader` fetches `public/i18n/<lang>.json` via `HttpClient`.
- Language detection at bootstrap: read `navigator.language`, take the
  2-letter prefix, match against `['ca','es','en']`; if no match, use `en`.
  This runs once in an app initializer that calls `translocoService.setActiveLang(...)`.
- `Navbar` includes a language `<select>` that calls
  `translocoService.setActiveLang(lang)` directly — no persistence to
  `localStorage` in this pass (not requested; deferred as an open item).
- Every hardcoded Catalan string in `plan-calculator.html` (and the new
  Navbar/Login/Landing templates) is replaced with `{{ 'key.path' | transloco }}`
  or the `*transloco="'key.path'"` structural directive where appropriate.

## 5. File Structure

```text
frontend/
├── public/
│   └── i18n/
│       ├── ca.json
│       ├── es.json
│       └── en.json
└── src/
    ├── environments/
    │   ├── environment.ts
    │   └── environment.development.ts
    └── app/
        ├── app.routes.ts                     # new
        ├── app.config.ts                     # + provideRouter, provideTransloco, auth init
        ├── app.ts / app.html                  # renders <app-navbar> + <router-outlet>
        ├── core/
        │   ├── auth/
        │   │   ├── auth.service.ts
        │   │   ├── auth.service.spec.ts
        │   │   ├── auth.guard.ts
        │   │   ├── auth.guard.spec.ts
        │   │   └── models.ts                  # UserProfile
        │   ├── navbar/
        │   │   ├── navbar.ts
        │   │   ├── navbar.html
        │   │   └── navbar.spec.ts
        │   └── i18n/
        │       └── language-detection.ts      # pure function, unit-testable
        └── features/
            ├── landing/
            │   ├── landing.ts
            │   ├── landing.html
            │   └── landing.spec.ts
            ├── login/
            │   ├── login.ts
            │   ├── login.html
            │   └── login.spec.ts
            └── plan-calculator/
                └── ...                        # existing, templates updated to use transloco keys
```

## 6. Components

- **Landing**: static marketing-ish copy (translated), a call-to-action
  button that calls `authService.login()` if unauthenticated, or a link to
  `/app` if already authenticated (e.g. a returning user with a live
  session who navigates back to `/`).
- **Login**: minimal — on mount, if already authenticated, redirect
  immediately to `/app` (or `returnUrl` if present); otherwise show a single
  "Log in with Keycloak" button calling `authService.login()`. No credential
  form (Keycloak's own hosted login page handles credentials).
- **Navbar**: shows app name/logo (static for now — visual design deferred
  per frontend-core-design.md §10), a language selector, and, conditionally:
  logged-out → "Log in" button (`authService.login()`); logged-in → user
  name (from `userProfile()`) + "Log out" button (`authService.logout()`).

## 7. Error Handling

- OIDC errors (discovery document fetch failure, token exchange failure):
  `angular-oauth2-oidc` emits events on `OAuthService.events`; `AuthService`
  subscribes and, on an error event, keeps `isAuthenticated` at `false` and
  logs the error via `console.error` (no user-facing error UI in this pass —
  the user simply stays on `/login` and can retry; a polished error banner
  is an open item, not needed until real Keycloak testing surfaces real
  failure modes).
- Guard failure (not authenticated) is not an error — it is the expected,
  handled redirect-to-`/login` path.
- Missing/placeholder `environment.auth.issuer` (before §2 is done): the
  discovery document fetch will fail; this surfaces as the OIDC error path
  above. This is expected and acceptable until the user completes the
  Keycloak setup.

## 8. Testing

- `auth.service.spec.ts`: fakes `OAuthService` (the library's public API is
  the seam — do not hit real HTTP/Keycloak); asserts `login()`/`logout()`
  delegate correctly and that signals update in response to
  `OAuthService.events` emissions (login success / logout / error).
- `auth.guard.spec.ts`: uses a fake `AuthService` with a controllable
  `isAuthenticated` signal; asserts `true` passes through and `false`
  produces a redirect `UrlTree` to `/login` with the correct `returnUrl`.
- `navbar.spec.ts`, `login.spec.ts`, `landing.spec.ts`: each injects a fake
  `AuthService` (never the real one) — same boundary-faking pattern already
  used for `UploadService` in frontend-core.
- Transloco in tests: use `provideTransloco` configured with an in-memory
  loader (a fake `TranslocoLoader` returning a plain object per language,
  not `TranslocoHttpLoader`) so no HTTP call happens in any spec file. This
  is Transloco's documented testing pattern.
- `language-detection.ts` gets a plain unit test (pure function: input
  `navigator.language`-like strings, output the matched or fallback lang) —
  no Angular TestBed needed for this one.
- `plan-calculator.spec.ts` (existing): updated so its Transloco provider
  setup matches the fake-loader pattern above; no behavioral change to the
  component's own logic, only the addition of translation-key lookups.

## 9. Open Items For Later Sub-Projects (explicitly not decided here)

- Persisting the user's language choice (e.g. `localStorage`) — not
  requested; revisit if it becomes annoying in practice.
- A polished, translated error UI for OIDC failures — deferred until real
  Keycloak testing exists to inform what failures actually look like.
- Protecting `/api/upload` on the backend with the Keycloak-issued token —
  explicitly out of scope; the backend remains open in this pass.
- Visual design of Navbar/Landing/Login — still deferred (per
  frontend-core-design.md §10), this pass is functional only.
- Production redirect URI / Web Origins in Keycloak — added once sub-project
  4 establishes the real domain.
