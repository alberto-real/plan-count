# PlanCount — Infra + Deploy Design

Status: Approved (sub-project 4 of 4)
Related: [PROMPT.md](../../../PROMPT.md), [backend-core-design.md](2026-08-28-backend-core-design.md), [frontend-core-design.md](2026-08-28-frontend-core-design.md), [auth-i18n-design.md](2026-08-31-auth-i18n-design.md)

## 1. Scope

This is the **fourth and final sub-project** decomposed from the full PlanCount spec:

1. Backend core (done — merged to `main`)
2. Frontend core (done — merged to `main`)
3. Auth + i18n (done — merged to `main`)
4. **Infra + Deploy** (this document)

**In scope:**
- A real, production-usable `docker-compose.yml` for PlanCount (frontend + backend + nginx reverse proxy), replacing the two placeholder Dockerfiles.
- nginx config: SPA fallback (`try_files`) for the Angular router, and `/api/*` reverse-proxy to the backend container.
- Real JWT bearer-token verification on the backend, and a frontend HTTP interceptor that attaches the token — closing the gap identified when reasoning about deploying `/api/upload` publicly (it calls a paid LLM API via OpenRouter and currently has zero access control).
- Wiring the app into the existing shared infrastructure in `albertoreal-infra`: a new Keycloak client (already created — see §2), a new Cloudflare Tunnel ingress rule for `plan-count.albertoreal.com`.
- A GitHub Actions workflow in the `plan-count` repo that deploys to the existing OCI VM on every push to `main`, following the existing `pokemon-game` pattern (git pull + build directly on the VM, no image registry).

