"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { fetchLatest, fetchRun, fetchStepJson, runStart, type Latest, type RunManifest } from "@/lib/data";

type VelocityLayer = { addTo: (m: LeafletMap) => VelocityLayer; setData: (d: unknown) => void };
type LeafletLib = typeof import("leaflet");

const REGION = "eu";
const WIND_COLORS = ["#a8dcf5", "#79cf6c", "#f4e65a", "#f7a53b", "#e2432b", "#c0267a", "#8c2d8f"];

export default function LiveMap() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<VelocityLayer | null>(null);
  const libRef = useRef<LeafletLib | null>(null);
  const cache = useRef(new Map<string, Promise<unknown>>());

  const [ready, setReady] = useState(false);
  const [latest, setLatest] = useState<Latest | null>(null);
  const [model, setModel] = useState("");
  const [run, setRun] = useState<RunManifest | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(900);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mappa Leaflet (solo nel browser)
  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: LeafletLib }).default ?? mod) as LeafletLib;
      (window as unknown as { L: unknown }).L = L; // leaflet-velocity cerca L globale
      await import("leaflet-velocity");
      if (disposed || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current, { center: [43, 12], zoom: 5, minZoom: 3, maxZoom: 9, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap contributors © CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      libRef.current = L;
      mapRef.current = map;
      setReady(true);
    })().catch((e: Error) => setError(e.message));
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    fetchLatest()
      .then((l) => {
        setLatest(l);
        setModel(Object.keys(l.models)[0] ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!latest || !model) return;
    let cancelled = false;
    fetchRun(model, latest.models[model].run)
      .then((r) => {
        if (cancelled) return;
        setRun(r);
        setIdx(0);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [latest, model]);

  const windVar = useMemo(() => {
    if (!run) return null;
    return Object.entries(run.vars).find(([, v]) => v.json_regions?.includes(REGION))?.[0] ?? null;
  }, [run]);
  const steps = useMemo(() => (run && windVar ? run.vars[windVar].steps : []), [run, windVar]);
  const i = Math.min(idx, Math.max(steps.length - 1, 0));
  const step = steps[i];

  // carica il vento dello step corrente (e il successivo, in anticipo)
  useEffect(() => {
    if (!ready || !run || !windVar || step === undefined) return;
    let cancelled = false;
    const load = (s: number) => {
      const key = `${run.model}/${run.run}/${s}`;
      let p = cache.current.get(key);
      if (!p) {
        p = fetchStepJson(run, REGION, windVar, s);
        cache.current.set(key, p);
        p.catch(() => cache.current.delete(key));
      }
      return p;
    };
    setLoading(true);
    load(step)
      .then((data) => {
        if (cancelled) return;
        const L = libRef.current as unknown as { velocityLayer: (o: object) => VelocityLayer } | null;
        if (layerRef.current) {
          layerRef.current.setData(data);
        } else if (L && mapRef.current) {
          layerRef.current = L.velocityLayer({
            displayValues: true,
            displayOptions: {
              velocityType: "Vento",
              position: "topright",
              emptyString: "Nessun dato",
              angleConvention: "bearingCW",
              speedUnit: "k/h",
            },
            data,
            maxVelocity: 30,
            velocityScale: 0.008,
            lineWidth: 1.6,
            opacity: 0.92,
            colorScale: WIND_COLORS,
          }).addTo(mapRef.current);
        }
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });
    const next = steps[i + 1];
    if (next !== undefined) load(next).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, run, windVar, step, steps, i]);

  useEffect(() => {
    if (!playing || steps.length < 2) return;
    const t = setInterval(() => setIdx((n) => (n + 1) % steps.length), speed);
    return () => clearInterval(t);
  }, [playing, speed, steps.length]);

  const start = run ? runStart(run.run) : null;
  const valid = start && step !== undefined ? new Date(start.getTime() + step * 3_600_000) : null;
  const whenFmt: Intl.DateTimeFormatOptions = {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  };

  let bottom: React.ReactNode;
  if (error) {
    bottom = <p role="alert"><strong>Dati non disponibili.</strong> {error}</p>;
  } else if (!run) {
    bottom = <p>Caricamento dei dati…</p>;
  } else if (!windVar) {
    bottom = <p>Questo modello non ha ancora dati di vento per la mappa live: lancia la pipeline e riprova.</p>;
  } else {
    bottom = (
      <>
        <header className="readout">
          <p className="when">{valid ? `${valid.toLocaleString("it-IT", whenFmt)} UTC` : "—"}</p>
          <p className="meta">
            {run.label}, previsione a +{step ?? 0} ore {loading ? "(caricamento…)" : ""}
          </p>
        </header>
        <div className="player">
          <button onClick={() => setIdx((n) => Math.max(n - 1, 0))} aria-label="Step precedente" disabled={i === 0}>‹</button>
          <button className="play" onClick={() => setPlaying((p) => !p)}>{playing ? "Pausa" : "Riproduci"}</button>
          <button onClick={() => setIdx((n) => Math.min(n + 1, steps.length - 1))} aria-label="Step successivo" disabled={i >= steps.length - 1}>›</button>
          <input
            type="range"
            min={0}
            max={Math.max(steps.length - 1, 0)}
            value={i}
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
            aria-label="Ora di previsione"
          />
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Velocità animazione">
            <option value={1500}>Lenta</option>
            <option value={900}>Normale</option>
            <option value={450}>Veloce</option>
          </select>
        </div>
        <p className="attr">{run.attribution}</p>
      </>
    );
  }

  return (
    <div className="live">
      <div ref={mapEl} className="live-map" />
      <section className="live-panel top">
        <h1 className="brand">
          Weather Report <span>Mappa live del vento</span>
        </h1>
        <Link className="navlink" href="/">← Carte dei modelli</Link>
        {latest && (
          <div className="group" role="radiogroup" aria-label="Modello">
            <p className="group-label">Modello</p>
            {Object.entries(latest.models).map(([id, m]) => (
              <button
                key={id}
                role="radio"
                aria-checked={id === model}
                className={id === model ? "choice on" : "choice"}
                onClick={() => {
                  setPlaying(false);
                  setModel(id);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="live-panel bottom">{bottom}</section>
    </div>
  );
}
