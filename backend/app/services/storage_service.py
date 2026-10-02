"""
Private resume storage – Supabase Storage (free tier).
Never exposes permanent public URLs.
"""
import logging
import uuid
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StorageService:
    def __init__(self):
        self.provider = (settings.STORAGE_PROVIDER or "").lower()
        self.bucket = settings.STORAGE_BUCKET or "resumes"
        self.supabase_url = (settings.SUPABASE_URL or "").rstrip("/")
        self.service_key = settings.SUPABASE_SERVICE_ROLE_KEY or ""

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.service_key}",
            "apikey": self.service_key,
        }

    def _key(self, candidate_id: str, version: int, filename: str) -> str:
        safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)
        return f"{candidate_id}/v{version}/{uuid.uuid4().hex[:8]}_{safe_name}"

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str,
        candidate_id: str = "temp",
        version: int = 1,
    ) -> str:
        """Upload file to Supabase Storage and return the storage key."""
        key = self._key(candidate_id, version, filename)

        if self.provider != "supabase" or not self.supabase_url or not self.service_key:
            logger.warning("Supabase storage not configured – returning mock key: %s", key)
            return key

        url = f"{self.supabase_url}/storage/v1/object/{self.bucket}/{key}"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    url,
                    content=file_bytes,
                    headers={
                        **self._headers(),
                        "Content-Type": content_type or "application/octet-stream",
                        "x-upsert": "true",
                    },
                )
                if response.status_code not in (200, 201):
                    logger.error(
                        "Supabase upload failed: %s %s",
                        response.status_code,
                        response.text,
                    )
                    raise RuntimeError("Failed to store resume in Supabase")
                return key
        except Exception as e:
            logger.exception("Upload failed: %s", e)
            raise RuntimeError("Failed to store resume securely") from e

    def generate_presigned_url(self, key: str, expires_seconds: int = 300) -> Optional[str]:
        """Generate a temporary signed download URL (default 5 minutes)."""
        if self.provider != "supabase" or not self.supabase_url or not self.service_key:
            logger.warning("Supabase not configured – cannot generate signed URL")
            return None

        if not key:
            return None

        # Clean the key – remove bucket name if it is already present
        object_path = key
        if object_path.startswith(f"{self.bucket}/"):
            object_path = object_path[len(self.bucket) + 1 :]
        if object_path.startswith("resumes/"):
            object_path = object_path[len("resumes/") :]

        url = f"{self.supabase_url}/storage/v1/object/sign/{self.bucket}/{object_path}"

        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(
                    url,
                    headers=self._headers(),
                    json={"expiresIn": expires_seconds},
                )
                if response.status_code != 200:
                    logger.error(
                        "Sign URL failed (%s): %s | path=%s",
                        response.status_code,
                        response.text,
                        object_path,
                    )
                    return None

                data = response.json()
                signed_path = (
                    data.get("signedURL")
                    or data.get("signedUrl")
                    or data.get("signed_url")
                )
                if not signed_path:
                    logger.error("No signedURL in response: %s", data)
                    return None

                if signed_path.startswith("http"):
                    return signed_path
                if signed_path.startswith("/"):
                    return f"{self.supabase_url}/storage/v1{signed_path}"
                return f"{self.supabase_url}/storage/v1/{signed_path}"
        except Exception as e:
            logger.exception("Presign failed: %s", e)
            return None

    def download_bytes(self, key: str) -> Optional[bytes]:
        if self.provider != "supabase" or not self.supabase_url or not self.service_key:
            return None

        object_path = key
        if object_path.startswith(f"{self.bucket}/"):
            object_path = object_path[len(self.bucket) + 1 :]
        if object_path.startswith("resumes/"):
            object_path = object_path[len("resumes/") :]

        url = f"{self.supabase_url}/storage/v1/object/{self.bucket}/{object_path}"
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.get(url, headers=self._headers())
                if response.status_code == 200:
                    return response.content
                return None
        except Exception:
            return None

    def delete(self, key: str) -> bool:
        if self.provider != "supabase" or not self.supabase_url or not self.service_key:
            return False

        object_path = key
        if object_path.startswith(f"{self.bucket}/"):
            object_path = object_path[len(self.bucket) + 1 :]
        if object_path.startswith("resumes/"):
            object_path = object_path[len("resumes/") :]

        url = f"{self.supabase_url}/storage/v1/object/{self.bucket}/{object_path}"
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.delete(url, headers=self._headers())
                return response.status_code in (200, 204)
        except Exception:
            return False


storage_service = StorageService()