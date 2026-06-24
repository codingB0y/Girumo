"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Rocket,
  ShoppingBag,
  Flame,
  ArrowLeft,
  ArrowRight,
  Check,
  Send,
  Clock,
  Loader2,
  PartyPopper,
  FileText,
} from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { type Group, type MessageTemplate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useCampanhas } from "@/lib/use-campanhas";

type Objetivo = "vender" | "reativar";

// "Lotar" leva ao Kit de Anúncio Meta (tráfego frio = gente NOVA de fora).
// Vender/Reativar usam o motor de disparo (mensagem p/ os grupos atuais).
const LOTAR = {
  icon: Rocket,
  title: "Lotar meu grupo",
  desc: "Anúncio no Meta que traz revendedoras NOVAS de fora",
  accent: "from-brand-500 to-brand-700",
  href: "/acquisition",
};

const OBJETIVOS: { id: Objetivo; icon: typeof Rocket; title: string; desc: string; accent: string }[] = [
  { id: "vender", icon: ShoppingBag, title: "Vender estoque", desc: "Disparar uma oferta para os grupos", accent: "from-emerald-500 to-emerald-700" },
  { id: "reativar", icon: Flame, title: "Reativar grupo", desc: "Reaquecer um grupo que esfriou", accent: "from-orange-500 to-orange-600" },
];

export default function CrescerPage() {
  return (
    <>
      <Topbar title="Crescer" subtitle="Em 3 passos, sem complicação" />
      <main className="flex-1 p-6">
        <Suspense>
          <CrescerFlow />
        </Suspense>
      </main>
    </>
  );
}

