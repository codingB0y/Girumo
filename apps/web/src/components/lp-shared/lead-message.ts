/**
 * Perguntas do formulário das landings e a mensagem que ele monta.
 *
 * O formulário NÃO grava nada no servidor: ele termina abrindo o WhatsApp de
 * vendas com a mensagem já escrita. É a decisão de 31/08/2026 — o CTA principal
 * é o WhatsApp de vendas, e a captura em banco do /demo foi revertida no #195.
 * O que as perguntas mudam é a conversa chegar qualificada (onde fica a loja,
 * quantos grupos), sem o vendedor ter que perguntar de novo.
 */

export type LeadOption = {
  label: string;
  /** Trecho que entra na mensagem do WhatsApp, em minúscula: "tenho de 6 a 20 grupos". */
  phrase: string;
};

export type LeadStep = {
  legend: string;
  options: readonly LeadOption[];
};

export const PERGUNTA_LOJA: LeadStep = {
  legend: "Onde fica a sua loja?",
  options: [
    { label: "Região da 44 (GO)", phrase: "minha loja fica na região da 44, em Goiânia" },
    { label: "Brás (SP)", phrase: "minha loja fica no Brás" },
    { label: "Bom Retiro (SP)", phrase: "minha loja fica no Bom Retiro" },
    { label: "Outro polo ou online", phrase: "vendo em outro polo ou online" },
  ],
};

export const PERGUNTA_GRUPOS: LeadStep = {
  legend: "Quantos grupos de WhatsApp você tem hoje?",
  options: [
    { label: "Ainda não tenho", phrase: "ainda não tenho grupo" },
    { label: "De 1 a 5", phrase: "tenho de 1 a 5 grupos" },
    { label: "De 6 a 20", phrase: "tenho de 6 a 20 grupos" },
    { label: "Mais de 20", phrase: "tenho mais de 20 grupos" },
  ],
};

export const PERGUNTA_SEGMENTO: LeadStep = {
  legend: "O que você vende?",
  options: [
    { label: "Roupa e acessórios", phrase: "vendo roupa e acessórios" },
    { label: "Outros produtos", phrase: "vendo outros produtos" },
    { label: "Serviços", phrase: "vendo serviços" },
    { label: "Estou começando", phrase: "estou começando agora" },
  ],
};

/** Nome digitado sem espaço sobrando e sem virar parágrafo na conversa. */
export function limpaNome(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().slice(0, 60);
}

export function buildLeadMessage(nome: string, phrases: readonly string[]): string {
  const limpo = limpaNome(nome);
  const abertura = limpo ? `Olá! Sou ${limpo}.` : "Olá!";
  const sobre = phrases.filter(Boolean).join(" e ");
  const contexto = sobre ? ` ${sobre.charAt(0).toUpperCase()}${sobre.slice(1)}.` : "";
  return `${abertura}${contexto} Quero ver a Girumo funcionando.`;
}

/**
 * Troca o texto pronto do link de WhatsApp, preservando número e demais params.
 *
 * `encodeURIComponent` e não `URLSearchParams`: o segundo codifica espaço como
 * `+`, e o wa.me nem sempre devolve o `+` como espaço na conversa.
 */
export function withWhatsAppText(baseUrl: string, text: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl;
  }
  url.searchParams.delete("text");
  const resto = url.searchParams.toString();
  return `${url.origin}${url.pathname}?${resto ? `${resto}&` : ""}text=${encodeURIComponent(text)}`;
}
