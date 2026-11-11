"""Manifest letti dal frontend. Ordine di pubblicazione: immagini -> manifest del run -> latest.json."""
import datetime as dt
import json

from ..naming import LATEST_KEY, run_manifest_key

JSON = "application/json"
RUN_CACHE = "public, max-age=300"
LATEST_CACHE = "public, max-age=60"


def _now() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _var_info(var: dict, steps, regions) -> dict:
    info = {"label": var["label"], "unit": var["unit"], "steps": sorted(steps)}
    live = [r for r in var.get("json_regions", []) if r in regions]
    if live:
        info["json_regions"] = live  # regioni con dati JSON per la mappa live
    return info


def write_run_manifest(store, model_id, model_cfg, run, regions_cfg, vars_cfg, produced, regions):
    manifest = {
        "model": model_id,
        "label": model_cfg["label"],
        "run": run,
        "ext": "webp",
        "generated": _now(),
        "attribution": model_cfg["attribution"],
        "regions": {r: {"label": regions_cfg[r]["label"], "bbox": regions_cfg[r]["bbox"]} for r in regions},
        "planned_countries": regions_cfg.get("planned_countries", {}),
        "vars": {v: _var_info(vars_cfg[v], steps, regions) for v, steps in produced.items()},
    }
    store.put(run_manifest_key(model_id, run), json.dumps(manifest, ensure_ascii=False).encode(), JSON, RUN_CACHE)


def update_latest(store, model_id: str, label: str, run: str) -> None:
    raw = store.get(LATEST_KEY)
    data = json.loads(raw) if raw else {"models": {}}
    current = data["models"].get(model_id)
    if current and current["run"] >= run:  # mai tornare indietro
        return
    data["models"][model_id] = {"label": label, "run": run}
    data["updated"] = _now()
    store.put(LATEST_KEY, json.dumps(data, ensure_ascii=False).encode(), JSON, LATEST_CACHE)


def cleanup(store, model_id: str, keep: int = 2) -> list[str]:
    runs = store.list_runs(model_id)
    old = runs[:-keep] if keep else runs
    for r in old:
        store.delete_prefix(f"{model_id}/{r}")
    return old
