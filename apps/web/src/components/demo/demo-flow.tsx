"use client";

import { useState } from "react";
import { DEMO_STEP_COUNT, isLastStep, nextStep, stepAt } from "@/lib/demo/script";
import { DemoBadge } from "./demo-badge";
import { DemoCta } from "./demo-cta";
import { CampaignStep } from "./steps/campaign-step";
import { DispatchStep } from "./steps/dispatch-step";
import { GroupStep } from "./steps/group-step";
import { OrderStep } from "./steps/order-step";

/**
 * O estado inteiro do demo é este índice. Nada aqui chama API, banco ou
 * Evolution — as telas leem constantes de módulo.
 */
export function DemoFlow() {
  const [index, setIndex] = useState(0);
  const step = stepAt(index);
  const last = isLastStep(index);

  return (
    <section className="pn-root mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6 space-y-3">
        <DemoBadge />
        <p className="text-sm text-volt-950/60" data-testid="demo-progress">
          Passo {index + 1} de {DEMO_STEP_COUNT}
        </p>
        <h1 className="font-display text-2xl text-volt-950">{step.title}</h1>
        <p className="text-volt-950/70">{step.narration}</p>
      </header>

      <div data-testid={`demo-step-${step.id}`} className="rounded-2xl bg-canvas-100 p-4">
        {step.id === "campaign" ? <CampaignStep /> : null}
        {step.id === "dispatch" ? <DispatchStep /> : null}
        {step.id === "group" ? <GroupStep /> : null}
        {step.id === "order" ? <OrderStep /> : null}
      </div>

      {step.action ? (
        <button
          type="button"
          data-testid="demo-advance"
          onClick={() => setIndex(nextStep(index))}
          className="mt-6 rounded-xl bg-acid-500 px-5 py-3 font-medium text-volt-950"
        >
          {step.action}
        </button>
      ) : null}

      {last ? <DemoCta stepReached={index} /> : null}
    </section>
  );
}
