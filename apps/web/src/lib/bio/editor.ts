// apps/web/src/lib/bio/editor.ts
import { documentoBio, type DocumentoBio } from "@/lib/bio/documento";
import type { CorpoDoPatchBio, RespostaDoPainelBio } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";

/**
 * Regras puras do editor do link da bio no painel (spec 2026-10-19-link-da-bio §8–§9).
 * Roda no navegador e nos testes: nada de fetch, React ou Supabase aqui. A validação
 * é o MESMO `documentoBio` do servidor (PR 2); este arquivo só traduz o erro dele para
 * o campo da tela.
 */

// ------------------------------------------------------------------- estado (§9)

/** O GET sem a página: o que não muda enquanto se edita. */
export type ContextoDoEditor = Omit<RespostaDoPainelBio, "pagina">;

/** O que o PATCH grava junto da `versao`. */
export type EstadoSalvavel = Omit<CorpoDoPatchBio, "versao">;

/** Erro preso a um campo; `campo` é o caminho do zod: "links.2.numero", "perfil.nome", "slug". */
export type ErroDeCampo = { campo: string; mensagem: string };

export type ResultadoDoSalvar =
  | { tipo: "ok"; pagina: PaginaBio }
  | { tipo: "conflito"; mensagem: string }
  | { tipo: "campo"; erro: ErroDeCampo }
  | { tipo: "falha"; mensagem: string };

export const MENSAGEM_DE_CONFLITO = "Outra pessoa salvou antes. Recarregue pra ver a versão nova.";
const PAGINA_SUMIU = "Essa página não existe mais. Recarregue pra ver como ela está agora.";
const FALHA_AO_SALVAR = "Não deu pra salvar. Confira a internet e tente de novo.";
const SEM_MENSAGEM = "Confira este campo.";

/**
 * A frase de cada campo, pelo caminho com os índices trocados por "*". É a frase da tela,
 * e não a do zod: o mesmo schema serve a API, e a lojista lê português. O 6b acrescenta
 * as do Perfil e do Divulgar aqui.
 */
export const MENSAGENS_DOS_CAMPOS: Readonly<Record<string, string>> = {
  links: "A página aceita até 20 links e um só em destaque.",
  "links.*.titulo": "Escreva o texto do botão.",
  "links.*.sub": "O texto de apoio vai até 80 letras.",
  "links.*.numero": "Número com DDD. Ex.: 62 99999-9999.",
  "links.*.mensagem": "A mensagem vai até 300 letras.",
  "links.*.campanhaId": "Escolha a campanha.",
  "links.*.url": "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo",
  "links.*.endereco": "Escreva o endereço da loja, com pelo menos 5 letras.",
  "links.*.horario": "O horário vai até 120 letras.",
};

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function ehPaginaBio(v: unknown): v is PaginaBio {
  if (!ehObjeto(v)) return false;
  const documento = v.documento;
  return (
    typeof v.id === "string" &&
    typeof v.slug === "string" &&
    typeof v.publicada === "boolean" &&
    typeof v.versao === "number" &&
    (v.bloqueadaEm === null || typeof v.bloqueadaEm === "string") &&
    ehObjeto(documento) &&
    Array.isArray(documento.links)
  );
}

function ehCampanha(v: unknown): boolean {
  return (
    ehObjeto(v) &&
    typeof v.id === "string" &&
    typeof v.nome === "string" &&
    (v.slug === null || typeof v.slug === "string")
  );
}

/** Guarda do GET: corpo fora do formato é erro de carga, nunca dado. */
export function ehRespostaDoPainelBio(v: unknown): v is RespostaDoPainelBio {
  if (!ehObjeto(v)) return false;
  const { pagina, campanhas, dominio, origemGirumo, sugestaoSlug, linksEscondidos } = v;
  return (
    (pagina === null || ehPaginaBio(pagina)) &&
    Array.isArray(campanhas) &&
    campanhas.every(ehCampanha) &&
    (dominio === null || typeof dominio === "string") &&
    typeof origemGirumo === "string" &&
    typeof sugestaoSlug === "string" &&
    Array.isArray(linksEscondidos) &&
    linksEscondidos.every((id) => typeof id === "string")
  );
}

export function estadoDe(pagina: PaginaBio): EstadoSalvavel {
  return { slug: pagina.slug, publicada: pagina.publicada, documento: pagina.documento };
}

