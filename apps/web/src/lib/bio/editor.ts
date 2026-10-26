// apps/web/src/lib/bio/editor.ts
import {
  documentoBio,
  documentoPadrao,
  type DadosRender,
  type DocumentoBio,
  type Icone,
  type LinkBio,
  type Modelo,
} from "@/lib/bio/documento";
import type { CampanhaDoPainel, CorpoDoPatchBio, RespostaDoPainelBio } from "@/lib/bio/painel-api";
import { formatPhoneBR } from "@/lib/phone";
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
  "links.*.fotos": "Confira as fotos deste botão. Envie de novo.",
  "links.*.foto": "Confira a foto da fachada. Envie de novo.",
  "perfil.nome": "Escreva o nome da loja.",
  "perfil.instagram": "No @ do Instagram só vão letras, números, ponto e _.",
  "confere.cnpj": "Confira o CNPJ: os números não batem.",
  "rastreio.metaPixelId": "Confira o ID do pixel: só números, de 5 a 20. Está no Gerenciador de Eventos da Meta.",
  "rastreio.ga4Id": "Confira o ID de medição: G- e pelo menos 4 letras ou números, como G-AB12CD34EF.",
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

// --------------------------------------------------------------- links (§4, §8)

/** "links | 0–20" (§4). */
export const MAX_LINKS = 20;

export type IdDoAtalho = "whatsapp" | "grupo" | "catalogo" | "endereco" | "canal" | "outro";
export type Atalho = { id: IdDoAtalho; nome: string; descricao: string; icone: Icone };

/** Os 6 atalhos da folha "Adicionar link" (§8), na ordem do mockup. */
export const ATALHOS: readonly Atalho[] = [
  { id: "whatsapp", nome: "WhatsApp da loja", descricao: "Conversa com a vendedora, com a mensagem já escrita", icone: "whatsapp" },
  { id: "grupo", nome: "Grupo VIP", descricao: "Entra no grupo da campanha que estiver com vaga", icone: "coroa" },
  { id: "catalogo", nome: "Catálogo ou site", descricao: "Catálogo, loja virtual ou qualquer página sua", icone: "catalogo" },
  { id: "endereco", nome: "Como chegar", descricao: "Endereço, horário e o mapa, ali na página", icone: "mapa" },
  { id: "canal", nome: "Canal do WhatsApp", descricao: "Novidades sem precisar conversar", icone: "canal" },
  { id: "outro", nome: "Outro link", descricao: "Instagram, TikTok, YouTube ou qualquer endereço", icone: "link" },
];

/** Os ícones que o link comum escolhe (o WhatsApp tem o seu, fixo), com o nome lido em voz alta. */
export const ICONES_DO_SELETOR: readonly (readonly [Icone, string])[] = [
  ["link", "Link"],
  ["catalogo", "Catálogo"],
  ["site", "Site"],
  ["sacola", "Sacola"],
  ["etiqueta", "Etiqueta"],
  ["instagram", "Instagram"],
  ["canal", "Canal"],
  ["video", "Vídeo"],
  ["coroa", "Coroa"],
  ["mapa", "Mapa"],
  ["caminhao", "Entrega"],
  ["cartao", "Pagamento"],
];

/** Os campos que a folha edita, na ordem da tela: é a ordem do "primeiro campo com erro". */
export const CAMPOS_DO_LINK = ["titulo", "sub", "numero", "mensagem", "campanhaId", "url", "fotos", "endereco", "horario", "foto"] as const;
export type CampoDoLink = (typeof CAMPOS_DO_LINK)[number];
/** Erros da folha por campo; "geral" = erro do link que não é de um campo da folha (ex.: foto que não é da loja). */
export type ErrosDoLink = Partial<Record<CampoDoLink | "geral", string>>;

/** O que decide o aviso vermelho de um link (§8): a lista do GET e a versão salva. */
export type ContextoDosAvisos = {
  campanhas: readonly CampanhaDoPainel[];
  linksEscondidos: readonly string[];
  salvos: readonly LinkBio[];
};

const ERRO_GERAL_DO_LINK = "Confira os dados deste link.";

function ehCampoDoLink(v: unknown): v is CampoDoLink {
  return typeof v === "string" && (CAMPOS_DO_LINK as readonly string[]).includes(v);
}

