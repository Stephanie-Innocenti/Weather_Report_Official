"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Language = "ita" | "en" | "deu" | "fr" | "esp";
type MessageKey = string;
type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  dateLocale: string;
  t: (key: MessageKey) => string;
  localizedLabel: (key: string, fallback: string) => string;
  countryName: (id: string, fallback: string) => string;
};

const STORAGE_KEY = "weather-report-language";
const languageOptions: { value: Language; htmlLang: string; name: string }[] = [
  { value: "ita", htmlLang: "it-IT", name: "Italiano" },
  { value: "en", htmlLang: "en-GB", name: "English" },
  { value: "deu", htmlLang: "de-DE", name: "Deutsch" },
  { value: "fr", htmlLang: "fr-FR", name: "Français" },
  { value: "esp", htmlLang: "es-ES", name: "Español" },
];

const messages: Record<Language, Record<string, string>> = {
  ita: {
    "language.label": "Lingua",
    "theme.system": "Sistema",
    "theme.light": "Chiaro",
    "theme.dark": "Scuro",
    "theme.current": "Tema attuale: {mode}. Scegli modalità tema",
    "theme.title": "Tema: {mode}",
    "theme.aria": "Modalità tema",
    "home.kicker": "Previsioni · modelli numerici",
    "home.tagline": "Leggi il tempo che arriva, un run alla volta.",
    "home.openLive": "Apri la mappa live",
    "home.forecastSelection": "Selezione previsione",
    "home.model": "Modello",
    "home.parameter": "Parametro",
    "home.area": "Area",
    "home.otherCountries": "Altri Paesi europei",
    "home.mapsPending": "Mappe non ancora pubblicate.",
    "home.sidebarNote": "Nuove mappe e parametri si attivano quando il run è pubblicato.",
    "home.noRun": "Nessun run pubblicato: lancia la pipeline e riprova.",
    "home.controls": "Controlli animazione",
    "home.previousStep": "Step precedente",
    "home.nextStep": "Step successivo",
    "home.play": "Riproduci",
    "home.pause": "Pausa",
    "home.forecastTime": "Ora di previsione",
    "home.animationSpeed": "Velocità animazione",
    "home.slow": "Lenta",
    "home.normal": "Normale",
    "home.fast": "Veloce",
    "home.animationHelp": "Usa le frecce o la barra spaziatrice per controllare l’animazione.",
    "home.forecastAt": "previsione a +{step} ore",
    "home.imageAlt": "{variable}, {area}, +{step} ore",
    "common.dataUnavailable": "Dati non disponibili.",
    "common.loading": "Caricamento dei dati…",
    "region.eu": "Europa",
    "region.it": "Italia",
    "var.t2m": "Temperatura a 2 m",
    "var.mslp": "Pressione al livello del mare",
    "var.tp-acc": "Precipitazione cumulata dal run",
    "var.z500": "Geopotenziale a 500 hPa",
    "var.z850": "Geopotenziale a 850 hPa",
    "var.t850": "Temperatura a 850 hPa",
    "var.t500": "Temperatura a 500 hPa",
    "var.snow-depth": "Neve accumulata al suolo",
    "var.wind10m": "Vento a 10 m",
    "common.awaitingData": "{label} · in attesa dei dati",
    "map.title": "Mappa live",
    "map.back": "← Carte dei modelli",
    "map.area": "Area",
    "map.windModel": "Modello del vento",
    "map.levels": "Livelli",
    "map.satellite": "Satellite (EUMETSAT)",
    "map.snow": "Neve osservata (NASA MODIS)",
    "map.radar": "Radar ({area})",
    "map.radarProduct": "Prodotto radar",
    "map.radarReflectivity": "Riflettività (VMI)",
    "map.rainIntensity": "Intensità di pioggia (SRI)",
    "map.radarAttribution": "Dati radar © RainViewer",
    "map.loading": "(caricamento…)",
    "map.noWind": "Questo modello non ha ancora dati di vento per la mappa live: lancia la pipeline e riprova.",
    "map.forecast": "Previsione {model}, +{step} ore {loading}",
    "map.wind": "Vento",
    "map.noData": "Nessun dato",
    "map.windAttribution": "Il cursore anima il vento previsto; il radar mostra l’ultimo dato disponibile.",
    "map.unavailableRadar": "Impossibile caricare il radar europeo",
    "map.invalidRadar": "Risposta non valida dal servizio radar europeo",
    "map.radarHttpError": "Radar Europa non disponibile (HTTP {status})",
    "map.noRadarFrames": "Nessuna immagine radar europea disponibile",
    "map.invalidRadarHost": "Host non valido per il servizio radar europeo",
    "country.xk": "Kosovo",
  },
  en: {
    "language.label": "Language",
    "theme.system": "System",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.current": "Current theme: {mode}. Choose theme mode",
    "theme.title": "Theme: {mode}",
    "theme.aria": "Theme mode",
    "home.kicker": "Forecasts · numerical models",
    "home.tagline": "See what the weather brings, one run at a time.",
    "home.openLive": "Open live map",
    "home.forecastSelection": "Forecast selection",
    "home.model": "Model",
    "home.parameter": "Parameter",
    "home.area": "Area",
    "home.otherCountries": "Other European countries",
    "home.mapsPending": "Maps not published yet.",
    "home.sidebarNote": "New maps and parameters become available when a run is published.",
    "home.noRun": "No run published: launch the pipeline and try again.",
    "home.controls": "Animation controls",
    "home.previousStep": "Previous step",
    "home.nextStep": "Next step",
    "home.play": "Play",
    "home.pause": "Pause",
    "home.forecastTime": "Forecast time",
    "home.animationSpeed": "Animation speed",
    "home.slow": "Slow",
    "home.normal": "Normal",
    "home.fast": "Fast",
    "home.animationHelp": "Use the arrow keys or space bar to control the animation.",
    "home.forecastAt": "forecast at +{step} hours",
    "home.imageAlt": "{variable}, {area}, +{step} hours",
    "common.dataUnavailable": "Data unavailable.",
    "common.loading": "Loading data…",
    "region.eu": "Europe",
    "region.it": "Italy",
    "var.t2m": "Temperature at 2 m",
    "var.mslp": "Mean sea-level pressure",
    "var.tp-acc": "Accumulated precipitation since run",
    "var.z500": "Geopotential at 500 hPa",
    "var.z850": "Geopotential at 850 hPa",
    "var.t850": "Temperature at 850 hPa",
    "var.t500": "Temperature at 500 hPa",
    "var.snow-depth": "Snow depth",
    "var.wind10m": "Wind at 10 m",
    "common.awaitingData": "{label} · awaiting data",
    "map.title": "Live map",
    "map.back": "← Model maps",
    "map.area": "Area",
    "map.windModel": "Wind model",
    "map.levels": "Layers",
    "map.satellite": "Satellite (EUMETSAT)",
    "map.snow": "Observed snow (NASA MODIS)",
    "map.radar": "Radar ({area})",
    "map.radarProduct": "Radar product",
    "map.radarReflectivity": "Reflectivity (VMI)",
    "map.rainIntensity": "Rain intensity (SRI)",
    "map.radarAttribution": "Radar data © RainViewer",
    "map.loading": "(loading…)",
    "map.noWind": "This model has no wind data for the live map yet. Run the pipeline and try again.",
    "map.forecast": "{model} forecast, +{step} hours {loading}",
    "map.wind": "Wind",
    "map.noData": "No data",
    "map.windAttribution": "The slider animates forecast wind; radar shows the latest available observation.",
    "map.unavailableRadar": "Unable to load European radar",
    "map.invalidRadar": "Invalid response from the European radar service",
    "map.radarHttpError": "European radar unavailable (HTTP {status})",
    "map.noRadarFrames": "No European radar image available",
    "map.invalidRadarHost": "Invalid host for the European radar service",
    "country.xk": "Kosovo",
  },
  deu: {
    "language.label": "Sprache",
    "theme.system": "System",
    "theme.light": "Hell",
    "theme.dark": "Dunkel",
    "theme.current": "Aktuelles Design: {mode}. Designmodus auswählen",
    "theme.title": "Design: {mode}",
    "theme.aria": "Designmodus",
    "home.kicker": "Vorhersagen · numerische Modelle",
    "home.tagline": "Das kommende Wetter sehen, Lauf für Lauf.",
    "home.openLive": "Live-Karte öffnen",
    "home.forecastSelection": "Vorhersage auswählen",
    "home.model": "Modell",
    "home.parameter": "Parameter",
    "home.area": "Gebiet",
    "home.otherCountries": "Weitere europäische Länder",
    "home.mapsPending": "Karten noch nicht veröffentlicht.",
    "home.sidebarNote": "Neue Karten und Parameter sind verfügbar, sobald ein Lauf veröffentlicht ist.",
    "home.noRun": "Kein Lauf veröffentlicht: Pipeline starten und erneut versuchen.",
    "home.controls": "Animationssteuerung",
    "home.previousStep": "Vorheriger Schritt",
    "home.nextStep": "Nächster Schritt",
    "home.play": "Abspielen",
    "home.pause": "Pause",
    "home.forecastTime": "Vorhersagezeit",
    "home.animationSpeed": "Animationsgeschwindigkeit",
    "home.slow": "Langsam",
    "home.normal": "Normal",
    "home.fast": "Schnell",
    "home.animationHelp": "Steuere die Animation mit den Pfeiltasten oder der Leertaste.",
    "home.forecastAt": "Vorhersage in +{step} Stunden",
    "home.imageAlt": "{variable}, {area}, +{step} Stunden",
    "common.dataUnavailable": "Daten nicht verfügbar.",
    "common.loading": "Daten werden geladen…",
    "region.eu": "Europa",
    "region.it": "Italien",
    "var.t2m": "Temperatur in 2 m",
    "var.mslp": "Luftdruck auf Meereshöhe",
    "var.tp-acc": "Niederschlagssumme seit dem Lauf",
    "var.z500": "Geopotential in 500 hPa",
    "var.z850": "Geopotential in 850 hPa",
    "var.t850": "Temperatur in 850 hPa",
    "var.t500": "Temperatur in 500 hPa",
    "var.snow-depth": "Schneehöhe am Boden",
    "var.wind10m": "Wind in 10 m",
    "common.awaitingData": "{label} · Daten ausstehend",
    "map.title": "Live-Karte",
    "map.back": "← Modellkarten",
    "map.area": "Gebiet",
    "map.windModel": "Windmodell",
    "map.levels": "Ebenen",
    "map.satellite": "Satellit (EUMETSAT)",
    "map.snow": "Beobachteter Schnee (NASA MODIS)",
    "map.radar": "Radar ({area})",
    "map.radarProduct": "Radarprodukt",
    "map.radarReflectivity": "Reflektivität (VMI)",
    "map.rainIntensity": "Regenintensität (SRI)",
    "map.radarAttribution": "Radardaten © RainViewer",
    "map.loading": "(wird geladen…)",
    "map.noWind": "Dieses Modell enthält noch keine Winddaten für die Live-Karte. Pipeline starten und erneut versuchen.",
    "map.forecast": "{model}-Vorhersage, +{step} Stunden {loading}",
    "map.wind": "Wind",
    "map.noData": "Keine Daten",
    "map.windAttribution": "Der Regler animiert den vorhergesagten Wind; das Radar zeigt die letzte verfügbare Messung.",
    "map.unavailableRadar": "Europäisches Radar kann nicht geladen werden",
    "map.invalidRadar": "Ungültige Antwort des europäischen Radardienstes",
    "map.radarHttpError": "Europäisches Radar nicht verfügbar (HTTP {status})",
    "map.noRadarFrames": "Kein europäisches Radarbild verfügbar",
    "map.invalidRadarHost": "Ungültiger Host für den europäischen Radardienst",
    "country.xk": "Kosovo",
  },
  fr: {
    "language.label": "Langue",
    "theme.system": "Système",
    "theme.light": "Clair",
    "theme.dark": "Sombre",
    "theme.current": "Thème actuel : {mode}. Choisir le mode de thème",
    "theme.title": "Thème : {mode}",
    "theme.aria": "Mode de thème",
    "home.kicker": "Prévisions · modèles numériques",
    "home.tagline": "Découvrez le temps à venir, run après run.",
    "home.openLive": "Ouvrir la carte en direct",
    "home.forecastSelection": "Sélection des prévisions",
    "home.model": "Modèle",
    "home.parameter": "Paramètre",
    "home.area": "Zone",
    "home.otherCountries": "Autres pays européens",
    "home.mapsPending": "Cartes pas encore publiées.",
    "home.sidebarNote": "Les nouvelles cartes et paramètres sont disponibles à la publication d’un run.",
    "home.noRun": "Aucun run publié : lancez le pipeline et réessayez.",
    "home.controls": "Commandes de l’animation",
    "home.previousStep": "Étape précédente",
    "home.nextStep": "Étape suivante",
    "home.play": "Lire",
    "home.pause": "Pause",
    "home.forecastTime": "Heure de prévision",
    "home.animationSpeed": "Vitesse de l’animation",
    "home.slow": "Lente",
    "home.normal": "Normale",
    "home.fast": "Rapide",
    "home.animationHelp": "Utilisez les flèches ou la barre d’espace pour contrôler l’animation.",
    "home.forecastAt": "prévision à +{step} heures",
    "home.imageAlt": "{variable}, {area}, +{step} heures",
    "common.dataUnavailable": "Données indisponibles.",
    "common.loading": "Chargement des données…",
    "region.eu": "Europe",
    "region.it": "Italie",
    "var.t2m": "Température à 2 m",
    "var.mslp": "Pression au niveau de la mer",
    "var.tp-acc": "Précipitations cumulées depuis le run",
    "var.z500": "Géopotentiel à 500 hPa",
    "var.z850": "Géopotentiel à 850 hPa",
    "var.t850": "Température à 850 hPa",
    "var.t500": "Température à 500 hPa",
    "var.snow-depth": "Hauteur de neige au sol",
    "var.wind10m": "Vent à 10 m",
    "common.awaitingData": "{label} · données à venir",
    "map.title": "Carte en direct",
    "map.back": "← Cartes des modèles",
    "map.area": "Zone",
    "map.windModel": "Modèle de vent",
    "map.levels": "Couches",
    "map.satellite": "Satellite (EUMETSAT)",
    "map.snow": "Neige observée (NASA MODIS)",
    "map.radar": "Radar ({area})",
    "map.radarProduct": "Produit radar",
    "map.radarReflectivity": "Réflectivité (VMI)",
    "map.rainIntensity": "Intensité de pluie (SRI)",
    "map.radarAttribution": "Données radar © RainViewer",
    "map.loading": "(chargement…)",
    "map.noWind": "Ce modèle n’a pas encore de données de vent pour la carte en direct. Lancez le pipeline et réessayez.",
    "map.forecast": "Prévision {model}, +{step} heures {loading}",
    "map.wind": "Vent",
    "map.noData": "Aucune donnée",
    "map.windAttribution": "Le curseur anime le vent prévu ; le radar affiche la dernière observation disponible.",
    "map.unavailableRadar": "Impossible de charger le radar européen",
    "map.invalidRadar": "Réponse invalide du service radar européen",
    "map.radarHttpError": "Radar européen indisponible (HTTP {status})",
    "map.noRadarFrames": "Aucune image radar européenne disponible",
    "map.invalidRadarHost": "Hôte invalide pour le service radar européen",
    "country.xk": "Kosovo",
  },
  esp: {
    "language.label": "Idioma",
    "theme.system": "Sistema",
    "theme.light": "Claro",
    "theme.dark": "Oscuro",
    "theme.current": "Tema actual: {mode}. Elegir modo de tema",
    "theme.title": "Tema: {mode}",
    "theme.aria": "Modo de tema",
    "home.kicker": "Pronósticos · modelos numéricos",
    "home.tagline": "Descubre el tiempo que viene, ejecución a ejecución.",
    "home.openLive": "Abrir mapa en directo",
    "home.forecastSelection": "Selección del pronóstico",
    "home.model": "Modelo",
    "home.parameter": "Parámetro",
    "home.area": "Área",
    "home.otherCountries": "Otros países europeos",
    "home.mapsPending": "Mapas aún no publicados.",
    "home.sidebarNote": "Los nuevos mapas y parámetros estarán disponibles cuando se publique una ejecución.",
    "home.noRun": "No hay ninguna ejecución publicada: inicia la canalización y vuelve a intentarlo.",
    "home.controls": "Controles de animación",
    "home.previousStep": "Paso anterior",
    "home.nextStep": "Paso siguiente",
    "home.play": "Reproducir",
    "home.pause": "Pausar",
    "home.forecastTime": "Hora del pronóstico",
    "home.animationSpeed": "Velocidad de animación",
    "home.slow": "Lenta",
    "home.normal": "Normal",
    "home.fast": "Rápida",
    "home.animationHelp": "Usa las flechas o la barra espaciadora para controlar la animación.",
    "home.forecastAt": "pronóstico a +{step} horas",
    "home.imageAlt": "{variable}, {area}, +{step} horas",
    "common.dataUnavailable": "Datos no disponibles.",
    "common.loading": "Cargando datos…",
    "region.eu": "Europa",
    "region.it": "Italia",
    "var.t2m": "Temperatura a 2 m",
    "var.mslp": "Presión a nivel del mar",
    "var.tp-acc": "Precipitación acumulada desde la ejecución",
    "var.z500": "Geopotencial a 500 hPa",
    "var.z850": "Geopotencial a 850 hPa",
    "var.t850": "Temperatura a 850 hPa",
    "var.t500": "Temperatura a 500 hPa",
    "var.snow-depth": "Espesor de nieve en el suelo",
    "var.wind10m": "Viento a 10 m",
    "common.awaitingData": "{label} · datos pendientes",
    "map.title": "Mapa en directo",
    "map.back": "← Mapas de modelos",
    "map.area": "Área",
    "map.windModel": "Modelo de viento",
    "map.levels": "Capas",
    "map.satellite": "Satélite (EUMETSAT)",
    "map.snow": "Nieve observada (NASA MODIS)",
    "map.radar": "Radar ({area})",
    "map.radarProduct": "Producto de radar",
    "map.radarReflectivity": "Reflectividad (VMI)",
    "map.rainIntensity": "Intensidad de lluvia (SRI)",
    "map.radarAttribution": "Datos de radar © RainViewer",
    "map.loading": "(cargando…)",
    "map.noWind": "Este modelo aún no tiene datos de viento para el mapa en directo. Inicia la canalización y vuelve a intentarlo.",
    "map.forecast": "Pronóstico de {model}, +{step} horas {loading}",
    "map.wind": "Viento",
    "map.noData": "Sin datos",
    "map.windAttribution": "El control anima el viento previsto; el radar muestra la observación más reciente disponible.",
    "map.unavailableRadar": "No se puede cargar el radar europeo",
    "map.invalidRadar": "Respuesta no válida del servicio de radar europeo",
    "map.radarHttpError": "Radar europeo no disponible (HTTP {status})",
    "map.noRadarFrames": "No hay imágenes de radar europeas disponibles",
    "map.invalidRadarHost": "Host no válido para el servicio de radar europeo",
    "country.xk": "Kosovo",
  },
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const languageListeners = new Set<() => void>();
let sessionLanguage: Language | null = null;

function isLanguage(value: string | null): value is Language {
  return languageOptions.some((option) => option.value === value);
}

function getLanguage(): Language {
  if (sessionLanguage) return sessionLanguage;
  if (typeof window === "undefined") return "ita";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : "ita";
  } catch {
    return "ita";
  }
}

