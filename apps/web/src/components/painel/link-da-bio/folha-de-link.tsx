// apps/web/src/components/painel/link-da-bio/folha-de-link.tsx
"use client";

import React, { useEffect, useState, type InputHTMLAttributes } from "react";
import { AlertTriangle, ChevronLeft, Trash2 } from "lucide-react";

import { Folha } from "@/components/painel/folha";
import { Interruptor } from "@/components/painel/instagram/interruptor";
import type { Icone, LinkBio } from "@/lib/bio/documento";
import {
  ATALHOS,
  ICONES_DO_SELETOR,
  linkDoAtalho,
  primeiroCampoComErro,
  rascunhoDoLink,
  validarLink,
  type CampoDoLink,
  type ErrosDoLink,
  type IdDoAtalho,
} from "@/lib/bio/editor";
import type { CampanhaDoPainel } from "@/lib/bio/painel-api";
import { cn } from "@/lib/utils";

import { IconeDoLink, QuadradoDoIcone } from "./icone-do-link";
import { focarDepois } from "./use-editor-bio";

export type InicioDaFolha = { modo: "tipos" } | { modo: "editar"; link: LinkBio; erros?: ErrosDoLink };

export const idDoCampo = (campo: CampoDoLink) => `bio-link-${campo}`;
const ID_EXCLUIR = "bio-link-excluir";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const PRIMARIO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-colors hover:bg-cobalt-700 ${FOCO}`;
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const FANTASMA = `inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-15 font-semibold text-slate-600 transition-colors hover:text-volt-950 ${FOCO}`;
const PERIGO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-15 font-semibold text-danger-700 transition-colors hover:bg-canvas-100 ${FOCO}`;
const PERIGO_CHEIO = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-danger-700 px-4 text-15 font-semibold text-paper-0 transition-[filter] hover:brightness-95 ${FOCO}`;

type ExtraDoCampo = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "autoComplete" | "autoCapitalize" | "spellCheck" | "placeholder"
>;

function CampoDeTexto({
  campo,
  rotulo,
  valor,
  erro,
  ajuda,
  maxLength,
  multilinha = false,
  extra,
  outrasDescricoes,
  aoMudar,
}: {
  campo: CampoDoLink;
  rotulo: string;
  valor: string;
  erro?: string;
  ajuda?: string;
  maxLength: number;
  multilinha?: boolean;
  extra?: ExtraDoCampo;
  /** ids de textos que também descrevem o campo (o aviso do número conectado). */
  outrasDescricoes?: string;
  aoMudar: (campo: CampoDoLink, valor: string) => void;
}) {
  const id = idDoCampo(campo);
  const descricoes =
    [erro ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null, outrasDescricoes ?? null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      {multilinha ? (
        <textarea
          id={id}
          value={valor}
          maxLength={maxLength}
          rows={3}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricoes}
          onChange={(e) => aoMudar(campo, e.target.value)}
          className={cn(CAMPO, "min-h-[84px] resize-y")}
        />
      ) : (
        <input
          type="text"
          {...extra}
          id={id}
          value={valor}
          maxLength={maxLength}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricoes}
          onChange={(e) => aoMudar(campo, e.target.value)}
          className={CAMPO}
        />
      )}
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
      {ajuda && (
        <p id={`${id}-ajuda`} className={AJUDA}>
          {ajuda}
        </p>
      )}
    </div>
  );
}

function SeletorDeCampanha({
  valor,
  erro,
  campanhas,
  aoMudar,
}: {
  valor: string;
  erro?: string;
  campanhas: readonly CampanhaDoPainel[];
  aoMudar: (campo: CampoDoLink, valor: string) => void;
}) {
  const id = idDoCampo("campanhaId");
  const ajuda =
    campanhas.length === 0
      ? "Você ainda não tem campanha. Crie uma em Campanhas e volte aqui."
      : "O botão usa o link da campanha: quem toca entra no grupo que estiver com vaga.";
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        Campanha
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar("campanhaId", e.target.value)}
        aria-invalid={erro ? true : undefined}
        aria-describedby={[erro ? `${id}-erro` : null, `${id}-ajuda`].filter(Boolean).join(" ")}
        className={CAMPO}
      >
        <option value="">Escolha a campanha…</option>
        {campanhas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.slug === null ? `${c.nome} (sem link)` : c.nome}
          </option>
        ))}
      </select>
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
      <p id={`${id}-ajuda`} className={AJUDA}>
        {ajuda}
      </p>
    </div>
  );
}

function SeletorDeIcone({ atual, aoIcone }: { atual: Icone; aoIcone: (icone: Icone) => void }) {
  return (
    <div className="grid gap-1.5">
      <span id="bio-link-icone" className={ROTULO}>
        Ícone
      </span>
      <div role="group" aria-labelledby="bio-link-icone" className="flex flex-wrap gap-2">
        {ICONES_DO_SELETOR.map(([icone, nome]) => (
          <button
            key={icone}
            type="button"
            aria-pressed={atual === icone}
            aria-label={nome}
            onClick={() => aoIcone(icone)}
            className={cn(
              "grid h-11 w-11 place-items-center rounded-lg border bg-paper-0 text-volt-950",
              FOCO,
              atual === icone ? "border-2 border-volt-950 bg-canvas-100" : "border-line-200",
            )}
          >
            <IconeDoLink icone={icone} />
          </button>
        ))}
      </div>
    </div>
  );
}

export type PropsDoConteudoDaFolha = {
  /** null = escolhendo o tipo (os 6 atalhos). */
  rascunho: LinkBio | null;
  novo: boolean;
  erros: ErrosDoLink;
  confirmando: boolean;
  campanhas: readonly CampanhaDoPainel[];
  aoEscolher: (atalho: IdDoAtalho) => void;
  aoVoltar: () => void;
  aoMudar: (campo: CampoDoLink, valor: string) => void;
  aoIcone: (icone: Icone) => void;
  aoDestaque: () => void;
  aoAplicar: () => void;
  aoCancelar: () => void;
  aoPedirExclusao: () => void;
  aoCancelarExclusao: () => void;
  aoExcluir: () => void;
};

function Tipos({ aoEscolher }: { aoEscolher: (atalho: IdDoAtalho) => void }) {
  return (
    <ul aria-label="Tipos de link" className="grid grid-cols-2 gap-2.5 pb-3 sm:grid-cols-3">
      {ATALHOS.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            id={`bio-atalho-${a.id}`}
            onClick={() => aoEscolher(a.id)}
            className={`grid h-full min-h-[124px] w-full content-start gap-2 rounded-xl border border-line-200 bg-paper-0 p-3.5 text-left transition-colors hover:border-slate-600 ${FOCO}`}
          >
            <QuadradoDoIcone icone={a.icone} />
            <span className="text-15 font-semibold leading-snug text-volt-950">{a.nome}</span>
            <span className="text-13 leading-snug text-slate-600">{a.descricao}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Rodape(p: PropsDoConteudoDaFolha & { rascunho: LinkBio }) {
  return (
    <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line-200 bg-paper-0 px-4 pb-1 pt-3">
      {p.confirmando ? (
        <>
          <p className="min-w-0 flex-[1_1_180px] text-15 font-semibold text-danger-700">
            {`Excluir “${p.rascunho.titulo}” da página?`}
          </p>
          {/* Pedir exclusão → foco no "Não" (§8). */}
          <button type="button" autoFocus onClick={p.aoCancelarExclusao} className={FANTASMA}>
            Não
          </button>
          <button type="button" onClick={p.aoExcluir} className={PERIGO_CHEIO}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Excluir
          </button>
        </>
      ) : (
        <>
          {!p.novo && (
            <button type="button" id={ID_EXCLUIR} onClick={p.aoPedirExclusao} className={PERIGO}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Excluir
            </button>
          )}
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={p.aoCancelar} className={SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARIO}>
              {p.novo ? "Adicionar" : "Pronto"}
            </button>
          </span>
        </>
      )}
    </div>
  );
}

function Formulario(p: PropsDoConteudoDaFolha & { rascunho: LinkBio }) {
  const r = p.rascunho;
  const e = p.erros;
  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        p.aoAplicar();
      }}
      className="grid gap-4"
    >
      {p.novo && (
        <button
          type="button"
          onClick={p.aoVoltar}
          aria-label="Voltar pros tipos de link"
          className={`-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-15 font-semibold text-cobalt-500 hover:bg-canvas-100 ${FOCO}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Tipos de link
        </button>
      )}
      {e.geral && (
        <p role="alert" className={ERRO}>
          {e.geral}
        </p>
      )}
      <CampoDeTexto campo="titulo" rotulo="Texto do botão" valor={r.titulo} erro={e.titulo} maxLength={50} aoMudar={p.aoMudar} />
      <CampoDeTexto
        campo="sub"
        rotulo="Texto de apoio (opcional)"
        valor={r.sub}
        erro={e.sub}
        maxLength={80}
        ajuda="Uma linha embaixo do botão, explicando o que tem lá."
        aoMudar={p.aoMudar}
      />
      {r.tipo === "whatsapp" && (
        <>
          <CampoDeTexto
            campo="numero"
            rotulo="WhatsApp de atendimento, com DDD"
            valor={r.numero}
            erro={e.numero}
            maxLength={20}
            extra={{ type: "tel", inputMode: "tel", autoComplete: "off", placeholder: "62 99999-9999" }}
            outrasDescricoes="bio-link-numero-aviso"
            aoMudar={p.aoMudar}
          />
          <p id="bio-link-numero-aviso" className="flex items-start gap-2.5 rounded-lg bg-aviso-fundo px-3 py-2.5 text-13 text-warning-700">
            <AlertTriangle className="mt-px h-4 w-4 flex-none" aria-hidden="true" />
            <span>Use o número de quem atende os pedidos. Não use o número conectado na Girumo: é ele que posta nos grupos.</span>
          </p>
          <CampoDeTexto
            campo="mensagem"
            rotulo="Mensagem que já vai escrita"
            valor={r.mensagem}
            erro={e.mensagem}
            maxLength={300}
            multilinha
            ajuda="A pessoa só aperta enviar. Dá pra pôr um código, como (BIO), pra saber de onde veio."
            aoMudar={p.aoMudar}
          />
        </>
      )}
      {r.tipo === "grupo" && (
        <SeletorDeCampanha valor={r.campanhaId} erro={e.campanhaId} campanhas={p.campanhas} aoMudar={p.aoMudar} />
      )}
      {r.tipo === "link" && (
        <>
          <CampoDeTexto
            campo="url"
            rotulo="Endereço do link"
            valor={r.url}
            erro={e.url}
            maxLength={500}
            extra={{
              inputMode: "url",
              autoComplete: "off",
              autoCapitalize: "none",
              spellCheck: false,
              placeholder: r.icone === "canal" ? "whatsapp.com/channel/…" : "sualoja.com.br/catalogo",
            }}
            aoMudar={p.aoMudar}
          />
          <SeletorDeIcone atual={r.icone} aoIcone={p.aoIcone} />
        </>
      )}
      {r.tipo === "endereco" && (
        <>
          <CampoDeTexto
            campo="endereco"
            rotulo="Endereço da loja"
            valor={r.endereco}
            erro={e.endereco}
            maxLength={200}
            multilinha
            aoMudar={p.aoMudar}
          />
          <CampoDeTexto campo="horario" rotulo="Horário (opcional)" valor={r.horario} erro={e.horario} maxLength={120} aoMudar={p.aoMudar} />
          <p className={AJUDA}>Na página, o botão abre ali mesmo com o endereço, o horário e o botão do Google Maps.</p>
        </>
      )}
      {r.tipo !== "endereco" && (
        <div className="flex items-center gap-3">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className={ROTULO}>Botão em destaque</span>
            <span className={AJUDA}>Fica maior e na cor de destaque. Só um por página.</span>
          </div>
          <Interruptor ligado={r.destaque} aoMudar={p.aoDestaque} rotulo="Botão em destaque" />
        </div>
      )}
      <Rodape {...p} />
    </form>
  );
}

