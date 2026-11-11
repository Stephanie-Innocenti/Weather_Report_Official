// Lettura dei dati pubblicati dalla pipeline. Lo schema dei path rispecchia pipeline/src/wr_pipeline/naming.py:
// {model}/{run}/{region}/{var}/f{step:03d}.{ext}
export const DATA_URL = (process.env.NEXT_PUBLIC_DATA_URL ?? "").replace(/\/$/, "");

export type Latest = {
  updated: string;
  models: Record<string, { label: string; run: string }>;
};

export type VarInfo = {
  label: string;
  unit: string;
  steps: number[];
  json_regions?: string[]; // regioni con dati JSON per la mappa live (es. vento)
};

export type RunManifest = {
  model: string;
  label: string;
  run: string; // YYYYMMDDHH, UTC
  ext: string;
  generated: string;
  attribution: string;
  regions: Record<string, { label: string; bbox: number[] }>;
  planned_countries?: Record<string, string>;
  vars: Record<string, VarInfo>;
};

async function getJson<T>(path: string): Promise<T> {
  if (!DATA_URL) throw new Error("NEXT_PUBLIC_DATA_URL non impostata (vedi .env.local)");
  const res = await fetch(`${DATA_URL}/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Impossibile leggere ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export const fetchLatest = () => getJson<Latest>("manifest/latest.json");
export const fetchRun = (model: string, run: string) =>
  getJson<RunManifest>(`${model}/${run}/manifest.json`);

export function dataUrl(m: RunManifest, region: string, variable: string, step: number, ext: string): string {
  return `${DATA_URL}/${m.model}/${m.run}/${region}/${variable}/f${String(step).padStart(3, "0")}.${ext}`;
}

export const imageUrl = (m: RunManifest, region: string, variable: string, step: number) =>
  dataUrl(m, region, variable, step, m.ext);

export async function fetchStepJson(m: RunManifest, region: string, variable: string, step: number): Promise<unknown> {
  const res = await fetch(dataUrl(m, region, variable, step, "json"));
  if (!res.ok) throw new Error(`Dati non disponibili per +${step} ore (HTTP ${res.status})`);
  return res.json();
}

export function runStart(run: string): Date {
  return new Date(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)));
}