function subscribeToLanguage(onChange: () => void) {
  languageListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sessionLanguage = null;
    languageListeners.forEach((listener) => listener());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    languageListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function saveLanguage(next: Language) {
  sessionLanguage = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // La scelta resta attiva per la sessione anche se il browser blocca lo storage.
  }
  languageListeners.forEach((listener) => listener());
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore<Language>(
    subscribeToLanguage,
    getLanguage,
    (): Language => "ita",
  );

  useEffect(() => {
    const option = languageOptions.find((item) => item.value === language);
    document.documentElement.lang = option?.htmlLang.split("-")[0] ?? "it";
  }, [language]);

  const setLanguage = useCallback((next: Language) => saveLanguage(next), []);

  const value = useMemo<LanguageContextValue>(() => {
    const t = (key: MessageKey) => messages[language][key] ?? messages.ita[key] ?? key;
    const dateLocale = languageOptions.find((option) => option.value === language)?.htmlLang ?? "it-IT";
    const localizedLabel = (key: string, fallback: string) => messages[language][key] ?? fallback;
    const countryName = (id: string, fallback: string) => {
      if (id === "xk") return t("country.xk");
      try {
        return new Intl.DisplayNames([dateLocale], { type: "region" }).of(id.toUpperCase()) ?? fallback;
      } catch {
        return fallback;
      }
    };
    return { language, setLanguage, dateLocale, t, localizedLabel, countryName };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage deve essere usato dentro LanguageProvider");
  return context;
}

export default function LanguageControl({ variant = "banner" }: { variant?: "banner" | "panel" }) {
  const { language, setLanguage, t } = useLanguage();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  return (
    <details
      className={`language-picker${variant === "panel" ? " panel-language-picker" : ""}`}
      ref={detailsRef}
    >
      <summary className="language-toggle" aria-label={t("language.label")} title={t("language.label")}>
        <span>{language}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m3.5 6 4.5 4 4.5-4" />
        </svg>
      </summary>
      <div className="language-menu" role="group" aria-label={t("language.label")}>
        {languageOptions.map(({ value, name }) => (
          <button
            key={value}
            type="button"
            className="language-option"
            aria-pressed={language === value}
            onClick={() => {
              setLanguage(value);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            <span>{name}</span>
            <span className="language-option-code">{value}</span>
            {language === value && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </details>
  );
}