function CrescerFlow() {
  const params = useSearchParams();
  const initial = (params.get("objetivo") as Objetivo) || null;
  const [objetivo, setObjetivo] = useState<Objetivo | null>(
    initial && OBJETIVOS.some((o) => o.id === initial) ? initial : null,
  );

  if (!objetivo) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">O que você quer fazer agora?</h2>
          <p className="text-sm text-slate-500">Escolha um objetivo — eu cuido do resto.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {/* LOTAR → kit de anúncio (gente nova) */}
          <Link
            href={LOTAR.href}
            className="group rounded-2xl border border-brand-200 bg-brand-50/40 p-5 text-left shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
          >
            <div className={cn("mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-brand", LOTAR.accent)}>
              <LOTAR.icon className="h-5 w-5" />
            </div>
            <p className="font-semibold text-slate-900">{LOTAR.title}</p>
            <p className="mt-1 text-sm text-slate-500">{LOTAR.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
              Montar anúncio <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          {OBJETIVOS.map((o) => (
            <button
              key={o.id}
              onClick={() => setObjetivo(o.id)}
              className="group rounded-2xl border border-slate-200/70 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-1 hover:shadow-card-hover"
            >
              <div className={cn("mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-brand", o.accent)}>
                <o.icon className="h-5 w-5" />
              </div>
              <p className="font-semibold text-slate-900">{o.title}</p>
              <p className="mt-1 text-sm text-slate-500">{o.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                Começar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <Wizard objetivo={objetivo} onReset={() => setObjetivo(null)} />;
}

function Wizard({ objetivo, onReset }: { objetivo: Objetivo; onReset: () => void }) {
  const toast = useToast();
  const { active } = useCampanhas();
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  // Escopo: só grupos da campanha ativa, maiores primeiro.
  const groups = (active ? allGroups.filter((g) => active.groupIds.includes(g.id)) : allGroups)
    .slice()
    .sort((a, b) => b.members - a.members);

  // form
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [alvos, setAlvos] = useState<string[]>([]); // ids dos grupos de destino (vender)
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const [scheduledAt, setScheduledAt] = useState("");

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ agendado?: boolean; grupos?: number } | null>(null);

  useEffect(() => {
    fetch("/api/groups").then((r) => r.json()).then(setAllGroups).catch(() => {});
    fetch("/api/templates").then((r) => r.json()).then(setTemplates).catch(() => {});
  }, []);

  const steps = useMemo<string[]>(() => {
    if (objetivo === "reativar") return ["grupo", "mensagem", "quando", "revisar"];
    return ["mensagem", "grupos", "quando", "revisar"]; // vender
  }, [objetivo]);

  const current = steps[step];
  const meta = OBJETIVOS.find((o) => o.id === objetivo)!;

  function next() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function back() {
    if (step === 0) onReset();
    else setStep((s) => s - 1);
  }

  function toggleAlvo(id: string) {
    setAlvos((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  // valida cada passo p/ habilitar "Continuar"
  const canNext = (() => {
    switch (current) {
      case "grupo":
        return !!grupo;
      case "mensagem":
        return mensagem.trim().length > 0;
      case "grupos":
        return alvos.length > 0;
      case "quando":
        return quando === "agora" || !!scheduledAt;
      default:
        return true;
    }
  })();

  async function executar() {
    setBusy(true);
    try {
      const msgFinal = mensagem.trim();
      const groupIds = objetivo === "reativar" ? (grupo ? [grupo.id] : []) : alvos;
      if (groupIds.length === 0) throw new Error("Escolha pelo menos um grupo.");

      const nome = objetivo === "reativar" ? `Reativar — ${grupo?.name}` : "Oferta";
      const bcRes = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, message: msgFinal, groupIds }),
      });
      if (!bcRes.ok) throw new Error("Falha ao criar a oferta.");
      const bc = await bcRes.json();

      let agendado = false;
      if (quando === "agendar" && scheduledAt) {
        await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: bc.id, campaignName: nome, scheduledAt, recurrence: "none" }),
        });
        agendado = true;
      } else {
        await fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: bc.id }),
        });
      }
      setDone({ agendado, grupos: groupIds.length });
      toast("Piloto automático ativado! 🚀");
    } catch (e) {
      toast((e as Error).message || "Algo deu errado", "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <SuccessView done={done} onReset={onReset} />;

  return (
    <div className="mx-auto max-w-xl">
      {/* Cabeçalho do objetivo + progresso */}
      <div className="mb-5 flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-brand", meta.accent)}>
          <meta.icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{meta.title}</p>
          <div className="mt-1.5 flex gap-1">
            {steps.map((s, i) => (
              <span
                key={s}
                className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-brand-500" : "bg-slate-200")}
              />
            ))}
          </div>
        </div>
        <span className="text-xs font-medium text-slate-400">
          {step + 1}/{steps.length}
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card dz-rise" key={current}>
        {current === "grupo" && (
          <Step title="Qual grupo quer reaquecer?">
            <GroupPicker groups={groups} value={grupo?.id} onPick={(g) => setGrupo(g)} />
          </Step>
        )}

        {current === "mensagem" && (
          <Step title={objetivo === "reativar" ? "A mensagem de reativação" : "A mensagem da oferta"}>
            {templates.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setMensagem(t.body)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                  >
                    <FileText className="h-3 w-3" />
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <Textarea rows={5} placeholder="Escreva a mensagem..." value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </Step>
        )}

        {current === "grupos" && (
          <Step title="Para quais grupos enviar?">
            <GroupMulti groups={groups} selected={alvos} onToggle={toggleAlvo} />
          </Step>
        )}

        {current === "quando" && (
          <Step title="Quando enviar?">
            <WhenPicker quando={quando} setQuando={setQuando} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt} />
          </Step>
        )}

        {current === "revisar" && (
          <Step title="Tudo certo? Bora?">
            <ReviewList objetivo={objetivo} grupo={grupo} mensagem={mensagem} alvos={alvos} quando={quando} scheduledAt={scheduledAt} />
          </Step>
        )}

        {/* Navegação */}
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={busy}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {current === "revisar" ? (
            <Button onClick={executar} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {busy ? "Ativando..." : "Ativar piloto"}
            </Button>
          ) : (
            <Button onClick={next} disabled={!canNext}>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
      {hint && <p className="mb-3 mt-1 text-sm text-slate-500">{hint}</p>}
      <div className={hint ? "" : "mt-4"}>{children}</div>
    </div>
  );
}

function GroupPicker({ groups, value, onPick }: { groups: Group[]; value?: string; onPick: (g: Group) => void }) {
  if (groups.length === 0)
    return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Nenhum grupo sincronizado. Conecte a engine primeiro.</p>;
  return (
    <div className="max-h-72 space-y-1.5 overflow-y-auto">
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onPick(g)}
          className={cn(
            "flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors",
            value === g.id ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:bg-slate-50",
          )}
        >
          <span className="truncate text-sm font-medium text-slate-800">{g.name}</span>
          <span className="ml-2 shrink-0 text-xs text-slate-400">{g.members} membros</span>
        </button>
      ))}
    </div>
  );
}

