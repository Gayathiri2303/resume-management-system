"""
Text extraction from PDF / DOCX / DOC / images.
Falls back to OCR when needed.
"""
import logging
from io import BytesIO
from typing import Tuple

from pypdf import PdfReader
from docx import Document

from app.services.ocr_service import ocr_service

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_bytes: bytes) -> Tuple[str, bool]:
    """Returns (text, used_ocr)."""
    try:
        reader = PdfReader(BytesIO(file_bytes))
        texts = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                texts.append(t.strip())
        full = "\n\n".join(texts)
        if len(full.strip()) > 80:  # enough text → digital PDF
            return full, False
        # Probably scanned → OCR
        ocr_text = ocr_service.extract_from_pdf_images(file_bytes)
        return ocr_text, True
    except Exception as e:
        logger.warning("PDF text extract failed, trying OCR: %s", e)
        ocr_text = ocr_service.extract_from_pdf_images(file_bytes)
        return ocr_text, True


def extract_text_from_docx(file_bytes: bytes) -> str:
    try:
        doc = Document(BytesIO(file_bytes))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        # Also tables
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    paragraphs.append(" | ".join(cells))
        return "\n".join(paragraphs)
    except Exception as e:
        logger.exception("DOCX extract failed: %s", e)
        return ""


def clean_text(text: str) -> str:
    if not text:
        return ""
    # Normalize whitespace
    lines = [line.strip() for line in text.splitlines()]
    lines = [l for l in lines if l]
    cleaned = "\n".join(lines)
    # Collapse multiple spaces
    import re
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    return cleaned.strip()


def extract_text(file_bytes: bytes, filename: str, content_type: str = "") -> Tuple[str, bool]:
    """
    Main entry.
    Returns (cleaned_text, used_ocr)
    """
    lower = (filename or "").lower()
    ct = (content_type or "").lower()

    if lower.endswith(".pdf") or "pdf" in ct:
        raw, used_ocr = extract_text_from_pdf(file_bytes)
        return clean_text(raw), used_ocr

    if lower.endswith((".docx",)) or "wordprocessingml" in ct:
        raw = extract_text_from_docx(file_bytes)
        return clean_text(raw), False

    if lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".tiff")) or "image" in ct:
        raw = ocr_service.extract_from_image(file_bytes)
        return clean_text(raw), True

    # Fallback try as PDF then image
    raw, used_ocr = extract_text_from_pdf(file_bytes)
    if not raw:
        raw = ocr_service.extract_from_image(file_bytes)
        used_ocr = True
    return clean_text(raw), used_ocr
