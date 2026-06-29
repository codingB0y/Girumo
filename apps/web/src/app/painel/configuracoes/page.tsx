"use client";

import { useState } from "react";
import {
  Smartphone,
  Users,
  Plug,
  CreditCard,
  User,
  Check,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Section = "Conexão" | "Equipe" | "Integrações" | "Plano" | "Conta";

const NAV: { key: Section; icon: typeof Smartphone }[] = [
  { key: "Conexão", icon: Smartphone },
  { key: "Equipe", icon: Users },
  { key: "Integrações", icon: Plug },
  { key: "Plano", icon: CreditCard },
  { key: "Conta", icon: User },
];

export default function PainelConfiguracoes() {
  const [section, setSection] = useState<Section>("Conexão");

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.03em]">Configurações</h1>
        <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/60">
          Conexão, equipe, integrações, plano e conta
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Sub-nav */}
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {NAV.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                section === key
                  ? "bg-white text-breu shadow-[0_1px_2px_rgba(11,13,26,0.06)]"
                  : "text-aco/70 hover:bg-white/60 hover:text-breu",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", section === key ? "text-iris" : "")} />
              {key}
            </button>
          ))}
        </nav>

        {/* Conteúdo */}
        <div className="min-w-0">
          {section === "Conexão" && <Conexao />}
          {section === "Equipe" && <Equipe />}
          {section === "Integrações" && <Integracoes />}
          {section === "Plano" && <Plano />}
          {section === "Conta" && <Conta />}
        </div>
      </div>
    </div>
  );
}

