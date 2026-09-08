"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { CopiarLinkVitrine } from "@/components/painel/copiar-link-vitrine";
import { iniciais } from "@/lib/painel/inicio";
import {
  cenaDoRanking,
  linkDaIndicadora,
  metaValida,
  ordenarRanking,
  podeCriarIndicadora,
  progressoDaIndicadora,
  quadrosDaIndicacao,
  resumoDoPrograma,
  textoDeCliques,
  type ConfigDoPrograma,
  type IndicadoraNaFicha,
} from "@/lib/painel/indicacao";
import type { Carga } from "@/lib/painel/types";

type Props = {
  ranking: readonly IndicadoraNaFicha[];
  config: ConfigDoPrograma;
  carga: Carga;
  /** `window.location.origin`, resolvido na página (o servidor não o tem). */
  origin: string;
  /** Falha de apagar/carregar que convive com a lista, sem sumir com ela. */
  avisoDeAcao: string | null;
  criando: boolean;
  erroDoFormulario: string | null;
  aoCriar: (dados: { nome: string; grupo: string; inviteUrl: string }) => void;
  salvandoConfig: boolean;
  configSalva: boolean;
  erroDaConfig: string | null;
  aoSalvarConfig: (dados: { reward: string; goal: number }) => void;
  apagando: string | null;
  aoApagar: (item: IndicadoraNaFicha) => void;
  aoTentarDeNovo: () => void;
};

/**
 * Indicação na Vitrine Aberta.
 *
 * A indicadora é PESSOA, então a peça dela é a ficha (`pn-ficha`), com as
 * iniciais na etiqueta quadrada — não a etiqueta de preço, que é de mercadoria.
 *
 * A métrica é **clique**, nunca "entrada": a entrada acontece dentro do
 * WhatsApp e não volta identificada. Esta área já foi 100% inerte por afirmar
 * número que ninguém media.
 */
