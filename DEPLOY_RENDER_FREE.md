# Publish Tattoo Workbench on Render Free

Render gives each deployed web service its own `onrender.com` URL. This project needs two free web services: the Python image processor and the Next.js interface. The public URL exists only after Render finishes deployment.

## 1. Put the source on GitHub

Create a repository, for example `tattoo-workbench`. Unzip `Tattoo_Workbench_MVP_Source.zip` and upload the **contents** of the archive to the repository root. Keep the `backend/` and `frontend/` directories.

## 2. Deploy the Python API

In [Render Dashboard](https://dashboard.render.com/), choose **New → Web Service** and connect the GitHub repository.

| Setting | Value |
| --- | --- |
| Name | `tattoo-workbench-api` (or any available name) |
| Language | Python |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | Free |
| Environment variable | `PYTHON_VERSION=3.12.14` |
| Environment variable | `TWB_DATA_DIR=/tmp/tattoo-workbench-data` |

After deployment, open the API's actual Render URL followed by `/health`. It should return `{"status":"ok",...}`. Copy the API URL from Render; do not guess it from the name.

## 3. Deploy the interface

Create a second **New → Web Service** from the same repository.

| Setting | Value |
| --- | --- |
| Name | `tattoo-workbench` (or any available name) |
| Language | Node |
| Root Directory | `frontend` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start -- --port $PORT` |
| Instance Type | Free |
| Environment variable | `NODE_VERSION=22.22.0` |
| Environment variable | `TWB_BACKEND_URL=https://YOUR-API-URL.onrender.com` |

Replace `TWB_BACKEND_URL` with the **exact URL** Render assigned to the API, without a trailing slash. Set it before the frontend's first build. Leave `NEXT_PUBLIC_API_URL` unset so the frontend sends `/api/` requests through its own Next.js server.

Once Render reports the frontend deployment as live, its `onrender.com` URL is the public Tattoo Workbench link. Verify its `/api/v1/health`, then upload a drawing, create a transfer, and download PNG and PDF.

## Free-plan limits

Free web services sleep after 15 minutes without traffic and can take around a minute to wake. Their local files disappear on sleep, restart, or redeploy. Projects therefore may disappear **before** the application's 24-hour expiry; this configuration is suitable for a public beta of immediate upload → process → export, not durable project storage. Render currently provides 750 free instance hours per workspace per month, shared by both services. See [Render's free-plan documentation](https://render.com/docs/free).
