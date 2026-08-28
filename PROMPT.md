# AGENT SPEC: PLANCOUNT (CAD Material Takeoff App)

## 1. OVERVIEW & PRODUCT VISION

**PlanCount** is a SaaS web application designed for architects, quantity surveyors, and builders. It allows users to upload architectural blueprints in vector format (`.dxf` / `.dwg`), analyze vector layer lengths using Python, and calculate volumes/surface areas based on an interactive height slider in the Frontend.

---

## 2. LLM VS. PYTHON CALCULATION RESPONSIBILITY MATRIX

- **Python Engine (`ezdxf` + Pydantic):**
  - **Strict Math & Spatial Logic:** Performs ALL geometric and arithmetic calculations.
  - Measures exact vector distances ($X, Y$) from CAD entities (`LINE`, `LWPOLYLINE`).
  - Calculates total linear meters per layer ($m_{linear}$).
  - Computes total surface area ($m^2 = m_{linear} \times height\_meters$) using the Frontend slider value.
  - **Rule:** The LLM must NEVER perform math, scaling, or length estimations.

- **LLM Engine (Gemini 2.5 Flash via OpenRouter):**
  - **Semantic Interpretation Only:** Maps raw, cryptic CAD layer names (e.g., `LAY_0725_EXT`, `WALL_YEL_0923`) or raw text legends to human-readable material descriptions (e.g., `"Yellowish Green Interior"`).
  - **Input to LLM:** A JSON array of raw layer strings extracted by Python.
  - **Output from LLM:** A JSON key-value map (`{"LAY_0725_EXT": "Yellowish Green Interior"}`).

---

## 3. ARCHITECTURAL STACK & INFRASTRUCTURE

- **Deployment Architecture:**
  - Deployment on an OCI Always Free VM Instance (Ampere ARM64) using `docker-compose`.
  - Reverse Proxy with **Nginx** to serve the compiled Angular Frontend and route `/api/` requests to the FastAPI Backend.

- **Frontend:**
  - **Framework:** Angular 22.1.6 (Latest) with Standalone Components. Use Angular MCP installed.
  - **Styling:** Tailwind CSS v3+.
  - **State & Reactivity:** Signals, `signalForm`, and `httpResource` for reactive data fetching.
  - **i18n:** `@ngx-translate/core` (or Transloco with native Signals support). English, Spanish, and Catalan options. Use the user's selected browser language if matched, with English as fallback.
  - **Auth:** OIDC Flow using `angular-oauth2-oidc` configured for Keycloak.
  - **Components:**
    - Navbar for navigation and User sections (login / user management).
    - Login Component.
    - Landing/Home page for non-authenticated users.
    - Post-login redirect to the Architect workspace component (to upload files and display calculation results).

- **Backend:**
  - **Framework:** FastAPI (Python 3.11+).
  - **CAD Processing:** `ezdxf` for vector extraction of `LINE` and `LWPOLYLINE` entities.
  - **DWG Conversion:** Integration with `ODA File Converter` CLI inside the Python container (to process `.dwg` files if uploaded).
  - **LLM Integration:** API Client with `OpenRouter` (Gemini 2.5 Flash / 1.5 Flash free model) to interpret text legends on the blueprint and map layer codes to real material names when direct mapping is absent.

---

## 4. MONOREPO STRUCTURE

The **PlanCount** project must be organized according to the following file tree:

```text
plancount/
├── PROMPT.md
├── docker-compose.yml
├── nginx/
│   └── default.conf
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── services/
│       │   ├── dxf_service.py
│       │   └── llm_service.py
│       └── api/
│           └── endpoints.py
└── frontend/
    ├── Dockerfile
    ├── angular.json
    ├── tailwind.config.js
    └── src/
        └── app/
            ├── core/
            ├── features/
            │   └── plan-calculator/
            └── shared/
```
