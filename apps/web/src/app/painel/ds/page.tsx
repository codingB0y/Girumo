import {
  Search,
  Plus,
  ArrowRight,
  Check,
  Send,
  Users,
  TrendingUp,
  Megaphone,
  Inbox,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoSymbol } from "@/components/landing/logo";

export const metadata = { title: "Design System — HubFlow" };

const COLORS = [
  { name: "Breu", hex: "#0B0D1A", text: "text-white", role: "60% · base" },
  { name: "Breu-2", hex: "#11142A", text: "text-white", role: "superfície escura" },
  { name: "Íris", hex: "#6A4BF0", text: "text-white", role: "30% · ação" },
  { name: "Íris-claro", hex: "#8A6CFF", text: "text-white", role: "hover / realce" },
  { name: "Íris-escuro", hex: "#3D1FB0", text: "text-white", role: "fim de gradiente" },
  { name: "Bruma", hex: "#ECEBF5", text: "text-breu", role: "10% · fundo claro" },
  { name: "Aço", hex: "#3A3F5C", text: "text-white", role: "texto 2º" },
  { name: "Ardósia", hex: "#5B6172", text: "text-white", role: "texto 3º" },
];

const SEMANTIC = [
  { name: "Sucesso", hex: "#1E8E5A" },
  { name: "Atenção", hex: "#D99B2A" },
  { name: "Alerta", hex: "#D84040" },
];

const SPACING = [
  ["xs", 8],
  ["sm", 12],
  ["md", 16],
  ["lg", 24],
  ["xl", 40],
  ["2xl", 64],
] as const;

const ICONS = [Search, Plus, Send, Users, TrendingUp, Megaphone, Check, ArrowRight];

