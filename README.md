# PlanCount

Aplicación para arquitectos, aparejadores y constructores: sube un plano
vectorial (`.dxf`), analiza la longitud de sus capas geométricas y calcula
metros lineales / superficies a partir de esas medidas.

- **Backend**: FastAPI (Python), procesa el DXF con `ezdxf` — toda la
  aritmética y geometría vive aquí.
- **Frontend**: Angular 22 (standalone, signals), sube el plano y muestra
  los resultados.
- **Auth**: OIDC contra Keycloak (`angular-oauth2-oidc` en el frontend, JWT
  verificado con la JWKS de Keycloak en el backend).
- **Despliegue**: `docker-compose` + Nginx detrás de un Cloudflare Tunnel en
  una VM OCI.

## Estructura del repo

```text
plan-count/
├── backend/     FastAPI + ezdxf
├── frontend/    Angular
├── nginx/       Reverse proxy (prod)
└── docker-compose.yml
```

## Desarrollo en local

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm ci
npm start   # ng serve, con proxy a localhost:8000 (ver proxy.conf.json)
```

Abre `http://localhost:4200`.

### Autenticación en local

En desarrollo **no hace falta un Keycloak levantado**: tanto el frontend
(`environment.ts`) como el backend (`AUTH_DISABLED`, ver abajo) tratan toda
sesión como autenticada por defecto. Esto es intencional — solo el build de
producción (`environment.production.ts`, `.env.prod`) exige el flujo OIDC
real.

Si quieres probar el flujo real de Keycloak en local, pon
`AUTH_DISABLED=false` en `backend/.env` y rellena `issuer`/`clientId` en
`frontend/src/environments/environment.ts`.

## Variables de entorno

### `backend/.env` (ver `backend/.env.example`)

| Variable                | Descripción                                              | Por defecto              |
|--------------------------|-----------------------------------------------------------|---------------------------|
| `MAX_UPLOAD_SIZE_MB`     | Tamaño máximo de fichero subido                            | `20`                       |
| `CORS_ALLOWED_ORIGIN`    | Origen permitido por CORS (además de `localhost:4200`)    | `http://localhost:4200`    |
| `COLOR_MATCH_TOLERANCE`  | Tolerancia de color al emparejar geometría con la leyenda  | `30.0`                     |
| `AUTH_DISABLED`          | Si es `true`, `verify_token` no exige JWT — solo para dev  | `false`                    |

### `.env` / `.env.prod` (raíz, usados por `docker-compose`)

| Variable                | Descripción                                       |
|--------------------------|------------------------------------------------------|
| `CORS_ALLOWED_ORIGIN`    | Origen público permitido por el backend               |
| `OPENROUTER_API_KEY`     | API key de OpenRouter (interpretación de leyendas LLM) |

## Levantar todo con Docker

```bash
docker compose --env-file .env up --build          # dev
docker compose --env-file .env.prod up --build     # prod (exige Keycloak real)
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npm test
```

## Despliegue

Cada push a `main` dispara [.github/workflows/deploy.yml](.github/workflows/deploy.yml):
se conecta por SSH a la VM OCI, hace `git pull` y reconstruye con
`docker compose --env-file .env.prod`.
