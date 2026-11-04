"""Download ECMWF Open Data (IFS) via ecmwf-opendata. Licenza CC-BY-4.0."""
import datetime as dt
from pathlib import Path

from ecmwf.opendata import Client


def _client(cfg: dict) -> Client:
    return Client(**cfg["client"])


def latest_run(cfg: dict, max_step: int, param: str) -> dt.datetime:
    """Ultimo run per cui il max_step e' gia' disponibile (cioe' run completo)."""
    return _client(cfg).latest(type="fc", stream=cfg["stream"], step=max_step, param=param)


def download(cfg: dict, run: dt.datetime, param: str, steps: list[int], target: Path) -> Path:
    """Scarica un solo parametro per tutti gli step in un unico GRIB2."""
    _client(cfg).retrieve(
        date=int(run.strftime("%Y%m%d")),
        time=run.hour,
        type="fc",
        stream=cfg["stream"],
        step=steps,
        param=param,
        target=str(target),
    )
    return target
