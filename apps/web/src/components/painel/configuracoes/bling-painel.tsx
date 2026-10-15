// apps/web/src/components/painel/configuracoes/bling-painel.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de site-proprio-painel.tsx).
import React from "react";

import { AlertTriangle, Clock, ExternalLink, Loader2, Lock, Pause, TrendingUp, Users } from "lucide-react";
import type { CartaoBling } from "@/lib/bling/cartao";
import { cn } from "@/lib/utils";
import { FormularioDeAjustes, ResumoDosAjustes, type AjustesParaSalvar } from "./bling-painel-ajustes";
import { ANEL, BLOCO, CARTAO, COR_DO_TOM, PRIMARIO, SECUNDARIO, TITULO } from "./bling-painel-estilo";
import { ListasDoBling } from "./bling-painel-listas";
import {
  chipDoBling,
  contagem,
  linhaDaPausa,
  linhaDeEstado,
  textoDoReconectar,
  tituloDoParado,
  type ConexaoDoCartao,
  type ListaDoCartao,
  type Ocupado,
  type Tom,
} from "./bling-painel-texto";
import { NumerosDoBling, UltimasDoBling } from "./bling-painel-vendas";

export type PropsDoBling = {
  /** Corpo de GET /api/integracoes/bling (spec 2026-10-13-integracao-bling §5). */
  cartao: CartaoBling;
  agora: Date;
  ocupado: Ocupado;
  /** Formulário de ajustes aberto embaixo do resumo. */
  ajustando: boolean;
  erroDosAjustes: string | null;
  onConectar: () => void;
  onAjustar: (aberto: boolean) => void;
  onSalvar: (ajustes: AjustesParaSalvar) => void;
  onDesconectar: () => void;
  onBaixar: (lista: ListaDoCartao) => void;
};

const FUNDO_DO_CHIP: Record<Tom, string> = {
  ok: "",
  alerta: "bg-aviso-fundo",
  erro: "bg-danger-700/10",
  neutro: "",
};

function Chip({ texto, tom }: { texto: string; tom: Tom }) {
  return (
    <span className={cn("pn-chip gap-1.5", COR_DO_TOM[tom], FUNDO_DO_CHIP[tom])}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {texto}
    </span>
  );
}

/** Uma seção só, com o mesmo nome em todo estado: é por ela que o e2e e o leitor de tela acham o Bling. */
function Cartao({ subtitulo, chip, children }: { subtitulo?: string; chip?: { texto: string; tom: Tom }; children: React.ReactNode }) {
  return (
    <section className={CARTAO} data-testid="configuracoes-bling" aria-labelledby="bling-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="bling-titulo" className="text-20 font-semibold text-volt-950">
          Bling
          {subtitulo && <span className="font-normal text-slate-600">{` · ${subtitulo}`}</span>}
        </h2>
        {chip && <Chip {...chip} />}
      </div>
      {children}
    </section>
  );
}

