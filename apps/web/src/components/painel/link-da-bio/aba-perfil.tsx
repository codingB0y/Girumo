// apps/web/src/components/painel/link-da-bio/aba-perfil.tsx
"use client";

import React, { useMemo, useState, type InputHTMLAttributes } from "react";
import { Crosshair } from "lucide-react";

import { CropFocal } from "@/components/pages/editor/crop-focal";
import { Interruptor } from "@/components/painel/instagram/interruptor";
import type { DocumentoBio } from "@/lib/bio/documento";
import { erroNoCampo, mesmoConteudo } from "@/lib/bio/editor";
import {
  camposDaLista,
  cnpjDoCampo,
  focoDoCrop,
  instagramDoCampo,
  listaDosCampos,
  mascaraDoCnpj,
  refDoCrop,
} from "@/lib/bio/editor-perfil";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { BlocoAvancado, LUGARES_DO_AVANCADO } from "./bloco-avancado";
import { CampoDeFoto } from "./campo-de-foto";
import { AvisoDaAba, useErroDaAba, type ErroDaAba } from "./erro-da-aba";
import { focarDepois } from "./use-editor-bio";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 py-2.5 text-[16px] leading-snug text-volt-950 aria-invalid:border-danger-700 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const ERRO = "text-13 font-medium text-danger-700";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const CARTAO = "pn-card grid gap-4 rounded-xl p-4 lg:p-5";
const TITULO = "font-brand text-15 font-bold text-volt-950";

/** Os campos da aba que mostram erro do salvar (`lugarDoErro`); o resto vai pro aviso do topo. */
const LUGARES_DO_PERFIL: readonly string[] = [
  "perfil.capa",
  "perfil.capaAlt",
  "perfil.logoClara",
  "perfil.logoEscura",
  "perfil.nome",
  "perfil.frase",
  "perfil.destaques",
  "perfil.local",
  "perfil.instagram",
  "confere.razao",
  "confere.cnpj",
  "confere.linhas",
  ...LUGARES_DO_AVANCADO, // PR 7: o erro rastreio.* fica embaixo do campo do Avançado
];

const comPerfil =
  (mudanca: Partial<DocumentoBio["perfil"]>) =>
  (d: DocumentoBio): DocumentoBio => ({ ...d, perfil: { ...d.perfil, ...mudanca } });
const comConfere =
  (mudanca: Partial<DocumentoBio["confere"]>) =>
  (d: DocumentoBio): DocumentoBio => ({ ...d, confere: { ...d.confere, ...mudanca } });

type ExtraDoCampo = Pick<InputHTMLAttributes<HTMLInputElement>, "autoComplete" | "autoCapitalize" | "spellCheck" | "placeholder">;

type PropsDoCampo = {
  id: string;
  /** Rótulo visível; sem ele, `nome` vira o `aria-label` (destaques e avisos, num grupo nomeado). */
  rotulo?: string;
  nome?: string;
  valor: string;
  aoMudar: (valor: string) => void;
  maxLength: number;
  erro?: string | null;
  ajuda?: string;
  contador?: boolean;
  /** Texto fixo antes do campo ("@"), fora do valor. */
  prefixo?: string;
  extra?: ExtraDoCampo;
};

