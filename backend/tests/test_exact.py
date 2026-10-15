from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from app.engine import Controls, load_image, process
from app.main import app
from app.pdf_export import make_pdf


def specimen() -> Image.Image:
    image = Image.new("RGB", (640, 640), "white")
    draw = ImageDraw.Draw(image)
    draw.line([(80, 110), (280, 140), (430, 80)], fill="black", width=5)
    draw.ellipse((120, 230, 250, 360), outline="black", width=5)
    draw.rectangle((360, 280, 510, 450), outline="black", width=5)
    draw.text((120, 500), "TATTOO", fill="black", font=ImageFont.load_default(size=28))
    return image


def png(image: Image.Image) -> bytes:
    out = BytesIO(); image.save(out, "PNG"); return out.getvalue()


def test_exact_is_deterministic_and_preserves_distinct_shapes():
    image = specimen()
    first, metrics = process(image, Controls())
    second, _ = process(image, Controls())
    assert first == second
    result = np.asarray(Image.open(BytesIO(first)))[:, :, 3]
    assert result[115:145, 78:120].max() > 0
    assert result[225:365, 115:255].max() > 0
    assert result[275:455, 355:515].max() > 0
    assert result[495:550, 110:340].max() > 0
    assert result[400:460, 70:300].max() == 0  # no invented object in empty region
    assert metrics["foreground_ratio"] < 0.15
    assert metrics["source_coverage"] > 0.9


def test_mirror_and_line_weight_change_real_pixels():
    image = specimen()
    base, _ = process(image, Controls())
    mirrored, _ = process(image, Controls(mirror=True))
    heavier, _ = process(image, Controls(line_weight=0.8))
    a = np.asarray(Image.open(BytesIO(base)))[:, :, 3]
    b = np.asarray(Image.open(BytesIO(mirrored)))[:, :, 3]
    c = np.asarray(Image.open(BytesIO(heavier)))[:, :, 3]
    assert np.array_equal(np.fliplr(a), b)
    assert np.count_nonzero(c) > np.count_nonzero(a)


def test_photo_ink_extraction_keeps_visible_geometry_without_skin_fill():
    image = Image.new("RGB", (640, 640), (202, 155, 130))
    draw = ImageDraw.Draw(image)
    draw.ellipse((150, 160, 490, 500), outline=(52, 48, 51), width=13)
    draw.line((170, 330, 470, 330), fill=(45, 43, 46), width=9)
    result, metrics = process(image, Controls(source_type="photo"))
    alpha = np.asarray(Image.open(BytesIO(result)))[:, :, 3]
    assert alpha[160:190, 280:350].max() == 255
    assert alpha[325:335, 280:350].max() == 255
    assert alpha[25:100, 25:100].max() == 0
    assert metrics["threshold_mode"] == "local_ink"


def test_api_upload_transfer_export_and_delete(tmp_path, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "DATA", tmp_path)
    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"
    project = client.post("/api/v1/projects", json={"name": "Test", "locale": "ru"}).json()
    pid = project["project_id"]
    uploaded = client.post(f"/api/v1/projects/{pid}/source", files={"file": ("design.png", png(specimen()), "image/png")})
    assert uploaded.status_code == 200
    assert client.get(f"/api/v1/projects/{pid}/preview?type=source").status_code == 200
    started = client.post(f"/api/v1/projects/{pid}/transfer", json={"detail_level": 3, "line_weight": 0.5})
    assert started.status_code == 200
    job = client.get(f"/api/v1/jobs/{started.json()['job_id']}").json()
    assert job["status"] == "completed"
    result = client.get(f"/api/v1/projects/{pid}/preview")
    assert result.status_code == 200 and result.headers["content-type"] == "image/png"
    exported = client.post(f"/api/v1/projects/{pid}/export/png", json={"transparent_background": True}).json()
    assert client.get(exported["download_url"]).content.startswith(b"\x89PNG")
    pdf = client.post(f"/api/v1/projects/{pid}/export/pdf", json={"width_mm": 120}).json()
    assert pdf["final_width_mm"] == 120 and pdf["scale_percent"] == 100
    assert client.get(pdf["download_url"]).content.startswith(b"%PDF")
    assert client.delete(f"/api/v1/projects/{pid}").json() == {"deleted": True}


def test_photo_crop_is_validated_and_compared_at_same_size(tmp_path, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "DATA", tmp_path)
    client = TestClient(app)
    pid = client.post("/api/v1/projects", json={}).json()["project_id"]
    assert client.post(f"/api/v1/projects/{pid}/source", files={"file": ("photo.png", png(specimen()), "image/png")}).status_code == 200
    bad = client.post(f"/api/v1/projects/{pid}/transfer", json={"source_type": "photo", "crop": [0.8, 0.1, 0.2, 0.9]})
    assert bad.status_code == 422
    started = client.post(f"/api/v1/projects/{pid}/transfer", json={"source_type": "photo", "crop": [0.1, 0.1, 0.9, 0.9]})
    assert started.status_code == 200
    assert client.get(f"/api/v1/jobs/{started.json()['job_id']}").json()["status"] == "completed"
    source = Image.open(BytesIO(client.get(f"/api/v1/projects/{pid}/preview?type=work_source").content))
    result = Image.open(BytesIO(client.get(f"/api/v1/projects/{pid}/preview?type=transfer").content))
    assert source.size == result.size == (512, 512)


def test_invalid_image_is_rejected(tmp_path, monkeypatch):
    import app.main as main
    monkeypatch.setattr(main, "DATA", tmp_path)
    client = TestClient(app)
    pid = client.post("/api/v1/projects", json={}).json()["project_id"]
    response = client.post(f"/api/v1/projects/{pid}/source", files={"file": ("evil.png", b"not an image", "image/png")})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IMAGE_FORMAT"


def test_superseded_transfer_cannot_publish_an_old_result(tmp_path, monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "DATA", tmp_path)
    client = TestClient(app)
    pid = client.post("/api/v1/projects", json={}).json()["project_id"]
    assert client.post(f"/api/v1/projects/{pid}/source", files={"file": ("design.png", png(specimen()), "image/png")}).status_code == 200
    older, newer = "job_older", "job_newer"
    main.jobs[older] = {"job_id": older, "project_id": pid, "status": "queued"}
    main.jobs[newer] = {"job_id": newer, "project_id": pid, "status": "queued"}
    main.latest_jobs[pid] = newer
    main.run_job(older, pid, main.TransferRequest(detail_level=1))
    assert main.jobs[older]["status"] == "superseded"
    assert not (tmp_path / pid / "result.png").exists()
    main.run_job(newer, pid, main.TransferRequest(detail_level=5))
    assert main.jobs[newer]["status"] == "completed"
    assert (tmp_path / pid / "result.png").exists()


def test_a4_tiling_and_single_sheet_limit():
    image = png(specimen())
    pdf, pages = make_pdf(image, 300, 400, tile=True, overlap_mm=10)
    assert pdf.startswith(b"%PDF") and pages == 4
    try:
        make_pdf(image, 300, 400, tile=False)
    except ValueError as exc:
        assert "tiling" in str(exc)
    else:
        raise AssertionError("Oversized artwork must not silently shrink to A4")
