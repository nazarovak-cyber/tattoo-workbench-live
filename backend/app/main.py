from __future__ import annotations

import json
import logging
import os
import re
import shutil
import threading
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, File, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image
from pydantic import BaseModel, Field, model_validator

from .engine import Controls, ImageError, MAX_BYTES, load_image, process, to_png
from .pdf_export import make_pdf

DATA = Path(os.environ.get("TWB_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
DATA.mkdir(parents=True, exist_ok=True)
TTL = timedelta(hours=24)
app = FastAPI(title="Tattoo Workbench API", version="0.1.0")
origins = os.environ.get("TWB_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])
jobs: dict[str, dict] = {}
latest_jobs: dict[str, str] = {}
job_state_lock = threading.Lock()
logger = logging.getLogger(__name__)


def error(code: str, message: str, status: int = 400, details: dict | None = None):
    return JSONResponse({"error": {"code": code, "message": message, "details": details or {}}}, status_code=status)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _exc: RequestValidationError):
    return error("INVALID_PARAMETER", "Check the request parameters.", 422)


def now() -> datetime:
    return datetime.now(timezone.utc)


def project_dir(project_id: str) -> Path:
    if not re.fullmatch(r"prj_[0-9a-f]{32}", project_id):
        raise FileNotFoundError
    folder = DATA / project_id
    if not folder.is_dir():
        raise FileNotFoundError
    return folder


def read_project(project_id: str) -> tuple[Path, dict]:
    folder = project_dir(project_id)
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    if datetime.fromisoformat(meta["expires_at"]) <= now():
        shutil.rmtree(folder, ignore_errors=True)
        raise FileNotFoundError
    return folder, meta


def save(folder: Path, meta: dict):
    tmp = folder / "meta.tmp"
    tmp.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    tmp.replace(folder / "meta.json")


def cleanup_expired():
    for folder in DATA.glob("prj_*"):
        try:
            meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
            if datetime.fromisoformat(meta["expires_at"]) <= now():
                shutil.rmtree(folder, ignore_errors=True)
        except (OSError, ValueError, KeyError):
            continue


@app.on_event("startup")
def startup():
    cleanup_expired()


class ProjectCreate(BaseModel):
    name: str = Field(default="Untitled transfer", min_length=1, max_length=100)
    locale: str = Field(default="en", pattern="^(en|ru|es|pt)$")
    mode: str = Field(default="transfer", pattern="^transfer$")


class TransferRequest(BaseModel):
    engine: str = Field(default="exact", pattern="^(exact|outline|detailed)$")
    design_lock: bool = True
    detail_level: int = Field(default=3, ge=1, le=5)
    line_weight: float = Field(default=0.5, ge=0.2, le=1.0)
    cleanup: int = Field(default=40, ge=0, le=100)
    mirror: bool = False
    background_remove: bool = True
    vectorize: bool = False

    @model_validator(mode="after")
    def preserve_design(self):
        if not self.design_lock:
            raise ValueError("Exact Copy requires Design Lock.")
        return self


class PngRequest(BaseModel):
    transparent_background: bool = True
    mirror: bool = False
    resolution: str = "working"


class PdfRequest(BaseModel):
    width_mm: float = Field(gt=5, le=2000)
    height_mm: float | None = Field(default=None, gt=5, le=2000)
    lock_aspect_ratio: bool = True
    paper_size: str = Field(default="A4", pattern="^A4$")
    orientation: str = Field(default="portrait", pattern="^portrait$")
    scale_percent: int = Field(default=100, ge=100, le=100)
    mirror: bool = False
    tile: bool = True
    overlap_mm: float = Field(default=10, ge=0, le=20)
    registration_marks: bool = True


@app.get("/api/v1/health")
@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0", "engines": {"exact": "available", "outline": "available", "detailed": "available"}}


@app.post("/api/v1/projects")
def create_project(body: ProjectCreate):
    cleanup_expired()
    project_id = "prj_" + uuid4().hex
    folder = DATA / project_id
    folder.mkdir()
    created = now()
    meta = {"project_id": project_id, "name": body.name, "locale": body.locale, "mode": body.mode,
            "status": "draft", "created_at": created.isoformat(), "expires_at": (created + TTL).isoformat(), "assets": {}}
    save(folder, meta)
    return {key: meta[key] for key in ("project_id", "name", "mode", "status", "created_at", "expires_at")}


@app.get("/api/v1/projects/{project_id}")
def get_project(project_id: str):
    try:
        _, meta = read_project(project_id)
        return meta
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)


@app.post("/api/v1/projects/{project_id}/source")
async def upload_source(project_id: str, file: UploadFile = File(...)):
    try:
        folder, meta = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    raw = await file.read(MAX_BYTES + 1)
    try:
        image, mime = load_image(raw)
    except ImageError as exc:
        return error(exc.code, str(exc), 400)
    if file.content_type not in (mime, "application/octet-stream"):
        return error("INVALID_IMAGE_FORMAT", "File MIME does not match image content.")
    with job_state_lock:
        latest_jobs.pop(project_id, None)
        (folder / "source.tmp").write_bytes(to_png(image))
        (folder / "source.tmp").replace(folder / "source.png")
        (folder / "original.bin").write_bytes(raw)
        for stale in folder.glob("result*.png"):
            stale.unlink()
        meta["assets"] = {"source": "source.png"}
        meta["status"] = "uploaded"
        meta.pop("metrics", None)
        save(folder, meta)
    return {"asset_id": f"ast_{project_id}_source", "project_id": project_id, "file_name": Path(file.filename or "artwork").name,
            "mime_type": mime, "width_px": image.width, "height_px": image.height, "size_bytes": len(raw),
            "preview_url": f"/api/v1/projects/{project_id}/preview?type=source"}


def run_job(job_id: str, project_id: str, body: TransferRequest):
    job = jobs[job_id]
    job.update(status="processing", progress=15, stage="preprocessing")
    try:
        folder, meta = read_project(project_id)
        image = Image.open(folder / "source.png").convert("RGB")
        job.update(progress=55, stage="extracting_lines")
        controls = Controls(body.detail_level, body.line_weight, body.cleanup, body.mirror, body.background_remove)
        png, metrics = process(image, controls)
        with job_state_lock:
            if latest_jobs.get(project_id) != job_id:
                job.update(status="superseded", progress=100, stage="superseded")
                return
            job.update(progress=90, stage="rendering")
            (folder / "result.png").write_bytes(png)
            meta.update(status="completed", controls=body.model_dump(), metrics=metrics)
            meta["assets"]["result"] = "result.png"
            save(folder, meta)
            job.update(status="completed", progress=100, stage="completed", metrics=metrics,
                       result={"png_asset_id": f"ast_{project_id}_result", "preview_asset_id": f"ast_{project_id}_result", "svg_asset_id": None})
    except Exception:
        logger.exception("Transfer job %s failed for project %s", job_id, project_id)
        job.update(status="failed", stage="failed", error={"code": "PROCESSING_FAILED", "message": "Transfer could not be generated."})


@app.post("/api/v1/projects/{project_id}/transfer")
def transfer(project_id: str, body: TransferRequest, background_tasks: BackgroundTasks):
    try:
        folder, _ = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    if not (folder / "source.png").exists():
        return error("UPLOAD_FAILED", "Upload an image first.")
    job_id = "job_" + uuid4().hex
    with job_state_lock:
        jobs[job_id] = {"job_id": job_id, "project_id": project_id, "status": "queued", "progress": 0, "stage": "queued"}
        latest_jobs[project_id] = job_id
    background_tasks.add_task(run_job, job_id, project_id, body)
    return {"job_id": job_id, "project_id": project_id, "status": "queued", "estimated_seconds": 4}


@app.post("/api/v1/projects/{project_id}/adjust")
def adjust(project_id: str, body: TransferRequest, background_tasks: BackgroundTasks):
    return transfer(project_id, body, background_tasks)


@app.get("/api/v1/jobs/{job_id}")
def get_job(job_id: str):
    return jobs.get(job_id) or error("JOB_NOT_FOUND", "Job not found.", 404)


@app.get("/api/v1/projects/{project_id}/preview")
def preview(project_id: str, type: str = "transfer"):
    try:
        folder, _ = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    name = "source.png" if type == "source" else "result.png"
    target = folder / name
    if not target.exists():
        return error("ASSET_NOT_FOUND", "Preview not available.", 404)
    return FileResponse(target, media_type="image/png", headers={"Cache-Control": "private, no-store"})


@app.post("/api/v1/projects/{project_id}/export/png")
def export_png(project_id: str, body: PngRequest):
    try:
        folder, meta = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    target = folder / "result.png"
    if not target.exists():
        return error("EXPORT_FAILED", "Generate a transfer first.")
    image = Image.open(target).convert("RGBA")
    if body.mirror:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if not body.transparent_background:
        white = Image.new("RGB", image.size, "white")
        white.paste(image, mask=image.getchannel("A"))
        image = white
    export_id = "exp_" + uuid4().hex
    filename = export_id + ".png"
    (folder / filename).write_bytes(to_png(image))
    meta["assets"][export_id] = filename
    save(folder, meta)
    return {"export_id": export_id, "download_url": f"/api/v1/exports/{project_id}/{export_id}/download"}


@app.post("/api/v1/projects/{project_id}/export/pdf")
def export_pdf(project_id: str, body: PdfRequest):
    try:
        folder, meta = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    target = folder / "result.png"
    if not target.exists():
        return error("EXPORT_FAILED", "Generate a transfer first.")
    image = Image.open(target)
    height_mm = body.width_mm * image.height / image.width if body.lock_aspect_ratio else body.height_mm
    if height_mm is None or height_mm > 2000:
        return error("INVALID_DIMENSIONS", "Enter a valid print height.")
    try:
        pdf, pages = make_pdf(target.read_bytes(), body.width_mm, height_mm, mirror=body.mirror,
                              tile=body.tile, overlap_mm=body.overlap_mm, registration_marks=body.registration_marks)
    except ValueError as exc:
        return error("INVALID_DIMENSIONS", str(exc))
    export_id = "exp_" + uuid4().hex
    filename = export_id + ".pdf"
    (folder / filename).write_bytes(pdf)
    meta["assets"][export_id] = filename
    save(folder, meta)
    return {"export_id": export_id, "pages": pages, "final_width_mm": body.width_mm,
            "final_height_mm": round(height_mm, 2), "paper_size": "A4", "scale_percent": 100,
            "download_url": f"/api/v1/exports/{project_id}/{export_id}/download"}


@app.get("/api/v1/exports/{project_id}/{export_id}/download")
def download(project_id: str, export_id: str):
    try:
        folder, meta = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    filename = meta["assets"].get(export_id)
    if not filename:
        return error("ASSET_NOT_FOUND", "Export not found.", 404)
    target = folder / filename
    return FileResponse(target, filename=f"tattoo-workbench.{target.suffix[1:]}", headers={"Cache-Control": "private, no-store"})


@app.delete("/api/v1/projects/{project_id}")
def delete_project(project_id: str):
    try:
        folder, _ = read_project(project_id)
    except FileNotFoundError:
        return error("PROJECT_NOT_FOUND", "Project not found or expired.", 404)
    shutil.rmtree(folder)
    return {"deleted": True}