export function contextoDe(r: RespostaDoPainelBio): ContextoDoEditor {
  return {
    campanhas: r.campanhas,
    dominio: r.dominio,
    origemGirumo: r.origemGirumo,
    sugestaoSlug: r.sugestaoSlug,
    linksEscondidos: r.linksEscondidos,
  };
}

/** JSON com as chaves em ordem: o jsonb do banco devolve outra ordem que a do zod, e ordem de chave não é mudança. */
function chaveEstavel(v: unknown): string {
  return JSON.stringify(v, (_chave, valor: unknown) =>
    ehObjeto(valor)
      ? Object.fromEntries(Object.entries(valor).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : valor,
  );
}

/** Mesmo conteúdo, em qualquer ordem de chaves. É o que decide "Alterações não salvas". */
export function mesmoConteudo(a: unknown, b: unknown): boolean {
  return chaveEstavel(a) === chaveEstavel(b);
}

/**
 * O endereço que vai na bio (§2, §8): a raiz do domínio próprio, se houver; senão o da
 * Girumo com o slug SALVO. Nunca a origem do navegador (`useLinkOrigin` devolveria o
 * domínio próprio, onde `/bio/*` é 404).
 */
export function enderecoPrincipal(c: Pick<ContextoDoEditor, "dominio" | "origemGirumo">, slug: string): string {
  return c.dominio ? `https://${c.dominio}/` : `${c.origemGirumo.replace(/\/+$/, "")}/bio/${slug}`;
}

/** "links.2.numero" → "links.*.numero". */
export function padraoDoCampo(campo: string): string {
  return campo.replace(/\.\d+(?=\.|$)/g, ".*");
}

export function mensagemDoCampo(campo: string): string {
  return MENSAGENS_DOS_CAMPOS[padraoDoCampo(campo)] ?? SEM_MENSAGEM;
}

/** O primeiro erro do documento inteiro, no mesmo formato do 400 da API. Roda antes do PATCH. */
export function erroDoDocumento(documento: DocumentoBio): ErroDeCampo | null {
  const r = documentoBio.safeParse(documento);
  if (r.success) return null;
  const issue = r.error.issues[0];
  const campo = (issue?.path ?? []).map(String).join(".");
  // Tabela da tela primeiro; senão a frase `custom` do superRefine (já em português); nunca a padrão do zod.
  const daTabela = MENSAGENS_DOS_CAMPOS[padraoDoCampo(campo)];
  const mensagem = daTabela ?? (issue?.code === "custom" && issue.message ? issue.message : SEM_MENSAGEM);
  return { campo, mensagem };
}

/**
 * O que fazer com a resposta do PATCH (§9): 200 `PaginaBio` · 400 `{ error, campo? }` · 404 ·
 * 409 `{ error, motivo }`. `texto` é o corpo cru: o 403 de permissão vem em texto puro.
 */
export function resultadoDoSalvar(status: number, corpo: unknown, texto: string): ResultadoDoSalvar {
  const o: Record<string, unknown> = ehObjeto(corpo) ? corpo : {};
  const erro = typeof o.error === "string" && o.error.trim() ? o.error.trim() : null;
  if (status === 200) {
    return ehPaginaBio(corpo) ? { tipo: "ok", pagina: corpo } : { tipo: "falha", mensagem: FALHA_AO_SALVAR };
  }
  if (status === 409 && o.motivo === "slug") {
    return { tipo: "campo", erro: { campo: "slug", mensagem: erro ?? "Esse endereço já é de outra loja. Escolha outro." } };
  }
  if (status === 409) return { tipo: "conflito", mensagem: MENSAGEM_DE_CONFLITO };
  if (status === 404) return { tipo: "conflito", mensagem: PAGINA_SUMIU };
  if (status === 400 && typeof o.campo === "string" && o.campo) {
    return { tipo: "campo", erro: { campo: o.campo, mensagem: erro ?? mensagemDoCampo(o.campo) } };
  }
  const cru = texto.trim();
  const legivel = cru && cru.length <= 200 && !cru.startsWith("<") ? cru : null;
  if (status >= 400 && status < 500) return { tipo: "falha", mensagem: erro ?? legivel ?? FALHA_AO_SALVAR };
  return { tipo: "falha", mensagem: FALHA_AO_SALVAR };
}
