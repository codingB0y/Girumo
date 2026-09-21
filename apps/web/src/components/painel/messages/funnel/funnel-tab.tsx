"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { useToast } from "@/components/toast";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { FUNNEL_TEMPLATES, type FunnelField, type FunnelTemplateId } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";
import { FunnelHero } from "./funnel-hero";
import { FunnelStepCard } from "./funnel-step-card";
import { EMPTY_PROGRESS, confirmFunnel, isStepDone, type ConfirmFailure, type FunnelProgress } from "./funnel-confirm";
import { anchorFrom, blockerLabels, defaultAnchorDate, isBlocked, planFunnel, type StepDraft, type StepPlan } from "./funnel-plan";

export type FunnelTabProps = {
  campaignSlug: string;
  campaignName: string;
  /** Os mesmos alvos da aba (grupo a grupo ou Avisos). */
  groupIds: string[];
  /** `https://<host>/r/<slug>`; vazio bloqueia as etapas de link. */
  masterUrl: string;
  groupCount: number;
  memberCount: number;
  /** Recarrega a Agenda e troca para ela. */
  onScheduled: () => Promise<void>;
  /** "Do zero": abre a sub-aba Agendar. */
  onFromScratch: () => void;
};

const JSON_HEADERS = { "Content-Type": "application/json" };
const postJson = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

const PILULA = "inline-flex min-h-11 items-center rounded-full border px-5 text-13 font-medium transition-colors";
const INPUT_TOPO =
  "h-11 w-full rounded-full border border-line-200 bg-canvas-100/40 px-4 text-base text-volt-950 focus:border-cobalt-500 focus:outline-none disabled:opacity-60";
const MINUTO = 60_000;

type Perfil = { loja: string; nicho: string };

