"use client";

type Props = {
  steps: number[];
  current?: number;
  onSelect: (step: number) => void;
};

export default function StepPicker({ steps, current, onSelect }: Props) {
  return (
    <div className="forecast-step-picker">
      <div className="forecast-step-list" role="group" aria-label="Scadenze previsionali">
        {steps.map((step) => (
          <button
            key={step}
            type="button"
            aria-pressed={step === current}
            aria-label={`Previsione a +${step} ore`}
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
