"""Caricamento dei file YAML in pipeline/config (richiede `pip install -e`)."""
from pathlib import Path

import yaml

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"


def load(name: str) -> dict:
    return yaml.safe_load((CONFIG_DIR / f"{name}.yaml").read_text(encoding="utf-8"))


def expand_steps(spec: dict, steps_max: int | None = None) -> list[int]:
    steps = list(range(spec["start"], spec["stop"] + 1, spec["every"]))
    if steps_max is not None:
        steps = [s for s in steps if s <= steps_max]
    return steps
