"""Storage: cartella locale (test) oppure Cloudflare R2 (API S3)."""
import os
import shutil
from pathlib import Path


class LocalStore:
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, data: bytes, content_type: str, cache: str) -> None:
        p = self.root / key
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, key: str) -> bytes | None:
        p = self.root / key
        return p.read_bytes() if p.exists() else None

    def exists(self, key: str) -> bool:
        return (self.root / key).exists()

    def list_runs(self, model: str) -> list[str]:
        d = self.root / model
        return sorted(p.name for p in d.iterdir() if p.is_dir()) if d.exists() else []

    def delete_prefix(self, prefix: str) -> None:
        shutil.rmtree(self.root / prefix, ignore_errors=True)


class R2Store:
    def __init__(self):
        import boto3
        from botocore.config import Config

        self.bucket = os.environ["R2_BUCKET"]
        self.s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
            config=Config(
                retries={"max_attempts": 5, "mode": "standard"},
                # i checksum di default delle versioni recenti di boto3 danno problemi con R2
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    def put(self, key: str, data: bytes, content_type: str, cache: str) -> None:
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type, CacheControl=cache)

    def get(self, key: str) -> bytes | None:
        from botocore.exceptions import ClientError

        try:
            return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
                return None
            raise

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
                return False
            raise

    def list_runs(self, model: str) -> list[str]:
        runs: list[str] = []
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=f"{model}/", Delimiter="/"):
            for cp in page.get("CommonPrefixes", []):
                runs.append(cp["Prefix"].rstrip("/").split("/")[-1])
        return sorted(runs)

    def delete_prefix(self, prefix: str) -> None:
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=f"{prefix}/"):
            objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objs:
                self.s3.delete_objects(Bucket=self.bucket, Delete={"Objects": objs})


def get_store(local_dir: str | None):
    return LocalStore(local_dir) if local_dir else R2Store()
