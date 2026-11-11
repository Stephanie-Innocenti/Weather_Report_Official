"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchLatest, fetchRun, imageUrl, runStart, type Latest, type RunManifest } from "@/lib/data";

type Option = { id: string; text: string; disabled?: boolean };

function Choice(props: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <div className="group" role="radiogroup" aria-label={props.label}>
      <p className="group-label">{props.label}</p>
      {props.options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === props.value}
          className={`choice${o.id === props.value ? " on" : ""}${o.disabled ? " unavailable" : ""}`}
          disabled={o.disabled}
          onClick={() => props.onChange(o.id)}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

export default function Viewer() {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [model, setModel] = useState("");
  const [run, setRun] = useState<RunManifest | null>(null);
  const [region, setRegion] = useState("");
  const [variable, setVariable] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [error, setError] = useState<string | null>(null);
  const preload = useRef<HTMLImageElement[]>([]);

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
        setRegion((p) => (p in r.regions ? p : Object.keys(r.regions)[0]));
        setVariable((p) => (p in r.vars ? p : Object.keys(r.vars)[0]));
        setIdx(0);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [latest, model]);

  const steps = useMemo(() => run?.vars[variable]?.steps ?? [], [run, variable]);
  const i = Math.min(idx, Math.max(steps.length - 1, 0));
  const step = steps[i];

  // precarica tutti gli step: l'animazione scorre senza attese
  useEffect(() => {
    if (!run || !region || !variable) return;
    preload.current = steps.map((s) => {
      const im = new Image();
      im.src = imageUrl(run, region, variable, s);
      return im;
    });
  }, [run, region, variable, steps]);

  useEffect(() => {
    if (!playing || steps.length < 2) return;
    const t = setInterval(() => setIdx((n) => (n + 1) % steps.length), speed);
    return () => clearInterval(t);
  }, [playing, speed, steps.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLButtonElement) return;
      if (e.key === "ArrowRight") setIdx((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setIdx((n) => Math.max(n - 1, 0));
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  if (error) {
    return (
      <div className="notice" role="alert">
        <strong>Dati non disponibili.</strong> {error}
      </div>
    );
  }
  if (!latest || !run) return <div className="notice">Caricamento dei dati…</div>;
  if (!model) return <div className="notice">Nessun run pubblicato: lancia la pipeline e riprova.</div>;

  const start = runStart(run.run);
  const valid = step !== undefined ? new Date(start.getTime() + step * 3_600_000) : null;
  const whenFmt: Intl.DateTimeFormatOptions = {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  };
  const runFmt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", timeZone: "UTC" };
  const v = run.vars[variable];
  const variableOptions: Option[] = Object.entries(run.vars).map(([id, info]) => ({ id, text: info.label }));
  for (const [id, label] of [
    ["snow-depth", "Neve accumulata al suolo"],
    ["t500", "Temperatura a 500 hPa"],
  ]) {
    if (!run.vars[id]) variableOptions.push({ id, text: `${label} · in attesa dei dati`, disabled: true });
  }

  return (
    <div className="weather-shell">
      <header className="season-banner">
        <div className="season-copy">
          <p className="season-kicker">Previsioni · modelli numerici</p>
          <h1>Weather Report</h1>
          <p>Leggi il tempo che arriva, un run alla volta.</p>
        </div>
        <Link className="season-link" href="/live">Apri la mappa live <span aria-hidden="true">↗</span></Link>
      </header>

      <div className="weather-body">
        <aside className="rail" aria-label="Selezione previsione">
          <section className="control-card">
            <span className="control-step">01</span>
            <Choice
              label="Modello"
              value={model}
              options={Object.entries(latest.models).map(([id, m]) => ({ id, text: m.label }))}
              onChange={(nextModel) => {
                setPlaying(false);
                setModel(nextModel);
              }}
            />
          </section>
          <section className="control-card">
            <span className="control-step">02</span>
            <Choice
              label="Parametro"
              value={variable}
              options={variableOptions}
              onChange={(nextVariable) => {
                setPlaying(false);
                setVariable(nextVariable);
              }}
            />
          </section>
          <section className="control-card">
            <span className="control-step">03</span>
            <Choice
              label="Area"
              value={region}
              options={Object.entries(run.regions).map(([id, r]) => ({ id, text: r.label }))}
              onChange={setRegion}
            />
          </section>
          <p className="sidebar-note">Nuove mappe e parametri si attivano quando il run è pubblicato.</p>
        </aside>

        <main className="stage">
          <section className="forecast-card">
            <header className="forecast-head">
              <div>
                <p className="forecast-kicker">{run.label} <span>·</span> {run.regions[region]?.label}</p>
                <h2 className="when">{valid ? `${valid.toLocaleString("it-IT", whenFmt)} UTC` : "—"}</h2>
                <p className="meta">
                  Run delle {start.toLocaleString("it-IT", runFmt)} UTC · previsione a +{step ?? 0} ore
                </p>
              </div>
            </header>

            <div className="frame">
              {step !== undefined && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl(run, region, variable, step)} alt={`${v?.label}, ${run.regions[region]?.label}, +${step} ore`} />
              )}
            </div>

            <div className="frame-caption">
              <strong>{v?.label}</strong>
              <span>{v?.unit} <span aria-hidden="true">·</span> {run.attribution}</span>
            </div>
          </section>

          <section className="player-card" aria-label="Controlli animazione">
            <div className="player">
              <button onClick={() => setIdx((n) => Math.max(n - 1, 0))} aria-label="Step precedente" disabled={i === 0}>
                ‹
              </button>
              <button className="play" onClick={() => setPlaying((p) => !p)}>
                {playing ? "Pausa" : "Riproduci"}
              </button>
              <button onClick={() => setIdx((n) => Math.min(n + 1, steps.length - 1))} aria-label="Step successivo" disabled={i >= steps.length - 1}>
                ›
              </button>
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
                <option value={1200}>Lenta</option>
                <option value={600}>Normale</option>
                <option value={300}>Veloce</option>
              </select>
            </div>
            <p className="attr">Usa le frecce o la barra spaziatrice per controllare l’animazione.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
