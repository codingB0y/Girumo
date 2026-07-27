import {
  Home,
  Megaphone,
  Users,
  Contact,
  LayoutTemplate,
  BarChart3,
  Upload,
  Plus,
  Search,
  ChevronDown,
  Pencil,
  Trash2,
  Check,
  ArrowUpRight,
  LifeBuoy,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Mockup denso do painel Girumo (tela "Grupos") — screenshot de produto codado,
 * não imagem: texto nítido, sem gibberish. Renderizado num canvas fixo de 960×600
 * e escalado pro container via container-query (.lp4-panelfit / .lp4-panelscale),
 * então encolhe proporcional como um print real em qualquer largura.
 */

const NAV = [
  { label: "Início", Icon: Home },
  { label: "Campanhas", Icon: Megaphone },
  { label: "Grupos", Icon: Users, active: true },
  { label: "Contatos", Icon: Contact },
  { label: "Páginas", Icon: LayoutTemplate },
  { label: "Resultados", Icon: BarChart3 },
];

const KPIS = [
  { label: "Grupos ativos", value: "47", delta: "8%" },
  { label: "Revendedores", value: "12.480", delta: "15%", avatars: true },
  { label: "Pedidos hoje", value: "128", delta: "20%" },
];

type Status = "Ativo" | "Lotado" | "Novo";

const ROWS: Array<{
  name: string;
  sub: string;
  status: Status;
  camp: string;
  when: string;
  fill: number;
  av: string;
  checked?: boolean;
}> = [
  { name: "VIP 01 · Atacado", sub: "1.240 membros", status: "Ativo", camp: "Grade 214", when: "há 2h", fill: 96, av: "+1,2k", checked: true },
  { name: "VIP 02 · Pronta entrega", sub: "980 membros", status: "Ativo", camp: "Grade 214", when: "há 2h", fill: 88, av: "+980", checked: true },
  { name: "VIP 03 · Outlet", sub: "1.512 membros", status: "Lotado", camp: "Grade 213", when: "ontem", fill: 100, av: "+1,5k" },
  { name: "VIP 04 · Infantil", sub: "760 membros", status: "Ativo", camp: "Grade 214", when: "há 3h", fill: 72, av: "+760" },
  { name: "VIP 05 · Plus size", sub: "540 membros", status: "Ativo", camp: "Grade 214", when: "há 3h", fill: 64, av: "+540" },
  { name: "VIP 06 · Calçados", sub: "120 membros", status: "Novo", camp: "—", when: "—", fill: 18, av: "+120" },
];

const STATUS_STYLE: Record<Status, string> = {
  Ativo: "bg-[rgba(167,255,47,0.13)] text-[var(--green)]",
  Lotado: "bg-[rgba(245,180,60,0.14)] text-[#f5b43c]",
  Novo: "bg-[rgba(108,198,255,0.14)] text-[#6cc6ff]",
};

const AV_TINT = ["from-[#A7FF2F] to-[#2C4B0A]", "from-[#6cc6ff] to-[#1c3a5e]", "from-[#f5b43c] to-[#5e3f1c]"];
const AV_INITIALS = ["MR", "CS", "AP"];

function AvatarStack({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex">
        {AV_INITIALS.map((ini, i) => (
          <span
            key={ini}
            className={`-ml-1.5 grid h-[22px] w-[22px] place-items-center rounded-full bg-gradient-to-br ${AV_TINT[i]} text-[8px] font-semibold text-[#071923] ring-2 ring-[var(--bg-2)] first:ml-0`}
          >
            {ini}
          </span>
        ))}
      </div>
      {label && <span className="text-[11px] text-[var(--body)]">{label}</span>}
    </div>
  );
}

export function PanelMock() {
  return (
    <div className="lp4-panelfit bg-[var(--bg-2)]">
      <div className="lp4-panelscale flex text-[var(--display)]">
        {/* ---------------- sidebar ---------------- */}
        <aside className="flex w-[190px] flex-col border-r border-[var(--line)] bg-[rgba(0,0,0,0.22)] px-3.5 py-4">
          <div className="flex items-center px-2 pb-5">
            <Logo className="text-[15px]" title={null} />
          </div>

          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV.map(({ label, Icon, active }) => (
              <span
                key={label}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] ${
                  active
                    ? "bg-[rgba(167,255,47,0.12)] font-semibold text-[var(--display)]"
                    : "text-[var(--body)]"
                }`}
              >
                <Icon className={`h-[15px] w-[15px] ${active ? "text-[var(--green)]" : ""}`} strokeWidth={1.9} />
                {label}
              </span>
            ))}
          </nav>

          <div className="mt-4 space-y-1 border-t border-[var(--line)] pt-3">
            <span className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-[var(--body)]">
              <LifeBuoy className="h-[15px] w-[15px]" strokeWidth={1.9} /> Suporte
            </span>
            <span className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--body)]">
              <span className="lp4-pulse h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
              WhatsApp conectado
            </span>
          </div>
        </aside>

        {/* ---------------- main ---------------- */}
        <section className="flex flex-1 flex-col px-6 py-4">
          {/* header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[20px] font-bold tracking-tight">Grupos</h3>
              <p className="mt-0.5 text-[11px] text-[var(--body)]">47 grupos · 12.480 revendedores</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-[12px] text-[var(--body)]">
                <Upload className="h-3.5 w-3.5" strokeWidth={2} /> Importar
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-[var(--green)] px-3 py-1.5 text-[12px] font-semibold text-[#071923]">
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} /> Novo grupo
              </span>
            </div>
          </div>

          {/* tabs */}
          <div className="mt-4 flex items-center gap-5 border-b border-[var(--line)] text-[12px]">
            {["Visão geral", "Ativos", "Lotados", "Arquivados"].map((t, i) => (
              <span
                key={t}
                className={`-mb-px border-b-2 pb-2.5 ${
                  i === 0
                    ? "border-[var(--green)] font-semibold text-[var(--display)]"
                    : "border-transparent text-[var(--body)]"
                }`}
              >
                {t}
              </span>
            ))}
          </div>

          {/* kpis */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {KPIS.map((k) => (
              <div key={k.label} className="rounded-xl border border-[var(--line)] bg-[rgba(242,241,234,0.02)] px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--body)]">{k.label}</span>
                  <span className="flex items-center gap-0.5 rounded-full bg-[rgba(167,255,47,0.13)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--green)]">
                    <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.4} />
                    {k.delta}
                  </span>
                </div>
                <div className="mt-1.5 flex items-end justify-between">
                  <span className="text-[24px] font-bold leading-none tracking-tight">{k.value}</span>
                  {k.avatars ? (
                    <AvatarStack label="" />
                  ) : (
                    <svg width="56" height="20" viewBox="0 0 56 20" fill="none" aria-hidden>
                      <path
                        d="M0 15 L10 12 L18 14 L26 7 L34 9 L42 4 L56 2"
                        stroke="var(--green)"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* filter row */}
          <div className="mt-4 flex items-center gap-2">
            {[
              ["Últimos 30 dias", true],
              ["VIP · +4", false],
              ["Mais filtros", true],
            ].map(([t, chev]) => (
              <span
                key={t as string}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--body)]"
              >
                {t}
                {chev && <ChevronDown className="h-3 w-3" strokeWidth={2} />}
              </span>
            ))}
            <span className="ml-auto flex w-[190px] items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] text-[var(--body)]">
              <Search className="h-3.5 w-3.5" strokeWidth={2} /> Buscar grupo
            </span>
          </div>

          {/* table */}
          <div className="mt-3 flex-1 overflow-hidden rounded-xl border border-[var(--line)]">
            {/* head */}
            <div className="grid grid-cols-[26px_1.7fr_0.9fr_1.2fr_1fr_1.1fr_44px] items-center gap-2 border-b border-[var(--line)] bg-[rgba(242,241,234,0.02)] px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--body)]">
              <span className="grid h-[15px] w-[15px] place-items-center rounded border border-[var(--hairline)]" />
              <span>Grupo</span>
              <span>Status</span>
              <span>Última campanha</span>
              <span>Membros</span>
              <span>Ocupação</span>
              <span />
            </div>
            {/* rows */}
            {ROWS.map((r) => (
              <div
                key={r.name}
                className={`grid grid-cols-[26px_1.7fr_0.9fr_1.2fr_1fr_1.1fr_44px] items-center gap-2 border-b border-[var(--line)] px-3 py-[9px] last:border-b-0 ${
                  r.checked ? "bg-[rgba(167,255,47,0.035)]" : ""
                }`}
              >
                {/* checkbox */}
                <span
                  className={`grid h-[15px] w-[15px] place-items-center rounded border ${
                    r.checked ? "border-[var(--green)] bg-[var(--green)]" : "border-[var(--hairline)]"
                  }`}
                >
                  {r.checked && <Check className="h-2.5 w-2.5 text-[#071923]" strokeWidth={3} />}
                </span>
                {/* grupo */}
                <span className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--green-deep)]">
                    <WhatsAppIcon className="h-3.5 w-3.5 text-[var(--green)]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-semibold">{r.name}</span>
                    <span className="block text-[10.5px] text-[var(--body)]">{r.sub}</span>
                  </span>
                </span>
                {/* status */}
                <span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                </span>
                {/* campanha */}
                <span className="min-w-0">
                  <span className="block truncate text-[12px]">{r.camp}</span>
                  <span className="block text-[10.5px] text-[var(--body)]">{r.when}</span>
                </span>
                {/* membros */}
                <AvatarStack label={r.av} />
                {/* ocupação */}
                <span className="flex items-center gap-2 pr-1">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(242,241,234,0.08)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${r.fill}%`,
                        background: r.fill >= 100 ? "#f5b43c" : "var(--green)",
                      }}
                    />
                  </span>
                  <span className="w-8 text-right text-[10.5px] tabular-nums text-[var(--body)]">{r.fill}%</span>
                </span>
                {/* actions */}
                <span className="flex items-center justify-end gap-1.5 text-[var(--body)]">
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.9} />
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
