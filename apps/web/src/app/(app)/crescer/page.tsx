"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  FileText,
  Flame,
  Loader2,
  PartyPopper,
  Rocket,
  Send,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Topbar } from "@/components/topbar";
import { useToast } from "@/components/toast";
import { type Group, type MessageTemplate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useCampanhas } from "@/lib/use-campanhas";

type Objetivo = "vender" | "reativar";

const LOTAR = {
  icon: Rocket,
  title: "Atrair novos leads",
  desc: "Montar kit de anuncio para trazer gente nova para os grupos.",
  href: "/acquisition",
};

const OBJETIVOS: { id: Objetivo; icon: typeof Rocket; title: string; desc: string }[] = [
  { id: "vender", icon: ShoppingBag, title: "Vender estoque", desc: "Criar uma oferta para os grupos atuais." },
  { id: "reativar", icon: Flame, title: "Reativar grupo", desc: "Reaquecer um grupo parado com mensagem direta." },
];

export default function CrescerPage() {
  return (
    <>
      <Topbar title="Crescer" subtitle="Escolha um objetivo e execute com fila segura" />
      <main className="flex-1 bg-slate-50/70 px-4 py-5 sm:px-6 lg:px-8">
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
    initial && OBJETIVOS.some((item) => item.id === initial) ? initial : null,
  );

  if (!objetivo) {
    return (
      <div className="mx-auto grid max-w-5xl gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-slate-950">O que precisa acontecer agora?</h1>
          <p className="mt-1 text-sm text-slate-500">
            Separe trafego novo, venda para base atual e reativacao. Cada caminho usa a ferramenta certa.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Link href={LOTAR.href} className="group rounded-lg border border-brand-200 bg-white p-4 shadow-card hover:shadow-card-hover">
            <GoalIcon icon={LOTAR.icon} />
            <p className="mt-3 font-semibold text-slate-900">{LOTAR.title}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">{LOTAR.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
              Montar anuncio
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          {OBJETIVOS.map((objetivoItem) => (
            <button
              key={objetivoItem.id}
              onClick={() => setObjetivo(objetivoItem.id)}
              className="group rounded-lg border border-slate-200 bg-white p-4 text-left shadow-card hover:shadow-card-hover"
            >
              <GoalIcon icon={objetivoItem.icon} />
              <p className="mt-3 font-semibold text-slate-900">{objetivoItem.title}</p>
              <p className="mt-1 text-sm leading-5 text-slate-500">{objetivoItem.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                Comecar
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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
  const [grupo, setGrupo] = useState<Group | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [alvos, setAlvos] = useState<string[]>([]);
  const [quando, setQuando] = useState<"agora" | "agendar">("agora");
  const [scheduledAt, setScheduledAt] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ agendado?: boolean; grupos?: number } | null>(null);

  const groups = (active ? allGroups.filter((group) => active.groupIds.includes(group.id)) : allGroups)
    .slice()
    .sort((a, b) => b.members - a.members);

  useEffect(() => {
    fetch("/api/groups").then((response) => response.json()).then(setAllGroups).catch(() => {});
    fetch("/api/templates").then((response) => response.json()).then(setTemplates).catch(() => {});
  }, []);

  const steps = useMemo<string[]>(() => {
    if (objetivo === "reativar") return ["grupo", "mensagem", "quando", "revisar"];
    return ["mensagem", "grupos", "quando", "revisar"];
  }, [objetivo]);

  const current = steps[step];
  const meta = OBJETIVOS.find((item) => item.id === objetivo)!;

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

  function next() {
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  function back() {
    if (step === 0) onReset();
    else setStep((value) => value - 1);
  }

  function toggleAlvo(id: string) {
    setAlvos((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function executar() {
    setBusy(true);
    try {
      const msgFinal = mensagem.trim();
      const groupIds = objetivo === "reativar" ? (grupo ? [grupo.id] : []) : alvos;
      if (groupIds.length === 0) throw new Error("Escolha pelo menos um grupo.");

      const nome = objetivo === "reativar" ? `Reativar - ${grupo?.name}` : "Oferta";
      const bcRes = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome, message: msgFinal, groupIds }),
      });
      if (!bcRes.ok) throw new Error("Falha ao criar a oferta.");
      const broadcast = await bcRes.json();

      let agendado = false;
      if (quando === "agendar" && scheduledAt) {
        await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: broadcast.id, campaignName: nome, scheduledAt, recurrence: "none" }),
        });
        agendado = true;
      } else {
        await fetch("/api/dispatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: broadcast.id }),
        });
      }
      setDone({ agendado, grupos: groupIds.length });
      toast("Fluxo ativado");
    } catch (error) {
      toast((error as Error).message || "Algo deu errado", "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <SuccessView done={done} onReset={onReset} />;

  return (
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="self-start rounded-lg border border-slate-200 bg-white p-4 shadow-card">
        <GoalIcon icon={meta.icon} />
        <p className="mt-3 font-semibold text-slate-900">{meta.title}</p>
        <p className="mt-1 text-sm leading-5 text-slate-500">{meta.desc}</p>
        <div className="mt-5 space-y-2">
          {steps.map((item, index) => (
            <div key={item} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-lg text-xs font-semibold",
                  index <= step ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400",
                )}
              >
                {index + 1}
              </span>
              <span className={cn("text-sm", index <= step ? "font-medium text-slate-800" : "text-slate-400")}>
                {stepLabel(item)}
              </span>
            </div>
          ))}
        </div>
      </aside>

      <Card className="p-5">
        {current === "grupo" && (
          <Step title="Escolha o grupo para reativar" hint="Use essa opcao para grupos parados ou com baixa resposta.">
            <GroupPicker groups={groups} value={grupo?.id} onPick={(group) => setGrupo(group)} />
          </Step>
        )}

        {current === "mensagem" && (
          <Step title={objetivo === "reativar" ? "Mensagem de reativacao" : "Mensagem da oferta"}>
            {templates.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setMensagem(template.body)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                  >
                    <FileText className="h-3 w-3" />
                    {template.name}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              rows={6}
              placeholder="Escreva a mensagem..."
              value={mensagem}
              onChange={(event) => setMensagem(event.target.value)}
            />
          </Step>
        )}

        {current === "grupos" && (
          <Step title="Selecione os grupos de destino">
            <GroupMulti groups={groups} selected={alvos} onToggle={toggleAlvo} />
          </Step>
        )}

        {current === "quando" && (
          <Step title="Quando enviar?">
            <WhenPicker quando={quando} setQuando={setQuando} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt} />
          </Step>
        )}

        {current === "revisar" && (
          <Step title="Revise antes de ativar">
            <ReviewList objetivo={objetivo} grupo={grupo} mensagem={mensagem} alvos={alvos} quando={quando} scheduledAt={scheduledAt} />
          </Step>
        )}

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={back} disabled={busy}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {current === "revisar" ? (
            <Button onClick={executar} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {busy ? "Ativando..." : "Ativar fluxo"}
            </Button>
          ) : (
            <Button onClick={next} disabled={!canNext}>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function stepLabel(step: string) {
  const labels: Record<string, string> = {
    grupo: "Grupo",
    mensagem: "Mensagem",
    grupos: "Destinos",
    quando: "Envio",
    revisar: "Revisao",
  };
  return labels[step] ?? step;
}

function GoalIcon({ icon: Icon }: { icon: typeof Rocket }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
      <Icon className="h-5 w-5" />
    </div>
  );
}

function Step({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">{title}</h2>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function GroupPicker({ groups, value, onPick }: { groups: Group[]; value?: string; onPick: (group: Group) => void }) {
  if (groups.length === 0) {
    return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Nenhum grupo sincronizado.</p>;
  }
  return (
    <div className="max-h-80 space-y-1.5 overflow-y-auto">
      {groups.map((group) => (
        <button
          key={group.id}
          onClick={() => onPick(group)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors",
            value === group.id ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50",
          )}
        >
          <span className="truncate text-sm font-medium text-slate-800">{group.name}</span>
          <span className="ml-2 shrink-0 text-xs text-slate-400">{group.members} membros</span>
        </button>
      ))}
    </div>
  );
}

function GroupMulti({ groups, selected, onToggle }: { groups: Group[]; selected: string[]; onToggle: (id: string) => void }) {
  if (groups.length === 0) {
    return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Nenhum grupo sincronizado.</p>;
  }
  return (
    <div className="max-h-80 space-y-1.5 overflow-y-auto">
      {groups.map((group) => {
        const on = selected.includes(group.id);
        return (
          <button
            key={group.id}
            onClick={() => onToggle(group.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
          >
            <span className={cn("flex h-5 w-5 items-center justify-center rounded border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")}>
              {on && <Check className="h-3 w-3" />}
            </span>
            <span className="flex-1 truncate text-sm font-medium text-slate-800">{group.name}</span>
            <span className="text-xs text-slate-400">{group.members}</span>
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
  setQuando: (value: "agora" | "agendar") => void;
  scheduledAt: string;
  setScheduledAt: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <PickCard
        active={quando === "agora"}
        onClick={() => setQuando("agora")}
        title="Enviar agora"
        desc="A engine coloca o disparo na fila segura."
        icon={<Send className="h-4 w-4" />}
      />
      <PickCard
        active={quando === "agendar"}
        onClick={() => setQuando("agendar")}
        title="Agendar"
        desc="Escolha data e horario para disparo."
        icon={<Clock className="h-4 w-4" />}
      />
      {quando === "agendar" && (
        <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
      )}
    </div>
  );
}

function PickCard({
  active,
  onClick,
  title,
  desc,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        active ? "border-brand-400 bg-brand-50" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <span className={cn("mt-0.5 flex h-5 w-5 items-center justify-center rounded border-2", active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 text-transparent")}>
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
  if (objetivo === "reativar") rows.push(["Grupo", grupo?.name ?? "-"]);
  else rows.push(["Grupos de destino", `${alvos.length} grupo(s)`]);
  rows.push(["Quando", quando === "agora" ? "Agora" : new Date(scheduledAt).toLocaleString("pt-BR")]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="text-slate-500">{key}</span>
            <span className="text-right font-medium text-slate-800">{value}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white p-2.5 shadow-sm">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{mensagem || "Sua mensagem aparece aqui..."}</p>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ done, onReset }: { done: { agendado?: boolean; grupos?: number }; onReset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-card">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <PartyPopper className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-normal text-slate-950">Fluxo ativado</h2>
      <p className="mt-1 text-sm leading-5 text-slate-500">
        {done.agendado
          ? "Sua divulgacao esta agendada para a engine disparar no horario definido."
          : `A engine esta disparando para ${done.grupos} grupo(s) pela fila segura.`}
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <Button variant="outline" onClick={onReset}>
          Fazer outro
        </Button>
        <Link href="/hoje">
          <Button>
            Acompanhar
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