/**
 * Link novo de um atalho, com tipo, ícone e textos padrão (mockup "Adicionar link"). `id` vem
 * de fora: `crypto.randomUUID()` no navegador, fixo no teste. O Grupo VIP nasce na primeira
 * campanha com link.
 */
export function linkDoAtalho(atalho: IdDoAtalho, o: { id: string; campanhas: readonly CampanhaDoPainel[] }): LinkBio {
  const base = { id: o.id, sub: "", ativo: true };
  switch (atalho) {
    case "whatsapp":
      return {
        ...base,
        tipo: "whatsapp",
        titulo: "Falar com a vendedora",
        sub: "Pedido, preço e estoque no WhatsApp",
        icone: "whatsapp",
        destaque: false,
        numero: "",
        mensagem: "Oi! Vim pelo Instagram e quero fazer um pedido. (BIO)",
      };
    case "grupo": {
      const campanha = o.campanhas.find((c) => c.slug !== null) ?? o.campanhas[0];
      return {
        ...base,
        tipo: "grupo",
        titulo: "Entrar no grupo VIP",
        sub: "Novidade e reposição saem primeiro no grupo",
        icone: "coroa",
        destaque: false,
        campanhaId: campanha?.id ?? "",
      };
    }
    case "catalogo":
      return { ...base, tipo: "link", titulo: "Catálogo", sub: "Veja os produtos e os preços", icone: "catalogo", destaque: false, url: "", fotos: [] };
    case "endereco":
      return { ...base, tipo: "endereco", titulo: "Como chegar na loja", sub: "Endereço, horário e o mapa", icone: "mapa", endereco: "", horario: "", foto: null };
    case "canal":
      return { ...base, tipo: "link", titulo: "Seguir o canal da loja", sub: "Novidades no seu WhatsApp", icone: "canal", destaque: false, url: "", fotos: [] };
    case "outro":
      return { ...base, tipo: "link", titulo: "", icone: "link", destaque: false, url: "", fotos: [] };
  }
}

/** O link como a folha edita: o número volta formatado ("+55 62 99999-0000"); o resto, igual. */
export function rascunhoDoLink(link: LinkBio): LinkBio {
  return link.tipo === "whatsapp" ? { ...link, numero: formatPhoneBR(link.numero) ?? link.numero } : link;
}

/** Os erros do zod que caem no link `indice`, por campo da folha (o primeiro de cada campo vence). */
export function errosDoLink(issues: readonly { readonly path: readonly PropertyKey[] }[], indice: number): ErrosDoLink {
  const erros: ErrosDoLink = {};
  for (const { path } of issues) {
    if (path[0] !== "links" || path[1] !== indice) continue;
    const campo = path[2];
    if (ehCampoDoLink(campo)) erros[campo] ??= mensagemDoCampo(`links.${indice}.${campo}`);
    else erros.geral ??= ERRO_GERAL_DO_LINK;
  }
  return erros;
}

/**
 * Valida UM link com o mesmo `documentoBio` do servidor, dentro do documento padrão (válido).
 * A saída vem normalizada pelo schema (endereço com https://, número com 55); o texto do botão
 * e o de apoio vão aparados.
 */
export function validarLink(link: LinkBio): { ok: true; link: LinkBio } | { ok: false; erros: ErrosDoLink } {
  const limpo = { ...link, titulo: link.titulo.trim(), sub: link.sub.trim() };
  const r = documentoBio.safeParse({ ...documentoPadrao({ nome: "Loja", campanhaId: null }), links: [limpo] });
  if (r.success) return { ok: true, link: r.data.links[0] };
  const erros = errosDoLink(r.error.issues, 0);
  return { ok: false, erros: Object.keys(erros).length > 0 ? erros : { geral: ERRO_GERAL_DO_LINK } };
}

/** "links.2.numero" → a folha do link 2 com o erro no Número; "links.2.fotos.0" → erro nas fotos do botão; fora de um link → null. */
export function erroNoLink(erro: ErroDeCampo): { indice: number; erros: ErrosDoLink } | null {
  const [raiz, indice, campo] = erro.campo.split(".");
  if (raiz !== "links" || indice === undefined || !/^\d+$/.test(indice)) return null;
  const erros: ErrosDoLink = {};
  if (ehCampoDoLink(campo)) erros[campo] = erro.mensagem;
  else erros.geral = erro.mensagem;
  return { indice: Number(indice), erros };
}

