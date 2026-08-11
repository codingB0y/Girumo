/**
 * Kit de divulgação da landing page: URL pública, mensagem pronta pro WhatsApp
 * e o layout da imagem de story.
 *
 * Tudo aqui é puro de propósito. O componente (`components/pages/share-kit.tsx`)
 * junta com `window`/`canvas`; o teste roda sem DOM.
 *
 * Regra anti-ban: nada neste módulo dispara mensagem. O link `wa.me` abre o
 * WhatsApp do próprio lojista com o texto pronto — quem envia é ele, na mão.
 */

/** Story do Instagram/WhatsApp: 1080×1920 é o formato nativo. */
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** QR grande o bastante pra imprimir em A5 sem serrilhar. */
export const QR_EXPORT_SIZE = 1024;

export function buildPublicUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/p/${slug}`;
}

export type ShareMessageInput = {
  storeName: string;
  headline?: string | null;
  url: string;
};

/**
 * Mensagem que o lojista cola no grupo ou no story.
 *
 * A headline só entra quando existe e não repete o nome da loja: página recém
 * criada costuma ter os dois iguais, e a mensagem duplicada parece defeito.
 */
export function buildShareMessage({ storeName, headline, url }: ShareMessageInput): string {
  const nome = storeName.trim();
  const chamada = headline?.trim() ?? "";
  const blocos: string[] = [];

  if (nome) blocos.push(`*${nome}*`);
  if (chamada && chamada.toLowerCase() !== nome.toLowerCase()) blocos.push(chamada);
  blocos.push(url);

  return blocos.join("\n\n");
}

/** `wa.me` sem número = o WhatsApp pergunta pra quem enviar. */
export function buildWhatsAppShareHref(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function shareFileName(slug: string, variant: "qrcode" | "story"): string {
  return `girumo-${slug}-${variant}.png`;
}

/** Corta no limite preservando palavra inteira quando dá, com reticência. */
export function truncate(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * Quebra em linhas por contagem de caracteres — aproximação suficiente porque
 * o story usa fonte e tamanho fixos. Palavra que estoura a linha sozinha é
 * cortada, senão a última linha vazaria da imagem.
 */
export function wrapWords(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const palavras = text.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];

  const linhas: string[] = [];
  let atual = "";
  let sobrou = false;

  for (const palavra of palavras) {
    const candidata = atual ? `${atual} ${palavra}` : palavra;

    if (candidata.length <= maxCharsPerLine) {
      atual = candidata;
      continue;
    }

    if (atual) linhas.push(atual);

    if (linhas.length >= maxLines) {
      sobrou = true;
      atual = "";
      break;
    }

    atual = palavra.length > maxCharsPerLine ? truncate(palavra, maxCharsPerLine) : palavra;
  }

  if (atual) {
    if (linhas.length < maxLines) linhas.push(atual);
    else sobrou = true;
  }

  // Texto cortado sempre avisa que foi cortado — senão o story mente por omissão.
  if (sobrou && linhas.length > 0) {
    const i = linhas.length - 1;
    const linha = linhas[i];
    linhas[i] = linha.endsWith("…")
      ? linha
      : linha.length < maxCharsPerLine
        ? `${linha}…`
        : `${linha.slice(0, maxCharsPerLine - 1).trimEnd()}…`;
  }

  return linhas;
}