export default function PainelDS() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-12 px-4 py-8 sm:px-6">
      {/* Cabeçalho */}
      <header>
        <div className="flex items-center gap-3">
          <LogoSymbol className="h-8 w-8 text-iris" />
          <span className="font-data rounded-full bg-bruma px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-aco/60">
            Design System
          </span>
        </div>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.035em]">
          Direção B · Corrente
        </h1>
        <p className="mt-2 max-w-xl text-aco">
          As peças que montam o painel HubFlow. Regra 60/30/10 (Breu/Íris/Bruma), verde só pra
          sucesso, Íris só pra ação.
        </p>
      </header>

      {/* Cores */}
      <Section n="01" title="Cores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLORS.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-2xl border border-breu/[0.08]">
              <div
                className={cn("flex h-24 items-end p-3", c.text)}
                style={{ background: c.hex }}
              >
                <span className="font-data text-[10px] uppercase tracking-wider opacity-70">
                  {c.role}
                </span>
              </div>
              <div className="bg-white px-3 py-2">
                <p className="text-sm font-medium text-breu">{c.name}</p>
                <p className="font-data text-[11px] text-aco/55">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {SEMANTIC.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-2xl border border-breu/[0.08] bg-white p-3">
              <span className="h-9 w-9 shrink-0 rounded-xl" style={{ background: c.hex }} />
              <div>
                <p className="text-sm font-medium text-breu">{c.name}</p>
                <p className="font-data text-[11px] text-aco/55">{c.hex}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="hf-gradient mt-3 flex h-16 items-center justify-center rounded-2xl text-white">
          <span className="font-data text-xs uppercase tracking-[0.2em]">Gradiente da marca</span>
        </div>
      </Section>

      {/* Tipografia */}
      <Section n="02" title="Tipografia">
        <div className="space-y-5 rounded-2xl border border-breu/[0.08] bg-white p-6">
          <TypeRow font="font-display" role="Bricolage · display" sample="Do caos ao canal" cls="text-4xl font-extrabold tracking-[-0.03em]" />
          <TypeRow font="font-body" role="IBM Plex Sans · corpo" sample="Texto de interface, claro e legível pro lojista." cls="text-base" />
          <TypeRow font="font-data" role="IBM Plex Mono · dados" sample="R$ 84.240 · 38% · +12 GRUPOS" cls="text-sm uppercase tracking-wider" />
          <TypeRow font="font-editorial italic" role="Instrument Serif · respiro" sample="Menos correria. Mais vendas." cls="text-2xl" />
        </div>
      </Section>

      {/* Botões */}
      <Section n="03" title="Botões">
        <div className="space-y-4 rounded-2xl border border-breu/[0.08] bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro">
              Primário <ArrowRight className="h-4 w-4" />
            </button>
            <button className="rounded-xl bg-breu px-5 py-2.5 text-sm font-medium text-white transition hover:bg-breu-2">
              Secundário
            </button>
            <button className="rounded-xl border border-breu/15 px-5 py-2.5 text-sm font-medium text-breu transition hover:border-iris hover:text-iris">
              Contorno
            </button>
            <button className="rounded-xl px-5 py-2.5 text-sm font-medium text-aco transition hover:bg-bruma">
              Fantasma
            </button>
            <button disabled className="cursor-not-allowed rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white opacity-40">
              Desabilitado
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-breu/[0.06] pt-4">
            <button className="rounded-lg bg-iris px-3 py-1.5 text-xs font-medium text-white">Pequeno</button>
            <button className="rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white">Médio</button>
            <button className="rounded-xl bg-iris px-7 py-3.5 text-base font-medium text-white">Grande</button>
          </div>
        </div>
      </Section>

      {/* Inputs */}
      <Section n="04" title="Inputs & Forms">
        <div className="grid gap-4 rounded-2xl border border-breu/[0.08] bg-white p-6 sm:grid-cols-2">
          <label className="block">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">Texto</span>
            <input
              placeholder="Nome do grupo…"
              className="mt-1.5 w-full rounded-xl border border-breu/10 bg-bruma/40 px-3.5 py-2.5 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:bg-white focus:ring-4 focus:ring-iris/10"
            />
          </label>
          <label className="block">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">Busca</span>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/40" />
              <input
                placeholder="Buscar…"
                className="w-full rounded-xl border border-breu/10 bg-bruma/40 py-2.5 pl-9 pr-3 text-sm text-breu outline-none transition focus:border-iris/40 focus:bg-white focus:ring-4 focus:ring-iris/10"
              />
            </div>
          </label>
          <label className="block sm:col-span-2">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">Área de texto</span>
            <textarea
              rows={2}
              placeholder="Mensagem da campanha…"
              className="mt-1.5 w-full rounded-xl border border-breu/10 bg-bruma/40 px-3.5 py-2.5 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:bg-white focus:ring-4 focus:ring-iris/10"
            />
          </label>
          <div className="flex items-center justify-between rounded-xl bg-bruma/40 px-3.5 py-2.5">
            <span className="text-sm text-aco">Toggle (ativo)</span>
            <span className="relative h-6 w-11 rounded-full bg-iris">
              <span className="absolute left-[22px] top-0.5 h-5 w-5 rounded-full bg-white shadow" />
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-bruma/40 px-3.5 py-2.5">
            <span className="text-sm text-aco">Toggle (inativo)</span>
            <span className="relative h-6 w-11 rounded-full bg-breu/15">
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
            </span>
          </div>
        </div>
      </Section>

      {/* Badges + Tabs */}
      <Section n="05" title="Badges & Tabs">
        <div className="space-y-5 rounded-2xl border border-breu/[0.08] bg-white p-6">
          <div className="flex flex-wrap gap-2">
            <Pill cls="bg-sucesso/10 text-sucesso">Ativo</Pill>
            <Pill cls="bg-iris/10 text-iris-escuro">Lotado</Pill>
            <Pill cls="bg-iris/[0.07] text-iris">Campanha</Pill>
            <Pill cls="bg-atencao/10 text-atencao">Atenção</Pill>
            <Pill cls="bg-alerta/10 text-alerta">Parado</Pill>
            <Pill cls="bg-bruma text-aco/60">Neutro</Pill>
          </div>
          <div className="flex w-fit gap-1 rounded-xl border border-breu/10 bg-bruma/40 p-1">
            <span className="rounded-lg bg-breu px-4 py-1.5 text-sm font-medium text-white">Ativo</span>
            <span className="rounded-lg px-4 py-1.5 text-sm font-medium text-aco/70">Inativo</span>
            <span className="rounded-lg px-4 py-1.5 text-sm font-medium text-aco/70">Inativo</span>
          </div>
        </div>
      </Section>

      {/* Cards + dual surface */}
      <Section n="06" title="Cards & Superfícies (light / dark)">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* light */}
          <div className="rounded-2xl border border-breu/[0.08] bg-white p-5">
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">Superfície clara · Bruma</p>
            <p className="font-display mt-2 text-2xl font-extrabold text-breu">R$ 84k</p>
            <p className="font-data mt-1 text-[11px] text-sucesso">+31% na semana</p>
          </div>
          {/* dark */}
          <div className="rounded-2xl bg-breu p-5 text-white">
            <p className="font-data text-[10px] uppercase tracking-wider text-bruma/40">Superfície escura · Breu</p>
            <p className="font-display mt-2 text-2xl font-extrabold">R$ 84k</p>
            <p className="font-data mt-1 text-[11px] text-[#5ED9A0]">+31% na semana</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-aco/60">
          O sistema é nativamente dual: Breu para enquadrar/destacar, Bruma para o trabalho. Não há
          um &ldquo;modo escuro&rdquo; separado — as duas superfícies convivem na mesma tela.
        </p>
      </Section>

      {/* Estados */}
      <Section n="07" title="Estados">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* loading skeleton */}
          <div className="rounded-2xl border border-breu/[0.08] bg-white p-5">
            <p className="font-data mb-3 text-[10px] uppercase tracking-wider text-aco/50">Carregando</p>
            <div className="space-y-2.5">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-bruma" />
              <div className="h-8 w-2/3 animate-pulse rounded-lg bg-bruma" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-bruma" />
            </div>
            <div className="mt-4 inline-flex items-center gap-2 text-xs text-aco/60">
              <Loader2 className="h-4 w-4 animate-spin text-iris" /> Sincronizando…
            </div>
          </div>
          {/* empty */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-breu/[0.08] bg-white p-5 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bruma text-aco/50">
              <Inbox className="h-6 w-6" />
            </span>
            <p className="font-display mt-3 text-sm font-bold text-breu">Nada por aqui ainda</p>
            <p className="mt-1 text-xs text-aco/60">Crie sua primeira campanha pra começar.</p>
            <button className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-iris px-3 py-1.5 text-xs font-medium text-white">
              <Plus className="h-3.5 w-3.5" /> Nova campanha
            </button>
          </div>
          {/* erro */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-alerta/20 bg-alerta/[0.04] p-5 text-center">
            <span className="font-display text-2xl font-extrabold text-alerta">!</span>
            <p className="font-display mt-2 text-sm font-bold text-breu">Número desconectou</p>
            <p className="mt-1 text-xs text-aco/60">Reconecte pra retomar os disparos.</p>
            <button className="mt-3 rounded-lg border border-alerta/30 px-3 py-1.5 text-xs font-medium text-alerta transition hover:bg-alerta/10">
              Reconectar
            </button>
          </div>
        </div>
      </Section>

      {/* Espaçamento + ícones */}
      <Section n="08" title="Espaçamento & Ícones">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-breu/[0.08] bg-white p-6">
            <p className="font-data mb-4 text-[10px] uppercase tracking-wider text-aco/50">Escala (px)</p>
            <div className="space-y-2.5">
              {SPACING.map(([name, px]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="font-data w-8 text-[11px] text-aco/55">{name}</span>
                  <span className="h-3 rounded bg-iris" style={{ width: px }} />
                  <span className="font-data text-[11px] text-aco/40">{px}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-breu/[0.08] bg-white p-6">
            <p className="font-data mb-4 text-[10px] uppercase tracking-wider text-aco/50">Ícones · lucide (monoline)</p>
            <div className="flex flex-wrap gap-3">
              {ICONS.map((Icon, i) => (
                <span key={i} className="flex h-11 w-11 items-center justify-center rounded-xl bg-bruma text-breu">
                  <Icon className="h-5 w-5" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* ---------- partes ---------- */

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <span className="font-data text-sm tabular-nums text-iris">{n}</span>
        <h2 className="font-display text-xl font-bold text-breu">{title}</h2>
        <span className="h-px flex-1 bg-breu/[0.08]" />
      </div>
      {children}
    </section>
  );
}

function TypeRow({ font, role, sample, cls }: { font: string; role: string; sample: string; cls: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-breu/[0.06] pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <p className={cn("min-w-0 text-breu", font, cls)}>{sample}</p>
      <span className="font-data shrink-0 text-[10px] uppercase tracking-wider text-aco/45">{role}</span>
    </div>
  );
}

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={cn("font-data rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider", cls)}>
      {children}
    </span>
  );
}