export function primeiroCampoComErro(erros: ErrosDoLink): CampoDoLink | null {
  return CAMPOS_DO_LINK.find((campo) => erros[campo]) ?? null;
}

/** A segunda linha de cada link na lista (mockup). */
export function resumoDoLink(link: LinkBio, campanhas: readonly CampanhaDoPainel[]): string {
  switch (link.tipo) {
    case "whatsapp":
      return `WhatsApp · ${formatPhoneBR(link.numero) ?? "sem número"}`;
    case "grupo":
      return `Grupo VIP · ${campanhas.find((c) => c.id === link.campanhaId)?.nome ?? "campanha apagada"}`;
    case "endereco":
      return link.endereco.split("\n")[0]?.trim() || "Sem endereço";
    case "link":
      return link.url.replace(/^https?:\/\//i, "").replace(/\/$/, "") || "Sem endereço";
  }
}

function destinoDe(link: LinkBio): string {
  return link.tipo === "whatsapp" ? link.numero : link.tipo === "link" ? link.url : "";
}

/**
 * Por que o link não sai na página mesmo ligado (§4, §6), ou null. Campanha: decide aqui, pela
 * lista do GET (apagada ou sem link). Número conectado: só a API sabe (ela vê as instâncias), e o
 * aviso vale enquanto o número (ou o endereço wa.me) é o mesmo da versão salva — trocou, o aviso
 * sai, e o salvar confere de novo.
 */
export function avisoDoLink(link: LinkBio, c: ContextoDosAvisos): string | null {
  if (link.tipo === "grupo") {
    const campanha = c.campanhas.find((x) => x.id === link.campanhaId);
    if (!campanha) return "A campanha deste botão foi apagada. Escolha outra campanha.";
    return campanha.slug === null ? "Essa campanha não tem link pra entrar no grupo. Escolha outra campanha." : null;
  }
  if (link.tipo === "endereco" || !c.linksEscondidos.includes(link.id)) return null;
  const salvo = c.salvos.find((s) => s.id === link.id);
  if (!salvo || salvo.tipo !== link.tipo || destinoDe(salvo) !== destinoDe(link)) return null;
  return link.tipo === "whatsapp"
    ? "Este é o número conectado na Girumo, então o botão saiu da página. Troque pelo número de atendimento."
    : "Este endereço leva pro número conectado na Girumo, então o botão saiu da página. Troque o endereço.";
}

/** "4 links · 3 aparecendo na página": aparecendo = ligado e sem aviso (o que a página vai mostrar). */
export function contagemDosLinks(links: readonly LinkBio[], c: ContextoDosAvisos): string {
  const aparecendo = links.filter((l) => l.ativo && avisoDoLink(l, c) === null).length;
  return `${links.length} ${links.length === 1 ? "link" : "links"} · ${aparecendo} aparecendo na página`;
}

/** Põe o link na lista (troca o de mesmo id, ou entra no fim). Destaque é um só (§4): ligar num desliga nos outros. */
export function comLink(links: readonly LinkBio[], link: LinkBio): LinkBio[] {
  const lista = links.some((l) => l.id === link.id)
    ? links.map((l) => (l.id === link.id ? link : l))
    : [...links, link];
  if (link.tipo === "endereco" || !link.destaque) return lista;
  return lista.map((l) => (l.id !== link.id && l.tipo !== "endereco" && l.destaque ? { ...l, destaque: false } : l));
}

export function semLink(links: readonly LinkBio[], id: string): LinkBio[] {
  return links.filter((l) => l.id !== id);
}

export function alternarLink(links: readonly LinkBio[], id: string): LinkBio[] {
  return links.map((l) => (l.id === id ? { ...l, ativo: !l.ativo } : l));
}

/** Sobe (-1) ou desce (+1) uma posição; na ponta, devolve a mesma ordem. */
export function moverLink(links: readonly LinkBio[], id: string, passo: -1 | 1): LinkBio[] {
  const lista = [...links];
  const i = lista.findIndex((l) => l.id === id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return lista;
}

/** O que o leitor de tela ouve depois de Subir/Descer (§8, `aria-live`). */
export function anuncioDaOrdem(titulo: string, posicao: number, total: number): string {
  return `${titulo}: agora é o ${posicao}º de ${total}.`;
}

// --------------------------------------------------------- prévia e saída (§8)

/** O nome de cada modelo, para o chip da prévia (e as miniaturas do 6b). */
export const NOME_DO_MODELO: Readonly<Record<Modelo, string>> = {
  etiqueta: "Etiqueta",
  vitrine: "Vitrine",
  romaneio: "Romaneio",
  classico: "Clássico",
};

/** Os ids que não saem na página agora (§6): o `linksEscondidos` que a prévia desenha. */
export function escondidosNaTela(links: readonly LinkBio[], c: ContextoDosAvisos): string[] {
  return links.filter((l) => avisoDoLink(l, c) !== null).map((l) => l.id);
}

/**
 * Os dados que a prévia passa ao `renderPaginaBio` (PR 3a): o RASCUNHO, com as campanhas e os
 * escondidos do jeito que a página pública vai ver depois de salvar.
 */
export function dadosDaPrevia(pagina: PaginaBio, documento: DocumentoBio, c: ContextoDoEditor): DadosRender {
  return {
    documento,
    paginaId: pagina.id,
    campanhas: Object.fromEntries(c.campanhas.flatMap((x) => (x.slug ? [[x.id, x.slug] as const] : []))),
    linksEscondidos: escondidosNaTela(documento.links, {
      campanhas: c.campanhas,
      linksEscondidos: c.linksEscondidos,
      salvos: pagina.documento.links,
    }),
    origem: c.dominio ? `https://${c.dominio}` : c.origemGirumo.replace(/\/+$/, ""),
    dominioProprio: c.dominio !== null,
  };
}

/** O que a guarda de saída lê do clique (fase de captura). */
export type CliqueLido = {
  defaultPrevented: boolean;
  button: number;
  comModificador: boolean;
  alvo: { href: string; target: string; download: boolean } | null;
};

/**
 * Para onde o clique ia levar DENTRO do app, ou null quando não é navegação daqui (outra aba,
 * download, outro site, a mesma tela, clique com modificador). Outro site fica com o
 * `beforeunload` do navegador.
 */
export function destinoInterno(c: CliqueLido, aqui: { origin: string; pathname: string; search: string }): string | null {
  if (c.defaultPrevented || c.button !== 0 || c.comModificador || !c.alvo) return null;
  if ((c.alvo.target && c.alvo.target !== "_self") || c.alvo.download) return null;
  let url: URL;
  try {
    url = new URL(c.alvo.href);
  } catch {
    return null;
  }
  if (url.origin !== aqui.origin) return null;
  if (url.pathname === aqui.pathname && url.search === aqui.search) return null;
  return url.pathname + url.search + url.hash;
}

// ------------------------------------------------- erro nas abas do 6b (§8, §11)

/** Id do elemento que mostra um campo do documento: "perfil.nome" → "bio-perfil-nome"; "slug" → "bio-slug". */
export function idNaTela(campo: string): string {
  return `bio-${campo.replaceAll(".", "-")}`;
}

/**
 * O lugar da aba que mostra o erro: o mais longo da lista que é o caminho do erro ou o começo
 * dele ("perfil.capa" mostra "perfil.capa.id"); null quando a aba não tem lugar para ele.
 */
export function lugarDoErro(campo: string, lugares: readonly string[]): string | null {
  let achado: string | null = null;
  for (const lugar of lugares) {
    const cobre = campo === lugar || campo.startsWith(`${lugar}.`);
    if (cobre && (achado === null || lugar.length > achado.length)) achado = lugar;
  }
  return achado;
}

/**
 * A frase do erro do documento NESTE campo (caminho exato), ou null. É o mesmo `documentoBio`
 * do salvar: o painel avisa antes (o CNPJ com 14 dígitos errados, o @ com espaço).
 */
export function erroNoCampo(documento: DocumentoBio, campo: string): string | null {
  const r = documentoBio.safeParse(documento);
  if (r.success) return null;
  return r.error.issues.some((issue) => issue.path.map(String).join(".") === campo) ? mensagemDoCampo(campo) : null;
}
