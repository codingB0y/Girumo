"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Users,
  Lock,
  Unlock,
  RefreshCw,
  Eye,
  MousePointerClick,
  ShoppingBag,
  AlertTriangle,
  Pencil,
  RotateCw,
  UserPlus,
  QrCode,
  FileBarChart,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";

type Data = { name: string; code: string; emoji?: string; grupos: number; limite: number; membros: number; cliques: number };

const DATA: Record<string, Data> = {
  "manychat-captacao": { name: "ManyChat · Captação Grupos", code: "28966", grupos: 17, limite: 17000, membros: 6538, cliques: 9684 },
  "captacao-apenas-grupos": { name: "Captação apenas Grupos", code: "28087", grupos: 60, limite: 60000, membros: 8107, cliques: 19348 },
  "saldao-mega-stock": { name: "Saldão Mega Stock Atacado", code: "24227", emoji: "🛍️", grupos: 5, limite: 5000, membros: 4538, cliques: 56064 },
  "grupos-gerais-atual": { name: "Grupos Gerais · Atual", code: "9059", grupos: 10, limite: 10000, membros: 6547, cliques: 14210 },
};

type Grp = {
  n: string;
  membros: number;
  admins: number;
  espioes: number;
  cliques: number;
  cap: number;
  conectado: boolean;
  link: string;
};

const GROUPS: Grp[] = [
  { n: "#100", membros: 836, admins: 4, espioes: 0, cliques: 1074, cap: 1000, conectado: false, link: "chat.whatsapp.com/JFuwLRl2WgADMg3F9uT10" },
  { n: "#101", membros: 744, admins: 4, espioes: 0, cliques: 1018, cap: 1000, conectado: false, link: "chat.whatsapp.com/Jy5dVp08mkOGoODkbQApHJ" },
  { n: "#102", membros: 693, admins: 4, espioes: 0, cliques: 1002, cap: 1000, conectado: false, link: "chat.whatsapp.com/G3npKWhiWqtj2u6n8qg6DKK" },
  { n: "#103", membros: 653, admins: 4, espioes: 0, cliques: 997, cap: 1000, conectado: false, link: "chat.whatsapp.com/FMHJYVb8CNfGGKMO2nUNAr" },
  { n: "#104", membros: 648, admins: 4, espioes: 0, cliques: 978, cap: 1000, conectado: false, link: "chat.whatsapp.com/BiMXTyKHKMh1Zi3oTnQWjb" },
  { n: "#105", membros: 253, admins: 4, espioes: 0, cliques: 985, cap: 1000, conectado: true, link: "chat.whatsapp.com/JcSeLnMMWkpEKV4aIoPPW0" },
];

const ACTIONS = [
  { label: "Editar", icon: Pencil },
  { label: "Atualizar membros", icon: RotateCw },
  { label: "Leads", icon: UserPlus },
  { label: "QR Code", icon: QrCode },
  { label: "Relatórios", icon: FileBarChart },
  { label: "Revisar links dos grupos", icon: RefreshCw },
  { label: "Arquivar", icon: Archive },
];

const TABS = ["Grupos", "Visão geral", "Páginas", "Integrações", "Resultados"] as const;
type Tab = (typeof TABS)[number];

