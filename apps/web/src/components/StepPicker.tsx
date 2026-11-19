"use client";

import { useLanguage } from "@/components/LanguageControl";

type Props = {
  steps: number[];
  current?: number;
  onSelect: (step: number) => void;
};

export default function StepPicker({ steps, current, onSelect }: Props) {
  const { t } = useLanguage();
  return (
    <div className="forecast-step-picker">
      <div className="forecast-step-list" role="group" aria-label={t("home.forecastTime")}>
        {steps.map((step) => (
          <button
            key={step}
            type="button"
            aria-pressed={step === current}
            aria-label={t("home.forecastAt").replace("{step}", String(step))}
            onClick={() => onSelect(step)}
            className={`choice forecast-step${step === current ? " on" : ""}`}
          >
            +{step}h
          </button>
        ))}
      </div>
    </div>
  );
}
