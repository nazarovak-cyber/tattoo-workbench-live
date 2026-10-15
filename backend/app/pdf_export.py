"""Physical-size A4 PDF with optional tiling and registration marks."""

from io import BytesIO
from math import ceil

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

MM = 72 / 25.4
A4 = (210, 297)


def make_pdf(png: bytes, width_mm: float, height_mm: float, *, mirror: bool = False,
             tile: bool = True, overlap_mm: float = 10, registration_marks: bool = True) -> tuple[bytes, int]:
    image = Image.open(BytesIO(png)).convert("RGBA")
    if mirror:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # Flatten on white for predictable print output.
    white = Image.new("RGB", image.size, "white")
    white.paste(image, mask=image.getchannel("A"))
    page_w, page_h = A4
    margin = 10
    printable_w, printable_h = page_w - 2 * margin, page_h - 2 * margin
    if not tile and (width_mm > printable_w or height_mm > printable_h):
        raise ValueError("Artwork exceeds one A4 page; enable tiling.")
    step_x = printable_w - overlap_mm
    step_y = printable_h - overlap_mm
    cols = max(1, ceil((width_mm - overlap_mm) / step_x)) if tile else 1
    rows = max(1, ceil((height_mm - overlap_mm) / step_y)) if tile else 1
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=(page_w * MM, page_h * MM), pageCompression=1)
    reader = ImageReader(white)
    for row in range(rows):
        for col in range(cols):
            x0, y0 = col * step_x, row * step_y
            pdf.saveState()
            clip = pdf.beginPath()
            clip.rect(margin * MM, margin * MM, printable_w * MM, printable_h * MM)
            pdf.clipPath(clip, stroke=0, fill=0)
            pdf.translate((margin - x0) * MM, (page_h - margin - height_mm + y0) * MM)
            pdf.drawImage(reader, 0, 0, width=width_mm * MM, height=height_mm * MM)
            pdf.restoreState()
            if registration_marks:
                pdf.setStrokeColorRGB(0.35, 0.35, 0.35)
                pdf.setLineWidth(0.3)
                for x in (margin, page_w - margin):
                    for y in (margin, page_h - margin):
                        arm = 4 * MM
                        px, py = x * MM, y * MM
                        pdf.line(px - arm, py, px + arm, py)
                        pdf.line(px, py - arm, px, py + arm)
            pdf.setFont("Helvetica", 8)
            pdf.drawString(10 * MM, 5 * MM, f"Tattoo Workbench  •  {width_mm:g} × {height_mm:g} mm  •  {col+1}/{cols}, {row+1}/{rows}  •  Print at 100%")
            pdf.showPage()
    pdf.save()
    return buf.getvalue(), cols * rows
