"""Deterministic stroke extraction. No generative image model is used."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from skimage.morphology import skeletonize

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 40_000_000
ALLOWED_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


class ImageError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class Controls:
    detail_level: int = 3
    line_weight: float = 0.5
    cleanup: int = 40
    mirror: bool = False
    background_remove: bool = True


def load_image(raw: bytes) -> tuple[Image.Image, str]:
    if len(raw) > MAX_BYTES:
        raise ImageError("IMAGE_TOO_LARGE", "Image exceeds the 25 MB limit.")
    try:
        image = Image.open(BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ImageError("INVALID_IMAGE_FORMAT", "Image cannot be decoded.") from exc
    if image.format not in ALLOWED_FORMATS:
        raise ImageError("INVALID_IMAGE_FORMAT", "Use JPG, PNG, or WebP.")
    mime = ALLOWED_FORMATS[image.format]
    image = ImageOps.exif_transpose(image)
    if min(image.size) < 256:
        raise ImageError("IMAGE_TOO_SMALL", "Each image side must be at least 256 px.")
    if max(image.size) > 8000 or image.width * image.height > MAX_PIXELS:
        raise ImageError("IMAGE_TOO_LARGE", "Image dimensions exceed the limit.")
    if image.mode in ("RGBA", "LA"):
        white = Image.new("RGBA", image.size, "white")
        white.alpha_composite(image.convert("RGBA"))
        image = white.convert("RGB")
    else:
        image = image.convert("RGB")
    return image, mime


def to_png(image: Image.Image) -> bytes:
    out = BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def process(image: Image.Image, controls: Controls) -> tuple[bytes, dict]:
    """Return opaque black strokes on transparent background plus audit metrics."""
    rgb = np.asarray(image)
    height, width = rgb.shape[:2]
    scale = min(1.0, 2400.0 / max(height, width))
    if scale < 1:
        rgb = cv2.resize(rgb, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    lightness = lab[:, :, 0]
    # Only correct paper illumination when the border indicates a light background.
    border = np.concatenate((lightness[0], lightness[-1], lightness[:, 0], lightness[:, -1]))
    light_paper = float(np.median(border)) > 145
    gray = lightness if light_paper else cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    if controls.background_remove and light_paper:
        bg = cv2.GaussianBlur(gray, (0, 0), sigmaX=25)
        gray = cv2.divide(gray, np.maximum(bg, 1), scale=255)
    gray = cv2.bilateralFilter(gray, 5, 30, 30)
    border_std = float(np.std(np.concatenate((gray[0], gray[-1], gray[:, 0], gray[:, -1]))))
    if border_std < 12:
        otsu_level, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        level = int(np.clip(otsu_level + (controls.detail_level - 3) * 6, 0, 255))
        _, mask = cv2.threshold(gray, level, 255, cv2.THRESH_BINARY_INV)
        threshold_mode = "otsu"
    else:
        c = int(np.clip(9 + (controls.detail_level - 3) * -2, 5, 15))
        mask = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY_INV, 31, c)
        threshold_mode = "adaptive"
    # Adaptive threshold can absorb a dark or textured background. Prefer a conservative fallback.
    if np.count_nonzero(mask) / mask.size > 0.45:
        _, fallback = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
        if np.count_nonzero(fallback) < np.count_nonzero(mask):
            mask, threshold_mode = fallback, "otsu_fallback"
    before_cleanup = mask.copy()
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    min_area = max(2, round(mask.size * 0.000002 * (0.25 + controls.cleanup / 80)))
    clean = np.zeros_like(mask)
    for index in range(1, n):
        if stats[index, cv2.CC_STAT_AREA] >= min_area:
            clean[labels == index] = 255
    if controls.cleanup >= 65:
        clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    # Rebuild around the centreline only when a heavier stroke was explicitly requested.
    if controls.line_weight > 0.55 and 0 < np.count_nonzero(clean) / clean.size < 0.30:
        centerline = skeletonize(clean > 0).astype(np.uint8) * 255
        radius = 1 if controls.line_weight < 0.75 else 2
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)
        rebuilt = cv2.dilate(centerline, kernel)
        # Preserve filled blackwork areas from the source mask.
        clean = cv2.max(clean, rebuilt)
    if controls.mirror:
        clean = cv2.flip(clean, 1)
    rgba = np.zeros((clean.shape[0], clean.shape[1], 4), dtype=np.uint8)
    rgba[:, :, 3] = clean
    result = Image.fromarray(rgba)
    metrics = {
        "threshold_mode": threshold_mode,
        "foreground_ratio": round(float(np.count_nonzero(clean) / clean.size), 4),
        "source_coverage": round(float(np.count_nonzero(cv2.bitwise_and(before_cleanup, clean)) / max(1, np.count_nonzero(before_cleanup))), 4),
        "width_px": result.width,
        "height_px": result.height,
        "warning": "Review fine details against the source before printing." if controls.cleanup > 70 else None,
    }
    return to_png(result), metrics
