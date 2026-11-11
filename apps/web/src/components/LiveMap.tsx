"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.css";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { fetchLatest, fetchRun, fetchStepJson, runStart, type Latest, type RunManifest } from "@/lib/data";

type VelocityLayer = { addTo: (m: LeafletMap) => VelocityLayer; setData: (d: unknown) => void };
type LeafletLib = typeof import("leaflet");
type Removable = { remove: () => unknown };
type RegionId = "eu" | "it";

// Vista bloccata sulla regione (come una carta meteo): zoom minimo = inquadratura, massimo = +3
const REGIONS: Record<RegionId, { label: string; view: [[number, number], [number, number]] }> = {
  eu: { label: "Europa", view: [[33, -13], [61, 37]] },
  it: { label: "Italia", view: [[35.2, 6.2], [47.3, 19.0]] },
};

// Satellite EUMETSAT in tile WMS: mantiene la proiezione corretta e non crea una singola immagine stirata
const SAT_URL = "https://view.eumetsat.int/geoserver/wms";
const SAT_LAYER = "mtg_fd:rgb_geocolour";

// Copertura nevosa osservata da satellite (NASA GIBS MODIS Terra)
const SNOW_URL = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";
const SNOW_LAYER = "MODIS_Terra_NDSI_Snow_Cover";

// Radar nazionale Radar-DPC (Protezione Civile), licenza CC BY-SA 4.0
const RADAR_URL = "https://radar-geowebcache.protezionecivile.it/service/wms";
const RADAR_PRODUCTS = [
  { id: "vmi", label: "Riflettività (VMI)" },
  { id: "sri", label: "Intensità di pioggia (SRI)" },
];

const WIND_COLORS = ["#a8dcf5", "#79cf6c", "#f4e65a", "#f7a53b", "#e2432b", "#c0267a", "#8c2d8f"];

