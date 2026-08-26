"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ArrowLeft, ArrowRight, CheckCircle2, Users, Sparkles, Copy, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import type { Group } from "@/lib/mock-data";
import { CAMPAIGN_PRESETS, getCampaignPreset, resolvePresetName, type CampaignPreset } from "@/lib/campaign-presets";

/**
 * Erro de requisição que preserva o caminho de saída.
 *
 * `throw new Error(msg)` jogava fora tudo que não fosse a mensagem — inclusive
 * o `upgradeUrl` que o 402 do gate de plano manda. Sem ele a tela só sabia
 * dizer que deu errado, nunca o que fazer a respeito.
 */
class RequestError extends Error {
  readonly upgradeUrl: string | null;
  constructor(message: string, upgradeUrl: string | null) {
    super(message);
    this.upgradeUrl = upgradeUrl;
  }
}

async function toRequestError(res: Response, fallback: string): Promise<RequestError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; upgradeUrl?: string };
  return new RequestError(body?.error ?? fallback, body?.upgradeUrl ?? null);
}

type GrowTemplate = { subjectPattern?: string };
type Campanha = {
  id: string;
  name: string;
  loja?: string;
  groupIds: string[];
  slug?: string;
  autoGrow?: boolean;
  growTemplate?: GrowTemplate | null;
};

/** Nome do próximo grupo. O `{n}` é o número que a numeração substitui. */
function defaultSubjectPattern(campanhaName: string): string {
  const base = campanhaName.trim();
  return base ? `${base} {n}` : "";
}

