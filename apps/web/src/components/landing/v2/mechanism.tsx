import { Copy, Link2, Megaphone, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Scrollytelling do mecanismo em 3 atos:
 * campanha → link rastreado em todo lugar → grupo enche e o próximo nasce.
 * Server Component: a ativação (.is-active) é do LandingFx via [data-mech].
 * Desktop: texto rola, visual fica sticky. Mobile: visual embutido em cada ato.
 */

const STEPS = [
  {
    n: "ato 01",
    title: "Crie a campanha",
    body:
      "Dê um nome, escolha os grupos de destino e pronto: o HubFlow gera um link rastreado exclusivo. Sem configuração técnica — a IA preenche o resto.",
  },
  {
    n: "ato 02",
    title: "Espalhe o link",
    body:
      "Cole no anúncio, na bio, no story, onde quiser. Cada clique carrega a origem: você vai saber exatamente de onde veio cada pessoa — e cada venda.",
  },
  {
    n: "ato 03",
    title: "O grupo enche sozinho",
    body:
      "Quem clica já cai direto no grupo certo. Lotou? O próximo nasce no automático, com o mesmo nome, foto e regras. Você só assiste o número subir.",
  },
] as const;

export function Mechanism() {
  return (
    <div data-mech className="relative mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
      {/* passos */}
      <div>
        {STEPS.map((s, i) => (
          <div key={s.n} className="lp-step relative py-14 pl-8 sm:py-20 lg:min-h-[70vh] lg:py-24">
            <span className="lp-step-bar absolute left-0 top-14 bottom-14 w-px bg-gradient-to-b from-white/70 to-zap sm:top-20 sm:bottom-20 lg:top-24 lg:bottom-24" />
            <p className="font-data text-xs uppercase tracking-[0.3em] text-bruma/45">{s.n}</p>
            <h3 className="font-tech mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{s.title}</h3>
            <p className="mt-5 max-w-md text-base leading-relaxed text-bruma/60 sm:text-lg">{s.body}</p>
            {/* visual embutido — só mobile/tablet */}
            <div className="mt-8 lg:hidden">
              <MechVisual index={i} embedded />
            </div>
          </div>
        ))}
      </div>

      {/* visual sticky — só desktop */}
      <div className="relative hidden lg:block">
        <div className="sticky top-0 flex h-screen items-center">
          <div className="relative h-[26rem] w-full">
            {STEPS.map((_, i) => (
              <MechVisual key={i} index={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MechVisual({ index, embedded }: { index: 0 | 1 | 2 | number; embedded?: boolean }) {
  return (
    <div
      className={cn(
        embedded ? "is-active relative" : "lp-visual",
        "flex items-center justify-center",
      )}
    >
      {index === 0 && <VisualCampaign />}
      {index === 1 && <VisualLink />}
      {index === 2 && <VisualGroup />}
    </div>
  );
}

/* Ato 1 — mini-builder de campanha */
function VisualCampaign() {
  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-void-2/90 p-6 shadow-deep backdrop-blur">
      <p className="font-data flex items-center gap-2 text-xs uppercase tracking-wider text-bruma/50">
        <span className="h-2 w-2 rounded-full bg-zap" /> nova campanha
      </p>
      <div className="mt-5 space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="font-data text-[10px] uppercase tracking-wider text-bruma/40">nome</p>
          <p className="mt-0.5 text-sm text-white">Ofertas da Semana</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <p className="font-data text-[10px] uppercase tracking-wider text-bruma/40">grupos de destino</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["VIP 01", "VIP 02", "VIP 03", "+ 47"].map((g) => (
              <span key={g} className="font-data inline-flex items-center gap-1 rounded-md bg-zap/10 px-2 py-0.5 text-[11px] text-zap ring-1 ring-inset ring-zap/25">
                <WhatsAppIcon className="h-3 w-3" /> {g}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="lp-btn lp-btn-light mt-5 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold">
        <Link2 className="h-4 w-4" /> Gerar link rastreado
      </div>
    </div>
  );
}

/* Ato 2 — link rastreado irradiando pros canais */
function VisualLink() {
  const targets = [
    { icon: Megaphone, label: "Anúncio" },
    { icon: UserRound, label: "Bio" },
    { icon: Plus, label: "Story" },
  ];
  return (
    <div className="w-full max-w-md">
      <div className="mx-auto flex w-fit items-center gap-3 rounded-2xl border border-white/25 bg-void-2/90 px-5 py-3.5 shadow-deep backdrop-blur">
        <Link2 className="h-4 w-4 shrink-0 text-zap" />
        <span className="font-data text-sm text-white">hubflow.com.br/c/ofertas</span>
        <Copy className="h-4 w-4 shrink-0 text-bruma/40" />
      </div>
      {/* linhas tracejadas correndo */}
      <svg viewBox="0 0 400 90" className="mx-auto -my-1 block w-full max-w-sm" aria-hidden>
        {[
          "M200 4 C 200 40, 70 40, 70 82",
          "M200 4 C 200 50, 200 50, 200 82",
          "M200 4 C 200 40, 330 40, 330 82",
        ].map((d) => (
          <path key={d} d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeDasharray="4 6" className="lp-dash-run" />
        ))}
      </svg>
      <div className="grid grid-cols-3 gap-3">
        {targets.map((t) => (
          <div key={t.label} className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] py-4">
            <t.icon className="h-5 w-5 text-bruma/60" />
            <span className="font-data text-xs uppercase tracking-wider text-bruma/50">{t.label}</span>
          </div>
        ))}
      </div>
      <p className="font-data mt-4 text-center text-xs uppercase tracking-[0.25em] text-zap/80">
        cada clique → origem rastreada
      </p>
    </div>
  );
}

/* Ato 3 — grupo enchendo + próximo nascendo */
function VisualGroup() {
  return (
    <div className="w-full max-w-md space-y-3">
      <div className="rounded-3xl border border-white/10 bg-void-2/90 p-6 shadow-deep backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-zap/15 text-zap">
            <WhatsAppIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-white">Ofertas da Semana · VIP 03</p>
            <p className="font-data text-xs text-bruma/45">grupo gerenciado pelo HubFlow</p>
          </div>
        </div>
        {/* membros pingando */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="lp-dotpop h-3.5 w-3.5 rounded-full"
              style={{
                background: `rgba(37, 211, 102, ${0.35 + ((i * 7) % 10) / 18})`,
                ["--d" as string]: `${i * 0.055}s`,
              }}
            />
          ))}
        </div>
        <div className="mt-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="lp-fill h-full rounded-full bg-gradient-to-r from-white/50 to-zap" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-data text-xs text-bruma/50">membros</span>
            <span className="font-data text-xs text-zap">1.024 / 1.024 · cheio</span>
          </div>
        </div>
      </div>
      <div className="lp-dotpop flex items-center gap-3 rounded-2xl border border-zap/30 bg-zap/[0.08] px-5 py-3.5" style={{ ["--d" as string]: "1.5s" }}>
        <Plus className="h-4 w-4 shrink-0 text-zap" />
        <p className="text-sm text-white">
          <span className="font-medium">VIP 04 criado no automático</span>{" "}
          <span className="text-bruma/50">— mesmo nome, foto e regras.</span>
        </p>
      </div>
    </div>
  );
}