export default function CampanhaDetalhe() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const d = DATA[slug] ?? { name: slug.replace(/-/g, " "), code: "0000", grupos: GROUPS.length, limite: 6000, membros: 3827, cliques: 6054 };
  const fill = (d.membros / d.limite) * 100;
  const offline = GROUPS.filter((g) => !g.conectado).length;
  const [tab, setTab] = useState<Tab>("Grupos");
  const [menu, setMenu] = useState(false);

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
      <Link
        href="/painel/campanhas"
        className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-aco/55 transition hover:text-iris"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
      </Link>

      {/* Header da campanha */}
      <div className="rounded-3xl border border-breu/[0.08] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {d.emoji ? (
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-iris-claro to-iris-escuro text-2xl">{d.emoji}</span>
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366] text-white"><MessageCircle className="h-6 w-6" /></span>
            )}
            <div>
              <h1 className="font-display text-2xl font-extrabold capitalize tracking-[-0.03em]">{d.name}</h1>
              <CopyLink url={`meugrupo.vip/c/${d.code}`} className="mt-1" />
            </div>
          </div>
          <div className="relative flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro">
              <Plus className="h-4 w-4" /> Adicionar grupo
            </button>
            <button
              onClick={() => setMenu((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-breu/10 bg-white text-aco transition hover:text-breu"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} aria-label="Fechar" />
                <div className="hf-enter absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl border border-breu/10 bg-white py-1.5 shadow-deep">
                  {ACTIONS.map((a) => {
                    const Icon = a.icon;
                    const cls =
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-aco transition hover:bg-bruma/60 hover:text-breu";
                    if (a.label === "Editar") {
                      return (
                        <Link key={a.label} href={`/painel/campanhas/${slug}/editar`} className={cls}>
                          <Icon className="h-4 w-4 text-aco/50" /> {a.label}
                        </Link>
                      );
                    }
                    return (
                      <button key={a.label} className={cls}>
                        <Icon className="h-4 w-4 text-aco/50" /> {a.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* preenchimento + stats */}
        <div className="mt-5 grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bruma">
                <div className="h-full rounded-full" style={{ width: `${fill}%`, background: fill >= 85 ? "#D99B2A" : "#6A4BF0" }} />
              </div>
              <span className={cn("font-data text-sm font-medium tabular-nums", fill >= 85 ? "text-atencao" : "text-iris")}>
                {fill.toFixed(1).replace(".", ",")}%
              </span>
            </div>
            <p className="font-data mt-1.5 text-[11px] text-aco/50">
              {d.membros.toLocaleString("pt-BR")} / {d.limite.toLocaleString("pt-BR")} membros
            </p>
          </div>
          <HeaderStat label="Grupos" value={d.grupos.toLocaleString("pt-BR")} />
          <HeaderStat label="Membros" value={d.membros.toLocaleString("pt-BR")} />
          <HeaderStat label="Cliques" value={d.cliques.toLocaleString("pt-BR")} />
        </div>

        {/* alerta de conexão */}
        {offline > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-alerta/20 bg-alerta/[0.04] px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-alerta" />
            <p className="flex-1 text-sm text-aco">
              <strong className="text-breu">{offline} grupos</strong> com instância desconectada — leads não entram até reconectar.
            </p>
            <button className="rounded-lg bg-alerta px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
              Reconectar
            </button>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-breu/[0.08]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("relative shrink-0 px-4 py-2.5 text-sm font-medium transition", tab === t ? "text-breu" : "text-aco/55 hover:text-breu")}
          >
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-iris" />}
          </button>
        ))}
      </div>

      <div className="hf-enter" key={tab}>
        {tab === "Grupos" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map((g) => (
              <GroupCard key={g.n} g={g} />
            ))}
          </div>
        )}

        {tab === "Visão geral" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              <Tile label="Grupos" value={String(d.grupos)} />
              <Tile label="Preenchimento" value={`${fill.toFixed(0)}%`} tone={fill >= 85 ? "atencao" : "iris"} />
              <Tile label="Cliques" value={d.cliques.toLocaleString("pt-BR")} />
            </div>
            <div className="rounded-3xl border border-breu/[0.08] bg-white p-6 lg:col-span-2">
              <h2 className="font-display text-base font-bold text-breu">Como está a campanha</h2>
              <p className="mt-2 text-sm text-aco">
                Cada clique no link é distribuído automaticamente pro próximo grupo com vaga. Quando
                um grupo lota, o sistema cria o próximo — você só acompanha.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Mini label="Vaga restante" value={`${(d.limite - d.membros).toLocaleString("pt-BR")} membros`} />
                <Mini label="Conversão clique→membro" value={`${Math.round((d.membros / d.cliques) * 100)}%`} />
              </div>
            </div>
          </div>
        )}

        {tab === "Páginas" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ConfigCard title="Página de entrada" desc="O que o lead vê antes de entrar no grupo.">
              <ToggleRow label="Ignorar página de entrada" on />
              <FieldRow label="Texto do botão" value="Entrar no Grupo!" />
              <FieldRow label="Mensagem de redirecionamento" value="Por favor, aguarde 5 segundos." />
              <ToggleRow label="Deep linking (abre o WhatsApp direto)" on />
            </ConfigCard>
            <ConfigCard title="Página de espera" desc="Exibida quando a campanha está cheia ou fora do prazo.">
              <ToggleRow label="Capturar dados do cliente (lead)" on />
              <FieldRow label="URL externa (redireciona se cheio)" value="—" muted />
              <FieldRow label="Vídeo de instruções" value="—" muted />
            </ConfigCard>
          </div>
        )}

        {tab === "Integrações" && (
          <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
            <h2 className="font-display text-base font-bold text-breu">Pixels & analytics</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FieldInput label="Pixel do Facebook" placeholder="código numérico" />
              <FieldInput label="Evento do Facebook" placeholder="Page View" />
              <FieldInput label="Google Analytics (GA4)" placeholder="G-XXXXXXX" />
              <FieldInput label="Google Tag Manager" placeholder="GTM-XXXXXX" />
              <FieldInput label="Google Ads · ID" placeholder="AW-000000000" />
              <FieldInput label="Google Ads · Label" placeholder="abcd1234" />
            </div>
          </div>
        )}

        {tab === "Resultados" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Cliques" value={d.cliques.toLocaleString("pt-BR")} />
              <Tile label="Membros" value={d.membros.toLocaleString("pt-BR")} />
              <Tile label="Conversão" value={`${Math.round((d.membros / d.cliques) * 100)}%`} tone="iris" />
              <Tile label="Grupos cheios" value={`${GROUPS.filter((g) => g.membros / g.cap >= 0.9).length}`} tone="atencao" />
            </div>
            <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
              <h2 className="font-display text-base font-bold text-breu">Do clique à venda</h2>
              <div className="mt-5 space-y-3">
                {[
                  { icon: MousePointerClick, label: "Clicaram no link", value: d.cliques.toLocaleString("pt-BR"), pct: 100 },
                  { icon: Users, label: "Entraram no grupo", value: d.membros.toLocaleString("pt-BR"), pct: Math.round((d.membros / d.cliques) * 100) },
                  { icon: Eye, label: "Viram a oferta", value: Math.round(d.membros * 0.7).toLocaleString("pt-BR"), pct: 47 },
                  { icon: ShoppingBag, label: "Compraram", value: Math.round(d.membros * 0.18).toLocaleString("pt-BR"), pct: 12 },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-aco"><Icon className="h-4 w-4 text-iris" />{s.label}</span>
                        <span className="font-display text-base font-extrabold tabular-nums text-breu">{s.value}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bruma">
                        <div className="hf-gradient h-full rounded-full" style={{ width: `${Math.max(s.pct, 4)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- grupo ---------- */

function GroupCard({ g }: { g: Grp }) {
  const cap = (g.membros / g.cap) * 100;
  const quase = cap >= 80;
  return (
    <div className={cn("rounded-3xl border bg-white p-5", g.conectado ? "border-breu/[0.08]" : "border-alerta/20")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
          <div>
            <p className="font-display text-sm font-bold text-breu">Mega Stock {g.n}</p>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/45">Instância 1 · WhatsApp</p>
          </div>
        </div>
        <button className="flex h-7 w-7 items-center justify-center rounded-lg text-aco/40 transition hover:bg-bruma hover:text-breu"><MoreHorizontal className="h-4 w-4" /></button>
      </div>

      {/* status conexão */}
      <div className="mt-3 flex items-center gap-2">
        {g.conectado ? (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-sucesso">
            <Unlock className="h-3 w-3" /> Conectado · ativo
          </span>
        ) : (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-alerta/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-alerta">
            <Lock className="h-3 w-3" /> Desconectado · fechado
          </span>
        )}
      </div>

      {/* capacidade */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">Capacidade</span>
          <span className={cn("font-data text-sm font-medium tabular-nums", quase ? "text-atencao" : "text-iris")}>
            {cap.toFixed(1).replace(".", ",")}%
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-bruma">
          <div className="h-full rounded-full" style={{ width: `${cap}%`, background: quase ? "#D99B2A" : "#6A4BF0" }} />
        </div>
        <p className="font-data mt-1 text-[10px] text-aco/45">{g.membros} membros · limite {g.cap}</p>
      </div>

      <CopyLink url={g.link} className="mt-3" />

      {/* stats */}
      <div className="mt-4 grid grid-cols-4 gap-1 border-t border-breu/[0.06] pt-3 text-center">
        <GStat value={g.membros} label="membros" />
        <GStat value={g.admins} label="admins" />
        <GStat value={g.espioes} label="espiões" />
        <GStat value={g.cliques} label="cliques" />
      </div>
    </div>
  );
}

function GStat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-sm font-extrabold tabular-nums text-breu">{value}</p>
      <p className="font-data text-[9px] uppercase tracking-wider text-aco/45">{label}</p>
    </div>
  );
}

/* ---------- helpers ---------- */

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className="font-display text-xl font-extrabold tabular-nums text-breu">{value}</p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "iris" | "atencao" | "sucesso" }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white p-4">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className={cn("font-display mt-1 text-2xl font-extrabold tracking-tight", tone === "iris" ? "text-iris" : tone === "atencao" ? "text-atencao" : tone === "sucesso" ? "text-sucesso" : "text-breu")}>
        {value}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-bruma/50 px-4 py-3">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-breu">{value}</p>
    </div>
  );
}

function ConfigCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
      <h2 className="font-display text-base font-bold text-breu">{title}</h2>
      <p className="mt-0.5 text-sm text-aco/65">{desc}</p>
      <div className="mt-4 divide-y divide-breu/[0.06]">{children}</div>
    </div>
  );
}

function ToggleRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0">
      <span className="text-sm text-aco">{label}</span>
      <span className={cn("relative h-6 w-11 rounded-full transition", on ? "bg-iris" : "bg-breu/15")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", on ? "left-[22px]" : "left-0.5")} />
      </span>
    </div>
  );
}

function FieldRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
      <span className="text-sm text-aco">{label}</span>
      <span className={cn("font-data truncate text-xs", muted ? "text-aco/40" : "text-breu")}>{value}</span>
    </div>
  );
}

function FieldInput({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="font-data text-[10px] uppercase tracking-wider text-aco/55">{label}</span>
      <input
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-breu/10 bg-bruma/40 px-3.5 py-2.5 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:bg-white focus:ring-4 focus:ring-iris/10"
      />
    </label>
  );
}