function GroupMulti({ groups, selected, onToggle }: { groups: Group[]; selected: string[]; onToggle: (id: string) => void }) {
  if (groups.length === 0)
    return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Nenhum grupo sincronizado. Conecte a engine primeiro.</p>;
  return (
    <div className="max-h-72 space-y-1.5 overflow-y-auto">
      {groups.map((g) => {
        const on = selected.includes(g.id);
        return (
          <button
            key={g.id}
            onClick={() => onToggle(g.id)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
          >
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")}>
              {on && <Check className="h-3 w-3" />}
            </span>
            <span className="flex-1 truncate text-sm font-medium text-slate-800">{g.name}</span>
            <span className="text-xs text-slate-400">{g.members}</span>
          </button>
        );
      })}
    </div>
  );
}

function WhenPicker({
  quando,
  setQuando,
  scheduledAt,
  setScheduledAt,
}: {
  quando: "agora" | "agendar";
  setQuando: (v: "agora" | "agendar") => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
}) {
  return (
    <div className="mt-4 space-y-2">
      <PickCard active={quando === "agora"} onClick={() => setQuando("agora")} title="Agora" desc="A engine dispara já, no ritmo seguro anti-ban." icon={<Send className="h-4 w-4" />} />
      <PickCard active={quando === "agendar"} onClick={() => setQuando("agendar")} title="Agendar" desc="Escolha o melhor horário." icon={<Clock className="h-4 w-4" />} />
      {quando === "agendar" && (
        <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1" />
      )}
    </div>
  );
}

function PickCard({ active, onClick, title, desc, icon }: { active: boolean; onClick: () => void; title: string; desc: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        active ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:bg-slate-50",
      )}
    >
      <span className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2", active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-transparent")}>
        <Check className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          {icon}
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
      </span>
    </button>
  );
}

function ReviewList({
  objetivo,
  grupo,
  mensagem,
  alvos,
  quando,
  scheduledAt,
}: {
  objetivo: Objetivo;
  grupo: Group | null;
  mensagem: string;
  alvos: string[];
  quando: "agora" | "agendar";
  scheduledAt: string;
}) {
  const rows: [string, string][] = [];
  if (objetivo === "reativar") rows.push(["Grupo", grupo?.name ?? "—"]);
  else rows.push(["Grupos de destino", `${alvos.length} grupo(s)`]);
  rows.push(["Quando", quando === "agora" ? "Agora" : new Date(scheduledAt).toLocaleString("pt-BR")]);
  return (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <span className="text-slate-500">{k}</span>
            <span className="font-medium text-slate-800">{v}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-[#e5ddd5] p-3">
        <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{mensagem || "Sua mensagem aparece aqui..."}</p>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ done, onReset }: { done: { agendado?: boolean; grupos?: number }; onReset: () => void }) {
  return (
    <div className="mx-auto max-w-md text-center dz-rise">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-brand">
        <PartyPopper className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">Piloto automático ativado! 🚀</h2>
      <p className="mt-1 text-sm text-slate-500">
        {done.agendado
          ? "Sua divulgação está agendada — a engine dispara no horário."
          : `A engine está disparando para ${done.grupos} grupo(s) na fila anti-ban.`}
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <Button variant="outline" onClick={onReset}>
          Fazer outro
        </Button>
        <Link href="/hoje">
          <Button>
            Acompanhar resultados
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
