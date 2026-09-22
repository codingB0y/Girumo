"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { useToast } from "@/components/toast";
import { uploadMediaFile } from "@/lib/media-upload-client";
import { PRACAS, isValidOpening, openingOf, type PracaId } from "@/lib/funnels/pracas";
import { FUNNEL_TEMPLATES, type FunnelField, type FunnelTemplateId } from "@/lib/funnels/templates";
import { cn } from "@/lib/utils";
import { FunnelHero } from "./funnel-hero";
import { FunnelStepCard } from "./funnel-step-card";
import { EMPTY_PROGRESS, applyProgress, confirmDays, isStepDone, type ConfirmFailure, type FunnelProgress } from "./funnel-confirm";
import { dayLabel, draftsForDay, funnelDays, repeatOptions } from "./funnel-days";
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
const PILULA_ATIVA = "border-volt-950 bg-volt-950 font-semibold text-paper-0";
const PILULA_INATIVA = "border-line-200 bg-paper-0 text-volt-950 hover:border-cobalt-500";
const PILULA_TRAVADA = "disabled:cursor-not-allowed disabled:opacity-50";
const INPUT_TOPO =
  "h-11 w-full rounded-full border border-line-200 bg-canvas-100/40 px-4 text-base text-volt-950 focus:border-cobalt-500 focus:outline-none disabled:opacity-60";
const MINUTO = 60_000;

type Perfil = { loja: string; nicho: string };

/** Praça lembrada neste navegador: é conveniência, não dado da loja. */
const CHAVE_PRACA = "girumo:funil:praca";
type PracaSalva = { praca: PracaId; hora: string };

function lerPraca(): PracaSalva | null {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE_PRACA) ?? "null") as Partial<PracaSalva> | null;
    if (!salvo || !PRACAS.some((p) => p.id === salvo.praca)) return null;
    return { praca: salvo.praca as PracaId, hora: typeof salvo.hora === "string" ? salvo.hora : "" };
  } catch {
    return null;
  }
}

function gravarPraca(v: PracaSalva) {
  try {
    window.localStorage.setItem(CHAVE_PRACA, JSON.stringify(v));
  } catch {
    // Navegador sem storage (aba anônima, bloqueio): a escolha vale só nesta tela.
  }
}

/** Um funil por dia: run próprio, progresso próprio (ver `confirmDays`). */
type DiaRun = { runId: string; progress: FunnelProgress; frozen: Readonly<Record<string, StepPlan>> };
const RUN_VAZIO: DiaRun = { runId: "", progress: EMPTY_PROGRESS, frozen: {} };
type Falha = ConfirmFailure & { day: string };

