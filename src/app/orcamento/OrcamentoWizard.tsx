"use client";

import { useReducer, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { QuoteFormData, SelectedAddon } from "./types";
import { calculatePrice } from "./pricing";
import Step1Category from "./steps/Step1Category";
import Step2EventType from "./steps/Step2EventType";
import Step3Details from "./steps/Step3Details";
import Step4Package from "./steps/Step4Package";
import Step5Addons from "./steps/Step5Addons";
import Step6Preferences from "./steps/Step6Preferences";
import Step7Contact from "./steps/Step7Contact";
import PriceSidebar from "./PriceSidebar";

export type Action =
  | { type: "SET"; field: keyof QuoteFormData; value: unknown }
  | { type: "ADD_ADDON"; addon: SelectedAddon }
  | { type: "REMOVE_ADDON"; id: string }
  | { type: "UPDATE_ADDON"; id: string; updates: Partial<SelectedAddon> };

const initialForm: QuoteFormData = {
  category: null,
  eventType: null,
  eventName: "",
  date: "",
  endDate: "",
  location: "",
  locationType: "lisboa",
  guests: 0,
  duration: 4,
  isMultiDay: false,
  packageTier: "completo",
  addons: [],
  budgetRange: null,
  urgency: "standard",
  notes: "",
  referralSource: "",
  name: "",
  email: "",
  phone: "",
  company: "",
  nif: "",
  acceptTerms: false,
  acceptMarketing: false,
};

function reducer(state: QuoteFormData, action: Action): QuoteFormData {
  switch (action.type) {
    case "SET":
      return { ...state, [action.field]: action.value };
    case "ADD_ADDON":
      return { ...state, addons: [...state.addons, action.addon] };
    case "REMOVE_ADDON":
      return { ...state, addons: state.addons.filter((a) => a.id !== action.id) };
    case "UPDATE_ADDON":
      return {
        ...state,
        addons: state.addons.map((a) => (a.id === action.id ? { ...a, ...action.updates } : a)),
      };
    default:
      return state;
  }
}

const STEPS = [
  { label: "Categoria", short: "1" },
  { label: "Tipo", short: "2" },
  { label: "Detalhes", short: "3" },
  { label: "Pacote", short: "4" },
  { label: "Extras", short: "5" },
  { label: "Preferências", short: "6" },
  { label: "Contacto", short: "7" },
];

function validateStep(step: number, form: QuoteFormData): string | null {
  if (step === 1 && !form.category) return "Por favor seleccione uma categoria de evento.";
  if (step === 2 && !form.eventType) return "Por favor seleccione o tipo de evento.";
  if (step === 3) {
    if (!form.date) return "Por favor indique a data do evento.";
    if (!form.guests || form.guests < 1) return "Por favor indique o número de convidados.";
  }
  if (step === 7) {
    if (!form.name.trim()) return "Por favor indique o seu nome.";
    if (!form.email.trim() || !form.email.includes("@"))
      return "Por favor indique um email válido.";
    if (!form.phone.trim()) return "Por favor indique o seu telefone.";
    if (!form.acceptTerms) return "Por favor aceite os Termos e Condições para continuar.";
  }
  return null;
}

export default function OrcamentoWizard() {
  const [form, dispatch] = useReducer(reducer, initialForm);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [animKey, setAnimKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const breakdown = calculatePrice(form);
  const totalSteps = STEPS.length;

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, breakdown }),
      });
      const data = await res.json();
      if (data.id) {
        // Hand the quote off to the confirmation page so it renders the full
        // summary even when the host can't persist it server-side (serverless).
        try {
          sessionStorage.setItem(
            `liquen-quote-${data.id}`,
            JSON.stringify({
              ...form,
              id: data.id,
              submittedAt: new Date().toISOString(),
              status: "pendente",
              priceBreakdown: breakdown,
            }),
          );
        } catch {
          /* sessionStorage unavailable — confirmation falls back gracefully */
        }
        router.push(`/orcamento/confirmacao/${data.id}`);
      } else {
        setError("Erro ao enviar o pedido. Por favor tente novamente.");
        setSubmitting(false);
      }
    } catch {
      setError("Erro de ligação. Por favor verifique a sua internet e tente novamente.");
      setSubmitting(false);
    }
  }, [form, breakdown, router]);

  const goNext = useCallback(() => {
    const err = validateStep(step, form);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (step === totalSteps) {
      handleSubmit();
      return;
    }
    setDirection("forward");
    setAnimKey((k) => k + 1);
    setStep((s) => s + 1);
  }, [step, form, totalSteps, handleSubmit]);

  const goBack = useCallback(() => {
    if (step === 1) return;
    setError(null);
    setDirection("back");
    setAnimKey((k) => k + 1);
    setStep((s) => s - 1);
  }, [step]);

  // When category changes, reset event type
  useEffect(() => {
    dispatch({ type: "SET", field: "eventType", value: null });
  }, [form.category]);

  const animClass = direction === "forward" ? "animate-step-forward" : "animate-step-back";

  function renderStep() {
    switch (step) {
      case 1:
        return <Step1Category form={form} dispatch={dispatch} />;
      case 2:
        return <Step2EventType form={form} dispatch={dispatch} />;
      case 3:
        return <Step3Details form={form} dispatch={dispatch} />;
      case 4:
        return <Step4Package form={form} dispatch={dispatch} />;
      case 5:
        return <Step5Addons form={form} dispatch={dispatch} />;
      case 6:
        return <Step6Preferences form={form} dispatch={dispatch} />;
      case 7:
        return <Step7Contact form={form} dispatch={dispatch} />;
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Progress */}
      <div className="sticky top-[68px] z-30 border-b border-foreground/6">
        {/* Thin fill line */}
        <div className="h-[2px] bg-foreground/6">
          <div
            className="h-full bg-moss transition-all duration-600 ease-out"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
        {/* Step info row */}
        <div className="max-w-7xl mx-auto px-6 lg:px-16 bg-surface/96 backdrop-blur-sm">
          <div className="flex items-center justify-between py-3">
            {/* Dot indicators */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-px rounded-full transition-all duration-500 ${
                    i < step - 1
                      ? "w-5 bg-moss"
                      : i === step - 1
                        ? "w-5 bg-moss/50"
                        : "w-3 bg-foreground/12"
                  }`}
                />
              ))}
            </div>
            {/* Current step label */}
            <span className="text-foreground/22 text-[9px] tracking-[0.45em] uppercase">
              {STEPS[step - 1]?.label} — {step} / {totalSteps}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 lg:px-16 py-12 pb-32 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-12 lg:gap-16 items-start">
          {/* Step content */}
          <div className="min-h-[60vh]">
            <div key={animKey} className={animClass}>
              {renderStep()}
            </div>

            {/* Error message */}
            {error && (
              <div className="mt-6 p-4 border border-moss/30 bg-moss/8 rounded-sm">
                <p className="text-moss/80 text-sm">{error}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-12 pt-8 border-t border-foreground/8">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1}
                className={`flex items-center gap-2 px-6 py-3 rounded-sm text-[11px] tracking-[0.2em] uppercase border transition-all duration-300 ${
                  step === 1
                    ? "border-foreground/8 text-foreground/18 cursor-not-allowed"
                    : "border-foreground/20 text-foreground/45 hover:border-foreground/40 hover:text-foreground/70"
                }`}
              >
                ← Anterior
              </button>

              <div className="flex items-center gap-4">
                {step < totalSteps && (
                  <span className="text-foreground/22 text-xs hidden sm:block">
                    {totalSteps - step} passo{totalSteps - step !== 1 ? "s" : ""} restante
                    {totalSteps - step !== 1 ? "s" : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                  className={`flex items-center gap-3 px-8 py-3.5 rounded-sm text-[11px] tracking-[0.2em] uppercase transition-all duration-300 shadow-lg shadow-moss/15 ${
                    submitting
                      ? "bg-moss/50 text-cream/50 cursor-not-allowed"
                      : "bg-moss text-cream hover:bg-moss-dark hover:gap-5"
                  }`}
                >
                  {submitting ? "A enviar…" : step === totalSteps ? "Enviar Pedido →" : "Avançar →"}
                </button>
              </div>
            </div>
          </div>

          {/* Summary sidebar */}
          <PriceSidebar form={form} currentStep={step} />
        </div>
      </div>
    </div>
  );
}
