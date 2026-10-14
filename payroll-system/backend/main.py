from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .routes import router as employee_router
from .ai_routes import router as ai_router
from .agent_routes import router as agent_router

app = FastAPI(
    title="Employee Payroll System",
    description="A CRUD payroll system with FastAPI, MySQL, GenAI (Phase 2), and Single-Agent (Phase 3)",
    version="3.0.0",
)

# Allow the frontend (served separately or from file://) to reach the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employee_router)
app.include_router(ai_router)
app.include_router(agent_router)

# Serve the frontend from /
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
frontend_dir = os.path.abspath(frontend_dir)

if os.path.isdir(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/", include_in_schema=False)
    def serve_frontend():
        return FileResponse(os.path.join(frontend_dir, "index.html"))
