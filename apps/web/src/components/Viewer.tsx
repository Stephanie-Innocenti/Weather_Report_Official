"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchLatest, fetchRun, imageUrl, runStart, type Latest, type RunManifest } from "@/lib/data";

type Option = { id: string; text: string };

function Choice(props: { label: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <div className="group" role="radiogroup" aria-label={props.label}>
      <p className="group-label">{props.label}</p>
      {props.options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={o.id === props.value}
          className={o.id === props.value ? "choice on" : "choice"}
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

  return (
    <div className="shell">
      <aside className="rail">
        <h1 className="brand">
          Weather Report <span>Official</span>
        </h1>
        <Link className="navlink" href="/live">Mappa live del vento →</Link>
        <Choice
          label="Modello"
          value={model}
          options={Object.entries(latest.models).map(([id, m]) => ({ id, text: m.label }))}
          onChange={setModel}
        />
        <Choice
          label="Parametro"
          value={variable}
          options={Object.entries(run.vars).map(([id, x]) => ({ id, text: x.label }))}
          onChange={setVariable}
        />
        <Choice
          label="Area"
          value={region}
          options={Object.entries(run.regions).map(([id, r]) => ({ id, text: r.label }))}
          onChange={setRegion}
        />
      </aside>

      <main className="stage">
        <header className="readout">
          <p className="when">{valid ? `${valid.toLocaleString("it-IT", whenFmt)} UTC` : "—"}</p>
          <p className="meta">
            Run delle {start.toLocaleString("it-IT", runFmt)} UTC, previsione a +{step ?? 0} ore
          </p>
        </header>

        <div className="frame">
          {step !== undefined && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(run, region, variable, step)} alt={`${v?.label}, ${run.regions[region]?.label}, +${step} ore`} />
          )}
        </div>

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

        <p className="attr">{run.attribution}. Frecce per scorrere, barra spaziatrice per l’animazione.</p>
      </main>
    </div>
  );
}
