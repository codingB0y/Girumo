import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Criar conta" },
  { label: "Conectar WhatsApp" },
  { label: "Primeiro disparo" },
];

/**
 * Indicador visual de progresso do fluxo signup → onboarding.
 * `current` é 1-indexed (1 = signup, 2 = conectar, 3 = disparo).
 */
export function SignupProgress({ current }: { current: number }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5">
        {STEPS.map((step, i) => (
          <div
            key={step.label}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              i < current ? "bg-iris" : "bg-white/[0.08]",
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        {STEPS.map((step, i) => (
          <span
            key={step.label}
            className={cn(
              "text-[11px] font-medium",
              i < current ? "text-iris-claro" : "text-bruma/30",
            )}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}
