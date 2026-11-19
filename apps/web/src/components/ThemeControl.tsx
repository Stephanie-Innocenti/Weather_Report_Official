"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLanguage } from "@/components/LanguageControl";

type ThemeMode = "system" | "light" | "dark";
type ThemeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void };

const STORAGE_KEY = "weather-report-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);
const themeListeners = new Set<() => void>();
let sessionMode: ThemeMode | null = null;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function getThemeMode(): ThemeMode {
  if (sessionMode) return sessionMode;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribeToTheme(onChange: () => void) {
  themeListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    sessionMode = null;
    themeListeners.forEach((listener) => listener());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    themeListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function saveThemeMode(mode: ThemeMode) {
  sessionMode = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // La modalità resta attiva per la sessione anche se il browser blocca lo storage.
  }
  themeListeners.forEach((listener) => listener());
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M20.2 15.3A8.8 8.8 0 0 1 8.7 3.8 8.8 8.8 0 1 0 20.2 15.3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore<ThemeMode>(
    subscribeToTheme,
    getThemeMode,
    (): ThemeMode => "system",
  );
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  const chooseMode = (nextMode: ThemeMode) => {
    document.documentElement.dataset.theme = nextMode;
    saveThemeMode(nextMode);
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode: chooseMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default function ThemeControl() {
  const context = useContext(ThemeContext);
  const { t } = useLanguage();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  if (!context) throw new Error("ThemeControl deve essere usato dentro ThemeProvider");

  const modes: { value: ThemeMode; label: string }[] = [
    { value: "system", label: t("theme.system") },
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
  ];
  const currentLabel = modes.find(({ value }) => value === context.mode)?.label ?? t("theme.system");
  const currentLabelTemplate = t("theme.current").replace("{mode}", currentLabel);
  return (
    <details className="theme-picker" ref={detailsRef}>
      <summary className="theme-toggle" aria-label={currentLabelTemplate} title={t("theme.title").replace("{mode}", currentLabel)}>
        <ThemeIcon mode={context.mode} />
      </summary>
      <div className="theme-menu" role="group" aria-label={t("theme.aria")}>
        {modes.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="theme-option"
            aria-pressed={context.mode === value}
            onClick={() => {
              context.setMode(value);
              if (detailsRef.current) detailsRef.current.open = false;
            }}
          >
            <span>{label}</span>
            {context.mode === value && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </details>
  );
}