export function FunnelTab(props: FunnelTabProps) {
  const toast = useToast();
  const [templateId, setTemplateId] = useState<FunnelTemplateId>(FUNNEL_TEMPLATES[0].id);
  const template = FUNNEL_TEMPLATES.find((t) => t.id === templateId) ?? FUNNEL_TEMPLATES[0];
  const [anchorDate, setAnchorDate] = useState(() => defaultAnchorDate(FUNNEL_TEMPLATES[0], new Date()));
  const [anchorTime, setAnchorTime] = useState("20:00");
  const [loja, setLoja] = useState("");
  const [nicho, setNicho] = useState("");
  const [perfilSalvo, setPerfilSalvo] = useState<Perfil | null>(null);
  // Rascunho do dia da âncora; os dias repetidos guardam só o que trocaram por cima dele.
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const [dayDrafts, setDayDrafts] = useState<Readonly<Record<string, Record<string, StepDraft>>>>({});
  const [repeat, setRepeat] = useState<readonly string[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(FUNNEL_TEMPLATES[0].steps[0].id);
  /** `${dia}|${stepId}` da foto subindo. */
  const [uploading, setUploading] = useState<string | null>(null);
  // Por dia. `frozen` = plano de cada etapa no momento em que foi agendada (ver `applyProgress`).
  const [runs, setRuns] = useState<Readonly<Record<string, DiaRun>>>({});
  const [failure, setFailure] = useState<Falha | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [praca, setPraca] = useState<PracaId>("bras");
  const [horaOutra, setHoraOutra] = useState("07:00");
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
        // Sem `storeName` o perfil falhou no servidor: perfilSalvo fica null e o
        // PATCH só manda o que não está vazio (nunca apaga o nicho salvo).
        if (!vivo || !s || typeof s.storeName !== "string") return;
        const salvo = { loja: s.storeName, nicho: s.niche ?? "" };
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

  // Depois de montar: no servidor não há localStorage.
  useEffect(() => {
    const salvo = lerPraca();
    if (!salvo) return;
    setPraca(salvo.praca);
    if (salvo.hora) setHoraOutra(salvo.hora);
  }, []);

  // "Já passou" muda com o relógio, não só com a âncora.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), MINUTO);
    return () => clearInterval(t);
  }, []);

  const anchor = anchorFrom(anchorDate, anchorTime, template.anchorNeedsTime);
  // Só roteiro com etapa presa à abertura pergunta a praça (a Live não tem).
  const temAbertura = template.steps.some((s) => s.followsOpening);
  const opening = openingOf(praca, horaOutra);
  const aberturaOk = !temAbertura || isValidOpening(opening);
  const days = template.repeatable ? funnelDays(anchorDate, repeat) : [anchorDate];
  const varios = days.length > 1;
  const diaAtivo = activeDay !== null && days.includes(activeDay) ? activeDay : anchorDate;
  const runDe = (day: string) => runs[day] ?? RUN_VAZIO;
  const draftsDe = (day: string) => (day === anchorDate ? drafts : draftsForDay(drafts, dayDrafts[day] ?? {}));
  /** Só o que foi digitado NAQUELE dia (o card mostra o herdado como placeholder). */
  const proprioDe = (day: string, stepId: string) => (day === anchorDate ? drafts[stepId] : dayDrafts[day]?.[stepId]);
  const travada = (day: string, stepId: string) => stepId in runDe(day).progress.scheduled;
  const pendentesDe = (day: string, ps: StepPlan[]) => ps.filter((p) => p.included && !isStepDone(p, runDe(day).progress));
  function planosDoDia(day: string, agora: Date): StepPlan[] {
    const a = anchorFrom(day, anchorTime, template.anchorNeedsTime);
    if (!a) return [];
    const r = runDe(day);
    // Etapa com mensagem no servidor volta congelada e sempre entra na retomada.
    return applyProgress(planFunnel(template, draftsDe(day), { anchor: a, now: agora, loja, nicho, link: props.masterUrl, opening }), r.progress, r.frozen);
  }
  const porDia = anchor ? days.map((day) => ({ day, plans: planosDoDia(day, now) })) : [];
  const plans = porDia.find((d) => d.day === diaAtivo)?.plans ?? [];
  const started = days.some((d) => Object.keys(runDe(d).progress.scheduled).length > 0);
  const pendentes = porDia.flatMap(({ day, plans: ps }) => pendentesDe(day, ps).map((p) => ({ day, p })));
  const bloqueios = pendentes.filter((x) => isBlocked(x.p));
  const diaBloqueado = bloqueios[0]?.day ?? anchorDate;
  const faltaNoDia = [...new Set(bloqueios.filter((x) => x.day === diaBloqueado).flatMap((x) => blockerLabels(x.p)))];
  const semGrupos = props.groupIds.length === 0;
  const podeAgendar =
    anchor !== null && aberturaOk && !semGrupos && uploading === null && pendentes.length > 0 && bloqueios.length === 0 && !confirming;
  const motivo = !anchor
    ? "Escolha a data."
    : !aberturaOk
      ? "A hora da abertura precisa ser até 11:00: o reforço sai ao meio-dia."
    : semGrupos
      ? "Esta campanha ainda não tem grupos."
      : uploading !== null
        ? "Aguarde a foto terminar de enviar."
        : pendentes.length === 0
        ? "Marque ao menos uma mensagem."
        : bloqueios.length > 0
          ? `Preencha${varios ? ` (${dayLabel(diaBloqueado)})` : ""}: ${faltaNoDia.join(", ")}.`
          : null;
  const incluidas = porDia.flatMap((d) => d.plans.filter((p) => p.included));
  const rotuloDe = (stepId: string) => template.steps.find((s) => s.id === stepId)?.label ?? stepId;

  function revogar(url: string) {
    URL.revokeObjectURL(url);
    blobs.current.delete(url);
  }

  function revogarTodas() {
    [drafts, ...Object.values(dayDrafts)].forEach((ds) =>
      Object.values(ds).forEach((d) => d.media && revogar(d.media.previewUrl)),
    );
  }

  function recomecar() {
    revogarTodas();
    setDrafts({});
    setDayDrafts({});
    setRepeat([]);
    setActiveDay(null);
    setRuns({});
  }

  // Etapa travada (mensagem já no servidor) não muda mais: o card só desabilita
  // o checkbox, então a trava dos campos fica aqui. O dia vem de quem chamou,
  // nunca do dia ativo: a foto termina de subir depois de o lojista trocar de dia.
  function mudarDraft(day: string, stepId: string, muda: (d: StepDraft) => StepDraft) {
    if (travada(day, stepId)) return;
    if (day === anchorDate) {
      setDrafts((atual) => ({ ...atual, [stepId]: muda(atual[stepId] ?? {}) }));
      return;
    }
    setDayDrafts((atual) => ({ ...atual, [day]: { ...atual[day], [stepId]: muda(atual[day]?.[stepId] ?? {}) } }));
  }

  function escolherRoteiro(id: FunnelTemplateId) {
    if (started || id === templateId) return;
    const t = FUNNEL_TEMPLATES.find((x) => x.id === id) ?? FUNNEL_TEMPLATES[0];
    recomecar();
    setTemplateId(t.id);
    setOpenStep(t.steps[0].id);
    setAnchorDate(defaultAnchorDate(t, new Date()));
    setFailure(null);
  }

  function escolherPraca(id: PracaId) {
    if (started) return;
    setPraca(id);
    gravarPraca({ praca: id, hora: horaOutra });
  }

  function mudarHoraOutra(hora: string) {
    if (started) return;
    setHoraOutra(hora);
    gravarPraca({ praca, hora });
  }

  function alternarDia(day: string) {
    if (started) return;
    setRepeat((atual) => (atual.includes(day) ? atual.filter((d) => d !== day) : [...atual, day]));
  }

  async function anexarFoto(day: string, stepId: string, arquivo: File) {
    if (travada(day, stepId)) return;
    setUploading(`${day}|${stepId}`);
    try {
      const enviado = await uploadMediaFile(arquivo);
      // Só revoga a foto DESTE dia: a herdada do 1º dia continua na bolha de lá.
      const anterior = proprioDe(day, stepId)?.media;
      if (anterior) revogar(anterior.previewUrl);
      const media = { id: enviado.id, name: arquivo.name, previewUrl: URL.createObjectURL(arquivo) };
      blobs.current.add(media.previewUrl);
      mudarDraft(day, stepId, (d) => ({ ...d, media }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao enviar a foto.", "error");
    } finally {
      setUploading(null);
    }
  }

  function removerFoto(day: string, stepId: string) {
    if (travada(day, stepId)) return;
    const media = proprioDe(day, stepId)?.media;
    if (media) revogar(media.previewUrl);
    // `media: undefined` explícito: no dia repetido, tira a foto herdada só dele.
    mudarDraft(day, stepId, (d) => ({ ...d, media: undefined }));
  }

  // A loja salva é o nome da organização (topo do painel, páginas públicas):
  // trocar aqui troca lá. Mesmo critério do PATCH abaixo, pra o aviso não mentir.
  const lojaVaiMudar = loja.trim() !== "" && loja.trim() !== perfilSalvo?.loja;

  async function salvarPerfilSeMudou() {
    const atual = { loja: loja.trim(), nicho: nicho.trim() };
    // Só o que mudou. A rota recusa `storeName` vazio (400); roteiro sem {loja}
    // deixa agendar sem ela. Sem o salvo (GET falhou), o nicho só vai se tiver
    // texto: `niche: null` apaga, e isso só quando o lojista apagou o campo.
    const mudouLoja = lojaVaiMudar;
    const mudouNicho = perfilSalvo ? atual.nicho !== perfilSalvo.nicho : atual.nicho !== "";
    if (!mudouLoja && !mudouNicho) return;
    // Falhar aqui não impede agendar: a copy já foi montada com o que está na tela.
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        ...(mudouLoja ? { storeName: atual.loja } : {}),
        ...(mudouNicho ? { niche: atual.nicho || null } : {}),
      }),
    }).catch(() => null);
    if (res?.ok) {
      setPerfilSalvo({
        loja: mudouLoja ? atual.loja : (perfilSalvo?.loja ?? ""),
        nicho: mudouNicho ? atual.nicho : (perfilSalvo?.nicho ?? ""),
      });
    }
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
      // runId nasce no 1º clique e fica: a retomada de um dia usa o mesmo.
      const atuais: Record<string, DiaRun> = Object.fromEntries(
        days.map((day) => [day, runs[day] ?? { ...RUN_VAZIO, runId: crypto.randomUUID() }]),
      );
      const jobs = days
        .map((day) => ({
          day,
          plans: planosDoDia(day, agora),
          run: { templateId, runId: atuais[day].runId, groupIds: props.groupIds },
          progress: atuais[day].progress,
        }))
        .filter((j) => pendentesDe(j.day, j.plans).length > 0);
      // Nada sobrou com o relógio do clique: não fecha como sucesso vazio; o
      // `now` novo já faz o motivo explicar.
      if (jobs.length === 0) return;
      setRuns((atual) => ({ ...atuais, ...atual }));
      await salvarPerfilSeMudou();
      const out = await confirmDays({ slug: props.campaignSlug, jobs, post: postJson });
      if (out.failedDay) {
        const falhou = out.failedDay;
        setRuns((atual) => {
          const proximo = { ...atual };
          for (const [day, o] of Object.entries(out.outcomes)) {
            proximo[day] = { runId: atuais[day].runId, progress: o.progress, frozen: { ...atuais[day].frozen, ...o.scheduledPlans } };
          }
          return proximo;
        });
        const f = out.outcomes[falhou]?.failure;
        if (f) setFailure({ ...f, day: falhou });
        // Mostra os cards do dia que parou: é lá que está o que corrigir.
        setActiveDay(falhou);
        return;
      }
      recomecar();
      await props.onScheduled();
    } finally {
      setConfirming(false);
    }
  }

  const agendadas = days.flatMap((day) =>
    Object.keys(runDe(day).progress.scheduled).map((id) => (varios ? `${rotuloDe(id)} (${dayLabel(day)})` : rotuloDe(id))),
  );
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
                className={cn(PILULA, ativo ? PILULA_ATIVA : PILULA_INATIVA, PILULA_TRAVADA)}
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
              <input value={loja} maxLength={80} disabled={started} onChange={(e) => setLoja(e.target.value)} className={INPUT_TOPO} />
            </Campo>
            <Campo rotulo="Seu nicho">
              <input value={nicho} maxLength={60} placeholder="moda infantil" disabled={started} onChange={(e) => setNicho(e.target.value)} className={INPUT_TOPO} />
            </Campo>
          </div>
          {temAbertura && (
            <div className="mt-4 space-y-2 border-t border-dashed border-line-200 pt-4">
              <span id="funil-praca" className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">
                Sua praça
              </span>
              <div role="group" aria-labelledby="funil-praca" className="flex flex-wrap items-center gap-2">
                {PRACAS.map((p) => {
                  const ativa = p.id === praca;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={ativa}
                      disabled={started}
                      onClick={() => escolherPraca(p.id)}
                      className={cn(PILULA, ativa ? PILULA_ATIVA : PILULA_INATIVA, PILULA_TRAVADA)}
                    >
                      {p.label}
                    </button>
                  );
                })}
                {praca === "outra" && (
                  <input
                    type="time"
                    aria-label="Hora da abertura"
                    value={horaOutra}
                    max="11:00"
                    disabled={started}
                    onChange={(e) => mudarHoraOutra(e.target.value)}
                    className={cn(INPUT_TOPO, "w-36")}
                  />
                )}
              </div>
              <p className="text-12 text-slate-600">
                A grade sai às {aberturaOk ? opening : "—"}. {PRACAS.find((p) => p.id === praca)?.nota}
              </p>
            </div>
          )}
          {template.repeatable && (
            <div className="mt-4 space-y-2 border-t border-dashed border-line-200 pt-4">
              <span id="funil-repetir" className="font-data text-12 uppercase tracking-[0.08em] text-slate-600">
                Repetir nos dias seguintes
              </span>
              <div role="group" aria-labelledby="funil-repetir" className="flex flex-wrap gap-2">
                {repeatOptions(anchorDate).map((day) => {
                  const marcado = repeat.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={marcado}
                      disabled={started}
                      onClick={() => alternarDia(day)}
                      className={cn(PILULA, marcado ? PILULA_ATIVA : PILULA_INATIVA, PILULA_TRAVADA)}
                    >
                      {dayLabel(day)}
                    </button>
                  );
                })}
              </div>
              <p className="text-12 text-slate-600">
                Cada dia vira um funil próprio na Agenda e começa igual ao primeiro. Troque só o que muda: a peça, a foto, a quantidade.
              </p>
            </div>
          )}
          {!started && lojaVaiMudar && (
            <p className="mt-3 text-12 text-atencao" role="status">
              Ao agendar, “{loja.trim()}” vira o nome da sua loja em todo o Girumo: no topo do painel e nas suas páginas.
            </p>
          )}
          {started && (
            <p className="mt-3 text-12 text-slate-600">
              Parte deste funil já está na Agenda: roteiro, datas, loja e nicho ficam travados até terminar.
            </p>
          )}
        </Bisel>
      </Secao>

      <Secao
        numero="03"
        titulo={`As ${template.steps.length} mensagens${varios ? " de cada dia" : ""}`}
        aside="Troque só o que quiser. O resto já está no tom certo."
      >
        {varios && (
          <div role="group" aria-label="Dia" className="flex flex-wrap gap-2">
            {days.map((day) => {
              const ativo = day === diaAtivo;
              const falta = bloqueios.some((b) => b.day === day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setActiveDay(day)}
                  className={cn(PILULA, ativo ? PILULA_ATIVA : PILULA_INATIVA, falta && !ativo && "border-alerta text-alerta")}
                >
                  {dayLabel(day)}
                  {falta && " · falta campo"}
                </button>
              );
            })}
          </div>
        )}
        {varios && diaAtivo !== anchorDate && (
          <p className="text-12 text-slate-600">
            Vem igual a {dayLabel(anchorDate)}. O que você trocar aqui vale só para {dayLabel(diaAtivo)}.
          </p>
        )}
        <div className="space-y-3">
          {plans.map((plan) => {
            const id = plan.step.id;
            const dia = diaAtivo;
            return (
              <FunnelStepCard
                key={`${dia}:${id}`}
                plan={plan}
                draft={proprioDe(dia, id) ?? {}}
                open={openStep === id}
                grupoNome={props.campaignName}
                uploading={uploading === `${dia}|${id}`}
                locked={travada(dia, id)}
                herancaRotulo={dia === anchorDate ? undefined : `igual a ${dayLabel(anchorDate)}`}
                onToggleOpen={() => setOpenStep((atual) => (atual === id ? null : id))}
                onIncludedChange={(incluir) => mudarDraft(dia, id, (d) => ({ ...d, excluded: !incluir }))}
                onFieldChange={(campo: FunnelField, valor) =>
                  mudarDraft(dia, id, (d) => ({ ...d, fields: { ...d.fields, [campo]: valor } }))
                }
                onMentionToggle={() => mudarDraft(dia, id, (d) => ({ ...d, mentionAll: !plan.mentionAll }))}
                onTextChange={(texto) =>
                  // `undefined` volta para a copy do roteiro (planFunnel: edited = customText !== undefined).
                  mudarDraft(dia, id, (d) => ({ ...d, customText: texto }))
                }
                onPhotoPick={(arquivo) => void anexarFoto(dia, id, arquivo)}
                onPhotoRemove={() => removerFoto(dia, id)}
              />
            );
          })}
        </div>
      </Secao>

      {failure && (
        <div role="alert" className="space-y-2 rounded-xl border border-alerta bg-paper-0 p-4 text-13 text-volt-950">
          <p className="font-semibold">
            Parou em “{rotuloDe(failure.stepId)}”{varios ? ` de ${dayLabel(failure.day)}` : ""}.
          </p>
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
