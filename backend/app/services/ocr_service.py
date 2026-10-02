"""
OCR Service – Tesseract (completely free).
Used only when text extraction fails or file is image/scanned PDF.
"""
import logging
from io import BytesIO
from typing import Optional

import pytesseract
from PIL import Image
from pdf2image import convert_from_bytes

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Point pytesseract to the system binary
pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD


class OCRService:
    def extract_from_image(self, image_bytes: bytes) -> str:
        try:
            image = Image.open(BytesIO(image_bytes))
            # Preprocess for better accuracy
            image = image.convert("L")  # grayscale
            text = pytesseract.image_to_string(image, lang=settings.OCR_LANGUAGE)
            return text.strip()
        except Exception as e:
            logger.exception("OCR image failed: %s", e)
            return ""

    def extract_from_pdf_images(self, pdf_bytes: bytes, max_pages: int = 10) -> str:
        """Convert first N pages of PDF to images then OCR."""
        try:
            images = convert_from_bytes(pdf_bytes, first_page=1, last_page=max_pages, dpi=200)
            texts = []
            for img in images:
                img = img.convert("L")
                page_text = pytesseract.image_to_string(img, lang=settings.OCR_LANGUAGE)
                if page_text.strip():
                    texts.append(page_text.strip())
            return "\n\n".join(texts)
        except Exception as e:
            logger.exception("OCR PDF failed: %s", e)
            return ""

    def extract(self, file_bytes: bytes, content_type: str, filename: str) -> str:
        """Smart entry point."""
        lower = (filename or "").lower()
        ct = (content_type or "").lower()

        if "image" in ct or lower.endswith((".jpg", ".jpeg", ".png", ".webp", ".tiff")):
            return self.extract_from_image(file_bytes)

        if "pdf" in ct or lower.endswith(".pdf"):
            # First try normal text extraction outside; this is fallback for scanned
            return self.extract_from_pdf_images(file_bytes)

        # For unknown, try as image
        return self.extract_from_image(file_bytes)


ocr_service = OCRService()
