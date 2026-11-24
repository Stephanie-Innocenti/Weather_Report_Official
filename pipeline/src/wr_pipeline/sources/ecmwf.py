"""Download ECMWF Open Data (IFS), con piu' sorgenti di riserva. Licenza CC-BY-4.0."""
import datetime as dt
import logging
from pathlib import Path

from ecmwf.opendata import Client

log = logging.getLogger("wr")


def _req(spec: dict) -> dict:
    """Parametri della richiesta: param (+ levtype/levelist per i livelli di pressione)."""
    return {k: spec[k] for k in ("param", "levtype", "levelist") if k in spec}


def _clients(cfg: dict):
    base = {k: v for k, v in cfg["client"].items() if k != "source"}
    names = cfg.get("sources") or [cfg["client"].get("source", "aws")]
    for name in names:
        try:
            yield name, Client(
                source=name,
                maximum_retries=cfg.get("retries", 3),
                retry_after=cfg.get("retry_after", 20),
                **base,
            )
        except Exception as e:  # sorgente non supportata dalla versione installata
            log.warning("Sorgente %s non disponibile: %s", name, e)


def available_runs(cfg: dict, max_step: int, spec: dict, limit: int = 4) -> list[dt.datetime]:
    """Ultimi run completi per ciascun ciclo configurato, dal piu' vecchio al piu' nuovo."""
    if limit < 1:
        raise ValueError("limit deve essere almeno 1")
    clients = list(_clients(cfg))
    runs: set[dt.datetime] = set()
    for hour in cfg["runs"]:
        for name, client in clients:
            try:
                run = client.latest(
                    type="fc", stream=cfg["stream"], time=hour, step=max_step, **_req(spec)
                )
            except Exception as e:
                log.warning("latest() per il ciclo %02d fallito con %s: %s", hour, name, e)
                continue
            runs.add(run.replace(hour=hour, minute=0, second=0, microsecond=0))
    if not runs:
        raise RuntimeError("Nessuna sorgente ha risposto per il calcolo dell'ultimo run")
    result = sorted(runs)[-limit:]
    log.info("Run ECMWF completi: %s", ", ".join(run.strftime("%Y%m%d%H") for run in result))
    return result


def latest_run(cfg: dict, max_step: int, spec: dict) -> dt.datetime:
    return available_runs(cfg, max_step, spec, 1)[-1]


def download(cfg: dict, run: dt.datetime, spec: dict, steps: list[int], target: Path) -> Path:
    for name, client in _clients(cfg):
        try:
            log.info("Download da %s", name)
            client.retrieve(
                date=int(run.strftime("%Y%m%d")),
                time=run.hour,
                type="fc",
                stream=cfg["stream"],
                step=steps,
                target=str(target),
                **_req(spec),
            )
            return target
        except Exception as e:
            log.warning("Download fallito con %s: %s", name, e)
            Path(target).unlink(missing_ok=True)
    raise RuntimeError(f"Tutte le sorgenti hanno fallito per {spec['param']}")
