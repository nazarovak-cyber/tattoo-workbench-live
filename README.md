# Tattoo Workbench

**From reference to tattoo-ready.** A mobile-first transfer workspace for tattoo artists. The beta implements a real Upload → Exact Copy → Adjust → Compare → PNG/PDF flow. Exact Copy uses deterministic computer vision; no generative model or paid AI API redraws artwork.

## What works

- JPG, PNG and WebP upload; EXIF orientation, type, size and dimension checks.
- FastAPI Exact Engine: light paper normalization, denoise, Otsu/adaptive threshold, conservative connected-component cleanup, optional centerline stroke rebuild and mirror.
- Exact, Outline and Detailed presets through detail and cleanup controls. Controls reprocess the uploaded source.
- Photo-of-tattoo workflow: warm skin tone suggests Photo mode on upload, the artist can crop the visible tattoo, and local contrast extracts visible ink without generative repainting. The before/after view uses the same cropped region.
- Before/after split, original, result and overlay views.
- Transparent or white PNG; exact-size A4 PDF with optional tiling, overlap and registration marks. Print at 100%, never Fit to page.
- Anonymous temporary projects, automatic cleanup on access/startup after 24 hours, explicit delete.
- Next.js PWA layout with EN, RU, ES and PT.

The brand board came from the user-provided shared brand book. The source illustration is included as `frontend/public/brand-board.png`. The small PWA icon is a temporary simplified mark until the standalone approved logo file is supplied.

## Run locally

Requires Node 22+, Python 3.12+ and a C compiler/runtime compatible with the Python wheels. In two terminals:

On Windows, from the repository root, `powershell -File .\scripts\start-local.ps1` installs missing dependencies, starts both services, checks their health, and opens the app. If startup fails, inspect `.local-logs/`. A browser tab left open from an earlier session does not mean the backend is running; check http://localhost:8000/health.

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
cp ../.env.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000. Next.js proxies `/api/` to FastAPI, so the app also works from a phone on the same network when Next.js and FastAPI are bound to the machine's network address. API health: http://localhost:8000/health. API docs: http://localhost:8000/docs. Alternatively run `docker compose up --build` from the repository root and open port 3000 on the host.

## Test and build

```bash
cd backend && pytest -q
cd frontend && npm run build
```

The test suite checks deterministic extraction, distinct shape retention, mirror and line weight changes, the upload/transfer/export API and invalid-image rejection. `benchmark/` describes the artist-approved regression corpus still needed for production quality claims.

For a tattoo photograph, upload the photo, confirm **Photo of tattoo** is selected, draw a crop around the desired tattoo, generate the transfer, and inspect the extracted black ink against the cropped photo. The print panel has a separate mirror switch for stencil printing and a millimetre-scaled A4 preview.

## API

Base `/api/v1`: `POST /projects`, `POST /projects/{id}/source`, `POST /projects/{id}/transfer`, `GET /jobs/{id}`, `GET /projects/{id}/preview`, `POST /projects/{id}/adjust`, `POST /projects/{id}/export/png`, `POST /projects/{id}/export/pdf`, `GET /exports/{project_id}/{export_id}/download`, `DELETE /projects/{id}`, `GET /health`. Browse `/docs` for live schemas. All API errors return `{ "error": { "code", "message", "details" } }`.

## Deployment

Deploy `frontend/` to a Next.js host and `backend/` as the provided Docker image on a Python-capable host with persistent storage mounted at `/data`. Set `TWB_BACKEND_URL` on the Next.js host to the backend's internal URL at build time so `/api/` is proxied on the same origin. If hosting them on separate public origins, set `NEXT_PUBLIC_API_URL` at frontend build time and `TWB_CORS_ORIGINS` to the exact frontend origin on the backend. Set `TWB_DATA_DIR` on the backend. Avoid an ephemeral backend filesystem if files must survive service restarts. No account or paid inference key is needed.

## Current limits

Source raster is processed at up to 2400 px on its long side. A single photograph cannot reveal lines hidden by body curvature, glare, blur or existing tattoos; Photo mode is a best-effort extraction of *visible* ink, and the artist must review it before printing. SVG/VTracer output and manual erase/restore are deferred until geometry validation is implemented. Wrap, Cover-Up and Create are labeled Coming Soon. Processing jobs are in memory; queued state is not durable through a backend restart. Files expire after 24 hours and are removed on the next request or backend startup; a scheduled cleanup worker is needed for strictly timed deletion on an idle service. On Render's free tier, services sleep after inactivity and the ephemeral filesystem can be lost on restart; the frontend waits for the backend to wake, but temporary projects may need to be uploaded again. This beta is intended for a single service instance; production scale needs shared job and file storage. Always compare fine detail with the source before stencil printing.
