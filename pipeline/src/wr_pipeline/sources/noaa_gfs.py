"""Download GFS 0.25 gradi da NOAA (bucket S3 pubblico). Si scaricano solo i messaggi GRIB
che servono, tramite il file .idx e richieste HTTP con Range. Dati di pubblico dominio."""
import datetime as dt
import logging
import re
from functools import lru_cache
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger("wr")

BASE = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"

_session = requests.Session()
_session.mount(
    "https://",
    HTTPAdapter(max_retries=Retry(total=6, backoff_factor=2, status_forcelist=(500, 502, 503, 504),
                                  allowed_methods=("GET", "HEAD"))),
)


def _url(run: dt.datetime, step: int) -> str:
    d, h = run.strftime("%Y%m%d"), run.strftime("%H")
    return f"{BASE}/gfs.{d}/{h}/atmos/gfs.t{h}z.pgrb2.0p25.f{step:03d}"


@lru_cache(maxsize=512)
def _idx(url: str) -> list[tuple[int, str, str, str]]:
    """Righe .idx: offset, variabile, livello e descrizione del periodo."""
    r = _session.get(url + ".idx", timeout=60)
    r.raise_for_status()
    rows = []
    for line in r.text.splitlines():
        p = line.split(":")
        if len(p) >= 5:
            rows.append((int(p[1]), p[3], p[4], p[5] if len(p) > 5 else ""))
    return rows


def _accumulation_hours(period: str) -> int | None:
    match = re.fullmatch(r"0-(\d+)\s+(hour|day) acc fcst", period.strip())
    if not match:
        return None
    amount = int(match.group(1))
    return amount * (24 if match.group(2) == "day" else 1)


def _ranges(url: str, spec: dict, step: int | None = None) -> list[tuple[int, int | None]]:
    rows = _idx(url)
    if spec.get("accum"):
        if step is None:
            raise ValueError("step richiesto per selezionare un accumulo GFS")
        for i, row in enumerate(rows):
            offset, var, level = row[:3]
            period = row[3] if len(row) > 3 else ""
            if var == spec["param"] and level == spec["level"] and _accumulation_hours(period) == step:
                end = rows[i + 1][0] - 1 if i + 1 < len(rows) else None
                return [(offset, end)]
        return []

    out = []
    for i, row in enumerate(rows):
        offset, var, level = row[:3]
        if var == spec["param"] and level == spec["level"]:
            end = rows[i + 1][0] - 1 if i + 1 < len(rows) else None
            out.append((offset, end))
    return out


def available_runs(max_step: int, limit: int = 1) -> list[dt.datetime]:
    """Ultimi run completi, in ordine cronologico, fino al limite richiesto."""
    if limit < 1:
        raise ValueError("limit deve essere almeno 1")
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0, tzinfo=None)
    cand = now.replace(hour=now.hour - now.hour % 6)
    runs = []
    for _ in range(8):  # fino a 2 giorni indietro
        r = _session.head(_url(cand, max_step) + ".idx", timeout=30)
        if r.status_code == 200:
            runs.append(cand)
            if len(runs) == limit:
                break
        cand -= dt.timedelta(hours=6)
    if not runs:
        raise RuntimeError("Nessun run GFS completo trovato negli ultimi 2 giorni")
    runs.reverse()
    log.info("Run GFS completi: %s", ", ".join(run.strftime("%Y%m%d%H") for run in runs))
    return runs


def latest_run(cfg: dict, max_step: int, spec: dict) -> dt.datetime:
    """Ultimo run il cui ultimo step (max_step) e' gia' stato pubblicato."""
    return available_runs(max_step, 1)[-1]


def download(cfg: dict, run: dt.datetime, spec: dict, steps: list[int], target: Path) -> Path:
    """Un solo GRIB2 con il parametro richiesto per tutti gli step."""
    try:
        with open(target, "wb") as out:
            for step in steps:
                if spec.get("skip_step0") and step == 0:
                    continue
                url = _url(run, step)
                ranges = _ranges(url, spec, step if spec.get("accum") else None)
                if not ranges:
                    raise RuntimeError(f"{spec['param']} {spec['level']} non trovato in {url}.idx")
                for start, end in ranges:
                    rng = f"bytes={start}-{end}" if end is not None else f"bytes={start}-"
                    r = _session.get(url, headers={"Range": rng}, timeout=120)
                    r.raise_for_status()
                    if r.status_code != 206:
                        raise RuntimeError(f"Il server ha ignorato il Range ({r.status_code}) per {url}")
                    out.write(r.content)
    except Exception:
        Path(target).unlink(missing_ok=True)
        raise
    return Path(target)