/** O miolo da folha (mockup "Adicionar link"/"Editar link"): só desenha. */
export function ConteudoDaFolha(p: PropsDoConteudoDaFolha) {
  if (!p.rascunho) return <Tipos aoEscolher={p.aoEscolher} />;
  return <Formulario {...p} rascunho={p.rascunho} />;
}

/**
 * Folha de um link (spec §8): os 6 atalhos, o formulário do tipo, o erro embaixo do campo (some
 * ao corrigir) e "Excluir" com confirmação na própria folha. Monta aberta e desmonta ao fechar:
 * cada abertura começa limpa. `fundoFecha={false}`: tocar fora não apaga o que foi escrito.
 */
export function FolhaDeLink({
  inicio,
  campanhas,
  aoAplicar,
  aoExcluir,
  aoFechar,
}: {
  inicio: InicioDaFolha;
  campanhas: readonly CampanhaDoPainel[];
  aoAplicar: (link: LinkBio, novo: boolean) => void;
  aoExcluir: (id: string) => void;
  aoFechar: () => void;
}) {
  const [rascunho, setRascunho] = useState<LinkBio | null>(inicio.modo === "editar" ? rascunhoDoLink(inicio.link) : null);
  const [novo, setNovo] = useState(inicio.modo === "tipos");
  const [erros, setErros] = useState<ErrosDoLink>(inicio.modo === "editar" ? (inicio.erros ?? {}) : {});
  const [confirmando, setConfirmando] = useState(false);

  // Aberta por um erro do salvar: o foco vai pro campo do erro (depois de a Folha guardar quem a abriu).
  useEffect(() => {
    const campo = inicio.modo === "editar" && inicio.erros ? primeiroCampoComErro(inicio.erros) : null;
    if (campo) focarDepois(idDoCampo(campo));
  }, [inicio]);

  function escolher(atalho: IdDoAtalho) {
    setRascunho(linkDoAtalho(atalho, { id: crypto.randomUUID(), campanhas }));
    setNovo(true);
    setErros({});
    focarDepois(idDoCampo("titulo")); // escolher tipo → primeiro campo (§8)
  }

  function voltar() {
    setRascunho(null);
    setErros({});
    focarDepois("bio-atalho-whatsapp");
  }

  function mudar(campo: CampoDoLink, valor: string) {
    // O formulário só desenha os campos do tipo do rascunho, então `campo` sempre existe nele.
    setRascunho((r) => (r ? ({ ...r, [campo]: valor } as LinkBio) : r));
    // "O erro some ao corrigir" (§8).
    setErros((atual) => {
      const resto = { ...atual };
      delete resto[campo];
      return resto;
    });
  }

  function aplicar() {
    if (!rascunho) return;
    const r = validarLink(rascunho);
    if (r.ok) {
      aoAplicar(r.link, novo);
      return;
    }
    setErros(r.erros);
    const campo = primeiroCampoComErro(r.erros);
    if (campo) focarDepois(idDoCampo(campo));
  }

  const titulo = rascunho === null ? "Adicionar link" : novo ? "Novo link" : "Editar link";
  return (
    <Folha aberta aoFechar={aoFechar} titulo={titulo} testId="bio-folha-link" emQualquerLargura fundoFecha={false}>
      <ConteudoDaFolha
        rascunho={rascunho}
        novo={novo}
        erros={erros}
        confirmando={confirmando}
        campanhas={campanhas}
        aoEscolher={escolher}
        aoVoltar={voltar}
        aoMudar={mudar}
        aoIcone={(icone) => setRascunho((r) => (r ? { ...r, icone } : r))}
        aoDestaque={() => setRascunho((r) => (r && r.tipo !== "endereco" ? { ...r, destaque: !r.destaque } : r))}
        aoAplicar={aplicar}
        aoCancelar={aoFechar}
        aoPedirExclusao={() => setConfirmando(true)}
        aoCancelarExclusao={() => {
          setConfirmando(false);
          focarDepois(ID_EXCLUIR);
        }}
        aoExcluir={() => {
          if (inicio.modo === "editar") aoExcluir(inicio.link.id);
        }}
      />
    </Folha>
  );
}
