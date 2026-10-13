// apps/web/src/components/painel/configuracoes/site-proprio-painel.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de aba-plano.tsx).
import React, { useState } from "react";

import { Check, Copy, Loader2 } from "lucide-react";
import { dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import type { LinhaDoCadastro } from "@/lib/integracoes/situacao-do-cadastro";
import { cn } from "@/lib/utils";

/** Corpo de GET /api/integracoes/site (spec 2026-10-10-funil-anuncios §3, + `gerada_em` e `links`). */
export type LeituraDoSite = {
  ativa: boolean;
  key_last4: string | null;
  gerada_em: string | null;
  link: { id: string; slug: string } | null;
  last_used_at: string | null;
  recebidos_30d: number;
  ultimos: LinhaDoCadastro[];
  links: { id: string; slug: string }[];
};

/** Corpo de POST /api/integracoes/site/teste — nada é gravado. */
export type TesteDoSite = {
  enviado: Record<string, string>;
  resposta: { status: number; corpo: Record<string, string> };
};

export type PropsDoPainel = {
  leitura: LeituraDoSite;
  agora: Date;
  /** Origem do app ("https://app.girumo.com.br"), para o contrato do envio. */
  origem: string;
  linkEscolhido: string;
  onLink: (id: string) => void;
  /** A chave inteira, só logo depois de gerada. */
  chaveNova: string | null;
  ocupado: "chave" | "teste" | null;
  teste: TesteDoSite | null;
  onGerar: () => void;
  onTestar: () => void;
};

/** O que o lojista cola em anúncio › Rastreamento › Parâmetros de URL (spec §1). */
export const PARAMETROS_DE_URL =
  "utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}";

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

const CARTAO = "pn-card rounded-[var(--radius-control)] p-6 lg:p-8";
const TITULO = "text-15 font-semibold text-volt-950";
const AJUDA = "mt-1 text-13 text-slate-600";
const CODIGO =
  "font-data mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-3 text-12 text-volt-950";
const PRIMARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-volt-950 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-volt-800 disabled:cursor-not-allowed disabled:bg-volt-950/30";
const SECUNDARIO =
  "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 disabled:cursor-not-allowed disabled:opacity-60";

export function haQuanto(iso: string, agora: Date): string {
  const passou = Math.max(0, agora.getTime() - Date.parse(iso));
  if (passou < MINUTO_MS) return "há menos de 1 min";
  if (passou < HORA_MS) return `há ${Math.floor(passou / MINUTO_MS)} min`;
  if (passou < 2 * DIA_MS) return `há ${Math.floor(passou / HORA_MS)} h`;
  return `há ${Math.floor(passou / DIA_MS)} dias`;
}

/**
 * Parado há mais de um dia costuma ser chave trocada sem atualizar o site
 * (spec §6): o site cai no link de sempre e ninguém vê, só esta linha.
 */
export function situacaoDoSite(
  l: Pick<LeituraDoSite, "ativa" | "last_used_at" | "recebidos_30d">,
  agora: Date,
): { titulo: string; detalhe: string | null; tom: "ok" | "alerta" | "neutro" } {
  const nos30 = `${l.recebidos_30d.toLocaleString("pt-BR")} nos últimos 30 dias`;
  if (!l.ativa) return { titulo: "Integração desligada", detalhe: "Gere a chave e entregue a quem programa o site.", tom: "neutro" };
  if (!l.last_used_at) return { titulo: "Esperando o primeiro cadastro", detalhe: nos30, tom: "neutro" };
  const parado = agora.getTime() - Date.parse(l.last_used_at) > DIA_MS;
  return {
    titulo: parado ? "Sem cadastros há mais de um dia" : "Recebendo cadastros",
    detalhe: `Último ${haQuanto(l.last_used_at, agora)} · ${nos30}`,
    tom: parado ? "alerta" : "ok",
  };
}

/** Hora de Brasília; a data só entra quando não é hoje. */
export function quando(iso: string, agora: Date): string {
  return dayBROf(iso) === dayBROf(agora.toISOString()) ? horaBR(iso) : `${diaMesBR(iso)} ${horaBR(iso)}`;
}

export function chaveMascarada(last4: string): string {
  return `gk_live_${"•".repeat(16)}${last4}`;
}

function exemploDeEnvio(origem: string): string {
  return [
    `POST ${origem}/api/integracoes/cadastro`,
    "Authorization: Bearer gk_live_…",
    "Content-Type: application/json",
    "",
    "{",
    '  "whatsapp": "62999998888",',
    '  "page_url": "https://seusite.com.br/vip?utm_source=…",',
    '  "event_id": "id único do cadastro",',
    '  "fbc": "cookie _fbc (opcional)",',
    '  "fbp": "cookie _fbp (opcional)"',
    "}",
  ].join("\n");
}

const EXEMPLO_DE_RESPOSTA = [
  "201 cadastro novo · 200 mesmo event_id de novo (não duplica)",
  "{",
  '  "redirect": "<link do grupo>?cid=<id do cadastro>",',
  '  "capture_id": "<id do cadastro>"',
  "}",
  "",
  '422 { "error": "numero" }: WhatsApp inválido, peça de novo.',
  "Qualquer outra resposta, ou 2 s sem resposta: mande para o link de sempre.",
].join("\n");

function BotaoCopiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard indisponível: o valor continua na tela para copiar à mão */
    }
  }
  return (
    <button type="button" onClick={copiar} aria-label={rotulo} className={cn(SECUNDARIO, "min-h-9 shrink-0 px-3 text-13")}>
      {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function CartaoDaSituacao(p: PropsDoPainel) {
  const situacao = situacaoDoSite(p.leitura, p.agora);
  return (
    <section className={CARTAO} aria-labelledby="site-proprio-titulo">
      <h2 id="site-proprio-titulo" className="text-20 font-semibold text-volt-950">
        Site próprio
      </h2>
      <p className={AJUDA}>
        Seu site manda cada cadastro pra Girumo e recebe de volta o link do grupo. Assim cada venda sabe de qual anúncio
        veio.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-line-200 pt-5">
        <div role="status">
          <p
            className={cn(
              "text-15 font-semibold",
              situacao.tom === "ok" ? "text-success-700" : situacao.tom === "alerta" ? "text-warning-700" : "text-volt-950",
            )}
          >
            {situacao.titulo}
          </p>
          {situacao.detalhe && <p className="font-data mt-0.5 text-13 text-slate-600">{situacao.detalhe}</p>}
        </div>
        <button type="button" onClick={p.onTestar} disabled={!p.leitura.ativa || p.ocupado !== null} className={SECUNDARIO}>
          {p.ocupado === "teste" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Enviar cadastro de teste
        </button>
      </div>
      {p.teste && (
        <div role="status" className="mt-4">
          <p className="text-13 text-volt-950">
            A Girumo responderia {p.teste.resposta.status} ao seu site. Nada foi gravado: o relatório da loja não muda.
          </p>
          <pre className={CODIGO}>{JSON.stringify(p.teste.resposta.corpo, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}

function CartaoDaChave(p: PropsDoPainel) {
  const { leitura } = p;
  const semLinks = leitura.links.length === 0;
  return (
    <section className={CARTAO} aria-labelledby="site-chave-titulo">
      <h3 id="site-chave-titulo" className={TITULO}>
        Chave da integração
      </h3>
      {p.chaveNova ? (
        <div role="status" className="pn-aviso mt-3 rounded-[var(--radius-control)] p-4">
          <p className="text-13 text-volt-950">
            Guarde agora: esta chave não aparece de novo. Entregue a quem programa o site; ela fica no servidor do site,
            nunca na página.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="font-data min-w-0 flex-1 break-all text-13 text-volt-950">{p.chaveNova}</code>
            <BotaoCopiar valor={p.chaveNova} rotulo="Copiar a chave" />
          </div>
        </div>
      ) : leitura.ativa && leitura.key_last4 ? (
        <p className="font-data mt-3 break-all text-15 text-volt-950">{chaveMascarada(leitura.key_last4)}</p>
      ) : (
        <p className={AJUDA}>Nenhuma chave ainda.</p>
      )}
      {leitura.ativa && leitura.gerada_em && (
        <p className={AJUDA}>
          {/* Uma string só: texto + expressão viraria "Gerada em <!-- -->10/10" no HTML. */}
          {`Gerada em ${diaMesBR(leitura.gerada_em)}. A chave só aparece inteira uma vez, quando é gerada. Gerar outra desliga a atual na hora: o site precisa receber a nova antes.`}
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line-200 pt-5">
        {semLinks ? (
          <p className="text-13 text-slate-600">Crie um link de grupo antes de gerar a chave.</p>
        ) : (
          <div className="min-w-[220px] flex-1">
            <label htmlFor="site-proprio-link" className="mb-1.5 block text-13 font-semibold text-volt-950">
              Mandar pro grupo pelo link
            </label>
            <select
              id="site-proprio-link"
              value={p.linkEscolhido}
              onChange={(e) => p.onLink(e.target.value)}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-15 text-volt-950"
            >
              {leitura.links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.slug}
                </option>
              ))}
            </select>
            {leitura.ativa && leitura.link && p.linkEscolhido !== leitura.link.id && (
              <p className="mt-1 text-13 text-slate-600">Trocar o link só vale com uma chave nova.</p>
            )}
          </div>
        )}
        <button type="button" onClick={p.onGerar} disabled={semLinks || p.ocupado !== null} className={PRIMARIO}>
          {p.ocupado === "chave" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {leitura.ativa ? "Gerar outra chave" : "Gerar chave"}
        </button>
      </div>
    </section>
  );
}

function CartaoDosParametros() {
  return (
    <section className={CARTAO} aria-labelledby="site-utm-titulo">
      <h3 id="site-utm-titulo" className={TITULO}>
        Parâmetros de URL dos anúncios
      </h3>
      <p className={AJUDA}>
        No Gerenciador de Anúncios: anúncio › Rastreamento › Parâmetros de URL. Cole uma vez; o Meta preenche campanha,
        conjunto e anúncio sozinho.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 p-3">
        <code className="font-data min-w-0 flex-1 break-all text-13 text-volt-950">{PARAMETROS_DE_URL}</code>
        <BotaoCopiar valor={PARAMETROS_DE_URL} rotulo="Copiar parâmetros" />
      </div>
      <p className={AJUDA}>Renomear um anúncio no Meta separa o histórico dele em dois nomes aqui.</p>
    </section>
  );
}

function CartaoParaQuemPrograma({ origem }: { origem: string }) {
  return (
    <section className={CARTAO} aria-labelledby="site-dev-titulo">
      <h3 id="site-dev-titulo" className={TITULO}>
        Para quem programa o site
      </h3>
      <p className={AJUDA}>
        Chame do servidor do site (nunca do navegador: a chave é secreta). Se a Girumo não responder em 2 segundos, mande
        a pessoa pro link de sempre. Ela nunca fica fora do grupo por causa disto.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="text-12 font-semibold text-slate-600">O site envia</p>
          <pre className={CODIGO}>{exemploDeEnvio(origem)}</pre>
        </div>
        <div className="min-w-0">
          <p className="text-12 font-semibold text-slate-600">A Girumo responde</p>
          <pre className={CODIGO}>{EXEMPLO_DE_RESPOSTA}</pre>
        </div>
      </div>
    </section>
  );
}

function CartaoDosUltimos({ ultimos, agora }: { ultimos: LinhaDoCadastro[]; agora: Date }) {
  return (
    <section className={CARTAO} aria-labelledby="site-ultimos-titulo">
      <h3 id="site-ultimos-titulo" className={TITULO}>
        Últimos cadastros recebidos
      </h3>
      {ultimos.length === 0 ? (
        <p className={AJUDA}>Nenhum cadastro recebido ainda.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="text-12 text-slate-600">
                <th scope="col" className="pb-2 font-normal">Hora</th>
                <th scope="col" className="pb-2 font-normal">WhatsApp</th>
                <th scope="col" className="pb-2 font-normal">Anúncio</th>
                <th scope="col" className="pb-2 font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((u, i) => (
                <tr key={`${u.hora}-${i}`} className="border-t border-line-200 align-top">
                  <td className="font-data py-3 pr-3 text-13 text-volt-950">{quando(u.hora, agora)}</td>
                  <td className="font-data py-3 pr-3 text-13 text-volt-950">{u.telefone_mascarado}</td>
                  <td className="py-3 pr-3 text-13 text-volt-950">{u.anuncio}</td>
                  <td
                    className={cn(
                      "py-3 text-13",
                      /^(Entrou|Comprou)/.test(u.situacao) ? "text-success-700" : "text-slate-600",
                    )}
                  >
                    {u.situacao}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Quem não tem `settings:connection` (operador) ou recebeu 403 da rota. Recado,
 * nunca "Não deu para carregar": nada quebrou, a área é que não é dele.
 */
export function SiteSemAcesso() {
  return (
    <section className={CARTAO} data-testid="configuracoes-site" aria-labelledby="site-proprio-titulo">
      <h2 id="site-proprio-titulo" className="text-20 font-semibold text-volt-950">
        Site próprio
      </h2>
      <p className="mt-2 text-13 text-slate-600">Só o dono ou a administração da loja mexe na integração do site.</p>
    </section>
  );
}

/** A rota falhou: dizer isso, nunca mostrar "desligada" (seria zero inventado, padrão `carga` da Vitrine). */
export function SiteComErro({ onTentar }: { onTentar: () => void }) {
  return (
    <section className={CARTAO} data-testid="configuracoes-site" aria-labelledby="site-proprio-titulo">
      <h2 id="site-proprio-titulo" className="text-20 font-semibold text-volt-950">
        Site próprio
      </h2>
      <p role="alert" className="mt-2 text-13 text-danger-700">Não deu para carregar a integração do site.</p>
      <button type="button" onClick={onTentar} className={cn(SECUNDARIO, "mt-4")}>
        Tentar de novo
      </button>
    </section>
  );
}

/**
 * Configurações › Integrações › Site próprio (spec §4, mockup Integracao.dc.html).
 * Só desenho: estado e chamadas ficam em `site-proprio.tsx`.
 */
export function PainelDoSite(p: PropsDoPainel) {
  return (
    <div className="space-y-6" data-testid="configuracoes-site">
      <CartaoDaSituacao {...p} />
      <CartaoDaChave {...p} />
      <CartaoDosParametros />
      <CartaoParaQuemPrograma origem={p.origem} />
      <CartaoDosUltimos ultimos={p.leitura.ultimos} agora={p.agora} />
    </div>
  );
}
