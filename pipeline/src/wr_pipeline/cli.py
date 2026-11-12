"""CLI: wr ingest --model ecmwf-ifs [--run latest|YYYYMMDDHH] [--local DIR]"""
import argparse
import importlib
import json
import logging
import tempfile
from pathlib import Path

from . import config, naming
from .publish import manifest as mf
from .publish.storage import get_store

log = logging.getLogger("wr")
IMG_CACHE = "public, max-age=31536000, immutable"  # il run e' nel path: non cambia mai

SOURCES = {
    "ecmwf_opendata": "wr_pipeline.sources.ecmwf",
    "noaa_gfs": "wr_pipeline.sources.noaa_gfs",
    "dwd_icon": "wr_pipeline.sources.dwd_icon",
}


def _source(name: str):
    return importlib.import_module(SOURCES[name])


def _effective_var(var: dict, spec: dict) -> dict:
    """Variabile con eventuale override di scale/offset specifico del modello (es. FI -> dam)."""
    return {**var, **{k: spec[k] for k in ("scale", "offset") if k in spec}}


def _scalar(spec: dict) -> dict:
    """Per le variabili vettoriali (u/v) si usa la componente u per le operazioni comuni."""
    return spec["u"] if "u" in spec else spec


def _meta(m: dict, run, hours: int, valid) -> dict:
    return {"model_label": m["label"], "run": run, "step": hours, "valid": valid, "attribution": m["attribution"]}


def _regions_for_model(regions_cfg: dict, model_cfg: dict) -> dict:
    regions = dict(regions_cfg)
    for region_id, bbox in model_cfg.get("region_bboxes", {}).items():
        regions[region_id] = {**regions_cfg[region_id], "bbox": bbox}
    return regions


def _ingest_vector(src, m, model, run, rid, var_id, spec, var, steps, regions, regions_cfg, store, tmp) -> list[int]:
    """Vento: scarica u e v, produce l'immagine (velocita' + frecce) e, per le regioni indicate, il JSON per la mappa live."""
    from .process.extract import crop, iter_fields, open_param
    from .process.wind import wind_json
    from .render.maps import render_map

    log.info("Scarico %s (u, v)", var_id)
    das = {}
    for comp in ("u", "v"):
        s = spec[comp]
        grib = src.download(m, run, s, steps, Path(tmp) / f"{var_id}_{comp}.grib2")
        das[comp] = open_param(grib, s.get("short", s["param"]))
    done: list[int] = []
    for (h, valid, fu), (h2, _, fv) in zip(iter_fields(das["u"], var), iter_fields(das["v"], var)):
        if h != h2:
            raise RuntimeError(f"Step di u e v non allineati: {h} / {h2}")
        for region_id in regions:
            reg = regions_cfg[region_id]
            cu, cv = crop(fu, reg["bbox"]), crop(fv, reg["bbox"])
            speed = (cu**2 + cv**2) ** 0.5 * 3.6  # m/s -> km/h
            img = render_map(speed, var, reg, _meta(m, run, h, valid), vectors=(cu, cv))
            store.put(naming.image_key(model, rid, region_id, var_id, h), img, "image/webp", IMG_CACHE)
            if region_id in var.get("json_regions", []):
                data = wind_json(cu["latitude"].values, cu["longitude"].values, cu.values, cv.values, valid,
                                 var.get("json_step_deg", 0.5))
                store.put(naming.data_key(model, rid, region_id, var_id, h), data, "application/json", IMG_CACHE)
        done.append(h)
    log.info("%s: %d step pubblicati", var_id, len(done))
    return done


