"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowLeft, ArrowRight, CheckCircle2, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import type { Group } from "@/lib/mock-data";

type Campanha = { id: string; name: string; loja?: string; groupIds: string[]; slug?: string; autoGrow?: boolean };

const SECTIONS = ["Cadastro", "Grupos"];

export function CampaignConfig({ mode, slug }: { mode: "create" | "edit"; slug?: string }) {
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [id, setId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [autoGrow, setAutoGrow] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [idx, setIdx] = useState(0);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try {
        const g = await fetch("/api/groups").then((r) => r.json()).catch(() => []);
        setGroups(Array.isArray(g) ? g : []);
        if (mode === "edit" && slug) {
          const list: Campanha[] = await fetch("/api/campanhas").then((r) => r.json()).catch(() => []);
          const c = Array.isArray(list) ? list.find((x) => x.slug === slug || x.id === slug) : null;
          if (c) {
            setId(c.id);
            setCreatedSlug(c.slug ?? null);
            setName(c.name ?? "");
            setAutoGrow(c.autoGrow ?? true);
            setSelected(new Set(c.groupIds ?? []));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [mode, slug]);

  const backHref = mode === "edit" && (createdSlug || slug) ? `/painel/campanhas/${createdSlug ?? slug}` : "/painel/campanhas";
  const canAdvance = name.trim().length > 0;

  const toggle = (gid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(gid)) n.delete(gid);
      else n.add(gid);
      return n;
    });

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const groupIds = [...selected];
      if (mode === "create") {
        const res = await fetch("/api/campanhas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), groupIds }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Erro ao criar.");
        const created: Campanha = await res.json();
        // grava autoGrow (POST não aceita) num PATCH
        await fetch("/api/campanhas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: created.id, autoGrow }),
        }).catch(() => {});
        setCreatedSlug(created.slug ?? null);
        setId(created.id);
      } else {
        if (!id) throw new Error("Campanha não carregada.");
        const res = await fetch("/api/campanhas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, name: name.trim(), groupIds, autoGrow }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Erro ao salvar.");
        router.push(backHref);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
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
        <h1 className="font-display mt-6 text-2xl font-extrabold tracking-[-0.03em] text-breu">Campanha criada!</h1>
        <p className="font-editorial mt-2 text-[18px] italic text-ardosia">Seu link de captação está pronto pra divulgar.</p>
        <div className="pn-card mt-4 rounded-xl px-4 py-3">
          <CopyLink url={`${origin}/r/${createdSlug}`} />
        </div>
        <button
          onClick={() => router.push(`/painel/campanhas/${createdSlug}`)}
          className="mt-7 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
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

  const sections = [
    <Card key="cadastro">
      <Field label="Título" hint="O nome da campanha. Ex: “Saldão Mega Stock Atacado”.">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da campanha…" className={inputCls} />
      </Field>
      {mode === "edit" && (createdSlug || slug) && (
        <Field label="Link da campanha" hint="É o link que você divulga — ele enche seus grupos.">
          <div className="flex items-center rounded-xl border border-breu/10 bg-poco px-3.5 py-2.5">
            <CopyLink url={`${origin}/r/${createdSlug ?? slug}`} />
          </div>
        </Field>
      )}
      <Field label="Automatizar criação de grupos?" hint="O HubFlow cria um grupo novo automaticamente quando o atual lota (a partir de 90%).">
        <ToggleInline on={autoGrow} setOn={setAutoGrow} labelOn="Sim, criar no automático" labelOff="Não, gerencio na mão" />
      </Field>
    </Card>,

    <Card key="grupos">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-breu">Grupos da campanha</p>
        <span className="font-data text-xs uppercase tracking-[0.08em] tabular-nums text-aco/55">{selected.size} selecionados</span>
      </div>
      <p className="-mt-2 text-xs text-aco/55">Os grupos que o link vai encher. Dá pra adicionar/remover depois.</p>
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-breu/15 px-4 py-8 text-center">
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
                className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition-[border-color,background-color] duration-[160ms] ease-[var(--ease-fluxo)]", sel ? "border-iris bg-iris/[0.05]" : "border-breu/[0.08] bg-papel hover:border-iris/30")}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sel ? "bg-iris text-white" : "bg-iris/10 text-iris")}>
                  <Users className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-breu">{g.name}</p>
                  <p className="font-data text-[11px] tabular-nums text-aco/55">{g.members?.toLocaleString("pt-BR") ?? 0} membros{!g.inviteUrl ? " · sem convite" : ""}</p>
                </div>
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border transition", sel ? "border-iris bg-iris text-white" : "border-breu/20")}>
                  {sel && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>,
  ];

  return (
    <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-8">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(backHref)} aria-label="Voltar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-breu/10 bg-papel text-aco transition-colors duration-[160ms] hover:text-breu">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-breu">{mode === "edit" ? "Editar campanha" : "Nova campanha"}</h1>
      </div>

      {/* Navegação */}
      {mode === "create" ? (
        <ol className="mt-6 flex items-center">
          {SECTIONS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full font-data text-sm font-medium tabular-nums transition", i < idx ? "bg-sucesso text-white" : i === idx ? "bg-iris text-white" : "bg-poco text-aco/50")}>
                  {i < idx ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("hidden text-sm sm:inline", i === idx ? "font-medium text-breu" : "text-aco/50")}>{s}</span>
              </div>
              {i < SECTIONS.length - 1 && <span className={cn("mx-3 h-px flex-1 transition", i < idx ? "bg-sucesso/40" : "bg-breu/10")} />}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-6 flex gap-1 border-b border-breu/[0.08]">
          {SECTIONS.map((s, i) => (
            <button key={s} onClick={() => setIdx(i)} className={cn("relative px-4 py-2.5 text-sm font-medium transition-colors duration-[160ms]", i === idx ? "text-breu" : "text-aco/55 hover:text-breu")}>
              {s}
              {i === idx && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-iris" />}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 hf-enter" key={idx}>
        {sections[idx]}
      </div>

      {error && <p className="mt-4 rounded-xl bg-alerta/10 px-4 py-3 text-sm text-alerta">{error}</p>}

      <div className="mt-6 flex items-center justify-between border-t border-breu/[0.08] pt-5">
        <button
          onClick={() => (mode === "create" && idx > 0 ? setIdx(idx - 1) : router.push(backHref))}
          className="inline-flex items-center gap-2 rounded-xl border border-breu/15 bg-papel px-4 py-2.5 text-sm font-medium text-breu transition-colors duration-[160ms] hover:border-aco/30"
        >
          <ArrowLeft className="h-4 w-4" /> {mode === "create" && idx > 0 ? "Voltar" : "Cancelar"}
        </button>

        {mode === "create" && idx < SECTIONS.length - 1 ? (
          <button
            onClick={() => canAdvance && setIdx(idx + 1)}
            disabled={!canAdvance}
            className={cn("inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)]", canAdvance ? "bg-iris hover:-translate-y-0.5 hover:brightness-110" : "cursor-not-allowed bg-iris/40")}
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={save}
            disabled={saving || !canAdvance}
            className={cn("inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)]", saving || !canAdvance ? "cursor-not-allowed bg-iris/40" : "bg-iris hover:-translate-y-0.5 hover:brightness-110")}
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
  "w-full rounded-[10px] border border-breu/10 bg-poco px-3.5 py-2.5 text-sm text-breu outline-none transition-[border-color,box-shadow] duration-[160ms] ease-[var(--ease-fluxo)] placeholder:text-aco/40 focus:border-iris/50 focus:bg-papel focus:shadow-[0_0_0_3px_var(--color-iris-light)]";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="pn-card space-y-5 rounded-2xl p-6 sm:p-7">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-breu">{label}</p>
      {hint && <p className="mb-2 mt-0.5 text-xs text-aco/55">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function ToggleInline({ on, setOn, labelOn, labelOff }: { on: boolean; setOn: (v: boolean) => void; labelOn: string; labelOff: string }) {
  return (
    <button onClick={() => setOn(!on)} className="flex w-full items-center justify-between rounded-xl border border-breu/10 bg-poco px-3.5 py-2.5 text-left text-sm transition-colors duration-[160ms] hover:border-iris/30">
      <span className={cn("font-medium", on ? "text-breu" : "text-aco/70")}>{on ? labelOn : labelOff}</span>
      <span className={cn("relative h-6 w-11 rounded-full transition-colors duration-[160ms]", on ? "bg-iris" : "bg-breu/15")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-[160ms] ease-[var(--ease-fluxo)]", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}
