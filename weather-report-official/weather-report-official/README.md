# Weather Report - Official

Sito meteo moderno ispirato a Meteociel: mappe dei modelli numerici, animazioni, mappa live in stile Windy.
Le mappe sono generate dalla pipeline a partire da dati aperti (ECMWF IFS/AIFS CC-BY-4.0, GFS, ICON, AROME).

## Struttura
- `pipeline/` generazione mappe (Python) -> Cloudflare R2
- `apps/web/` frontend (Next.js, Fase 2)
- `.github/workflows/` cron di ingest
- `docs/` note e decisioni

## Pipeline: avvio locale
```bash
cd pipeline
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
wr ingest --model ecmwf-ifs --run latest --steps-max 12 --vars t2m --regions it --local out
```
Output in `pipeline/out/`. Senza `--local` carica su R2 (servono le variabili R2_*).

## Naming file
`{model}/{run}/{region}/{var}/f{step:03d}.webp`  es. `ecmwf-ifs/2026110400/it/t2m/f024.webp`
Manifest: `manifest/latest.json` e `{model}/{run}/manifest.json`

## Attribuzione
ECMWF IFS Open Data, CC BY 4.0. L'attribuzione va mostrata sul sito.

##
Reserved
