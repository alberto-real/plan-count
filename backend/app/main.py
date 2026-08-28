from fastapi import FastAPI

app = FastAPI(title="PlanCount Backend")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
