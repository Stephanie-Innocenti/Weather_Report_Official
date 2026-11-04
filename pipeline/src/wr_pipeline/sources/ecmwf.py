"""Download ECMWF Open Data (IFS), con piu' sorgenti di riserva. Licenza CC-BY-4.0."""
import datetime as dt
import logging
from pathlib import Path

from ecmwf.opendata import Client

log = logging.getLogger("wr")


def _clients(cfg: dict):
    for name in cfg["sources"]:
        try:
            yield name, Client(
                source=name,
                maximum_retries=cfg.get("retries", 3),
                retry_after=cfg.get("retry_after", 20),
                **cfg["client"],
            )
        except Exception as e:  # sorgente non supportata dalla versione installata
            log.warning("Sorgente %s non disponibile: %s", name, e)


def latest_run(cfg: dict, max_step: int, param: str) -> dt.datetime:
    for name, client in _clients(cfg):
        try:
            run = client.latest(type="fc", stream=cfg["stream"], step=max_step, param=param)
            log.info("Ultimo run trovato con la sorgente %s", name)
            return run
        except Exception as e:
            log.warning("latest() fallito con %s: %s", name, e)
    raise RuntimeError("Nessuna sorgente ha risposto per il calcolo dell'ultimo run")


def download(cfg: dict, run: dt.datetime, param: str, steps: list[int], target: Path) -> Path:
    for name, client in _clients(cfg):
        try:
            log.info("Download da %s", name)
            client.retrieve(
                date=int(run.strftime("%Y%m%d")),
                time=run.hour,
                type="fc",
                stream=cfg["stream"],
                step=steps,
                param=param,
                target=str(target),
            )
            return target
        except Exception as e:
            log.warning("Download fallito con %s: %s", name, e)
            Path(target).unlink(missing_ok=True)
    raise RuntimeError(f"Tutte le sorgenti hanno fallito per {param}")