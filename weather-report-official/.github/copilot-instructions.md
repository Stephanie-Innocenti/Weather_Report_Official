# Istruzioni per Copilot
- Progetto: Weather Report - Official. Pipeline Python in `pipeline/`, frontend Next.js in `apps/web/`.
- Naming file generati: `{model}/{run}/{region}/{var}/f{step:03d}.webp` (run = YYYYMMDDHH UTC). Le chiavi si costruiscono solo con `wr_pipeline/naming.py`.
- Modelli, variabili e regioni stanno in `pipeline/config/*.yaml`: non hardcodare valori nel codice.
- Un nuovo modello = una voce in models.yaml + un file in `wr_pipeline/sources/`.
- Solo servizi gratuiti (GitHub Actions, Cloudflare R2/Pages, Supabase free). Nessuno scraping di siti terzi.
- Commenti e messaggi utente in italiano, codice e identificatori in inglese.
