import { cn } from "@/lib/utils";
import { activationLabel } from "@/lib/onboarding-steps";

/**
 * "Criar conta" é do signup e só existe aqui; os outros dois vêm da fonte única
 * de ativação, para o lojista não ler um nome aqui e outro no painel.
 *
 * O terceiro passo dizia "Primeiro disparo" — e disparo não ativa ninguém. O que
 * enche grupo é a campanha e o link dela, que é o que a ativação de fato mede.
 */
const STEPS = [
  { label: "Criar conta" },
  { label: activationLabel("connect") },
  { label: activationLabel("campaign") },
];

/**
 * Indicador visual de progresso do fluxo signup → onboarding.
 * `current` é 1-indexed (1 = signup, 2 = conectar, 3 = campanha).
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
              i < current ? "bg-cobalt-500" : "bg-volt-800",
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
              i < current ? "text-cobalt-500" : "text-canvas-100/40",
            )}
          >
            {step.label}
          </span>
        ))}
      </div>
    </div>
  );
}