export function FunnelTab(props: FunnelTabProps) {
  const toast = useToast();
  const [templateId, setTemplateId] = useState<FunnelTemplateId>(FUNNEL_TEMPLATES[0].id);
  const template = FUNNEL_TEMPLATES.find((t) => t.id === templateId) ?? FUNNEL_TEMPLATES[0];
  const [anchorDate, setAnchorDate] = useState(() => defaultAnchorDate(FUNNEL_TEMPLATES[0], new Date()));
  const [anchorTime, setAnchorTime] = useState("20:00");
  const [loja, setLoja] = useState("");
  const [nicho, setNicho] = useState("");
  const [perfilSalvo, setPerfilSalvo] = useState<Perfil | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const [openStep, setOpenStep] = useState<string | null>(FUNNEL_TEMPLATES[0].steps[0].id);
  const [uploading, setUploading] = useState<string | null>(null);
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const [progress, setProgress] = useState<FunnelProgress>(EMPTY_PROGRESS);
  const [failure, setFailure] = useState<ConfirmFailure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // previewUrl vivos: revogados ao trocar/remover a foto e, no fim, ao desmontar.
  const blobs = useRef(new Set<string>());

  useEffect(() => {
    const vivos = blobs.current;
    return () => {
      vivos.forEach((url) => URL.revokeObjectURL(url));
      vivos.clear();
    };
  }, []);

  // Loja e nicho vêm da organização; a 1ª vez o lojista preenche, as próximas já vêm.
  useEffect(() => {
    let vivo = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { storeName?: string; niche?: string | null } | null) => {
        if (!vivo || !s) return;
        const salvo = { loja: s.storeName ?? "", nicho: s.niche ?? "" };
        // Não atropela o que o lojista já começou a digitar.
        setLoja((atual) => atual || salvo.loja);
        setNicho((atual) => atual || salvo.nicho);
        setPerfilSalvo(salvo);
      })
      // Sem perfil os campos ficam vazios e o gate por missingKeys segura o botão.
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // "Já passou" muda com o relógio, não só com a âncora.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), MINUTO);
    return () => clearInterval(t);
  }, []);

  const anchor = anchorFrom(anchorDate, anchorTime, template.anchorNeedsTime);
  const ctx = anchor ? { anchor, now, loja, nicho, link: props.masterUrl } : null;
  const travada = (stepId: string) => stepId in progress.scheduled;
  // Etapa com mensagem no servidor e oferta pendente sempre entra na retomada:
  // desmarcar ou virar passado não pode deixar a mensagem sem oferta. Quem
  // decide é o servidor (agendamento já promovido → a rota da oferta recusa).
  const comRetomada = (ps: StepPlan[]) =>
    ps.map((p) => (travada(p.step.id) && !isStepDone(p, progress) ? { ...p, included: true } : p));
  const pendentesDe = (ps: StepPlan[]) => ps.filter((p) => p.included && !isStepDone(p, progress));
  const plans = ctx ? comRetomada(planFunnel(template, drafts, ctx)) : [];
  const started = Object.keys(progress.scheduled).length > 0;
  const pendentes = pendentesDe(plans);
  const bloqueios = pendentes.filter(isBlocked);
  const semGrupos = props.groupIds.length === 0;
  const podeAgendar =
    anchor !== null && !semGrupos && uploading === null && pendentes.length > 0 && bloqueios.length === 0 && !confirming;
  const motivo = !anchor
    ? "Escolha a data."
    : semGrupos
      ? "Esta campanha ainda não tem grupos."
      : uploading !== null
        ? "Aguarde a foto terminar de enviar."
        : pendentes.length === 0
        ? "Marque ao menos uma mensagem."
        : bloqueios.length > 0
          ? `Preencha: ${[...new Set(bloqueios.flatMap(blockerLabels))].join(", ")}.`
          : null;
  const incluidas = plans.filter((p) => p.included);
  const rotuloDe = (stepId: string) => template.steps.find((s) => s.id === stepId)?.label ?? stepId;

  function revogar(url: string) {
    URL.revokeObjectURL(url);
    blobs.current.delete(url);
  }

  // Etapa travada (mensagem já no servidor) não muda mais: o card só desabilita
  // o checkbox, então a trava dos campos fica aqui.
  function mudarDraft(stepId: string, muda: (d: StepDraft) => StepDraft) {
    if (travada(stepId)) return;
    setDrafts((atual) => ({ ...atual, [stepId]: muda(atual[stepId] ?? {}) }));
  }

  function escolherRoteiro(id: FunnelTemplateId) {
    if (started || id === templateId) return;
    const t = FUNNEL_TEMPLATES.find((x) => x.id === id) ?? FUNNEL_TEMPLATES[0];
    Object.values(drafts).forEach((d) => d.media && revogar(d.media.previewUrl));
    setTemplateId(t.id);
    setDrafts({});
    setOpenStep(t.steps[0].id);
    setAnchorDate(defaultAnchorDate(t, new Date()));
    setFailure(null);
  }

  async function anexarFoto(stepId: string, arquivo: File) {
    if (travada(stepId)) return;
    setUploading(stepId);
    try {
      const enviado = await uploadMediaFile(arquivo);
      const anterior = drafts[stepId]?.media;
      if (anterior) revogar(anterior.previewUrl);
      const media = { id: enviado.id, name: arquivo.name, previewUrl: URL.createObjectURL(arquivo) };
      blobs.current.add(media.previewUrl);
      mudarDraft(stepId, (d) => ({ ...d, media }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao enviar a foto.", "error");
    } finally {
      setUploading(null);
    }
  }

  function removerFoto(stepId: string) {
    if (travada(stepId)) return;
    const media = drafts[stepId]?.media;
    if (media) revogar(media.previewUrl);
    mudarDraft(stepId, (d) => ({ ...d, media: undefined }));
  }

  async function salvarPerfilSeMudou() {
    const atual = { loja: loja.trim(), nicho: nicho.trim() };
    if (perfilSalvo && perfilSalvo.loja === atual.loja && perfilSalvo.nicho === atual.nicho) return;
    // Falhar aqui não impede agendar: a copy já foi montada com o que está na tela.
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: JSON_HEADERS,
      // A rota recusa `storeName` vazio (400); roteiro sem {loja} deixa agendar sem ela.
      body: JSON.stringify({ ...(atual.loja ? { storeName: atual.loja } : {}), niche: atual.nicho || null }),
    }).catch(() => null);
    if (res?.ok) setPerfilSalvo(atual);
    else toast("Não deu pra salvar loja e nicho para a próxima vez. As mensagens seguem com o que está na tela.", "error");
  }

  async function agendar() {
    if (!podeAgendar || !anchor) return;
    setConfirming(true);
    setFailure(null);
    try {
      // Recalcula com o relógio de AGORA: etapa que virou passado entre a
      // renderização e o clique não sai.
      const agora = new Date();
      setNow(agora);
      const frescos = comRetomada(planFunnel(template, drafts, { anchor, now: agora, loja, nicho, link: props.masterUrl }));
      // Nada sobrou com o relógio do clique: não fecha como sucesso vazio; o
      // `now` novo já faz o motivo explicar.
      if (pendentesDe(frescos).length === 0) return;
      await salvarPerfilSeMudou();
      const out = await confirmFunnel({
        slug: props.campaignSlug,
        plans: frescos,
        run: { templateId, runId, groupIds: props.groupIds },
        progress,
        post: postJson,
      });
      if (out.failure) {
        setProgress(out.progress);
        setFailure(out.failure);
        return;
      }
      Object.values(drafts).forEach((d) => d.media && revogar(d.media.previewUrl));
      setProgress(EMPTY_PROGRESS);
      setRunId(crypto.randomUUID());
      setDrafts({});
      await props.onScheduled();
    } finally {
      setConfirming(false);
    }
  }

  const agendadas = Object.keys(progress.scheduled).map(rotuloDe);
  const n = pendentes.length;

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-7">
      <FunnelHero
        templateId={templateId}
        templateLabel={template.label}
        anchor={anchor}
        mensagens={incluidas.length}
        grupos={props.groupCount}
        revendedoras={props.memberCount}
        relampagos={incluidas.filter((p) => p.step.kind === "relampago").length}
      />

      <Secao numero="01" titulo="Roteiro">
        <div role="group" aria-label="Roteiro" className="flex flex-wrap gap-2">
          {FUNNEL_TEMPLATES.map((t) => {
            const ativo = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={ativo}
                disabled={started && !ativo}
                onClick={() => escolherRoteiro(t.id)}
                className={cn(
                  PILULA,
                  ativo ? "border-volt-950 bg-volt-950 font-semibold text-paper-0" : "border-line-200 bg-paper-0 text-volt-950 hover:border-cobalt-500",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {t.label}
              </button>
            );
          })}
          <button type="button" onClick={props.onFromScratch} className={cn(PILULA, "border-dashed border-line-200 text-slate-600 hover:text-volt-950")}>
            Do zero
          </button>
        </div>
        <p className="text-13 text-slate-600">{template.description}</p>
      </Secao>

      <Secao numero="02" titulo="Quando, e de quem">
        <Bisel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo={template.anchorLabel}>
              <input type="date" value={anchorDate} disabled={started} onChange={(e) => setAnchorDate(e.target.value)} className={INPUT_TOPO} />
            </Campo>
            {template.anchorNeedsTime && (
              <Campo rotulo="Hora">
                <input type="time" value={anchorTime} disabled={started} onChange={(e) => setAnchorTime(e.target.value)} className={INPUT_TOPO} />
              </Campo>
            )}
            <Campo rotulo="Sua loja">
              <input value={loja} maxLength={80} onChange={(e) => setLoja(e.target.value)} className={INPUT_TOPO} />
            </Campo>
            <Campo rotulo="Seu nicho">
              <input value={nicho} maxLength={60} placeholder="moda infantil" onChange={(e) => setNicho(e.target.value)} className={INPUT_TOPO} />
            </Campo>
          </div>
          {started && (
            <p className="mt-3 text-12 text-slate-600">
              Parte deste funil já está na Agenda: roteiro e data ficam travados até terminar.
            </p>
          )}
        </Bisel>
      </Secao>

      <Secao
        numero="03"
        titulo={`As ${template.steps.length} mensagens`}
        aside="Troque só o que quiser. O resto já está no tom certo."
      >
        <div className="space-y-3">
          {plans.map((plan) => (
            <FunnelStepCard
              key={plan.step.id}
              plan={plan}
              draft={drafts[plan.step.id] ?? {}}
              open={openStep === plan.step.id}
              grupoNome={props.campaignName}
              uploading={uploading === plan.step.id}
              locked={travada(plan.step.id)}
              onToggleOpen={() => setOpenStep((atual) => (atual === plan.step.id ? null : plan.step.id))}
              onIncludedChange={(incluir) => mudarDraft(plan.step.id, (d) => ({ ...d, excluded: !incluir }))}
              onFieldChange={(campo: FunnelField, valor) =>
                mudarDraft(plan.step.id, (d) => ({ ...d, fields: { ...d.fields, [campo]: valor } }))
              }
              onMentionToggle={() => mudarDraft(plan.step.id, (d) => ({ ...d, mentionAll: !plan.mentionAll }))}
              onTextChange={(texto) =>
                // `undefined` volta para a copy do roteiro (planFunnel: edited = customText !== undefined).
                mudarDraft(plan.step.id, (d) => ({ ...d, customText: texto }))
              }
              onPhotoPick={(arquivo) => void anexarFoto(plan.step.id, arquivo)}
              onPhotoRemove={() => removerFoto(plan.step.id)}
            />
          ))}
        </div>
      </Secao>

      {failure && (
        <div role="alert" className="space-y-2 rounded-xl border border-alerta bg-paper-0 p-4 text-13 text-volt-950">
          <p className="font-semibold">Parou em “{rotuloDe(failure.stepId)}”.</p>
          <PlanLimitAlert message={failure.message} upgradeUrl={failure.upgradeUrl} />
          {failure.stage === "oferta" && (
            <p className="text-slate-600">
              A mensagem desta etapa ficou agendada sem a oferta relâmpago. Tente de novo para criar a oferta, ou cancele a mensagem na Agenda.
            </p>
          )}
          {agendadas.length > 0 && (
            <p className="text-slate-600">Já agendadas (dá pra cancelar na Agenda): {agendadas.join(", ")}.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-center">
        <p id="funil-motivo" className="flex-1 text-13 text-slate-600">
          {motivo ?? "Nada sai sem você confirmar. Cada mensagem pode ser cancelada depois, na Agenda."}
        </p>
        <button
          type="button"
          onClick={() => void agendar()}
          disabled={!podeAgendar}
          aria-describedby="funil-motivo"
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-3 rounded-full py-1.5 pl-6 pr-1.5 text-15 font-semibold transition-colors",
            podeAgendar ? "bg-volt-950 text-paper-0 hover:bg-volt-900" : "cursor-not-allowed bg-line-200 text-slate-600",
          )}
        >
          Agendar {n} {n === 1 ? "mensagem" : "mensagens"}
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", podeAgendar ? "bg-acid-500 text-volt-950" : "bg-paper-0 text-slate-600")}>
            {confirming ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden className="h-4 w-4" />}
          </span>
        </button>
      </div>
    </div>
  );
}

function Secao({ numero, titulo, aside, children }: { numero: string; titulo: string; aside?: string; children: ReactNode }) {
  const id = `funil-secao-${numero}`;
  return (
    <section aria-labelledby={id} className="space-y-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-hidden className="font-data text-15 text-slate-600">{numero}</span>
        <h3 id={id} className="font-display text-20 font-bold text-volt-950">{titulo}</h3>
        {aside && <p className="w-full text-12 text-slate-600 sm:ml-auto sm:w-auto">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

function Bisel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-volt-950/[0.04] p-1.5">
      <div className="rounded-lg border border-line-200 bg-paper-0 p-4 sm:p-5">{children}</div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">{rotulo}</span>
      {children}
    </label>
  );
}
