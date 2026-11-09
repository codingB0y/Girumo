import Link from "next/link";
import React, { useState } from "react";

import { Folha } from "@/components/painel/folha";
import { CARTAO } from "@/components/painel/configuracoes/bling-painel-estilo";
import type { RespostaDaConfig } from "@/lib/rastreio/config-painel";
import { previaDoEmail, previaDoWhatsapp, type DadosDaPrevia } from "@/lib/rastreio/previas";
import { ETAPAS_COM_AVISO, type Canal, type EtapaComAviso } from "@/lib/rastreio/tipos";
import { formatPhoneBR } from "@/lib/phone";
import { normalizeWhatsappBR } from "@/lib/pages/phone";

import { Interruptor, MatrizDeAvisos, ROTULO_DA_ETAPA } from "./matriz-de-avisos";

const INTEGRACOES = "/painel/configuracoes?secao=integracoes";
const LINK = "text-13 text-cobalt-700 underline underline-offset-2";
const BOTAO = "inline-flex h-9 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 text-volt-950";

export type ErroDoRastreio = { error: string; campo: string } | null;

export type PropsDoPainel = {
  dados: RespostaDaConfig;
  cartaoDoNumero: React.ReactNode;
  /** A chave que está salvando: `matrix`, `notifyStoreOnProblem`, `storeWhatsapp` ou `vipLinkId`. */
  salvando: string | null;
  /** `campo: "storeWhatsapp"` vai embaixo do campo; o resto vira alerta da tela. */
  erro: ErroDoRastreio;
  aoAlternar(etapa: EtapaComAviso, canal: Canal): void;
  aoAlternarProblema(): void;
  aoSalvarNumero(v: string): void;
  aoEscolherConvite(id: string | null): void;
  aoCopiar(): void;
};

function AvisoDaYampi({ yampi }: { yampi: RespostaDaConfig["yampi"] }) {
  if (yampi === "ativa") return null;
  const semConexao = yampi === null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 py-3 text-[14px] text-volt-950">
      {semConexao ? "Conecte a Yampi para os pedidos chegarem aqui." : "A conexão com a Yampi precisa de atenção."}
      <Link href={INTEGRACOES} className={LINK}>
        {semConexao ? "Conectar a Yampi" : "Abrir Integrações"}
      </Link>
    </p>
  );
}