function Campo({ id, rotulo, nome, valor, aoMudar, maxLength, erro, ajuda, contador = false, prefixo, extra }: PropsDoCampo) {
  const descricoes =
    [erro ? `${id}-erro` : null, ajuda ? `${id}-ajuda` : null, contador ? `${id}-conta` : null].filter(Boolean).join(" ") ||
    undefined;
  const entrada = (
    <input
      type="text"
      {...extra}
      id={id}
      aria-label={rotulo ? undefined : nome}
      value={valor}
      maxLength={maxLength}
      aria-invalid={erro ? true : undefined}
      aria-describedby={descricoes}
      onChange={(e) => aoMudar(e.target.value)}
      className={cn(CAMPO, prefixo && "pl-7")}
    />
  );
  return (
    <div className="grid gap-1.5">
      {rotulo && (
        <label htmlFor={id} className={ROTULO}>
          {rotulo}
        </label>
      )}
      {prefixo ? (
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-600">
            {prefixo}
          </span>
          {entrada}
        </div>
      ) : (
        entrada
      )}
      {erro && (
        <p id={`${id}-erro`} className={ERRO}>
          {erro}
        </p>
      )}
      {(ajuda || contador) && (
        <div className="flex items-start gap-3">
          {ajuda && (
            <p id={`${id}-ajuda`} className={cn(AJUDA, "min-w-0 flex-1")}>
              {ajuda}
            </p>
          )}
          {contador && (
            <span id={`${id}-conta`} className={cn(AJUDA, "ml-auto font-data")}>
              {`${valor.length}/${maxLength}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Campos fixos (3 destaques, 2 avisos) por cima da lista do documento: o texto não pula de caixa
 * enquanto se digita, e o documento só recebe os que têm texto (§4: cada item com pelo menos 1 letra).
 */
function useCamposDaLista(lista: readonly string[], total: number): [string[], (i: number, valor: string) => string[]] {
  const [campos, setCampos] = useState(() => camposDaLista(lista, total));
  // A lista mudou por fora (Descartar, Recarregar): os campos voltam a ela. As duas pontas
  // normalizadas: um item só de espaço não faz a tela reescrever os campos sem parar.
  if (!mesmoConteudo(listaDosCampos(campos), listaDosCampos(lista))) setCampos(camposDaLista(lista, total));
  function mudar(i: number, valor: string): string[] {
    const novos = campos.map((campo, j) => (j === i ? valor : campo));
    setCampos(novos);
    return listaDosCampos(novos);
  }
  return [campos, mudar];
}

/** Os avisos do zod que a tela dá antes do salvar: calculados uma vez por mudança do documento. */
type AvisosDoDocumento = { instagram: string | null; cnpj: string | null };

type PropsDoCartao = {
  documento: DocumentoBio;
  mudarDocumento: PropsDaAba["mudarDocumento"];
  erros: ErroDaAba;
  avisos: AvisosDoDocumento;
};

function CartaoFotos({ documento, mudarDocumento, erros }: PropsDoCartao) {
  const [ajustando, setAjustando] = useState(false);
  const p = documento.perfil;
  const capa = p.capa;
  return (
    <section aria-labelledby="bio-fotos-titulo" className={CARTAO}>
      <h2 id="bio-fotos-titulo" className={TITULO}>
        Foto e logo
      </h2>
      {documento.modelo === "romaneio" && (
        <p className={AJUDA}>O modelo Romaneio não usa a foto: ela volta se você trocar de modelo.</p>
      )}
      <CampoDeFoto
        id="bio-perfil-capa"
        rotulo="Foto da loja"
        nome="foto da loja"
        ajuda="A foto do topo da página: a fachada, a arara, a equipe."
        tipo="lp-media"
        formato="foto"
        valor={capa}
        erro={erros.erroDe("perfil.capa")}
        aoMudar={(nova) => {
          erros.corrigiu("perfil.capa");
          setAjustando(false);
          mudarDocumento(comPerfil({ capa: nova }));
        }}
        acoes={
          capa && (
            <button
              type="button"
              id="bio-perfil-ajustar-foco"
              aria-expanded={ajustando}
              aria-controls="bio-perfil-foco"
              onClick={() => setAjustando((a) => !a)}
              className={SECUNDARIO}
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              Ajustar o foco
            </button>
          )
        }
      />
      {ajustando && capa && (
        <div id="bio-perfil-foco" className="grid gap-2">
          <CropFocal
            media={refDoCrop(capa)}
            onChange={(r) => mudarDocumento(comPerfil({ capa: { id: capa.id, foco: focoDoCrop(r) } }))}
          />
          <button
            type="button"
            onClick={() => {
              setAjustando(false);
              focarDepois("bio-perfil-ajustar-foco");
            }}
            className={cn(SECUNDARIO, "w-fit")}
          >
            Pronto
          </button>
        </div>
      )}
      <Campo
        id="bio-perfil-capaAlt"
        rotulo="Descrição da foto (opcional)"
        valor={p.capaAlt}
        maxLength={140}
        erro={erros.erroDe("perfil.capaAlt")}
        ajuda="Pra quem usa leitor de tela. Ex.: Fachada da loja com as araras na calçada."
        aoMudar={(capaAlt) => {
          erros.corrigiu("perfil.capaAlt");
          mudarDocumento(comPerfil({ capaAlt }));
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoDeFoto
          id="bio-perfil-logoClara"
          rotulo="Logo clara"
          nome="logo clara"
          ajuda="Pra fundo escuro"
          tipo="lp-logo"
          formato="logo-clara"
          valor={p.logoClara}
          erro={erros.erroDe("perfil.logoClara")}
          aoMudar={(logoClara) => {
            erros.corrigiu("perfil.logoClara");
            mudarDocumento(comPerfil({ logoClara }));
          }}
        />
        <CampoDeFoto
          id="bio-perfil-logoEscura"
          rotulo="Logo escura"
          nome="logo escura"
          ajuda="Pra fundo claro"
          tipo="lp-logo"
          formato="logo-escura"
          valor={p.logoEscura}
          erro={erros.erroDe("perfil.logoEscura")}
          aoMudar={(logoEscura) => {
            erros.corrigiu("perfil.logoEscura");
            mudarDocumento(comPerfil({ logoEscura }));
          }}
        />
      </div>
      <p className={AJUDA}>Com uma logo só, a página usa ela numa plaquinha quando o fundo não combina.</p>
    </section>
  );
}

function CartaoTextos({ documento, mudarDocumento, erros, avisos }: PropsDoCartao) {
  const p = documento.perfil;
  const [destaques, mudarDestaque] = useCamposDaLista(p.destaques, 3);
  const erroDosDestaques = erros.erroDe("perfil.destaques");
  return (
    <section aria-labelledby="bio-textos-titulo" className={CARTAO}>
      <h2 id="bio-textos-titulo" className={TITULO}>
        Nome e textos
      </h2>
      <Campo
        id="bio-perfil-nome"
        rotulo="Nome da loja"
        valor={p.nome}
        maxLength={60}
        erro={erros.erroDe("perfil.nome")}
        aoMudar={(nome) => {
          erros.corrigiu("perfil.nome");
          mudarDocumento(comPerfil({ nome }));
        }}
      />
      <Campo
        id="bio-perfil-frase"
        rotulo="Frase (opcional)"
        valor={p.frase}
        maxLength={120}
        contador
        erro={erros.erroDe("perfil.frase")}
        ajuda="O que a loja vende, numa linha."
        aoMudar={(frase) => {
          erros.corrigiu("perfil.frase");
          mudarDocumento(comPerfil({ frase }));
        }}
      />
      <div className="grid gap-1.5">
        <span id="bio-perfil-destaques-rotulo" className={ROTULO}>
          Destaques (opcional, até 3)
        </span>
        <div
          role="group"
          id="bio-perfil-destaques"
          tabIndex={-1}
          aria-labelledby="bio-perfil-destaques-rotulo"
          aria-describedby={erroDosDestaques ? "bio-perfil-destaques-erro" : "bio-perfil-destaques-ajuda"}
          className="grid gap-2"
        >
          {destaques.map((valor, i) => (
            <Campo
              key={i}
              id={`bio-perfil-destaques-${i}`}
              nome={`Destaque ${i + 1}`}
              valor={valor}
              maxLength={40}
              aoMudar={(v) => {
                erros.corrigiu("perfil.destaques");
                mudarDocumento(comPerfil({ destaques: mudarDestaque(i, v) }));
              }}
            />
          ))}
        </div>
        {erroDosDestaques && (
          <p id="bio-perfil-destaques-erro" className={ERRO}>
            {erroDosDestaques}
          </p>
        )}
        <p id="bio-perfil-destaques-ajuda" className={AJUDA}>
          Frases curtas embaixo do nome. Ex.: 12 kits no catálogo
        </p>
      </div>
      <Campo
        id="bio-perfil-local"
        rotulo="Onde fica (opcional)"
        valor={p.local}
        maxLength={90}
        erro={erros.erroDe("perfil.local")}
        aoMudar={(local) => {
          erros.corrigiu("perfil.local");
          mudarDocumento(comPerfil({ local }));
        }}
      />
      {/* Letra que não vale no @ aparece na hora; o tamanho o próprio campo segura. */}
      <Campo
        id="bio-perfil-instagram"
        rotulo="@ do Instagram (opcional)"
        prefixo="@"
        valor={p.instagram}
        maxLength={100}
        extra={{ autoComplete: "off", autoCapitalize: "none", spellCheck: false, placeholder: "sualoja" }}
        erro={erros.erroDe("perfil.instagram") ?? avisos.instagram}
        ajuda="Pode colar o link do perfil: fica só o @."
        aoMudar={(v) => {
          erros.corrigiu("perfil.instagram");
          mudarDocumento(comPerfil({ instagram: instagramDoCampo(v) }));
        }}
      />
    </section>
  );
}

function CartaoConfere({ documento, mudarDocumento, erros, avisos }: PropsDoCartao) {
  const c = documento.confere;
  const [linhas, mudarLinha] = useCamposDaLista(c.linhas, 2);
  // Com os 14 caracteres o zod já sabe se o dígito fecha; antes disso, digitar não acende erro.
  const erroDoCnpj = erros.erroDe("confere.cnpj") ?? (c.cnpj.length === 14 ? avisos.cnpj : null);
  const erroDasLinhas = erros.erroDe("confere.linhas");
  return (
    <section aria-labelledby="bio-confere-titulo" className={CARTAO}>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="bio-confere-titulo" className={TITULO}>
            Antes de pagar, confere
          </h2>
          <p className={AJUDA}>Mostra em nome de quem cai o Pix, com o CNPJ pra copiar. Ajuda a cliente a fugir de perfil falso.</p>
        </div>
        <Interruptor
          ligado={c.ativo}
          aoMudar={(ativo) => mudarDocumento(comConfere({ ativo }))}
          rotulo="Mostrar o bloco Antes de pagar, confere"
        />
      </div>
      {/* Os campos ficam na tela com o bloco desligado: o erro do salvar sempre tem onde aparecer. */}
      <Campo
        id="bio-confere-razao"
        rotulo="Razão social (opcional)"
        valor={c.razao}
        maxLength={120}
        erro={erros.erroDe("confere.razao")}
        ajuda="O nome que aparece pra quem paga no Pix."
        aoMudar={(razao) => {
          erros.corrigiu("confere.razao");
          mudarDocumento(comConfere({ razao }));
        }}
      />
      <Campo
        id="bio-confere-cnpj"
        rotulo="CNPJ (opcional)"
        valor={mascaraDoCnpj(c.cnpj)}
        maxLength={18}
        extra={{ autoComplete: "off", autoCapitalize: "characters", spellCheck: false, placeholder: "00.000.000/0000-00" }}
        erro={erroDoCnpj}
        ajuda="Com ou sem pontuação. Vale o CNPJ novo, com letras."
        aoMudar={(v) => {
          erros.corrigiu("confere.cnpj");
          mudarDocumento(comConfere({ cnpj: cnpjDoCampo(v) }));
        }}
      />
      <div className="grid gap-1.5">
        <span id="bio-confere-linhas-rotulo" className={ROTULO}>
          Outros avisos (opcional, até 2)
        </span>
        <div
          role="group"
          id="bio-confere-linhas"
          tabIndex={-1}
          aria-labelledby="bio-confere-linhas-rotulo"
          aria-describedby={erroDasLinhas ? "bio-confere-linhas-erro" : "bio-confere-linhas-ajuda"}
          className="grid gap-2"
        >
          {linhas.map((valor, i) => (
            <Campo
              key={i}
              id={`bio-confere-linhas-${i}`}
              nome={`Aviso ${i + 1}`}
              valor={valor}
              maxLength={160}
              aoMudar={(v) => {
                erros.corrigiu("confere.linhas");
                mudarDocumento(comConfere({ linhas: mudarLinha(i, v) }));
              }}
            />
          ))}
        </div>
        {erroDasLinhas && (
          <p id="bio-confere-linhas-erro" className={ERRO}>
            {erroDasLinhas}
          </p>
        )}
        <p id="bio-confere-linhas-ajuda" className={AJUDA}>
          Ex.: A gente só envia depois do Pix confirmado.
        </p>
      </div>
    </section>
  );
}

function CartaoSelo({ documento, mudarDocumento }: PropsDoCartao) {
  return (
    <section aria-labelledby="bio-selo-titulo" className={CARTAO}>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="bio-selo-titulo" className={TITULO}>
            Selo no rodapé
          </h2>
          <p className={AJUDA}>Um “Feito com Girumo” pequeno, no fim da página.</p>
        </div>
        <Interruptor
          ligado={documento.feitoComGirumo}
          aoMudar={(feitoComGirumo) => mudarDocumento((d) => ({ ...d, feitoComGirumo }))}
          rotulo="Mostrar “Feito com Girumo” no rodapé"
        />
      </div>
    </section>
  );
}

/**
 * Aba Perfil (spec §8): foto e logos, nome e textos, "Antes de pagar, confere" e o selo. O
 * "Avançado" (Pixel da Meta e GA4, PR 7) fecha a aba, depois do `CartaoSelo`; os lugares dele
 * estão no `LUGARES_DO_PERFIL`, então o erro `rastreio.*` passa pelo mesmo `useErroDaAba`.
 */
export function AbaPerfil({ pagina, rascunho, mudarDocumento, erro, limparErro }: PropsDaAba) {
  const erros = useErroDaAba(erro, limparErro, LUGARES_DO_PERFIL, pagina.versao);
  const documento = rascunho.documento;
  const avisos = useMemo<AvisosDoDocumento>(
    () => ({ instagram: erroNoCampo(documento, "perfil.instagram"), cnpj: erroNoCampo(documento, "confere.cnpj") }),
    [documento],
  );
  const cartao: PropsDoCartao = { documento, mudarDocumento, erros, avisos };
  return (
    <div className="grid gap-4">
      {erros.erroSolto && <AvisoDaAba mensagem={erros.erroSolto} />}
      <CartaoFotos {...cartao} />
      <CartaoTextos {...cartao} />
      <CartaoConfere {...cartao} />
      <CartaoSelo {...cartao} />
      <BlocoAvancado
        rastreio={rascunho.documento.rastreio}
        mudarDocumento={mudarDocumento}
        erroDe={erros.erroDe}
        corrigiu={erros.corrigiu}
      />
    </div>
  );
}