export function CampaignConfig({ mode, slug }: { mode: "create" | "edit"; slug?: string }) {
  const router = useRouter();
  // O passo "Objetivo" (presets) só existe na criação. Edição segue igual.
  const SECTIONS = mode === "create" ? ["Objetivo", "Cadastro", "Grupos"] : ["Cadastro", "Grupos"];
  const cadastroIdx = mode === "create" ? 1 : 0;

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Preenchido só quando o erro veio do gate de plano (402). */
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);

  const [id, setId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [autoGrow, setAutoGrow] = useState(true);
  // Molde do nome do grupo que a Girumo cria quando o pool lota. Vazio = usa o
  // sugerido a partir do nome da campanha (o preset de Objetivo já preenche esse).
  const [growSubject, setGrowSubject] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Mensagem-modelo do preset escolhido — sugestão pra postar com o link (não persiste).
  const [suggestedMsg, setSuggestedMsg] = useState<string | null>(null);

  const [idx, setIdx] = useState(0);
  const [origin, setOrigin] = useState("");

  // Aplica um preset (passo Objetivo → Cadastro). "Do zero" só avança, sem pré-preencher.
  function applyPreset(preset: CampaignPreset) {
    if (preset.id !== "zero") {
      const monthName = new Date().toLocaleString("pt-BR", { month: "long" });
      setName((cur) => cur || resolvePresetName(preset, monthName));
      setSuggestedMsg(preset.message);
    } else {
      setSuggestedMsg(null);
    }
    setIdx(cadastroIdx);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try {
        const g = await fetch("/api/groups").then((r) => r.json()).catch(() => []);
        setGroups(Array.isArray(g) ? g : []);
        if (mode === "create") {
          // Deep-link: ?preset=<id>&groups=<ids> (ex.: reativação vinda de Resultados).
          const params = new URLSearchParams(window.location.search);
          const groupsParam = params.get("groups");
          if (groupsParam) setSelected(new Set(groupsParam.split(",").filter(Boolean)));
          const presetId = params.get("preset");
          const preset = presetId ? getCampaignPreset(presetId) : undefined;
          if (preset && preset.id !== "zero") {
            const monthName = new Date().toLocaleString("pt-BR", { month: "long" });
            setName(resolvePresetName(preset, monthName));
            setSuggestedMsg(preset.message);
            setIdx(1); // já vem com objetivo escolhido — pula o passo Objetivo
          }
        }
        if (mode === "edit" && slug) {
          const list: Campanha[] = await fetch("/api/campanhas").then((r) => r.json()).catch(() => []);
          const c = Array.isArray(list) ? list.find((x) => x.slug === slug || x.id === slug) : null;
          if (c) {
            setId(c.id);
            setCreatedSlug(c.slug ?? null);
            setName(c.name ?? "");
            setAutoGrow(c.autoGrow ?? true);
            setGrowSubject(c.growTemplate?.subjectPattern ?? "");
            setSelected(new Set(c.groupIds ?? []));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, slug]);

  const backHref = mode === "edit" && (createdSlug || slug) ? `/painel/campanhas/${createdSlug ?? slug}` : "/painel/campanhas";
  const isObjetivoStep = mode === "create" && idx === 0;
  const canAdvance = isObjetivoStep ? true : name.trim().length > 0;
  // O molde efetivo: o que o lojista escreveu, ou o sugerido pelo nome da campanha.
  // Sem molde o auto-grow não teria como nomear o grupo e ficaria ligado sem agir.
  const growPattern = growSubject.trim() || defaultSubjectPattern(name);

  const toggle = (gid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  /**
   * Só manda o molde quando o auto-grow está ligado. Com ele desligado a chave
   * fica de fora do PATCH de propósito — desligar o automático não deve apagar o
   * nome que o lojista configurou, só parar de criar.
   */
  function growTemplatePatch(): { growTemplate?: GrowTemplate } {
    if (!autoGrow || !growPattern) return {};
    return { growTemplate: { subjectPattern: growPattern } };
  }

  async function save() {
    setError(null);
    setUpgradeUrl(null);
    setSaving(true);
    try {
      const groupIds = [...selected];
      if (mode === "create") {
        const res = await fetch("/api/campanhas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), groupIds }),
        });
        if (!res.ok) throw await toRequestError(res, "Erro ao criar.");
        const created: Campanha = await res.json();
        // grava autoGrow + molde do grupo (POST não aceita) num PATCH
        await fetch("/api/campanhas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: created.id, autoGrow, ...growTemplatePatch() }),
        }).catch(() => {});
        setCreatedSlug(created.slug ?? null);
        setId(created.id);
      } else {
        if (!id) throw new Error("Campanha não carregada.");
        const res = await fetch("/api/campanhas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: name.trim(), groupIds, autoGrow, ...growTemplatePatch() }),
        });
        if (!res.ok) throw await toRequestError(res, "Erro ao salvar.");
        router.push(backHref);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
      setUpgradeUrl(e instanceof RequestError ? e.upgradeUrl : null);
      setSaving(false);
    }
  }

  /* sucesso (create) */
  if (mode === "create" && createdSlug) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="hf-enter flex h-16 w-16 items-center justify-center rounded-full bg-sucesso/10 text-sucesso">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="font-display mt-6 text-2xl font-extrabold tracking-[-0.03em] text-volt-950">Campanha criada!</h1>
        <p className="font-editorial mt-2 text-[18px] italic text-ardosia">Seu link de captação está pronto pra divulgar.</p>
        <div className="pn-card mt-4 rounded-xl px-4 py-3">
          <CopyLink url={`${origin}/r/${createdSlug}`} />
        </div>
        <button
          onClick={() => router.push(`/painel/campanhas/${createdSlug}`)}
          className="mt-7 rounded-xl bg-cobalt-500 px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
        >
          Abrir campanha
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[760px] space-y-4 px-4 py-10 sm:px-8">
        <div className="pn-skeleton h-10 w-48 rounded-lg" />
        <div className="pn-skeleton h-72 rounded-2xl" />
      </div>
    );
  }

  const objetivoCard = (
    <Card key="objetivo">
      <div>
        <p className="text-sm font-medium text-volt-950">Qual o objetivo?</p>
        <p className="mb-3 mt-0.5 text-xs text-aco/55">Escolha e a gente pré-monta a campanha. Dá pra ajustar tudo depois.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAMPAIGN_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className="flex flex-col gap-1 rounded-2xl border border-volt-950/[0.08] bg-papel p-4 text-left transition-[border-color,background-color] duration-[160ms] ease-[var(--ease-fluxo)] hover:border-cobalt-500/40 hover:bg-cobalt-500/[0.03]"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-volt-950">
                <Target className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />
                {p.label}
              </span>
              <span className="text-xs text-aco/60">{p.description}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );

  const cadastroCard = (
    <Card key="cadastro">
      <Field label="Título" hint="O nome da campanha. Ex: “Saldão Mega Stock Atacado”.">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da campanha…" className={inputCls} />
      </Field>
      {suggestedMsg && (
        <Field label="Mensagem sugerida pra divulgar" hint="Copie e poste junto do seu link de captação nos grupos. É só um modelo — ajuste do seu jeito.">
          <div className="rounded-xl border border-volt-950/10 bg-poco p-3.5">
            <p className="whitespace-pre-line text-sm leading-relaxed text-volt-950">{suggestedMsg}</p>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(suggestedMsg).catch(() => {})}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-volt-950/10 bg-papel px-3 py-1.5 text-xs font-medium text-volt-950 transition-colors duration-[160ms] hover:border-cobalt-500/30"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar mensagem
            </button>
          </div>
        </Field>
      )}
      {mode === "edit" && (createdSlug || slug) && (
        <Field label="Link da campanha" hint="É o link que você divulga — ele enche seus grupos.">
          <div className="flex items-center rounded-xl border border-volt-950/10 bg-poco px-3.5 py-2.5">
            <CopyLink url={`${origin}/r/${createdSlug ?? slug}`} />
          </div>
        </Field>
      )}
      <Field label="Automatizar criação de grupos?" hint="A Girumo cria um grupo novo automaticamente quando o atual lota (a partir de 90%).">
        <ToggleInline on={autoGrow} setOn={setAutoGrow} labelOn="Sim, criar no automático" labelOff="Não, gerencio na mão" />
        {autoGrow && (
          <div className="mt-2">
            <label htmlFor="grow-subject" className="text-xs text-aco/55">
              Nome dos grupos criados — <span className="font-data">{"{n}"}</span> vira o número
            </label>
            <input
              id="grow-subject"
              value={growSubject}
              onChange={(e) => setGrowSubject(e.target.value)}
              placeholder={defaultSubjectPattern(name) || "Atacado {n}"}
              className={cn(inputCls, "mt-1.5")}
            />
            {growPattern && (
              <p className="mt-1.5 text-xs text-aco/55">
                O próximo vai se chamar{" "}
                <span className="font-medium text-volt-950">
                  {growPattern.includes("{n}") ? growPattern.replace("{n}", String(selected.size + 1)) : `${growPattern} ${selected.size + 1}`}
                </span>
                .
              </p>
            )}
          </div>
        )}
      </Field>
    </Card>
  );

  const gruposCard = (
    <Card key="grupos">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-volt-950">Grupos da campanha</p>
        <span className="font-data text-xs uppercase tracking-[0.08em] tabular-nums text-aco/55">{selected.size} selecionados</span>
      </div>
      <p className="-mt-2 text-xs text-aco/55">Os grupos que o link vai encher. Dá pra adicionar/remover depois.</p>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-volt-950/15 px-4 py-8 text-center">
          <p className="text-sm text-aco">Nenhum grupo sincronizado ainda.</p>
          <p className="mt-1 text-xs text-aco/55">Conecte o WhatsApp e os grupos aparecem aqui.</p>
        </div>
      ) : (
        <div className="grid max-h-[340px] gap-2 overflow-y-auto sm:grid-cols-2">
          {groups.map((g) => {
            const sel = selected.has(g.id);
            return (
              <button
                key={g.id}
                onClick={() => toggle(g.id)}
                className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition-[border-color,background-color] duration-[160ms] ease-[var(--ease-fluxo)]", sel ? "border-cobalt-500 bg-cobalt-500/[0.05]" : "border-volt-950/[0.08] bg-papel hover:border-cobalt-500/30")}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sel ? "bg-cobalt-500 text-white" : "bg-cobalt-500/10 text-cobalt-500")}>
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-volt-950">{g.name}</p>
                  <p className="font-data text-[11px] tabular-nums text-aco/55">{g.members?.toLocaleString("pt-BR") ?? 0} membros{!g.inviteUrl ? " · sem convite" : ""}</p>
                </div>
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border transition", sel ? "border-cobalt-500 bg-cobalt-500 text-white" : "border-volt-950/20")}>
                  {sel && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );

  const sections = mode === "create" ? [objetivoCard, cadastroCard, gruposCard] : [cadastroCard, gruposCard];

  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(backHref)} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-volt-950/10 bg-papel text-aco transition-colors duration-[160ms] hover:text-volt-950">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-volt-950">{mode === "edit" ? "Editar campanha" : "Nova campanha"}</h1>
      </div>

      {/* Navegação */}
      {mode === "create" ? (
        <ol className="mt-6 flex items-center">
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full font-data text-sm font-medium tabular-nums transition", i < idx ? "bg-sucesso text-white" : i === idx ? "bg-cobalt-500 text-white" : "bg-poco text-aco/50")}>
                  {i < idx ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("hidden text-sm sm:inline", i === idx ? "font-medium text-volt-950" : "text-aco/50")}>{s}</span>
              </div>
              {i < SECTIONS.length - 1 && <span className={cn("mx-3 h-px flex-1 transition", i < idx ? "bg-sucesso/40" : "bg-volt-950/10")} />}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-6 flex gap-1 border-b border-volt-950/[0.08]">
          {SECTIONS.map((s, i) => (
            <button key={s} onClick={() => setIdx(i)} className={cn("relative px-4 py-2.5 text-sm font-medium transition-colors duration-[160ms]", i === idx ? "text-volt-950" : "text-aco/55 hover:text-volt-950")}>
              {s}
              {i === idx && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-cobalt-500" />}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 hf-enter" key={idx}>
        {sections[idx]}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta"
        >
          <p className="min-w-0">{error}</p>
          {/* Só aparece no 402: o gate manda para onde ir, a tela não inventa. */}
          {upgradeUrl && (
            <Link
              href={upgradeUrl}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-acid-500 px-4 py-2 text-xs font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden /> Ver planos
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-volt-950/[0.08] pt-5">
        <button
          onClick={() => (mode === "create" && idx > 0 ? setIdx(idx - 1) : router.push(backHref))}
          className="inline-flex items-center gap-2 rounded-xl border border-volt-950/15 bg-papel px-4 py-2.5 text-sm font-medium text-volt-950 transition-colors duration-[160ms] hover:border-aco/30"
        >
          <ArrowLeft className="h-4 w-4" /> {mode === "create" && idx > 0 ? "Voltar" : "Cancelar"}
        </button>

        {mode === "create" && idx < SECTIONS.length - 1 ? (
          <button
            onClick={() => canAdvance && setIdx(idx + 1)}
            disabled={!canAdvance}
            className={cn("inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)]", canAdvance ? "bg-cobalt-500 hover:-translate-y-0.5 hover:brightness-110" : "cursor-not-allowed bg-cobalt-500/40")}
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={save}
            disabled={saving || !canAdvance}
            className={cn("inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)]", saving || !canAdvance ? "cursor-not-allowed bg-cobalt-500/40" : "bg-cobalt-500 hover:-translate-y-0.5 hover:brightness-110")}
          >
            {mode === "edit" ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {saving ? "Salvando…" : mode === "edit" ? "Salvar alterações" : "Criar campanha"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

const inputCls =
  "w-full rounded-[10px] border border-volt-950/10 bg-poco px-3.5 py-2.5 text-sm text-volt-950 outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-cobalt-500/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-cobalt-soft)]";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="pn-card space-y-5 rounded-2xl p-6 sm:p-7">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-volt-950">{label}</p>
      {hint && <p className="mb-2 mt-0.5 text-xs text-aco/55">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function ToggleInline({ on, setOn, labelOn, labelOff }: { on: boolean; setOn: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <button onClick={() => setOn(!on)} className="flex w-full items-center justify-between rounded-xl border border-volt-950/10 bg-poco px-3.5 py-2.5 text-left text-sm transition-colors duration-[160ms] hover:border-cobalt-500/30">
      <span className={cn("font-medium", on ? "text-volt-950" : "text-aco/70")}>{on ? labelOn : labelOff}</span>
      <span className={cn("relative h-6 w-11 rounded-full transition-colors duration-[160ms]", on ? "bg-cobalt-500" : "bg-volt-950/15")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-[160ms] ease-[var(--ease-fluxo)]", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}
