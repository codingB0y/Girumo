import { z } from "zod";

import { normalizeWhatsappBR } from "@/lib/pages/phone";

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

const COR = /^#[0-9A-F]{6}$/;
const ENDERECO_INVALIDO = "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo";

/**
 * Texto que o jsonb aceita: sem NUL e sem metade de emoji (surrogate solto) — os dois viram 500
 * no Postgres em vez de 400 aqui. `encodeURIComponent` lança exatamente no surrogate solto.
 */
function gravavel(v: string): boolean {
  if (v.includes("\u0000")) return false;
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

function texto(max: number, obrigatorio?: string) {
  const campo = z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .refine(gravavel, "Esse texto tem um caractere que não dá para salvar. Apague e digite de novo.");
  return obrigatorio ? campo.min(1, obrigatorio) : campo;
}

/** Corta em `max` unidades (a conta do `.max` do zod) sem deixar metade de um emoji no fim. */
function corta(v: string, max: number): string {
  const cortado = v.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cortado) ? cortado.slice(0, -1) : cortado;
}

/** Dígitos verificadores do CNPJ, numérico ou alfanumérico (cada caractere vale o código ASCII − 48). */
function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * ((base.length - 1 - i) % 8 + 2), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = dv(cnpj.slice(0, 12));
  return primeiro === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

const midia = z.strictObject({
  id: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/, "Imagem inválida. Envie de novo."),
  foco: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable(),
});

const cor = z.string().trim().toUpperCase().regex(COR, "Escolha uma cor.");

/** "62 99999-9999", "(62) 9 9999-9999", "+55 62…" → "5562999999999". */
const numero = z
  .string()
  .max(30, "Número com DDD, só o celular. Ex.: 62 99999-9999.")
  .transform((bruto, ctx) => {
    const e164 = normalizeWhatsappBR(bruto);
    if (!e164) {
      ctx.addIssue("Número com DDD, só o celular. Ex.: 62 99999-9999.");
      return z.NEVER;
    }
    return e164.slice(1);
  });

/** Só http/https, host com ponto; sem esquema ganha `https://`. Guarda `url.href` (≤ 500). */
const url = z
  .string()
  .max(600, "Endereço longo demais (até 500 caracteres).")
  .transform((bruto, ctx) => {
    const limpo = bruto.trim();
    if (!limpo) {
      ctx.addIssue("Cole o endereço do link.");
      return z.NEVER;
    }
    let lido: URL;
    try {
      lido = new URL(/^[a-z][a-z0-9+.-]*:/i.test(limpo) ? limpo : `https://${limpo}`);
    } catch {
      ctx.addIssue(ENDERECO_INVALIDO);
      return z.NEVER;
    }
    if (lido.protocol !== "https:" && lido.protocol !== "http:") {
      ctx.addIssue("Só endereços de site (que começam com http ou https).");
      return z.NEVER;
    }
    if (!/\.[a-z]{2,}$/i.test(lido.hostname)) {
      ctx.addIssue(ENDERECO_INVALIDO);
      return z.NEVER;
    }
    if (lido.href.length > 500) {
      ctx.addIssue("Endereço longo demais (até 500 caracteres).");
      return z.NEVER;
    }
    return lido.href;
  });

/** Aceita com ou sem pontuação; guarda sem pontuação e em maiúsculas. Vazio vale. */
const cnpj = z
  .string()
  .max(30, "CNPJ inválido. Confira os números.")
  .transform((bruto, ctx) => {
    const limpo = bruto.replace(/[\s./-]/g, "").toUpperCase();
    if (limpo && !cnpjValido(limpo)) {
      ctx.addIssue("CNPJ inválido. Confira os números.");
      return z.NEVER;
    }
    return limpo;
  });

const base = {
  id: z.string().regex(UUID_BIO, "Link inválido. Apague e crie de novo."),
  titulo: texto(50, "Escreva o texto do botão."),
  sub: texto(80),
  icone: z.enum(ICONES),
  ativo: z.boolean(),
};

const link = z.discriminatedUnion("tipo", [
  z.strictObject({ ...base, tipo: z.literal("whatsapp"), destaque: z.boolean(), numero, mensagem: texto(300) }),
  z.strictObject({
    ...base,
    tipo: z.literal("grupo"),
    destaque: z.boolean(),
    campanhaId: z.string().regex(UUID_BIO, "Escolha a campanha."),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("link"),
    destaque: z.boolean(),
    url,
    fotos: z.array(midia).max(3, "Até 3 fotos."),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("endereco"),
    endereco: texto(200, "Escreva o endereço da loja.").min(5, "Escreva o endereço da loja."),
    horario: texto(120),
    foto: midia.nullable(),
  }),
]);

