"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { GroupSettings } from "@/components/painel/grupos/group-settings";
import { useCarimboEvento } from "@/lib/painel/use-carimbo-evento";
import {
  conferidoHa,
  contagensDosFiltros,
  estadoDoGrupo,
  lotacao,
  maisCheioPrimeiro,
  numero,
  prestesALotar,
  romaneio,
  type EstadoDoGrupo,
} from "@/lib/painel/grupos";
import type { Group } from "@/lib/mock-data";

type Filtro = "todos" | "ativos" | "cheios" | "sem_convite";

type Props = {
  grupos: readonly Group[];
  carregando: boolean;
  sincronizando: boolean;
  erroDoSync: string | null;
  avisoDoSync: { texto: string; alerta: boolean } | null;
  onSincronizar: () => void;
  onRecarregar: () => void | Promise<void>;
  acoesEmMassa?: React.ReactNode;
};

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "cheios", rotulo: "Cheios" },
  { valor: "sem_convite", rotulo: "Sem convite" },
];

/** A prateleira é o retrato do estoque; a lista é o balcão. Spec 12.5. */
export function GruposVitrine({
  grupos,
  carregando,
  sincronizando,
  erroDoSync,
  avisoDoSync,
  onSincronizar,
  onRecarregar,
  acoesEmMassa,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);

  const agora = new Date();
  const total = romaneio(grupos);
  const contagens = contagensDosFiltros(total);
  const aviso = prestesALotar(grupos);

  const ordenados = useMemo(() => maisCheioPrimeiro(grupos), [grupos]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ordenados.filter((g) => {
      const estado = estadoDoGrupo(g);
      const passaNoFiltro =
        filtro === "todos" ||
        (filtro === "cheios" && estado === "cheio") ||
        (filtro === "sem_convite" && estado === "sem_convite") ||
        (filtro === "ativos" && (estado === "ativo" || estado === "quase"));
      return passaNoFiltro && (termo === "" || g.name.toLowerCase().includes(termo));
    });
  }, [ordenados, filtro, busca]);

  // Sem memo: preso a [grupos], o `agora` capturado congelava e o cabeçalho
  // ficava em "há 1 min" enquanto as fichas já diziam "há 11 min".
  const carimbos = grupos.map((g) => g.syncedAt).filter((v): v is string => !!v);
  // O total só é tão fresco quanto o grupo consultado há mais tempo.
  const conferido = carimbos.length > 0 ? conferidoHa(carimbos.reduce((a, b) => (a < b ? a : b)), agora) : "";

  if (carregando) {
    return (
      <div className="space-y-6 px-4 py-5 lg:px-8 lg:py-8" role="status" aria-label="Carregando os grupos">
        <div className="pn-skeleton h-24 rounded-xl" data-testid="painel-skeleton" />
        <div className="pn-skeleton h-72 rounded-xl" data-testid="painel-skeleton" />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-5 lg:px-8 lg:py-8">
      <Cabecalho
        grupos={total.grupos}
        conferido={conferido}
        sincronizando={sincronizando}
        erroDoSync={erroDoSync}
        avisoDoSync={avisoDoSync}
        onSincronizar={onSincronizar}
        acoesEmMassa={acoesEmMassa}
      />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        {/* Bloco 2: a prateleira */}
        <section className="pn-card rounded-[var(--radius-control)] p-5 lg:col-span-8 lg:p-6">
          <Prateleira grupos={ordenados} />
          <div className="font-data mt-4 flex flex-wrap items-center gap-4 text-12 text-slate-600">
            <Legenda className="bg-volt-800" texto="gente" />
            <Legenda className="bg-volt-950" texto="lotou" />
            <Legenda className="border border-warning-700 bg-aviso-fundo" texto="quase" />
          </div>
        </section>

        {/* Bloco 3: o romaneio */}
        <section className="lg:col-span-4" data-testid="grupos-romaneio">
          <p className="font-data text-[40px] font-medium leading-none tabular-nums text-volt-950">
            {numero(total.pessoas)}
          </p>
          <p className="mt-1 text-[14px] text-slate-600">
            pessoas nos {total.grupos} {total.grupos === 1 ? "grupo" : "grupos"}
          </p>
          <p className="font-data mt-4 text-20 tabular-nums text-volt-950">
            {numero(total.vagas)} vagas livres
          </p>
          <p className="font-data mt-1 text-13 tabular-nums text-slate-600">
            {total.lotados} {total.lotados === 1 ? "lotou" : "lotaram"} · {total.semConvite} sem convite ·{" "}
            {total.ativos} {total.ativos === 1 ? "ativo" : "ativos"}
          </p>

          {aviso && (
            <div className="pn-aviso mt-6">
              <p className="text-[14px] text-volt-950">
                <strong className="font-semibold">{aviso.grupo.name}</strong> ·{" "}
                <span className="font-data tabular-nums">
                  {numero(aviso.grupo.members)} / {numero(aviso.grupo.capacity)}
                </span>
                . {aviso.faltam === 1 ? "Falta 1 vaga." : `Faltam ${aviso.faltam}.`}
              </p>
              <Link
                href="/painel/campanhas"
                className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-[14px] font-semibold text-paper-0"
              >
                Abrir a campanha que lota sozinha
              </Link>
            </div>
          )}
        </section>
      </div>

      <Filtros contagens={contagens} filtro={filtro} onFiltro={setFiltro} busca={busca} onBusca={setBusca} />

      {/* Bloco 5: a lista */}
      <section data-testid="grupos-lista">
        {visiveis.length === 0 ? (
          <p className="py-10 text-center text-[14px] text-slate-600">
            {grupos.length === 0
              ? "Nenhum grupo ainda. Sincronize para trazer os grupos que você administra."
              : "Nenhum grupo com esse filtro."}
          </p>
        ) : (
          <ul>
            {visiveis.map((g, index) => (
              <li
                key={g.id}
                className={index < 8 ? "pn-entrada-lista" : undefined}
                style={index < 8 ? { ["--i" as string]: index } : undefined}
              >
                <FichaDoGrupo
                  grupo={g}
                  agora={agora}
                  editando={editando === g.whatsappGroupId}
                  onEditar={() => setEditando(editando === g.whatsappGroupId ? null : g.whatsappGroupId)}
                  onFechar={() => setEditando(null)}
                  onSalvo={onRecarregar}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Bloco 1 da spec 12.5: o que a tela é e o que dá pra fazer com ela. */
function Cabecalho({
  grupos,
  conferido,
  sincronizando,
  erroDoSync,
  avisoDoSync,
  onSincronizar,
  acoesEmMassa,
}: {
  grupos: number;
  conferido: string;
  sincronizando: boolean;
  erroDoSync: string | null;
  avisoDoSync: { texto: string; alerta: boolean } | null;
  onSincronizar: () => void;
  acoesEmMassa?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3" data-testid="grupos-cabecalho">
      <div>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Grupos</h1>
        <p className="mt-1 text-[14px] text-slate-600">
          {grupos} {grupos === 1 ? "grupo" : "grupos"} do seu número.{" "}
          {conferido
            ? `Contagem conferida ${conferido} pelo próprio WhatsApp.`
            : "Sincronize para conferir a contagem no WhatsApp."}
        </p>
        {erroDoSync && (
          <p role="alert" className="mt-2 text-13 text-danger-700">
            {erroDoSync}
          </p>
        )}
        {avisoDoSync && (
          <p className={cn("mt-2 text-13", avisoDoSync.alerta ? "text-danger-700" : "text-slate-600")}>
            {avisoDoSync.texto}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSincronizar}
          disabled={sincronizando}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-volt-950 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", sincronizando && "animate-spin")} aria-hidden="true" />
          {sincronizando ? "Sincronizando…" : "Sincronizar"}
        </button>
        {acoesEmMassa}
      </div>
    </header>
  );
}

/** Bloco 4 da spec 12.5: recortar a lista sem sair da tela. */
function Filtros({
  contagens,
  filtro,
  onFiltro,
  busca,
  onBusca,
}: {
  contagens: { todos: number; ativos: number; cheios: number; semConvite: number };
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  busca: string;
  onBusca: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar grupos">
        {FILTROS.map((f) => {
          const quantos =
            f.valor === "todos"
              ? contagens.todos
              : f.valor === "ativos"
                ? contagens.ativos
                : f.valor === "cheios"
                  ? contagens.cheios
                  : contagens.semConvite;
          const ativo = filtro === f.valor;
          return (
            <button
              key={f.valor}
              type="button"
              onClick={() => onFiltro(f.valor)}
              aria-pressed={ativo}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[14px]",
                ativo ? "bg-volt-950 text-paper-0" : "bg-paper-0 text-volt-950 hover:bg-canvas-100",
              )}
            >
              {f.rotulo}
              <span className="font-data tabular-nums opacity-70">{quantos}</span>
            </button>
          );
        })}
      </div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="grupos-busca">
          Buscar grupo
        </label>
        <input
          id="grupos-busca"
          data-testid="grupos-busca"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar grupo"
          className="h-10 w-[280px] max-w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 pl-9 pr-3 text-[16px] text-volt-950 placeholder:text-slate-600"
        />
      </div>
    </div>
  );
}

function Legenda({ className, texto }: { className: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-3 rounded-[var(--radius-chip)]", className)} aria-hidden="true" />
      {texto}
    </span>
  );
}

/** 13 colunas por 7 linhas: o estoque inteiro numa olhada só. */
function Prateleira({ grupos }: { grupos: readonly Group[] }) {
  return (
    <div className="pn-prateleira" data-testid="grupos-prateleira" aria-hidden="true">
      {grupos.map((g) => {
        const estado = estadoDoGrupo(g);
        return (
          <span
            key={g.id}
            className={cn(
              "pn-prateleira__caixa",
              estado === "cheio" && "pn-prateleira__caixa--cheia",
              estado === "quase" && "pn-prateleira__caixa--quase",
            )}
            style={{ ["--lotacao" as string]: lotacao(g.members, g.capacity) }}
            title={`${g.name} · ${numero(g.members)} / ${numero(g.capacity)}`}
          />
        );
      })}
    </div>
  );
}

const CHIP: Record<EstadoDoGrupo, { texto: string; classe: string }> = {
  cheio: { texto: "LOTOU", classe: "bg-acid-500 text-volt-950" },
  quase: { texto: "QUASE", classe: "bg-aviso-fundo text-volt-950" },
  ativo: { texto: "ATIVO", classe: "bg-canvas-100 text-volt-950" },
  sem_convite: { texto: "SEM CONVITE", classe: "bg-canvas-100 text-slate-600" },
};

function FichaDoGrupo({
  grupo,
  agora,
  editando,
  onEditar,
  onFechar,
  onSalvo,
}: {
  grupo: Group;
  agora: Date;
  editando: boolean;
  onEditar: () => void;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
}) {
  const estado = estadoDoGrupo(grupo);
  const chip = CHIP[estado];
  const acabouDeLotar = useCarimboEvento(estado === "cheio") && estado === "cheio";
  const ocupacao = lotacao(grupo.members, grupo.capacity);
  const conferido = conferidoHa(grupo.syncedAt, agora);

  return (
    <div className="border-b border-line-200">
      <div className="flex flex-wrap items-center gap-3 py-3 lg:h-16 lg:flex-nowrap lg:py-0">
        <div className="min-w-0 flex-1 lg:w-[320px] lg:flex-none">
          <p className="truncate text-15 font-semibold text-volt-950">{grupo.name}</p>
          <p className="font-data mt-0.5 flex flex-wrap items-center gap-2 text-12 text-slate-600">
            {conferido ? `conferido ${conferido}` : "nunca conferido"}
            {grupo.isAdmin === false && (
              <span className="rounded-[var(--radius-chip)] bg-canvas-100 px-1.5 py-0.5">não admin</span>
            )}
          </p>
        </div>

        <div className="hidden flex-1 lg:block">
          <div className="pn-lotacao">
            <span
              className={cn("pn-lotacao__cheio", ocupacao >= 0.95 && "pn-lotacao__cheio--ponta")}
              style={{ width: `${Math.round(ocupacao * 100)}%` }}
            />
          </div>
        </div>

        <p className="font-data w-[120px] shrink-0 text-right text-15 tabular-nums text-volt-950">
          {numero(grupo.members)} / {numero(grupo.capacity)}
        </p>

        <span
          className={
            acabouDeLotar
              ? "pn-carimbo-evento"
              : cn(
                  "font-data inline-flex h-6 shrink-0 items-center rounded-[var(--radius-chip)] px-2 text-12",
                  chip.classe,
                )
          }
        >
          {chip.texto}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          <CopiarConvite url={grupo.inviteUrl} />
          <button
            type="button"
            onClick={onEditar}
            aria-expanded={editando}
            className="h-9 rounded-[var(--radius-control)] px-2 text-13 font-semibold text-cobalt-500"
          >
            {editando ? "Fechar" : "Configurar"}
          </button>
        </div>
      </div>

      {editando && (
        <div className="pb-4">
          <GroupSettings
            groupId={grupo.whatsappGroupId}
            inviteUrl={grupo.inviteUrl}
            capacity={grupo.capacity}
            onSaved={onSalvo}
            onClose={onFechar}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Copia o convite sem mostrar a URL (spec 12.5): o link do grupo na tela é
 * convite aberto para quem estiver olhando por cima do ombro.
 */
function CopiarConvite({ url }: { url?: string }) {
  const [copiado, setCopiado] = useState(false);

  if (!url) {
    return <span className="font-data text-12 text-slate-600">sem convite</span>;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url!.startsWith("http") ? url! : `https://${url}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem clipboard (contexto inseguro, permissão negada) o botão não finge que copiou.
      setCopiado(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="h-9 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 text-volt-950"
    >
      {copiado ? "Copiado" : "Copiar convite"}
      {/* O botão troca de texto, mas leitor de tela não reanuncia rótulo de botão focado. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copiado ? "Convite copiado" : ""}
      </span>
    </button>
  );
}
