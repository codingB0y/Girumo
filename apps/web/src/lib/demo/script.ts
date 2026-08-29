/**
 * Máquina de passos do modo demonstração. Pura: sem I/O, sem `server-only`,
 * roda sob `tsx --test`.
 *
 * O estado inteiro do demo é UM índice. Tudo o mais é derivado daqui.
 */

export type DemoStepId = "campaign" | "dispatch" | "group" | "order";

export type DemoStep = {
  id: DemoStepId;
  /** Título curto do passo. */
  title: string;
  /** O que o lojista está vendo acontecer, em uma frase. */
  narration: string;
  /** Rótulo do botão que avança. `null` no último passo: ali entra o CTA. */
  action: string | null;
};

export const DEMO_STEPS: readonly DemoStep[] = [
  {
    id: "campaign",
    title: "A campanha está pronta",
    narration: "Três grupos selecionados e uma novidade para anunciar.",
    action: "Disparar campanha",
  },
  {
    id: "dispatch",
    title: "Saindo com cadência",
    narration:
      "As mensagens saem espaçadas, uma por grupo — nunca no privado de ninguém. É o que mantém o número vivo.",
    action: "Ver o grupo enchendo",
  },
  {
    id: "group",
    title: "O grupo enchendo",
    narration: "Quem clicou no convite entra, e vira contato com origem registrada.",
    action: "Ver o primeiro pedido",
  },
  {
    id: "order",
    title: "O primeiro pedido",
    narration: "A venda fecha e o pedido aparece amarrado à campanha que a gerou.",
    action: null,
  },
];

export const DEMO_STEP_COUNT = DEMO_STEPS.length;

/** Índice preso à faixa válida — nunca devolve `undefined`. */
export function stepAt(index: number): DemoStep {
  const clamped = Math.min(Math.max(index, 0), DEMO_STEP_COUNT - 1);
  return DEMO_STEPS[clamped]!;
}

/** Avança um passo, parando no último. */
export function nextStep(index: number): number {
  return Math.min(index + 1, DEMO_STEP_COUNT - 1);
}

export function isLastStep(index: number): boolean {
  return index >= DEMO_STEP_COUNT - 1;
}
