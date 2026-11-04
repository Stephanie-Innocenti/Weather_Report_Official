"""Unico punto in cui si costruiscono le chiavi dei file. Schema:
{model}/{run}/{region}/{var}/f{step:03d}.webp
"""
import datetime as dt

LATEST_KEY = "manifest/latest.json"
IMAGE_EXT = "webp"


def run_id(run: dt.datetime) -> str:
    return run.strftime("%Y%m%d%H")


def parse_run_id(value: str) -> dt.datetime:
    return dt.datetime.strptime(value, "%Y%m%d%H")


def image_key(model: str, run: str, region: str, var: str, step: int) -> str:
    return f"{model}/{run}/{region}/{var}/f{step:03d}.{IMAGE_EXT}"


def run_manifest_key(model: str, run: str) -> str:
    return f"{model}/{run}/manifest.json"