// Base cartografica: OpenFreeMap (vettoriale, senza chiave) tramite MapLibre; senza WebGL ripiega su tile raster Esri
async function addBasemap(L: LeafletLib, map: LeafletMap) {
  try {
    const maplibre = await import("maplibre-gl");
    maplibre.setWorkerUrl("/maplibre-gl-worker.mjs");
    (window as unknown as { maplibregl: unknown }).maplibregl =
      (maplibre as unknown as { default?: unknown }).default ?? maplibre;
    await import("@maplibre/maplibre-gl-leaflet");
    (L as unknown as { maplibreGL: (o: object) => { addTo: (m: LeafletMap) => void } })
      .maplibreGL({ style: "https://tiles.openfreemap.org/styles/dark", attributionControl: false })
      .addTo(map);
    map.attributionControl.addAttribution(
      '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © ' +
        '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from ' +
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    );
  } catch {
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles © Esri",
      maxNativeZoom: 16,
      maxZoom: 19,
    }).addTo(map);
  }
}

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
  const [region, setRegion] = useState<RegionId>("eu");
  const [sat, setSat] = useState(true);
  const [snow, setSnow] = useState(false);
  const [radar, setRadar] = useState(false);
  const [radarProduct, setRadarProduct] = useState("vmi");
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(900);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mappa Leaflet (solo nel browser). Zoom senza animazione: i livelli restano sempre allineati
  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = await import("leaflet");
      const L = ((mod as unknown as { default?: LeafletLib }).default ?? mod) as LeafletLib;
      (window as unknown as { L: unknown }).L = L; // leaflet-velocity cerca L globale
      await import("leaflet-velocity");
      if (disposed || !mapEl.current || mapRef.current) return;
      const map = L.map(mapEl.current, {
        center: [43, 12], zoom: 5, zoomControl: false, attributionControl: true,
        zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, zoomSnap: 0.25, zoomDelta: 0.5,
      });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      // pannelli con ordine fisso: base < satellite < radar < particelle del vento (overlayPane)
      const satPane = map.createPane("sat");
      satPane.style.zIndex = "250";
      satPane.style.pointerEvents = "none";
      const radarPane = map.createPane("radar");
      radarPane.style.zIndex = "300";
      radarPane.style.pointerEvents = "none";
      const snowPane = map.createPane("snow");
      snowPane.style.zIndex = "350";
      snowPane.style.pointerEvents = "none";
      await addBasemap(L, map);
      if (disposed) return;
      libRef.current = L;
      mapRef.current = map;
      setReady(true);
    })().catch((e: Error) => {
      if (!disposed) setError(e.message);
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
  }, []);

  // inquadratura della regione: zoom minimo = vista iniziale, massimo +3, niente trascinamento fuori dall'area
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const b = L.latLngBounds(REGIONS[region].view);
    map.setMaxBounds(L.latLngBounds([[-85, -180], [85, 180]]));
    map.setMinZoom(0);
    map.setMaxZoom(18);
    map.fitBounds(b, { animate: false });
    const z = map.getZoom();
    map.setMinZoom(z);
    map.setMaxZoom(z + 3);
    map.setMaxBounds(b.pad(0.2));
  }, [ready, region]);

  // satellite EUMETSAT: tile WMS in EPSG:3857, aggiornati ogni 10 minuti
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !sat) return;
    const layer = L.tileLayer.wms(SAT_URL, {
      layers: SAT_LAYER,
      styles: "raster",
      format: "image/png",
      transparent: true,
      version: "1.1.1",
      pane: "sat",
      attribution: "© EUMETSAT",
    }).addTo(map);
    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (retry = false) => {
      const now = new Date();
      if (!retry) now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10, 0, 0);
      const params: import("leaflet").WMSParams & { time: string } = {
        layers: SAT_LAYER,
        time: now.toISOString(),
      };
      layer.setParams(params);
    };
    const retryFailedTiles = () => {
      if (retryTimer || retries >= 3) return;
      retries += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        refresh(true);
      }, retries * 1000);
    };
    layer.on("tileerror", retryFailedTiles);
    const t = setInterval(() => refresh(), 10 * 60 * 1000);
    return () => {
      clearInterval(t);
      if (retryTimer) clearTimeout(retryTimer);
      layer.off("tileerror", retryFailedTiles);
      layer.remove();
    };
  }, [ready, sat]);

  // copertura nevosa osservata: il servizio NASA seleziona l'ultima acquisizione disponibile
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !snow) return;
    const layer = L.tileLayer
      .wms(SNOW_URL, {
        layers: SNOW_LAYER,
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        tiled: true,
        opacity: 0.8,
        pane: "snow",
        attribution: "Copertura nevosa © NASA GIBS / MODIS",
      } as never)
      .addTo(map) as unknown as Removable;
    return () => {
      layer.remove();
    };
  }, [ready, snow]);

  // Radar-DPC pubblica l'ultimo campione; cambia URL per evitare tile memorizzate nella cache.
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !radar) return;
    let layer: Removable | null = null;
    const make = () => {
      layer?.remove();
      layer = L.tileLayer
        .wms(RADAR_URL, {
          layers: `radar:${radarProduct}`, format: "image/png", transparent: true, version: "1.1.1", tiled: true,
          _wr_refresh: Date.now(),
          opacity: 0.85, pane: "radar",
          attribution: "Radar-DPC © Dipartimento della Protezione Civile (CC BY-SA 4.0)",
        } as never)
        .addTo(map) as unknown as Removable;
    };
    make();
    // Il cursore cambia la previsione del vento, non le osservazioni radar.
    const t = setInterval(make, 5 * 60 * 1000);
    return () => {
      clearInterval(t);
      layer?.remove();
    };
  }, [ready, radar, radarProduct]);

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

  const selectedRun = latest?.models[model]?.run;

  useEffect(() => {
    if (!selectedRun || !model) return;
    let cancelled = false;
    fetchRun(model, selectedRun)
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
  }, [model, selectedRun]);

  const windVar = useMemo(() => {
    if (!run) return null;
    return Object.entries(run.vars).find(([, v]) => v.json_regions?.length)?.[0] ?? null;
  }, [run]);
  // per l'Italia si usa il JSON a risoluzione piu' fine, se pubblicato
  const windRegion = useMemo(() => {
    if (!run || !windVar) return "eu";
    return run.vars[windVar].json_regions?.includes(region) ? region : "eu";
  }, [run, windVar, region]);
  const steps = useMemo(() => (run && windVar ? run.vars[windVar].steps : []), [run, windVar]);
  const i = Math.min(idx, Math.max(steps.length - 1, 0));
  const step = steps[i];

  // carica il vento dello step corrente (e il successivo, in anticipo)
  useEffect(() => {
    if (!ready || !run || !windVar || step === undefined) return;
    let cancelled = false;
    const load = (s: number) => {
      const key = `${run.model}/${run.run}/${windRegion}/${s}`;
      let p = cache.current.get(key);
      if (!p) {
        p = fetchStepJson(run, windRegion, windVar, s);
        cache.current.set(key, p);
        p.catch(() => cache.current.delete(key));
      }
      return p;
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  }, [ready, run, windVar, windRegion, step, steps, i]);

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
            Previsione {run.label}, +{step ?? 0} ore {loading ? "(caricamento…)" : ""}
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
        <p className="attr">
          {run.attribution}. Il cursore anima il vento previsto; il radar mostra l’ultimo dato disponibile.
        </p>
      </>
    );
  }

  return (
    <div className="live">
      <div ref={mapEl} className="live-map" />
      <section className="live-panel top">
        <h1 className="brand">
          Weather Report <span>Mappa live</span>
        </h1>
        <Link className="navlink" href="/">← Carte dei modelli</Link>

        <div className="group" role="radiogroup" aria-label="Area">
          <p className="group-label">Area</p>
          {(Object.keys(REGIONS) as RegionId[]).map((id) => (
            <button key={id} role="radio" aria-checked={id === region} className={id === region ? "choice on" : "choice"} onClick={() => setRegion(id)}>
              {REGIONS[id].label}
            </button>
          ))}
        </div>

        {latest && (
          <div className="group" role="radiogroup" aria-label="Modello">
            <p className="group-label">Modello del vento</p>
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

        <div className="group">
          <p className="group-label">Livelli</p>
          <label className="check">
            <input type="checkbox" checked={sat} onChange={(e) => setSat(e.target.checked)} />
            Satellite (EUMETSAT)
          </label>
          <label className="check">
            <input type="checkbox" checked={snow} onChange={(e) => setSnow(e.target.checked)} />
            Neve osservata (NASA MODIS)
          </label>
          <label className="check">
            <input type="checkbox" checked={radar} onChange={(e) => setRadar(e.target.checked)} />
            Radar (Italia)
          </label>
          {radar && (
            <select className="sub" value={radarProduct} onChange={(e) => setRadarProduct(e.target.value)} aria-label="Prodotto radar">
              {RADAR_PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          )}
        </div>
      </section>
      <section className="live-panel bottom">{bottom}</section>
    </div>
  );
}