/* ---------- seções ---------- */

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-breu/[0.08] bg-white">
      <div className="border-b border-breu/[0.06] px-6 py-5">
        <h2 className="font-display text-lg font-bold text-breu">{title}</h2>
        {desc && <p className="mt-0.5 text-sm text-aco/65">{desc}</p>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function Conexao() {
  return (
    <Panel title="Conexão do WhatsApp" desc="O número que dispara e recebe nos seus grupos.">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sucesso/10 text-sucesso">
            <Smartphone className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-base font-bold text-breu">+55 11 9 8765-4321</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-aco/70">
              <span className="h-1.5 w-1.5 rounded-full bg-sucesso" /> Conectado · sincronizado há 2 min
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-breu/15 bg-white px-4 py-2.5 text-sm font-medium text-breu transition hover:border-iris hover:text-iris">
            <RefreshCw className="h-4 w-4" /> Reconectar
          </button>
          <button className="rounded-xl border border-alerta/30 bg-alerta/[0.04] px-4 py-2.5 text-sm font-medium text-alerta transition hover:bg-alerta/10">
            Desconectar
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Info label="Grupos sincronizados" value="24" />
        <Info label="Status do número" value="Aquecido" tone="sucesso" />
        <Info label="Limite diário" value="no ritmo seguro" />
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-bruma/60 px-4 py-3.5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-iris" />
        <p className="text-sm text-aco">
          Número mascarado e dentro da LGPD. Seus contatos são seus — se desconectar, leva tudo.
        </p>
      </div>
    </Panel>
  );
}

function Equipe() {
  const members = [
    { name: "Igor Toledo", email: "igor@modabras.com", role: "Dono", you: true },
    { name: "Ana Souza", email: "ana@modabras.com", role: "Operadora", you: false },
    { name: "Carlos Lima", email: "carlos@modabras.com", role: "Operador", you: false },
  ];
  return (
    <Panel title="Equipe" desc="Quem pode operar o painel com você.">
      <div className="divide-y divide-breu/[0.06]">
        {members.map((m) => (
          <div key={m.email} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-iris/10 font-data text-xs font-medium text-iris">
              {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-breu">
                {m.name} {m.you && <span className="font-data text-[10px] text-aco/40">· você</span>}
              </p>
              <p className="font-data truncate text-[11px] text-aco/55">{m.email}</p>
            </div>
            <span
              className={cn(
                "font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider",
                m.role === "Dono" ? "bg-iris/10 text-iris-escuro" : "bg-bruma text-aco/60",
              )}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>
      <button className="mt-5 inline-flex items-center gap-2 rounded-xl border border-dashed border-breu/20 px-4 py-2.5 text-sm font-medium text-aco transition hover:border-iris/40 hover:text-iris">
        <Plus className="h-4 w-4" /> Convidar pessoa
      </button>
    </Panel>
  );
}

function Integracoes() {
  const items = [
    { name: "Meta Ads", desc: "Kit de anúncio + custo por revendedora", status: "Conectado" as const },
    { name: "Links rastreáveis", desc: "Indicação premiada com ranking", status: "Ativo" as const },
    { name: "Webhook / API", desc: "Envie eventos pro seu sistema", status: "Configurar" as const },
  ];
  return (
    <Panel title="Integrações" desc="Conecte o HubFlow ao resto da sua operação.">
      <div className="space-y-3">
        {items.map((it) => {
          const on = it.status !== "Configurar";
          return (
            <div
              key={it.name}
              className="flex items-center gap-4 rounded-2xl border border-breu/[0.08] p-4"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-iris/10 text-iris">
                <Plug className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-breu">{it.name}</p>
                <p className="text-xs text-aco/65">{it.desc}</p>
              </div>
              <span
                className={cn(
                  "font-data inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider",
                  on ? "bg-sucesso/10 text-sucesso" : "bg-bruma text-aco/60",
                )}
              >
                {on && <Check className="h-3 w-3" />} {it.status}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Plano() {
  return (
    <Panel title="Plano e cobrança" desc="Você está no plano Growth.">
      <div className="rounded-2xl bg-breu p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-data text-[10px] uppercase tracking-[0.2em] text-iris-claro/80">
              Plano atual
            </p>
            <p className="font-display mt-2 text-2xl font-extrabold">Growth</p>
            <p className="text-sm text-bruma/55">Grupos VIP ilimitados · suporte no WhatsApp</p>
          </div>
          <p className="font-display text-2xl font-extrabold">
            R$ 297<span className="text-sm font-normal text-bruma/50">/mês</span>
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 font-data text-[11px] uppercase tracking-wider text-bruma/50">
          <span>Próxima cobrança · 12 jul</span>
          <span>Número 1 / 1</span>
          <span>Grupos ∞</span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { name: "Essencial", price: "197", active: false },
          { name: "Growth", price: "297", active: true },
          { name: "Performance Max", price: "497", active: false },
        ].map((p) => (
          <div
            key={p.name}
            className={cn(
              "rounded-2xl border p-4 text-center",
              p.active ? "border-iris/40 bg-iris/[0.05]" : "border-breu/[0.08]",
            )}
          >
            <p className="font-display text-sm font-bold text-breu">{p.name}</p>
            <p className="font-display mt-1 text-xl font-extrabold text-breu">R$ {p.price}</p>
            <button
              disabled={p.active}
              className={cn(
                "mt-3 w-full rounded-lg py-2 text-xs font-medium transition",
                p.active
                  ? "cursor-default bg-iris/10 text-iris"
                  : "border border-breu/15 text-breu hover:border-iris hover:text-iris",
              )}
            >
              {p.active ? "Plano atual" : "Mudar"}
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Conta() {
  return (
    <div className="space-y-5">
      <Panel title="Conta" desc="Seus dados de acesso.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value="Igor Toledo" />
          <Field label="Loja" value="Moda Brás" />
          <Field label="E-mail" value="igor@modabras.com" />
          <Field label="Telefone" value="+55 11 9 8765-4321" />
        </div>
        <button className="mt-5 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro">
          Salvar alterações
        </button>
      </Panel>

      <Panel title="Privacidade & LGPD">
        <div className="space-y-1">
          <Toggle label="Número mascarado nos disparos" on />
          <Toggle label="Opt-out automático para quem pede saída" on />
          <Toggle label="Receber resumo diário por e-mail" on={false} />
        </div>
      </Panel>
    </div>
  );
}

/* ---------- partes ---------- */

function Info({ label, value, tone }: { label: string; value: string; tone?: "sucesso" }) {
  return (
    <div className="rounded-2xl bg-bruma/50 px-4 py-3.5">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className={cn("mt-1 text-sm font-medium", tone === "sucesso" ? "text-sucesso" : "text-breu")}>
        {value}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">{label}</span>
      <input
        defaultValue={value}
        className="mt-1.5 w-full rounded-xl border border-breu/10 bg-bruma/40 px-3.5 py-2.5 text-sm text-breu outline-none transition focus:border-iris/40 focus:bg-white focus:ring-4 focus:ring-iris/10"
      />
    </label>
  );
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-aco">{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition",
          on ? "bg-iris" : "bg-breu/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
            on ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </div>
  );
}
