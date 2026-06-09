"""Object storage access for the worker (S3-compatible: MinIO locally, R2 prod).

Unlike the API — which hands the browser presigned URLs — the worker holds the
credentials directly and reads/writes objects itself, because it's a trusted
backend process, not a browser.
"""

import os

import boto3
from botocore.config import Config

_ENDPOINT = os.environ.get("R2_ENDPOINT", "http://localhost:9000")
_BUCKET = os.environ.get("R2_BUCKET", "musical-atelier")
_REGION = os.environ.get("R2_REGION", "auto")
_FORCE_PATH_STYLE = os.environ.get("R2_FORCE_PATH_STYLE", "true") == "true"

_s3 = boto3.client(
    "s3",
    endpoint_url=_ENDPOINT,
    aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
    region_name=_REGION,
    config=Config(
        s3={"addressing_style": "path" if _FORCE_PATH_STYLE else "auto"}
    ),
)


def download(key: str) -> bytes:
    """Download an object's bytes from storage."""
    resp = _s3.get_object(Bucket=_BUCKET, Key=key)
    return resp["Body"].read()


def upload(key: str, data: bytes, content_type: str) -> None:
    """Upload bytes to storage under `key`."""
    _s3.put_object(Bucket=_BUCKET, Key=key, Body=data, ContentType=content_type)