/** Configurações › Rastreio de pedidos: só o desenho (testado sem navegador). O estado mora em `RastreioConfiguracoes`. */
export function PainelDoRastreio({
  dados,
  cartaoDoNumero,
  salvando,
  erro,
  aoAlternar,
  aoAlternarProblema,
  aoSalvarNumero,
  aoEscolherConvite,
  aoCopiar,
}: PropsDoPainel) {
  const { config, linkDaBusca, linksDeConvite } = dados;
  const [previa, setPrevia] = useState<EtapaComAviso | null>(null);

  const dadosDaPrevia: DadosDaPrevia = { loja: dados.loja ?? "sua loja", linkDaBusca, storeWhatsapp: config.storeWhatsapp };
  const temPrevia = ETAPAS_COM_AVISO.some((e) => previaDoWhatsapp(e, dadosDaPrevia) || previaDoEmail(e, dadosDaPrevia));
  const erroDoNumero = erro?.campo === "storeWhatsapp" ? erro.error : null;
  const erroDaTela = erro && !erroDoNumero ? erro.error : null;
  const emailLigado = ETAPAS_COM_AVISO.some((e) => config.matrix[e].email);
  const conviteLigado = config.vipLinkId !== null;
  const semLinks = linksDeConvite.length === 0;

  // Uma gravação por vez: com outra chave salvando, os controles ficam inertes em vez de engolir o toque.
  const ocupado = salvando !== null;
  const conviteDesconhecido = config.vipLinkId !== null && !linksDeConvite.some((l) => l.id === config.vipLinkId);

  return (
    <div className="space-y-6" data-testid="rastreio-config">
      {cartaoDoNumero}
      <AvisoDaYampi yampi={dados.yampi} />
      {config.importedAt === null && dados.yampi !== null && (
        <p role="status" className="text-13 text-slate-600">
          Importando os pedidos dos últimos 30 dias. Em poucos minutos eles aparecem em Entregas.
        </p>
      )}
      {erroDaTela && (
        <p role="alert" className="text-13 text-danger-700">
          {erroDaTela}
        </p>
      )}

      <section className={CARTAO} aria-labelledby="rastreio-avisos-titulo">
        <h3 id="rastreio-avisos-titulo" className="text-20 font-semibold text-volt-950">Avisos automáticos</h3>
        <p className="mt-1 text-13 text-slate-600">
          A compradora recebe um aviso a cada etapa do pedido. O WhatsApp sai pelo número do atendimento.
        </p>
        <div className="mt-4 overflow-x-auto">
          <MatrizDeAvisos
            matriz={config.matrix}
            desabilitado={ocupado}
            aoAlternar={aoAlternar}
            aoVerMensagem={temPrevia ? setPrevia : null}
          />
        </div>
        {emailLigado && (
          <p className="mt-3 text-13 text-slate-600">
            O e-mail só sai para quem informou e-mail no pedido. Quando o WhatsApp falha, o e-mail vai no lugar.
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-line-200 pt-4">
          <p className="text-[14px] text-volt-950">Me avisar quando um pedido tiver problema na entrega</p>
          <Interruptor
            ligado={config.notifyStoreOnProblem}
            rotulo="Me avisar quando um pedido tiver problema na entrega"
            desabilitado={ocupado}
            aoAlternar={aoAlternarProblema}
          />
        </div>
      </section>

      <section className={CARTAO} aria-labelledby="rastreio-pagina-titulo">
        <h3 id="rastreio-pagina-titulo" className="text-20 font-semibold text-volt-950">Página de rastreio</h3>
        <p className="mt-1 text-13 text-slate-600">A compradora busca o pedido pelo número ou pelo CPF/CNPJ.</p>
        {linkDaBusca && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="font-data min-w-0 break-all rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-13 text-volt-950">
              {linkDaBusca}
            </code>
            <button type="button" onClick={aoCopiar} className={BOTAO}>
              Copiar
            </button>
            <a href={linkDaBusca} target="_blank" rel="noopener noreferrer" className={BOTAO}>
              Abrir
            </a>
          </div>
        )}

        <CampoDoNumero
          // A rota devolve o número gravado: o campo recomeça dele, e a comparação não dispara PATCH à toa.
          key={config.storeWhatsapp ?? ""}
          gravado={config.storeWhatsapp}
          erro={erroDoNumero}
          ocupado={ocupado}
          aoSalvar={aoSalvarNumero}
        />

        <div className="mt-5 border-t border-line-200 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] text-volt-950">Convidar para o grupo VIP</p>
              <p className="mt-0.5 text-13 text-slate-600">
                {semLinks
                  ? "Crie uma campanha com link para oferecer o convite"
                  : "A página e os avisos levam o convite para o grupo da campanha."}
              </p>
            </div>
            <Interruptor
              ligado={conviteLigado}
              rotulo="Convidar para o grupo VIP"
              desabilitado={semLinks || ocupado}
              aoAlternar={() => aoEscolherConvite(conviteLigado ? null : linksDeConvite[0].id)}
            />
          </div>
          <label htmlFor="rastreio-link-do-convite" className="mt-3 block text-13 text-slate-600">
            Link do convite
          </label>
          <select
            id="rastreio-link-do-convite"
            value={config.vipLinkId ?? ""}
            disabled={semLinks || !conviteLigado}
            aria-disabled={ocupado || undefined}
            onChange={(e) => {
              if (!ocupado) aoEscolherConvite(e.target.value || null);
            }}
            className="mt-1 h-10 w-full max-w-xs rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[14px] text-volt-950"
          >
            {!conviteLigado && <option value="">Nenhum</option>}
            {conviteDesconhecido && <option value={config.vipLinkId ?? ""}>Link removido</option>}
            {linksDeConvite.map((l) => (
              <option key={l.id} value={l.id}>
                {l.slug}
              </option>
            ))}
          </select>
        </div>
      </section>

      <Folha
        aberta={previa !== null}
        aoFechar={() => setPrevia(null)}
        titulo={previa ? ROTULO_DA_ETAPA[previa] : ""}
        testId="rastreio-previa"
        emQualquerLargura
      >
        {previa && <Previa etapa={previa} dados={dadosDaPrevia} />}
      </Folha>
    </div>
  );
}

function Previa({ etapa, dados }: { etapa: EtapaComAviso; dados: DadosDaPrevia }) {
  const whatsapp = previaDoWhatsapp(etapa, dados);
  const email = previaDoEmail(etapa, dados);
  return (
    <div className="space-y-4 px-4 pb-4 text-[14px] text-volt-950">
      <p className="text-13 text-slate-600">Exemplo com a compradora Ana e o pedido nº 1541.</p>
      {whatsapp && (
        <div>
          <h3 className="text-13 font-semibold">WhatsApp</h3>
          <p className="mt-1 whitespace-pre-line">{whatsapp}</p>
        </div>
      )}
      {email && (
        <div>
          <h3 className="text-13 font-semibold">E-mail · {email.assunto}</h3>
          <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{email.texto}</p>
        </div>
      )}
    </div>
  );
}

/** 55 + DDD + número, como a rota grava; vazio é `null`; inválido volta cru para a rota recusar com o texto dela. */
function comoGravado(v: string): string | null {
  if (v.trim() === "") return null;
  return normalizeWhatsappBR(v)?.slice(1) ?? v.trim();
}

function CampoDoNumero({
  gravado,
  erro,
  ocupado,
  aoSalvar,
}: {
  gravado: string | null;
  erro: string | null;
  ocupado: boolean;
  aoSalvar(v: string): void;
}) {
  const [numero, setNumero] = useState(gravado ? (formatPhoneBR(gravado) ?? gravado) : "");
  // O erro é do valor que foi enviado: assim que a lojista mexe, ele sai da tela.
  const [mexeu, setMexeu] = useState(false);
  const erroVisivel = mexeu ? null : erro;
  // O valor já mandado: Enter seguido de blur, ou blur depois de uma recusa, não repete o PATCH.
  const [enviado, setEnviado] = useState<string | null>(null);

  function salvar(e?: React.FormEvent) {
    e?.preventDefault();
    if (ocupado || numero === enviado || comoGravado(numero) === gravado) return;
    setEnviado(numero);
    setMexeu(false);
    aoSalvar(numero);
  }

  return (
    <form onSubmit={salvar} className="mt-5 border-t border-line-200 pt-5">
      <label htmlFor="rastreio-whatsapp-da-loja" className="block text-[14px] text-volt-950">
        WhatsApp da loja
      </label>
      <input
        id="rastreio-whatsapp-da-loja"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={numero}
        onChange={(e) => {
          setNumero(e.target.value);
          setMexeu(true);
        }}
        onBlur={() => salvar()}
        readOnly={ocupado}
        aria-invalid={erroVisivel ? true : undefined}
        aria-describedby={erroVisivel ? "rastreio-whatsapp-ajuda rastreio-whatsapp-erro" : "rastreio-whatsapp-ajuda"}
        placeholder="(11) 91234-5678"
        className="mt-1.5 h-10 w-full max-w-xs rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[14px] text-volt-950"
      />
      <p id="rastreio-whatsapp-ajuda" className="mt-1.5 text-13 text-slate-600">
        Aparece como “Falar com a loja” na página e no aviso de entregue. Vazio: o botão some.
      </p>
      {erroVisivel && (
        <p id="rastreio-whatsapp-erro" role="alert" className="mt-1 text-13 text-danger-700">
          {erroVisivel}
        </p>
      )}
    </form>
  );
}