function BotaoConectar({ rotulo, ocupado, onConectar }: { rotulo: string; ocupado: Ocupado; onConectar: () => void }) {
  return (
    <button type="button" onClick={onConectar} disabled={ocupado !== null} className={cn(PRIMARIO, ANEL)}>
      {ocupado === "conectar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {rotulo}
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** Faltam as variáveis do Bling no servidor (spec §7): a rota nem consulta o banco. */
export function BlingIndisponivel() {
  return (
    <Cartao>
      <p className="mt-2 text-13 text-slate-600">Integração com o Bling indisponível no momento.</p>
    </Cartao>
  );
}

/** A rota falhou: dizer isso, nunca mostrar "não conectado" (seria estado inventado). */
export function BlingComErro({ onTentar }: { onTentar: () => void }) {
  return (
    <Cartao>
      <p role="alert" className="mt-2 text-13 text-danger-700">
        Não deu para carregar a integração com o Bling.
      </p>
      <button type="button" onClick={onTentar} className={cn(SECUNDARIO, ANEL, "mt-4")}>
        Tentar de novo
      </button>
    </Cartao>
  );
}

const FAIXA_DO_RETORNO: Record<Tom, string> = {
  ok: "border-success-700 bg-success-700/10",
  alerta: "border-warning-700 bg-aviso-fundo",
  erro: "border-danger-700 bg-danger-700/10",
  neutro: "border-slate-600 bg-canvas-100",
};

/** O resultado da volta do Bling (`?bling=`), uma vez. Quem anuncia é a região viva em `bling.tsx`. */
export function RetornoDoBling({ texto, tom }: { texto: string; tom: Tom }) {
  return (
    <p className={cn("rounded-[var(--radius-control)] border-l-[3px] px-4 py-3 text-[14px] text-volt-950", FAIXA_DO_RETORNO[tom])}>
      {texto}
    </p>
  );
}

const PROMESSAS = [
  { Icone: TrendingUp, texto: "Entra no Resultados e na aba Anúncios com a origem" },
  { Icone: Lock, texto: "Vai para o Meta como compra, com os dados da cliente criptografados" },
  { Icone: Users, texto: "Monta 3 listas de clientes: Alto valor, Compradores e Leads qualificados" },
] as const;

/** Mockup Main: a promessa, o que acontece e o botão. */
function NaoConectado({ ocupado, onConectar }: Pick<PropsDoBling, "ocupado" | "onConectar">) {
  return (
    <Cartao subtitulo="não conectado">
      <div className={cn(BLOCO, "max-w-[680px] space-y-4")}>
        <div>
          <h3 className={TITULO}>Vendas do Bling</h3>
          <p className="mt-1.5 text-15 text-volt-950">
            Toda venda registrada no Bling entra na Girumo na hora — com o grupo e o anúncio de onde a cliente veio.
          </p>
        </div>
        <ul className="space-y-2.5">
          {PROMESSAS.map(({ Icone, texto }) => (
            <li key={texto} className="flex items-start gap-2.5 text-[14px] text-volt-950">
              <Icone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              {texto}
            </li>
          ))}
        </ul>
        <div className="space-y-3 pt-2">
          <BotaoConectar rotulo="Conectar Bling" ocupado={ocupado} onConectar={onConectar} />
          <div className="space-y-1 text-13 text-slate-600">
            <p>
              Você entra no Bling e autoriza a Girumo a ler pedidos e contatos. Só leitura — a Girumo não altera nada no
              seu Bling.
            </p>
            <p>Ao conectar, importamos as vendas dos últimos 90 dias.</p>
          </div>
        </div>
      </div>
    </Cartao>
  );
}

type PropsDosAlertas = { c: ConexaoDoCartao; agora: Date; ocupado: Ocupado; onConectar: () => void };

/** Mockup Alertas: acesso recusado (vermelho, com Reconectar) e tempo real parado (âmbar). */
function Alertas({ c, agora, ocupado, onConectar }: PropsDosAlertas) {
  if (c.status === "reconectar") {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[var(--radius-control)] border-l-[3px] border-danger-700 bg-danger-700/10 px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-15 font-semibold text-danger-700">O Bling recusou o acesso da Girumo</p>
            <p className="mt-1 text-[14px] text-volt-950">{textoDoReconectar(c.ultima_venda_em, agora)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <BotaoConectar rotulo="Reconectar Bling" ocupado={ocupado} onConectar={onConectar} />
          <p className="text-13 text-slate-600">Leva 1 minuto. Nada do que já foi importado se perde.</p>
        </div>
      </div>
    );
  }
  if (c.tempo_real !== "parado") return null;
  return (
    <div role="status" className="pn-aviso flex items-start gap-3 rounded-[var(--radius-control)]">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning-700" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold text-warning-700">{tituloDoParado(c.ultimo_aviso_em, agora)}</p>
        <p className="mt-1">
          O Bling parou de avisar as vendas na hora. Elas continuam chegando a cada 5 minutos pela conferência
          automática.
        </p>
      </div>
    </div>
  );
}

function LinhaDeEstado({ c, agora }: { c: ConexaoDoCartao; agora: Date }) {
  const estado = linhaDeEstado(c, agora);
  const recebendo = estado.detalhe !== null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-15">
      <span className={cn("pn-ponto", recebendo ? "pn-ponto--conectado" : "bg-slate-600")} aria-hidden="true" />
      <span className={cn("font-semibold", recebendo ? "text-success-700" : "text-volt-950")}>{estado.titulo}</span>
      {estado.detalhe && <span className="font-data text-13 text-slate-600">{`· ${estado.detalhe}`}</span>}
    </p>
  );
}

/** O Bling não informa o total: a barra é indeterminada e o número é o que já foi lido. */
function Importando({ lidos }: { lidos: number }) {
  const texto = `${contagem(lidos)} pedidos lidos`;
  return (
    <div className={cn(BLOCO, "space-y-2.5")}>
      <p id="bling-importando" className="text-15 font-semibold text-volt-950">
        {"Importando os últimos 90 dias — "}
        <span className="font-data font-medium tabular-nums">{texto}</span>
      </p>
      <div role="progressbar" aria-labelledby="bling-importando" aria-valuetext={texto} className="relative h-2 overflow-hidden rounded-full bg-line-200">
        {/* `pn-sheen` (globals.css) em laço; sem movimento, a faixa inteira fica parada e o texto diz o resto. */}
        <span className="absolute inset-y-0 left-0 w-[28%] animate-[pn-sheen_1.6s_cubic-bezier(0.65,0,0.35,1)_infinite] rounded-full bg-cobalt-500 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
      </div>
      <p className="text-13 text-slate-600">
        Leva alguns minutos: o Bling deixa ler 3 pedidos por segundo. As vendas novas já entram na hora.
      </p>
    </div>
  );
}

function Conectado(p: PropsDoBling & { c: ConexaoDoCartao }) {
  const { c, cartao, agora } = p;
  const ativa = c.status === "ativa";
  const empresa = c.empresa ?? "";
  return (
    <Cartao subtitulo={ativa ? `conectado${empresa && ` a ${empresa}`}` : empresa || undefined} chip={chipDoBling(c)}>
      <div className={cn(BLOCO, "space-y-4")}>
        <Alertas c={c} agora={agora} ocupado={p.ocupado} onConectar={p.onConectar} />
        {ativa && <LinhaDeEstado c={c} agora={agora} />}
        {c.pausada_ate && (
          <p className="flex items-start gap-2 text-13 text-volt-950">
            <Pause className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            {linhaDaPausa(c.pausada_ate, agora)}
          </p>
        )}
        {c.ultimo_erro && <p className="text-13 text-danger-700">{`Último erro: ${c.ultimo_erro}`}</p>}
      </div>
      {/* Sem acesso o histórico também para: a barra andando mentiria. */}
      {ativa && cartao.historico && !cartao.historico.concluido && <Importando lidos={cartao.historico.lidos} />}
      {cartao.numeros_30d && <NumerosDoBling n={cartao.numeros_30d} />}
      <UltimasDoBling ultimas={cartao.ultimas} agora={agora} />
      {cartao.listas && (
        <ListasDoBling
          listas={cartao.listas}
          valorAlto={cartao.ajustes?.high_value ?? null}
          ocupado={p.ocupado}
          onBaixar={p.onBaixar}
        />
      )}
      {cartao.ajustes && (
        <>
          <ResumoDosAjustes ajustes={cartao.ajustes} aberto={p.ajustando} onAjustar={p.onAjustar} />
          {p.ajustando && (
            <FormularioDeAjustes
              ajustes={cartao.ajustes}
              ocupado={p.ocupado}
              erro={p.erroDosAjustes}
              onSalvar={p.onSalvar}
              onCancelar={() => p.onAjustar(false)}
              onDesconectar={p.onDesconectar}
            />
          )}
        </>
      )}
    </Cartao>
  );
}

/**
 * Configurações › Integrações › Bling (spec §6, mockup Fpbmf3pLq7F8t6BzsAhX2z). Só desenho:
 * estado e chamadas ficam em `bling.tsx`. Um estado por vez, todos a partir do GET.
 */
export function PainelDoBling(p: PropsDoBling) {
  if (!p.cartao.disponivel) return <BlingIndisponivel />;
  if (!p.cartao.conexao) return <NaoConectado ocupado={p.ocupado} onConectar={p.onConectar} />;
  return <Conectado {...p} c={p.cartao.conexao} />;
}
