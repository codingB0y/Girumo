import { ArrowRight, Check, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND, getPublicSiteUrl } from "@/lib/brand";

const PUBLIC_HOST = new URL(getPublicSiteUrl()).host;

const STEPS = [
  {
    product: BRAND.products[2],
    title: "Crie a campanha",
    body: `Dê um nome e escolha os grupos de destino. A ${BRAND.name} organiza um link rastreado e uma página de captação com a sua marca, sem configuração técnica.`,
  },
  {
    product: BRAND.products[0],
    title: "Espalhe o link",
    body: "Cole no anúncio, na bio ou no story. Cada clique carrega a origem para mostrar de onde veio cada pessoa e cada venda.",
  },
  {
    product: BRAND.products[1],
    title: "Mantenha a entrada aberta",
    body: "Quem clica entra no grupo disponível. Quando ele lota, o próximo assume o mesmo link, nome, foto e regras.",
  },
] as const;

export function Mechanism() {
  return (
    <div data-mech className="relative mx-auto grid max-w-7xl gap-10 px-4 md:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20">
      <div>
        {STEPS.map((step, index) => (
          <div key={step.title} className="lp-step relative py-14 pl-7 sm:py-20 lg:min-h-[68vh] lg:py-24">
            <span className="lp-step-bar absolute bottom-14 left-0 top-14 w-px bg-cobalt-500 sm:bottom-20 sm:top-20 lg:bottom-24 lg:top-24" />
            <p className="font-data text-xs text-cobalt-500">{step.product}</p>
            <h3 className="mt-4 font-tech text-3xl font-bold tracking-tight text-paper-0 sm:text-4xl">{step.title}</h3>
            <p className="mt-5 max-w-md text-base leading-relaxed text-canvas-100/68 sm:text-lg">{step.body}</p>
            <div className="mt-8 lg:hidden">
              <ProcessVisual index={index} host={PUBLIC_HOST} embedded />
            </div>
          </div>
        ))}
      </div>

      <div className="relative hidden lg:block">
        <div className="sticky top-0 flex min-h-[100dvh] items-center">
          <div className="relative h-[30rem] w-full">
            {STEPS.map((step, index) => (
              <ProcessVisual key={step.title} index={index} host={PUBLIC_HOST} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcessVisual({
  index,
  host,
  embedded,
}: {
  index: number;
  host: string;
  embedded?: boolean;
}) {
  return (
    <div className={cn(embedded ? "is-active relative" : "lp-visual", "flex items-center justify-center")}>
      {index === 0 && <CampaignProcess />}
      {index === 1 && <LinkProcess host={host} />}
      {index === 2 && <GroupProcess />}
    </div>
  );
}

function CampaignProcess() {
  return (
    <div className="w-full max-w-xl bg-paper-0 p-7 text-volt-950 sm:p-9">
      <p className="font-data text-xs uppercase tracking-[0.14em] text-slate-600">campanha organizada</p>
      <p className="mt-5 font-tech text-4xl font-bold leading-none tracking-tight sm:text-5xl">Uma definição. Três saídas.</p>
      <dl className="mt-9 grid gap-px bg-line-200 sm:grid-cols-3">
        {[
          ["Você define", "Oferta e grupos"],
          [BRAND.name, "Página e link"],
          ["Operação", "Pronta para publicar"],
        ].map(([term, description]) => (
          <div key={term} className="bg-canvas-100 p-4">
            <dt className="font-data text-[10px] uppercase tracking-[0.12em] text-slate-600">{term}</dt>
            <dd className="mt-2 text-sm font-semibold">{description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 flex items-center gap-2 bg-acid-500 px-4 py-3 text-sm font-semibold text-volt-950">
        <Check className="h-4 w-4" /> Link rastreado pronto para publicar
      </p>
    </div>
  );
}

function LinkProcess({ host }: { host: string }) {
  return (
    <div className="w-full max-w-xl">
      <div className="bg-acid-500 p-6 text-volt-950">
        <p className="font-data text-[10px] uppercase tracking-[0.12em]">endereço configurado</p>
        <p className="mt-3 flex items-center gap-2 font-data text-sm font-semibold sm:text-base">
          <Link2 className="h-4 w-4 shrink-0" /> {host}/c/ofertas
        </p>
      </div>
      <div className="grid gap-px bg-volt-800 sm:grid-cols-3">
        {[
          ["Anúncio", "origem registrada"],
          ["Bio", "origem registrada"],
          ["Story", "origem registrada"],
        ].map(([channel, result]) => (
          <div key={channel} className="bg-paper-0 p-5 text-volt-950">
            <p className="font-tech text-xl font-bold">{channel}</p>
            <p className="mt-6 font-data text-[10px] uppercase tracking-[0.12em] text-cobalt-700">{result}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupProcess() {
  return (
    <div className="w-full max-w-xl bg-canvas-100 p-7 text-volt-950 sm:p-9">
      <p className="font-data text-xs uppercase tracking-[0.14em] text-slate-600">continuidade do link</p>
      <div className="mt-7 grid items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div className="border border-line-200 bg-paper-0 p-5">
          <p className="font-data text-[10px] uppercase tracking-[0.12em] text-slate-600">grupo atual</p>
          <p className="mt-4 font-tech text-2xl font-bold">Lotou</p>
        </div>
        <ArrowRight className="mx-auto h-5 w-5 self-center text-cobalt-500 sm:rotate-0 rotate-90" aria-hidden />
        <div className="bg-volt-950 p-5 text-paper-0">
          <p className="font-data text-[10px] uppercase tracking-[0.12em] text-canvas-100/60">próximo grupo</p>
          <p className="mt-4 font-tech text-2xl font-bold">Assume o link</p>
        </div>
      </div>
      <p className="mt-6 bg-acid-500 px-4 py-3 text-sm font-semibold text-volt-950">
        Mesmo nome, foto e regras. Nenhum anúncio precisa mudar.
      </p>
    </div>
  );
}