def ingest(args) -> int:
    from .process.extract import crop, iter_fields, open_param
    from .render.maps import render_map

    models, vars_cfg, regions_cfg = config.load("models"), config.load("variables"), config.load("regions")
    if args.model not in models or not models[args.model].get("enabled"):
        log.error("Modello non abilitato: %s", args.model)
        return 2
    m = models[args.model]
    model_regions_cfg = _regions_for_model(regions_cfg, m)
    src = _source(m["source"])
    all_steps = config.expand_steps(m["steps"])
    steps = config.expand_steps(m["steps"], args.steps_max)
    var_ids = args.vars.split(",") if args.vars else list(m["params"])
    regions = args.regions.split(",") if args.regions else m["regions"]
    unknown = [v for v in var_ids if v not in m["params"]]
    if unknown:
        log.error("Variabili non previste per %s: %s", args.model, unknown)
        return 2
    specs = {v: config.param_spec(m["params"][v]) for v in var_ids}

    if args.run == "latest":
        run = src.latest_run(m, max(all_steps), _scalar(specs[var_ids[0]]))
    else:
        run = naming.parse_run_id(args.run)
    if run.hour not in m["runs"]:
        log.error("Run %s UTC non supportato per %s (ammessi: %s)", run.hour, args.model, m["runs"])
        return 2
    rid = naming.run_id(run)
    log.info("Modello %s, run %s, step %s..%s", args.model, rid, steps[0], steps[-1])

    store = get_store(args.local)
    raw = store.get(naming.run_manifest_key(args.model, rid))
    old = json.loads(raw) if raw else {"vars": {}, "regions": {}}

    def complete(v: str) -> bool:
        info = old["vars"].get(v)
        return bool(info and info["steps"] and max(info["steps"]) >= steps[-1] and set(regions) <= set(old["regions"]))

    if not args.force:
        todo = [v for v in var_ids if not complete(v)]
        if not todo:
            if old.get("planned_countries") != regions_cfg.get("planned_countries", {}):
                existing = {v: info["steps"] for v, info in old["vars"].items()}
                mf.write_run_manifest(
                    store, args.model, m, rid, model_regions_cfg, vars_cfg, existing, list(old["regions"])
                )
            log.info("Run gia' completo, niente da fare (usa --force per rigenerare)")
            return 0
        if len(todo) < len(var_ids):
            log.info("Run gia' parziale: completo solo %s", todo)
        var_ids = todo

    produced: dict[str, list[int]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        for var_id in var_ids:
            spec, var = specs[var_id], _effective_var(vars_cfg[var_id], specs[var_id])
            if var["kind"] == "vector":
                produced[var_id] = _ingest_vector(src, m, args.model, run, rid, var_id, spec, var, steps,
                                                  regions, model_regions_cfg, store, tmp)
                continue
            log.info("Scarico %s (%s)", var_id, spec["param"])
            grib = src.download(m, run, spec, steps, Path(tmp) / f"{var_id}.grib2")
            da = open_param(grib, spec.get("short", spec["param"]))
            produced[var_id] = []
            for hours, valid, field in iter_fields(da, var):
                for region_id in regions:
                    img = render_map(
                        crop(field, model_regions_cfg[region_id]["bbox"]), var, model_regions_cfg[region_id],
                        _meta(m, run, hours, valid),
                    )
                    store.put(naming.image_key(args.model, rid, region_id, var_id, hours), img, "image/webp", IMG_CACHE)
                produced[var_id].append(hours)
            log.info("%s: %d step pubblicati", var_id, len(produced[var_id]))

    # il manifest e' ADDITIVO: le variabili gia' presenti restano, quelle rigenerate vengono aggiornate
    merged = {v: x["steps"] for v, x in old["vars"].items()}
    merged.update(produced)
    merged = {v: merged[v] for v in m["params"] if v in merged}  # ordine come in models.yaml
    regions_all = [r for r in regions_cfg if r in set(old["regions"]) | set(regions)]
    mf.write_run_manifest(store, args.model, m, rid, model_regions_cfg, vars_cfg, merged, regions_all)
    mf.update_latest(store, args.model, m["label"], rid)
    removed = mf.cleanup(store, args.model, keep=2)
    log.info("Fatto. Run rimossi: %s", removed or "nessuno")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="wr")
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("ingest", help="scarica un run, genera le mappe, pubblica")
    i.add_argument("--model", required=True)
    i.add_argument("--run", default="latest", help="latest oppure YYYYMMDDHH")
    i.add_argument("--vars", help="es. t2m,mslp (default: tutte)")
    i.add_argument("--regions", help="es. it,eu (default: da models.yaml)")
    i.add_argument("--steps-max", type=int, help="limita gli step (utile nei test)")
    i.add_argument("--local", metavar="DIR", help="scrive in locale invece che su R2")
    i.add_argument("--force", action="store_true", help="rigenera anche se il run esiste")
    i.set_defaults(func=ingest)
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
