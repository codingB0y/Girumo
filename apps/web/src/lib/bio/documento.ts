/**
 * O documento do link da bio (spec 2026-10-19-link-da-bio §4 e §9): uma página = um JSON,
 * validado só aqui. Puro de propósito — o painel valida no navegador antes de salvar e a API
 * valida de novo no servidor, com o MESMO schema. Nada de server-only, Supabase ou Node.
 */

export const MODELOS = ["etiqueta", "vitrine", "romaneio", "classico"] as const;
export type Modelo = (typeof MODELOS)[number];

/** `azul` é a paleta que o mockup (paletas.json) chama de `mks`. */
export const PALETAS = {
  etiqueta: ["azul", "rosa", "menta", "grafite"],
  vitrine: ["papel", "noite", "rose", "azul"],
  romaneio: ["kraft", "caneta", "nota", "azul"],
  classico: ["claro", "escuro", "lavanda", "azul"],
} as const;

export const ICONES = [
  "whatsapp", "catalogo", "coroa", "mapa", "canal", "instagram", "site", "sacola",
  "etiqueta", "caminhao", "video", "cartao", "link",
] as const;
export type Icone = (typeof ICONES)[number];

/** `id` = `^[A-Za-z0-9_-]+$` (o id de `/api/p/media/<id>`); foco `x`,`y` em 0..1. */
export type MidiaRef = { id: string; foco: { x: number; y: number } | null };
type Base = { id: string; titulo: string; sub: string; icone: Icone; ativo: boolean };
export type LinkBio =
  | (Base & { tipo: "whatsapp"; destaque: boolean; numero: string; mensagem: string })
  | (Base & { tipo: "grupo"; destaque: boolean; campanhaId: string })
  | (Base & { tipo: "link"; destaque: boolean; url: string; fotos: MidiaRef[] })
  | (Base & { tipo: "endereco"; endereco: string; horario: string; foto: MidiaRef | null });
export type DocumentoBio = {
  v: 1;
  modelo: Modelo;
  /** De `PALETAS[modelo]` ou `"marca"`. */
  paleta: string;
  /** `#RRGGBB` maiúsculo; obrigatório quando `paleta = "marca"`. */
  cores: { fundo: string; botao: string } | null;
  animar: boolean;
  feitoComGirumo: boolean;
  perfil: {
    nome: string;
    frase: string;
    destaques: string[];
    local: string;
    instagram: string;
    capa: MidiaRef | null;
    capaAlt: string;
    logoClara: MidiaRef | null;
    logoEscura: MidiaRef | null;
  };
  /** `cnpj` sem pontuação: 14 dígitos (ou 12 letras/dígitos + 2 dígitos, o CNPJ alfanumérico). */
  confere: { ativo: boolean; razao: string; cnpj: string; linhas: string[] };
  rastreio: { metaPixelId: string; ga4Id: string };
  links: LinkBio[];
};

/**
 * O que o renderizador recebe. Mora aqui, e não no renderizador, porque o cache e o conferir
 * (PR 2) usam antes de o PR 3a existir.
 */
export type DadosRender = {
  documento: DocumentoBio;
  paginaId: string;
  /** campanhaId -> slug do link mestre (só as que existem e têm link mestre). */
  campanhas: Record<string, string>;
  /** Ids que não saem: número conectado (whatsapp ou wa.me) ou campanha sumida/sem link mestre. */
  linksEscondidos: string[];
  origem: string;
  dominioProprio: boolean;
};

/** 3 a 40, letras minúsculas, números e hífen simples (o CHECK de `bio_pages.slug`). */
export const SLUG_BIO = /^(?=.{3,40}$)[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  "_dominio", "admin", "api", "bio", "girumo", "painel", "login", "ajuda", "suporte",
]);
export function slugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.has(slug) || slug.includes("girumo") || slug.includes("hubflow");
}

/** Uuid minúsculo: o mesmo formato do CHECK de `bio_contagens.alvo` (maiúsculo vira 23514). */
export const UUID_BIO = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
