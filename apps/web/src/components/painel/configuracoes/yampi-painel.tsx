// apps/web/src/components/painel/configuracoes/yampi-painel.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de bling-painel.tsx).
import React, { useState } from "react";

import { AlertTriangle, Loader2 } from "lucide-react";
import type { CartaoYampi } from "@/lib/yampi/cartao";
import { cn } from "@/lib/utils";
import { ANEL, AJUDA, BLOCO, CAMPO, CARTAO, COR_DO_TOM, PRIMARIO, SECUNDARIO } from "./bling-painel-estilo";
import type { Tom } from "./bling-painel-texto";
import { haQuanto } from "./site-proprio-painel";
import { chipDaYampi } from "./yampi-painel-texto";

export type OcupadoDaYampi = "conectar" | "testar" | "desconectar" | null;
export type CredenciaisDaYampi = { alias: string; user_token: string; user_secret_key: string };

export type PropsDaYampi = {
  /** Corpo de GET /api/integracoes/yampi. */
  cartao: CartaoYampi;
  agora: Date;
  ocupado: OcupadoDaYampi;
  erroDoFormulario: string | null;
  onConectar: (c: CredenciaisDaYampi) => void;
  onTestar: () => void;
  onDesconectar: () => void;
  /** Blocos de cada módulo (Rastreio, Recuperar); só aparecem com conexão. */
  children?: React.ReactNode;
};

type ConexaoDaYampi = NonNullable<CartaoYampi["conexao"]>;

const FUNDO_DO_CHIP: Record<Tom, string> = { ok: "", alerta: "bg-aviso-fundo", erro: "bg-danger-700/10", neutro: "" };

function Chip({ texto, tom }: { texto: string; tom: Tom }) {
  return (
    <span className={cn("pn-chip gap-1.5", COR_DO_TOM[tom], FUNDO_DO_CHIP[tom])}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {texto}
    </span>
  );
}

/** Uma seção só, com o mesmo nome em todo estado: é por ela que o e2e e o leitor de tela acham a Yampi. */
function Cartao({ subtitulo, chip, children }: { subtitulo?: string; chip?: { texto: string; tom: Tom }; children: React.ReactNode }) {
  return (
    <section className={CARTAO} data-testid="configuracoes-yampi" aria-labelledby="yampi-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="yampi-titulo" className="text-20 font-semibold text-volt-950">
          Yampi
          {subtitulo && <span className="font-normal text-slate-600">{` · ${subtitulo}`}</span>}
        </h2>
        {chip && <Chip {...chip} />}
      </div>
      {children}
    </section>
  );
}

const Carregando = () => <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

/** Os segredos fora do vocabulário de senha: o gerenciador não preenche e o autofill não cola e-mail. */
const SEGREDO = { type: "password", autoComplete: "new-password", "data-1p-ignore": true, "data-lpignore": "true", spellCheck: false } as const;

/** O que está nos campos agora, aparado. */
function lerCampos(form: HTMLFormElement): CredenciaisDaYampi {
  const d = new FormData(form);
  const valor = (nome: string) => String(d.get(nome) ?? "").trim();
  return { alias: valor("yampi-loja"), user_token: valor("yampi-campo-1"), user_secret_key: valor("yampi-campo-2") };
}
const completas = (c: CredenciaisDaYampi) => c.alias !== "" && c.user_token !== "" && c.user_secret_key !== "";

/**
 * Campos não controlados: um input controlado escreve o valor no atributo `value` do DOM (o React sincroniza o
 * `defaultValue`), e o token ficaria legível por seletor de atributo, extensão ou cópia do HTML. O estado guarda
 * só se os três estão preenchidos; os valores são lidos do formulário no envio.
 */
