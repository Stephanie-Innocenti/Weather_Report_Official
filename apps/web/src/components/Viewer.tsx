"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import LanguageControl, { useLanguage } from "@/components/LanguageControl";
import StepPicker from "@/components/StepPicker";
import ThemeControl from "@/components/ThemeControl";
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
  const { t, dateLocale, localizedLabel, countryName } = useLanguage();
  const [latest, setLatest] = useState<Latest | null>(null);
  const [model, setModel] = useState("");
  const [run, setRun] = useState<RunManifest | null>(null);
  const [region, setRegion] = useState("");
  const [variable, setVariable] = useState("");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showPlannedCountries, setShowPlannedCountries] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [error, setError] = useState<string | null>(null);
  const preload = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchLatest()
      .then((l) => {
        if (cancelled) return;
        setLatest(l);
        setModel((current) => current in l.models ? current : Object.keys(l.models)[0] ?? "");
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const runRefreshKey = `${latest?.models[model]?.run ?? ""}|${latest?.updated ?? ""}`;

  useEffect(() => {
    const separator = runRefreshKey.indexOf("|");
    const selectedRun = runRefreshKey.slice(0, separator);
    const version = runRefreshKey.slice(separator + 1);
    if (!selectedRun || !model) return;
    let cancelled = false;
    fetchRun(model, selectedRun, version)
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
  }, [model, runRefreshKey]);

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
        <strong>{t("common.dataUnavailable")}</strong> {error}
      </div>
    );
  }
  if (!latest || !run) return <div className="notice">{t("common.loading")}</div>;
  if (!model) return <div className="notice">{t("home.noRun")}</div>;

  const start = runStart(run.run);
  const valid = step !== undefined ? new Date(start.getTime() + step * 3_600_000) : null;
  const whenFmt: Intl.DateTimeFormatOptions = {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  };
  const runFmt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", hour: "2-digit", timeZone: "UTC" };
  const v = run.vars[variable];
  const variableOptions: Option[] = Object.entries(run.vars).map(([id, info]) => ({
    id,
    text: localizedLabel(`var.${id}`, info.label),
  }));
  for (const [id, fallback] of [
    ["snow-depth", "Neve accumulata al suolo"],
    ["t500", "Temperatura a 500 hPa"],
  ]) {
    if (!run.vars[id]) {
      const label = localizedLabel(`var.${id}`, fallback);
      variableOptions.push({
        id,
        text: t("common.awaitingData").replace("{label}", label),
        disabled: true,
      });
    }
  }

  return (
    <div className="weather-shell">
      <header className="season-banner">
        <div className="season-copy">
          <p className="season-kicker">{t("home.kicker")}</p>
          <h1>Weather Report</h1>
          <p>{t("home.tagline")}</p>
        </div>
        <div className="season-actions">
          <Link className="season-link" href="/live">{t("home.openLive")} <span aria-hidden="true">↗</span></Link>
          <LanguageControl />
          <ThemeControl />
        </div>
      </header>

      <div className="weather-body">
      <aside className="rail" aria-label={t("home.forecastSelection")}>
          <section className="control-card">
            <Choice
            label={t("home.model")}
              value={model}
              options={Object.entries(latest.models).map(([id, m]) => ({ id, text: m.label }))}
              onChange={(nextModel) => {
                setPlaying(false);
                setModel(nextModel);
              }}
            />
          </section>
          <section className="control-card">
            <Choice
              label={t("home.parameter")}
              value={variable}
              options={variableOptions}
              onChange={(nextVariable) => {
                setPlaying(false);
                setVariable(nextVariable);
              }}
            />
          </section>
          <section className="control-card">
            <Choice
              label={t("home.area")}
              value={region}
              options={Object.entries(run.regions).map(([id, r]) => ({
                id,
                text: localizedLabel(`region.${id}`, r.label),
              }))}
              onChange={setRegion}
            />
            <button
              type="button"
              className="choice other-areas-toggle"
              aria-expanded={showPlannedCountries}
              aria-controls="planned-countries"
              onClick={() => setShowPlannedCountries((visible) => !visible)}
            >
              {t("home.otherCountries")} <span aria-hidden="true">{showPlannedCountries ? "−" : "+"}</span>
            </button>
            {showPlannedCountries && (
              <div id="planned-countries" className="planned-countries">
                <p className="planned-countries-note">{t("home.mapsPending")}</p>
                {Object.entries(run.planned_countries ?? {}).map(([id, label]) => (
                  <button key={id} type="button" className="choice unavailable" disabled>
                    {countryName(id, label)}
                  </button>
                ))}
              </div>
            )}
          </section>
          <p className="sidebar-note">{t("home.sidebarNote")}</p>
        </aside>

        <main className="stage">
          <section className="forecast-card">
            <header className="forecast-head">
              <div>
                <p className="forecast-kicker">
                  {run.label} <span>·</span> {localizedLabel(`region.${region}`, run.regions[region]?.label ?? region)}
                </p>
                <h2 className="when">{valid ? `${valid.toLocaleString(dateLocale, whenFmt)} UTC` : "—"}</h2>
                <p className="meta">
                  Run {start.toLocaleString(dateLocale, runFmt)} UTC · {t("home.forecastAt").replace("{step}", String(step ?? 0))}
                </p>
              </div>
            </header>

            <div className="forecast-map">
              <div className="frame">
                {step !== undefined && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl(run, region, variable, step)}
                    alt={t("home.imageAlt")
                      .replace("{variable}", localizedLabel(`var.${variable}`, v?.label ?? variable))
                      .replace("{area}", localizedLabel(`region.${region}`, run.regions[region]?.label ?? region))
                      .replace("{step}", String(step))}
                  />
                )}
              </div>
              <StepPicker
                steps={steps}
                current={step}
                onSelect={(s) => {
                  setPlaying(false);
                  setIdx(Math.max(steps.indexOf(s), 0));
                }}
              />
            </div>

            <div className="frame-caption">
              <strong>{localizedLabel(`var.${variable}`, v?.label ?? variable)}</strong>
              <span>{v?.unit} <span aria-hidden="true">·</span> {run.attribution}</span>
            </div>
          </section>

          <section className="player-card" aria-label={t("home.controls")}>
            <div className="player">
              <button onClick={() => setIdx((n) => Math.max(n - 1, 0))} aria-label={t("home.previousStep")} disabled={i === 0}>
                ‹
              </button>
              <button className="play" onClick={() => setPlaying((p) => !p)}>
                {playing ? t("home.pause") : t("home.play")}
              </button>
              <button onClick={() => setIdx((n) => Math.min(n + 1, steps.length - 1))} aria-label={t("home.nextStep")} disabled={i >= steps.length - 1}>
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
                aria-label={t("home.forecastTime")}
              />
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t("home.animationSpeed")}>
                <option value={1200}>{t("home.slow")}</option>
                <option value={600}>{t("home.normal")}</option>
                <option value={300}>{t("home.fast")}</option>
              </select>
            </div>
            <p className="attr">{t("home.animationHelp")}</p>
          </section>
        </main>
      </div>
    </div>
  );
}