**Explicitly out of scope:**
- A staging/dev environment — production only (`plan-count.albertoreal.com`), per explicit decision. Revisit if this ever needs pre-prod testing.
- Role-based access control inside PlanCount — any authenticated user in the `albertoreal` Keycloak realm may use the app; no new realm role is created.
- A dedicated `github-deploy` VM user (the pattern `albertoreal-infra` itself uses for its own repo) — PlanCount reuses the existing `ubuntu` user and SSH key pattern already proven by `pokemon-game` and `albertoreal-ui`, since introducing a second deploy-user model for one more small app adds operational complexity without a clear benefit here.
- Persisting the frontend's language choice, a polished OIDC-error UI, and any other item already deferred in `auth-i18n-design.md` §9 — unchanged by this sub-project.
- PKCE-required enforcement on the Keycloak client (see §2) — not necessary since the frontend already always sends a PKCE challenge by default (`angular-oauth2-oidc`'s default behavior); enforcing it server-side is an optional hardening item, not a functional requirement.

## 2. Keycloak Client (already done, manually, during design)

A public client was created in the existing `albertoreal` realm at `https://auth.albertoreal.com`, via the Admin Console:

- **Client ID:** `plan-count-frontend`
- **Client authentication:** Off (public client — no secret, matches `angular-oauth2-oidc`'s browser-only usage)
- **Standard flow:** On (only flow enabled)
- **Valid redirect URIs:** `https://plan-count.albertoreal.com/app`
- **Valid post logout redirect URIs:** `https://plan-count.albertoreal.com/`
- **Web origins:** `https://plan-count.albertoreal.com`

This client's settings were verified directly in the Admin Console during the design session. The realm's PKCE-required toggle for this client was not located in this Keycloak version's UI and was deliberately not pursued further (see §1 — not required for the flow to work; `angular-oauth2-oidc` sends the PKCE challenge unconditionally).

**Follow-up action (not automated by this sub-project):** re-export `realm-config/realm-albertoreal.json` in `albertoreal-infra` (per that repo's documented script) and commit, so the new client is captured in the versioned realm backup.

## 3. Architecture

### 3.1 Docker Compose stack (`plan-count/docker-compose.yml`)

Three services in one internal bridge network (mirrors `albertoreal-infra`'s and `pokemon-game`'s pattern):

```text
frontend (nginx, serves Angular build + proxies /api/*)  →  backend (FastAPI, internal-only)
```

- **`backend`**: built from `backend/Dockerfile` (existing stub, hardened: non-root user, pinned base image). Not published on any host port — reachable only from `frontend` via the internal Docker network, at `http://backend:8000`.
- **`frontend`**: `frontend/Dockerfile` rewritten as a real multi-stage build — `node:20-slim` stage runs `npm ci && npm run build` (production configuration), then an `nginx:alpine` stage copies `dist/frontend/browser` and `nginx/default.conf`. Published as `127.0.0.1:8091:80` on the VM host — bound to localhost only, exactly like Keycloak (`8081`) and every other app on this VM; the Cloudflare Tunnel is the only thing that exposes it externally.
- Secrets via `.env.prod` (gitignored, created once on the VM): `OPENROUTER_API_KEY` (real key, replacing the `stub-key` default) and `CORS_ALLOWED_ORIGIN` (`https://plan-count.albertoreal.com`, passed to the backend — mirrors `pokemon-game`'s `CORS_ALLOWED_ORIGINS` pattern for consistency across repos).
- No database, no persistent volume — the backend is stateless (processes an uploaded DXF in a temp file per request, per the existing implementation).

### 3.2 nginx (`plan-count/nginx/default.conf`)

```nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://backend:8000/api/;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

The `try_files ... /index.html` fallback is required for the Angular router's deep links (`/login`, `/app`) to survive a direct navigation or page refresh — without it, those routes 404 at the nginx layer before Angular ever runs. (This was flagged as a carried-forward risk at the end of the auth-i18n sub-project; this is where it gets addressed.)

### 3.3 Backend JWT verification

New file `backend/app/services/auth_service.py`:

- Fetches and caches Keycloak's JWKS from `https://auth.albertoreal.com/realms/albertoreal/protocol/openid-connect/certs` (in-memory cache with a short TTL, refetched on a `kid` cache-miss — handles Keycloak's own key rotation without a redeploy).
- `verify_token(request) -> None` — a FastAPI dependency: extracts the `Authorization: Bearer <token>` header, verifies the RS256 signature against the cached JWKS, checks `iss == "https://auth.albertoreal.com/realms/albertoreal"` and `exp` not expired, and checks `azp == "plan-count-frontend"` (Keycloak's public clients typically carry the client ID in `azp`, not `aud`, by default — this is verified against a real token once the client is exercised for the first time, not assumed blindly; if it turns out Keycloak does populate `aud` for this client, checking `aud` instead is an equivalent, equally acceptable fix with no architectural impact).
- Raises `HTTPException(401)` on any failure (missing header, bad signature, wrong issuer/audience, expired).
- Wired as `Depends(verify_token)` on the existing `POST /api/upload` endpoint only — no other endpoint changes.
- New dependency: `python-jose[cryptography]` (or `PyJWT` + `cryptography` — final pick left to the implementer based on whichever has better FastAPI-ecosystem precedent at implementation time; both are equivalent for this use case).
- `CORSMiddleware` added to `app/main.py`, restricted to `CORS_ALLOWED_ORIGIN` from settings (plus `http://localhost:4200`-style origins for local dev, via a separate dev-only settings default) — a defense-in-depth layer, not the access-control mechanism (see the design discussion in §1: CORS is browser-enforced only).

### 3.4 Frontend auth interceptor

New file `frontend/src/app/core/auth/auth.interceptor.ts`:

- A functional `HttpInterceptorFn`, registered via `provideHttpClient(withInterceptors([authInterceptor]))` in `app.config.ts`.
- For requests whose URL starts with `/api/`, adds `Authorization: Bearer <token>`, where the token comes from a new `AuthService.getAccessToken(): string | null` method (a thin delegate to `OAuthService.getAccessToken()` — `AuthService` remains the only file importing `angular-oauth2-oidc` directly, unchanged from the auth-i18n sub-project's constraint).
- Requests to other URLs pass through unchanged.
- `UploadService` itself needs no changes — the interceptor is transparent to it.

## 4. Shared Infra Changes (`albertoreal-infra` repo)

- `cloudflared/config.yml`: one new `ingress` entry, inserted before the catch-all `404` entry:
  ```yaml
  - hostname: plan-count.albertoreal.com
    service: http://localhost:8091
  ```
- One-time, manual, run once this config is live on the VM: `cloudflared tunnel route dns 743628cf-44a7-4a6d-b67b-c0cfea8708f4 plan-count.albertoreal.com`.
- `realm-config/realm-albertoreal.json`: re-exported after §2's client creation (see follow-up action there).

These are the only changes to `albertoreal-infra`. No changes to `docker-compose.prod.yml` in that repo — PlanCount's own stack lives entirely in the `plan-count` repo, deployed independently (see §5).

## 5. Deployment (`plan-count/.github/workflows/deploy.yml`)

Mirrors `pokemon-game`'s existing workflow, which is the simplest and closest-sized precedent among the two examples on this VM (`albertoreal-ui`'s OCIR-multi-arch-build pipeline is unnecessary complexity for an app this size — no image registry, no cross-arch build step, since the VM builds the image itself):

- Trigger: `push` to `main` (plus `workflow_dispatch`).
- One job: SSH to the VM as `ubuntu` using existing secrets (`VM_SSH_PRIVATE_KEY`, `VM_HOST`, `VM_USER` — reused if already present as *organization* secrets; created fresh as *repository* secrets on `plan-count` otherwise, matching how `pokemon-game` scopes its own).
- On the VM: `cd /home/ubuntu/plan-count && git fetch --prune origin && git reset --hard origin/main && docker compose --env-file .env.prod up -d --build && docker image prune -f`.
- Smoke test: retry loop against `https://plan-count.albertoreal.com/api/health` (the backend's existing `/health` endpoint, reached through the nginx proxy) expecting `200`, same retry/backoff shape as `pokemon-game`'s.
- No automatic rollback on failure (matches both existing precedents) — a failed deploy surfaces as a red ❌ in Actions; manual fix via SSH or Dockge.

**One-time manual VM setup** (before the first automated deploy): `git clone` the `plan-count` repo to `/home/ubuntu/plan-count`, create `.env.prod` there with the real `OPENROUTER_API_KEY` and `CORS_ALLOWED_ORIGIN`. No new VM user, no new SSH key beyond what may already exist for `ubuntu`.

## 6. Error Handling

- Backend JWT verification failure (missing/expired/malformed token, JWKS fetch failure): `401 Unauthorized`, no detail leak beyond a generic message (matches the existing error-detail-leak fix already applied to `/api/upload`'s other error paths in backend-core).
- Deploy-time smoke-test failure: job fails loudly (red ❌), no silent partial deploys — same posture as `pokemon-game`/`albertoreal-ui`.
- nginx `try_files` fallback means an unknown deep path still resolves to `index.html` (Angular's own router then has no matching route) rather than a raw nginx 404 — consistent with the "no wildcard route" open item already noted at the end of auth-i18n; still not addressed here, still deferred (see §7).

## 7. Testing

- `backend/tests/test_auth_service.py` (new): unit tests for `verify_token` against a locally-generated RSA keypair standing in for Keycloak's JWKS (never a real network call to `auth.albertoreal.com` in tests) — valid token accepted, expired token rejected, wrong issuer rejected, wrong `azp` rejected, missing header rejected.
- `backend/tests/test_endpoints.py` (existing, updated): `/api/upload` tests now include a valid bearer token fixture (reusing the same test keypair) for the happy-path tests, plus one new test asserting a request with no token gets `401`.
- `frontend/src/app/core/auth/auth.interceptor.spec.ts` (new): asserts the interceptor adds the header for `/api/*` requests when `AuthService.getAccessToken()` returns a token, omits it when the token is `null`, and leaves non-`/api/` requests untouched — using a fake `AuthService`, never the real `OAuthService` (same boundary-faking convention as every other auth-i18n spec).
- No integration test hits the real Keycloak instance or the real deployed VM from CI — the GitHub Actions smoke test (§5) is the only check that runs against production, and it runs after deploy, not as a unit/integration test.

## 8. Open Items For Later (explicitly not decided here)

- Whether to check `aud` instead of `azp` in the backend JWT verification — left for the implementer to confirm against a real token once the flow is exercised end-to-end (see §3.3).
- PKCE-required enforcement on the Keycloak client — optional hardening, not pursued (see §1, §2).
- A staging/dev environment — deferred; revisit if needed.
- Automatic rollback on a failed deploy or failed smoke test — deferred; matches existing precedent on this VM.
- Renaming/consolidating the `github-deploy` vs. plain-`ubuntu` deploy-user patterns across all apps on this VM into one consistent approach — out of scope for a single app's sub-project; would be its own `albertoreal-infra` cleanup task.
