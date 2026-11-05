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


def latest_run(cfg: dict, max_step: int, spec: dict) -> dt.datetime:
    for name, client in _clients(cfg):
        try:
            run = client.latest(type="fc", stream=cfg["stream"], step=max_step, **_req(spec))
        except Exception as e:
            log.warning("latest() fallito con %s: %s", name, e)
            continue
        # i run 06/18 non ci interessano: si scende al run 00/12 piu' recente
        hour = max(h for h in cfg["runs"] if h <= run.hour)
        run = run.replace(hour=hour, minute=0, second=0, microsecond=0)
        log.info("Ultimo run utilizzabile: %s (sorgente %s)", run, name)
        return run
    raise RuntimeError("Nessuna sorgente ha risposto per il calcolo dell'ultimo run")


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
