"""Download ICON-EU dal server Open Data del DWD (griglia regolare lat-lon, file .bz2).
Un file per parametro, livello e step: vengono decompressi e uniti in un unico GRIB2.
Attribuzione richiesta: Datenbasis: Deutscher Wetterdienst."""
import bz2
import datetime as dt
import logging
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger("wr")

BASE = "https://opendata.dwd.de/weather/nwp/icon-eu/grib"

_session = requests.Session()
_session.mount(
    "https://",
    HTTPAdapter(max_retries=Retry(total=5, backoff_factor=2, status_forcelist=(500, 502, 503, 504),
                                  allowed_methods=("GET", "HEAD"))),
)


def _url(run: dt.datetime, step: int, spec: dict) -> str:
    stamp, hh, var = run.strftime("%Y%m%d%H"), run.strftime("%H"), spec["param"]
    if spec.get("level") is None:
        name = f"icon-eu_europe_regular-lat-lon_single-level_{stamp}_{step:03d}_{var}.grib2.bz2"
    else:
        name = f"icon-eu_europe_regular-lat-lon_pressure-level_{stamp}_{step:03d}_{spec['level']}_{var}.grib2.bz2"
    return f"{BASE}/{hh}/{var.lower()}/{name}"


def latest_run(cfg: dict, max_step: int, spec: dict) -> dt.datetime:
    """Ultimo run il cui ultimo step e' gia' pubblicato (se un run non arriva a max_step viene saltato)."""
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0, tzinfo=None)
    cand = now.replace(hour=now.hour - now.hour % 6)
    for _ in range(6):
        r = _session.head(_url(cand, max_step, spec), timeout=30)
        if r.status_code == 200:
            log.info("Ultimo run utilizzabile: %s", cand)
            return cand
        cand -= dt.timedelta(hours=6)
    raise RuntimeError("Nessun run ICON-EU completo trovato (il DWD conserva solo circa un giorno di dati)")


def download(cfg: dict, run: dt.datetime, spec: dict, steps: list[int], target: Path) -> Path:
    try:
        with open(target, "wb") as out:
            for step in steps:
                url = _url(run, step, spec)
                r = _session.get(url, timeout=120)
                if r.status_code != 200:
                    raise RuntimeError(f"HTTP {r.status_code} per {url}")
                out.write(bz2.decompress(r.content))
    except Exception:
        Path(target).unlink(missing_ok=True)
        raise
    return Path(target)