/**
 * Fonte única da validação. `strictObject`: campo desconhecido é erro. Normaliza número
 * (`55`+dígitos), url (`href`), cnpj (sem pontuação), cores (maiúsculas) e @ do Instagram.
 * Mensagens em português, prontas para aparecer embaixo do campo; o caminho do campo é
 * `issue.path.join(".")` (ex.: "links.2.numero").
 */
export const documentoBio: z.ZodType<DocumentoBio> = z
  .strictObject({
    v: z.literal(1),
    modelo: z.enum(MODELOS),
    paleta: z.string(),
    cores: z.strictObject({ fundo: cor, botao: cor }).nullable(),
    animar: z.boolean(),
    feitoComGirumo: z.boolean(),
    perfil: z.strictObject({
      nome: texto(60, "Escreva o nome da loja."),
      frase: texto(120),
      destaques: z.array(texto(40, "Escreva o destaque ou apague a linha.")).max(3, "Até 3 destaques."),
      local: texto(90),
      instagram: z
        .string()
        .trim()
        .toLowerCase()
        .overwrite((v) => v.replace(/^@+/, ""))
        .max(30, "Use no máximo 30 caracteres.")
        .regex(/^[a-z0-9._]*$/, "Só letras, números, ponto e _ (sem @)."),
      capa: midia.nullable(),
      capaAlt: texto(140),
      logoClara: midia.nullable(),
      logoEscura: midia.nullable(),
    }),
    confere: z.strictObject({
      ativo: z.boolean(),
      razao: texto(120),
      cnpj,
      linhas: z.array(texto(160, "Escreva a linha ou apague.")).max(2, "Até 2 linhas."),
    }),
    rastreio: z.strictObject({
      metaPixelId: z.string().trim().regex(/^(\d{5,20})?$/, "O ID do Pixel tem só números (5 a 20)."),
      ga4Id: z
        .string()
        .trim()
        .toUpperCase()
        .max(30, "O ID do GA4 começa com G-.")
        .regex(/^(G-[A-Z0-9]{4,})?$/, "O ID do GA4 começa com G-."),
    }),
    links: z.array(link).max(20, "Até 20 links."),
  })
  .superRefine((doc, ctx) => {
    const prontas: readonly string[] = PALETAS[doc.modelo];
    if (doc.paleta !== "marca" && !prontas.includes(doc.paleta)) {
      ctx.addIssue({ code: "custom", message: "Escolha uma das paletas do modelo.", path: ["paleta"] });
    }
    if (doc.paleta === "marca" && !doc.cores) {
      ctx.addIssue({ code: "custom", message: "Escolha as duas cores da marca.", path: ["cores"] });
    }
    const vistos = new Set<string>();
    let destaques = 0;
    doc.links.forEach((l, i) => {
      if (vistos.has(l.id)) {
        ctx.addIssue({ code: "custom", message: "Link repetido. Apague um deles.", path: ["links", i, "id"] });
      }
      vistos.add(l.id);
      if (l.tipo !== "endereco" && l.destaque && ++destaques > 1) {
        ctx.addIssue({ code: "custom", message: "Só um link pode ser o principal.", path: ["links", i, "destaque"] });
      }
    });
  });

/**
 * A página do "Criar minha página" (spec §8): modelo Etiqueta, paleta azul, nome da loja e,
 * se a loja tiver campanha com link mestre, o botão do grupo VIP (textos do mockup).
 */
export function documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio {
  return {
    v: 1,
    modelo: "etiqueta",
    paleta: "azul",
    cores: null,
    animar: true,
    feitoComGirumo: true,
    perfil: {
      nome: corta(i.nome.trim(), 60).trim() || "Minha loja",
      frase: "",
      destaques: [],
      local: "",
      instagram: "",
      capa: null,
      capaAlt: "",
      logoClara: null,
      logoEscura: null,
    },
    confere: { ativo: false, razao: "", cnpj: "", linhas: [] },
    rastreio: { metaPixelId: "", ga4Id: "" },
    links: i.campanhaId
      ? [
          {
            id: crypto.randomUUID(),
            tipo: "grupo",
            titulo: "Entrar no grupo VIP",
            sub: "Kit novo e reposição saem primeiro no grupo",
            icone: "coroa",
            ativo: true,
            destaque: false,
            campanhaId: i.campanhaId,
          },
        ]
      : [],
  };
}
