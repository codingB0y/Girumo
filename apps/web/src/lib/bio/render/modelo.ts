/**
 * O que cada modelo do link da bio entrega ao `index.ts`, e o que recebe dele.
 * O PR 3b cria vitrine.ts, romaneio.ts e classico.ts com este formato.
 */
import type { TokensBio } from "@/lib/bio/cores";
import type { DadosRender, LinkBio, MidiaRef } from "@/lib/bio/documento";

export type ModoRender = "publica" | "previa";

/** Um woff2 (subset latin) em `public/fonts/bio/<arquivo>`; vira @font-face e preload. */
export type FonteDoModelo = {
  familia: string; // nome usado no CSS do modelo, ex. "Lexend"
  arquivo: string; // caminho sob /fonts/bio/, ex. "lexend/lexend-latin.woff2"
  peso: string; // descritor font-weight: "100 900" (variável) ou "400"
  estilo: "normal" | "italic";
};

/** Link que sai na página: ativo, fora de `linksEscondidos` e com destino válido. */
export type LinkVisivel = {
  link: LinkBio;
  href: string; // destino; no `endereco` é o "Abrir no Google Maps"
  principal: boolean; // o primeiro `destaque` (nunca um `endereco`)
};

/** Logo escolhida pela luminância do fundo; `placa` quando só existe a do fundo errado. */
export type LogoDaPagina = { midia: MidiaRef; placa: "clara" | "escura" | null };

export type ContextoRender = {
  d: DadosRender;
  modo: ModoRender;
  tokens: TokensBio; // já revalidados: chave "--nome", valor "#RRGGBB"
  links: readonly LinkVisivel[];
  logo: LogoDaPagina | null;
};

export type ModeloRender = {
  fontes: readonly FonteDoModelo[];
  /** CSS fixo: nenhuma interpolação; cor de paleta só por var(--…); a fonte do texto em `.lk{font-family:…}`. */
  css: string;
  /** `theme-color` (hex) a partir dos tokens. */
  corDoTopo: (t: TokensBio) => string;
  /** Fundo (hex) atrás da logo: decide entre logoClara e logoEscura. */
  fundoDoLogo: (t: TokensBio) => string;
  /** O `<main>` do modelo, com exatamente um `<h1>`. */
  corpo: (c: ContextoRender) => string;
};