function Formulario({ aliasInicial, rotulo, p }: { aliasInicial: string; rotulo: string; p: PropsDaYampi }) {
  const [completo, setCompleto] = useState(false);
  return (
    <form
      className="mt-4 max-w-[480px] space-y-4"
      onInput={(e) => setCompleto(completas(lerCampos(e.currentTarget)))}
      onSubmit={(e) => {
        e.preventDefault();
        const campos = lerCampos(e.currentTarget);
        if (completas(campos)) p.onConectar(campos);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="yampi-alias" className="text-13 font-semibold text-volt-950">Loja (alias na Yampi)</label>
        <input id="yampi-alias" name="yampi-loja" autoComplete="off" spellCheck={false} defaultValue={aliasInicial} className={cn(CAMPO, ANEL)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="yampi-token" className="text-13 font-semibold text-volt-950">User-Token</label>
        <input id="yampi-token" name="yampi-campo-1" {...SEGREDO} className={cn(CAMPO, ANEL)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="yampi-chave" className="text-13 font-semibold text-volt-950">User-Secret-Key</label>
        <input id="yampi-chave" name="yampi-campo-2" {...SEGREDO} className={cn(CAMPO, ANEL)} />
      </div>
      <div className="space-y-1">
        <p className={AJUDA}>Copie em Perfil › Credenciais de API, na Yampi.</p>
        <p className={AJUDA}>Se você trocar a senha da Yampi, o token muda e a conexão cai: é só colar de novo aqui.</p>
      </div>
      {p.erroDoFormulario && (
        <p role="alert" className="text-13 text-danger-700">{p.erroDoFormulario}</p>
      )}
      <button type="submit" disabled={!completo || p.ocupado !== null} className={cn(PRIMARIO, ANEL)}>
        {p.ocupado === "conectar" && <Carregando />}
        {rotulo}
      </button>
    </form>
  );
}

function BotaoDesconectar({ p }: { p: PropsDaYampi }) {
  return (
    <button type="button" onClick={p.onDesconectar} disabled={p.ocupado !== null} className={cn(SECUNDARIO, ANEL)}>
      {p.ocupado === "desconectar" && <Carregando />}
      Desconectar
    </button>
  );
}

function Conectada({ c, p }: { c: ConexaoDaYampi; p: PropsDaYampi }) {
  return (
    <>
      <ul className={cn(BLOCO, "space-y-1 text-[14px] text-volt-950")}>
        <li>{c.token_final ? `Token ••••${c.token_final}` : "Token salvo"}</li>
        <li>{`Último aviso: ${c.ultimo_aviso_em ? haQuanto(c.ultimo_aviso_em, p.agora) : "ainda nenhum"}`}</li>
        <li>{`Última conferência: ${c.ultima_conferencia_em ? haQuanto(c.ultima_conferencia_em, p.agora) : "ainda não"}`}</li>
      </ul>
      {c.status === "aviso_desativado" && (
        <p role="status" className="mt-4 flex gap-2 text-13 text-warning-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          A Yampi parou de avisar a Girumo. Tentamos religar sozinhos a cada hora; use Testar conexão para tentar agora.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={p.onTestar} disabled={p.ocupado !== null} className={cn(PRIMARIO, ANEL)}>
          {p.ocupado === "testar" && <Carregando />}
          Testar conexão
        </button>
        <BotaoDesconectar p={p} />
      </div>
    </>
  );
}

function AcessoRecusado({ c, p }: { c: ConexaoDaYampi; p: PropsDaYampi }) {
  return (
    <div className={BLOCO}>
      <div role="alert" className="text-13 text-danger-700">
        <p className="font-semibold">A Yampi recusou o acesso da Girumo</p>
        <p className="mt-1">Isso acontece quando a senha da Yampi muda. Cole o token e a chave de novo.</p>
      </div>
      <Formulario aliasInicial={c.alias} rotulo="Reconectar Yampi" p={p} />
      <div className="mt-4">
        <BotaoDesconectar p={p} />
      </div>
    </div>
  );
}

/** O desenho do cartão da Yampi em Configurações › Integrações, testado sem navegador. */
export function PainelDaYampi(p: PropsDaYampi): React.JSX.Element {
  const { cartao } = p;
  if (!cartao.disponivel) {
    return (
      <Cartao>
        <p className="mt-2 text-13 text-slate-600">Integração com a Yampi indisponível no momento.</p>
      </Cartao>
    );
  }
  const c = cartao.conexao;
  if (!c) {
    return (
      <Cartao subtitulo="não conectada">
        <div className={cn(BLOCO, "max-w-[680px]")}>
          <p className="text-15 text-volt-950">
            Os pedidos e os carrinhos da sua loja Yampi chegam na Girumo na hora. A conexão é a mesma do Rastreio do pedido e do
            Recuperar.
          </p>
          <Formulario aliasInicial="" rotulo="Conectar Yampi" p={p} />
        </div>
      </Cartao>
    );
  }
  return (
    <Cartao subtitulo={c.alias} chip={chipDaYampi(c.status)}>
      {c.status === "credencial_invalida" ? <AcessoRecusado c={c} p={p} /> : <Conectada c={c} p={p} />}
      {p.children}
    </Cartao>
  );
}

/** A rota falhou: dizer isso, nunca mostrar "não conectada" (seria estado inventado). */
export function YampiComErro({ onTentar }: { onTentar: () => void }): React.JSX.Element {
  return (
    <Cartao>
      <p role="alert" className="mt-2 text-13 text-danger-700">
        Não deu para carregar a integração com a Yampi.
      </p>
      <button type="button" onClick={onTentar} className={cn(SECUNDARIO, ANEL, "mt-4")}>
        Tentar de novo
      </button>
    </Cartao>
  );
}