export function IndicacaoVitrine({
  ranking,
  config,
  carga,
  origin,
  avisoDeAcao,
  criando,
  erroDoFormulario,
  aoCriar,
  salvandoConfig,
  configSalva,
  erroDaConfig,
  aoSalvarConfig,
  apagando,
  aoApagar,
  aoTentarDeNovo,
}: Props) {
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [premio, setPremio] = useState(config.reward);
  const [meta, setMeta] = useState(String(config.goal));
  const [erroDaMeta, setErroDaMeta] = useState<string | null>(null);

  // A config chega depois da primeira pintura; sem isto os campos ficariam
  // presos no fallback e "salvar" gravaria o valor errado por cima do real.
  useEffect(() => {
    setPremio(config.reward);
    setMeta(String(config.goal));
  }, [config.reward, config.goal]);

  const ordenado = useMemo(() => ordenarRanking(ranking), [ranking]);
  const quadros = useMemo(() => quadrosDaIndicacao(ranking, carga), [ranking, carga]);
  const cena = cenaDoRanking({ carga, total: ranking.length });
  const podeCriar = podeCriarIndicadora({ nome, grupo, inviteUrl }) && !criando;

  function enviarConfig(evento: React.FormEvent) {
    evento.preventDefault();
    const numero = metaValida(meta);
    if (numero === null) {
      // `Number("")` é 0, e meta 0 daria o prêmio a todo mundo na hora — a
      // validação para aqui em vez de mandar isso para a API.
      setErroDaMeta("A meta precisa ser um número de 1 a 1000.");
      return;
    }
    setErroDaMeta(null);
    aoSalvarConfig({ reward: premio.trim(), goal: numero });
  }

  function enviarIndicadora(evento: React.FormEvent) {
    evento.preventDefault();
    if (!podeCriar) return;
    aoCriar({ nome: nome.trim(), grupo: grupo.trim(), inviteUrl: inviteUrl.trim() });
    setNome("");
    setGrupo("");
    setInviteUrl("");
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Indicação</h1>
        <p className="mt-1 text-15 text-slate-600">
          Suas clientes trazem gente pro grupo e ganham recompensa.
        </p>
      </header>

      {avisoDeAcao && (
        <p className="pn-aviso rounded-[var(--radius-control)] px-4 py-3" role="alert">
          {avisoDeAcao}
        </p>
      )}

      {/* A regra do programa, em Volt: é o cartaz do balcão. */}
      <section className="rounded-[var(--radius-porta)] bg-volt-950 p-6 text-paper-0 sm:p-8">
        <p className="font-data text-12 uppercase tracking-[0.16em] text-paper-0/50">
          Programa de indicação
        </p>
        <h2 className="font-brand mt-2 text-20 font-bold sm:text-28">{resumoDoPrograma(config)}</h2>
        <p className="mt-2 max-w-2xl text-15 text-paper-0/70">
          Cadastre uma cliente e ela recebe um link só dela. Quem clicar cai direto no seu grupo, e o
          clique fica no nome de quem indicou.
        </p>

        <form onSubmit={enviarConfig} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="font-data block text-12 uppercase tracking-[0.06em] text-paper-0/50">
              Recompensa
            </span>
            <input
              value={premio}
              onChange={(e) => setPremio(e.target.value)}
              maxLength={120}
              placeholder="Frete grátis no próximo pedido"
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-paper-0/15 bg-paper-0/10 px-4 text-15 text-paper-0 outline-none placeholder:text-paper-0/40 focus:border-cobalt-500"
            />
          </label>
          <label className="sm:w-36">
            <span className="font-data block text-12 uppercase tracking-[0.06em] text-paper-0/50">
              Meta (cliques)
            </span>
            <input
              type="number"
              min={1}
              max={1000}
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              aria-invalid={erroDaMeta !== null}
              aria-describedby={erroDaMeta ? "erro-da-meta" : undefined}
              className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-paper-0/15 bg-paper-0/10 px-4 text-15 text-paper-0 outline-none focus:border-cobalt-500"
            />
          </label>
          <button
            type="submit"
            disabled={salvandoConfig}
            className="min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-15 font-semibold text-paper-0 transition-colors hover:brightness-110 disabled:opacity-60"
          >
            {salvandoConfig ? "Salvando…" : configSalva ? "Salvo" : "Salvar"}
          </button>
        </form>
        {(erroDaMeta || erroDaConfig) && (
          <p id="erro-da-meta" className="mt-2 text-13 text-paper-0" role="alert">
            {erroDaMeta ?? erroDaConfig}
          </p>
        )}
      </section>

      <section className="pn-card rounded-[var(--radius-control)] p-6">
        <h2 className="font-brand text-20 font-bold text-volt-950">Nova indicadora</h2>
        <p className="mt-1 text-13 text-slate-600">
          O link de convite é o do seu grupo no WhatsApp — é pra lá que o clique vai.
        </p>
        <form
          onSubmit={enviarIndicadora}
          className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]"
        >
          <Campo rotulo="Nome" valor={nome} aoMudar={setNome} maxLength={80} placeholder="Ana" />
          <Campo
            rotulo="Grupo"
            valor={grupo}
            aoMudar={setGrupo}
            maxLength={120}
            placeholder="Ofertas 01"
          />
          <Campo
            rotulo="Link de convite"
            valor={inviteUrl}
            aoMudar={setInviteUrl}
            maxLength={500}
            tipo="url"
            placeholder="https://chat.whatsapp.com/..."
          />
          <button
            type="submit"
            disabled={!podeCriar}
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-5 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {criando ? "Criando…" : "Criar link"}
          </button>
        </form>
        {erroDoFormulario && (
          <p className="mt-3 text-13 text-warning-700" role="alert">
            {erroDoFormulario}
          </p>
        )}
      </section>

      <div className="grid grid-cols-3 gap-3">
        {quadros.map((q) => (
          <Quadro key={q.rotulo} rotulo={q.rotulo} valor={q.valor} />
        ))}
      </div>

      {cena === "carregando" && (
        <div className="space-y-2" role="status" aria-label="Carregando as indicadoras">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pn-skeleton h-16 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
          ))}
        </div>
      )}

      {cena === "erro" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6" role="alert">
          <p className="text-15 text-volt-950">Não deu para carregar as indicações.</p>
          <p className="mt-1 text-13 text-slate-600">
            Os links já criados continuam funcionando — só esta lista não chegou.
          </p>
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {cena === "vazio" && (
        <div className="pn-card rounded-[var(--radius-control)] p-6">
          <p className="text-15 text-volt-950">Nenhuma indicadora ainda.</p>
          <p className="mt-1 text-13 text-slate-600">
            Cadastre a primeira acima. Ela recebe um link só dela, e você vê quantos cliques trouxe.
          </p>
        </div>
      )}

      {cena === "lista" && (
        <section className="pn-card rounded-[var(--radius-control)] p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-brand text-20 font-bold text-volt-950">Ranking</h2>
            <span className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">
              Por cliques no link
            </span>
          </div>
          <ul className="mt-4">
            {ordenado.map((item, posicao) => (
              <li key={item.id}>
                <Ficha
                  item={item}
                  posicao={posicao + 1}
                  goal={config.goal}
                  origin={origin}
                  apagando={apagando === item.id}
                  aoApagar={aoApagar}
                />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-13 text-slate-600">
            Contamos os cliques no link, que é o que dá para medir com certeza. A entrada no grupo
            acontece dentro do WhatsApp e não volta identificada pra cá.
          </p>
        </section>
      )}
    </div>
  );
}

function Ficha({
  item,
  posicao,
  goal,
  origin,
  apagando,
  aoApagar,
}: {
  item: IndicadoraNaFicha;
  posicao: number;
  goal: number;
  origin: string;
  apagando: boolean;
  aoApagar: (item: IndicadoraNaFicha) => void;
}) {
  const progresso = progressoDaIndicadora(item, goal);
  const link = linkDaIndicadora(origin, item.path);

  return (
    <article className="pn-ficha flex-wrap">
      <span className="pn-ficha__iniciais" aria-hidden="true">
        {iniciais(item.referrerName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="pn-ficha__nome truncate">
          <span className="font-data mr-1.5 text-slate-600">{posicao}.</span>
          {item.referrerName}
        </p>
        <p className="pn-ficha__origem truncate">{item.group}</p>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {link ? (
          <CopiarLinkVitrine
            rotulo={item.path}
            url={link}
            descricao={`Copiar o link de ${item.referrerName}`}
          />
        ) : (
          <span className="font-data text-13 text-cobalt-500">{item.path}</span>
        )}

        <span className="font-data shrink-0 text-13 tabular-nums text-volt-950">
          {textoDeCliques(item.cliques)}
        </span>

        <span className={cn("pn-chip shrink-0", progresso.atingiu ? "pn-chip--acid" : "pn-chip--line")}>
          {progresso.texto}
        </span>

        <button
          type="button"
          onClick={() => aoApagar(item)}
          disabled={apagando}
          aria-label={`Apagar indicação de ${item.referrerName}`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-slate-600 transition-colors hover:bg-canvas-100 hover:text-volt-950 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <span
        className="pn-etiqueta-preco__barra mt-2 w-full"
        style={{ ["--p" as string]: progresso.proporcao }}
        aria-hidden="true"
      />
    </article>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  maxLength,
  placeholder,
  tipo,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  maxLength: number;
  placeholder: string;
  tipo?: "url";
}) {
  return (
    <label>
      <span className="font-data block text-12 uppercase tracking-[0.06em] text-slate-600">
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        required
        type={tipo ?? "text"}
        maxLength={maxLength}
        placeholder={placeholder}
        className="mt-1.5 min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-15 text-volt-950 outline-none transition-colors placeholder:text-slate-600 focus:border-cobalt-500"
      />
    </label>
  );
}

function Quadro({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="pn-card rounded-[var(--radius-control)] p-4">
      <p className="font-data text-12 uppercase tracking-[0.06em] text-slate-600">{rotulo}</p>
      {/* Travessão, não zero: antes de a lista chegar a tela não sabe. */}
      <p
        className={cn(
          "font-data mt-2 text-28 tabular-nums",
          valor === null ? "text-slate-600" : "text-volt-950",
        )}
      >
        {valor ?? "—"}
      </p>
    </div>
  );
}
