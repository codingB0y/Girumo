/**
 * Dados e versionamento dos documentos legais.
 *
 * Fica num arquivo só porque os dois documentos, o rodapé e o registro de
 * aceite precisam concordar: se a versão exibida na página não for a mesma que
 * o banco grava, o registro de consentimento não prova nada — e provar QUAL
 * versão o titular aceitou é o ponto do registro (LGPD, art. 8º, §1º).
 *
 * Ao mudar qualquer texto dos documentos, suba `LEGAL_VERSION` e
 * `LEGAL_EFFECTIVE_DATE` no mesmo commit.
 */

export const LEGAL_VERSION = "2026-08-26";
export const LEGAL_EFFECTIVE_DATE = "26 de agosto de 2026";

/**
 * Identificação do controlador.
 *
 * PENDENTE DE PREENCHIMENTO PELO IGOR — os três campos abaixo são os únicos que
 * o código não tem como descobrir, e sem eles o documento não identifica quem
 * responde pelos dados. `LEGAL_ENTITY_PENDING` existe para a página avisar em
 * vez de publicar um contrato com lacuna silenciosa.
 */
export const LEGAL_ENTITY = {
  /** Razão social completa, como no cartão CNPJ. */
  legalName: "",
  /** Só números ou formatado — o texto usa como veio. */
  taxId: "",
  /** Cidade/UF do foro. */
  jurisdiction: "Goiânia, Goiás",
} as const;

/** Canal do titular para exercer direitos da LGPD e falar de contrato. */
export const LEGAL_CONTACT_EMAIL = "contato@girumo.com.br";

/** True enquanto faltar razão social ou CNPJ. */
export const LEGAL_ENTITY_PENDING =
  LEGAL_ENTITY.legalName.trim() === "" || LEGAL_ENTITY.taxId.trim() === "";

/**
 * Como o controlador se identifica no corpo do texto.
 *
 * Sem os dados preenchidos devolve o nome comercial — o aviso de pendência é
 * responsabilidade da página, não daqui. Quem monta frase em volta disto deve
 * usar `controllerSentence`, senão sai "operada por Girumo".
 */
export function controllerLine(): string {
  if (LEGAL_ENTITY_PENDING) return "Girumo";
  return `${LEGAL_ENTITY.legalName}, inscrita no CNPJ sob o nº ${LEGAL_ENTITY.taxId}`;
}

/**
 * A frase de abertura dos Termos, inteira.
 *
 * Existe porque interpolar `controllerLine()` em "A Girumo é operada por ..."
 * produz "A Girumo é operada por Girumo" enquanto os dados não estão
 * preenchidos. Com a frase montada aqui, os dois estados saem naturais.
 */
export function controllerSentence(): string {
  if (LEGAL_ENTITY_PENDING) {
    return "A Girumo (“Girumo”, “nós”) é a plataforma descrita neste documento.";
  }
  return `A Girumo é operada por ${controllerLine()} (“Girumo”, “nós”).`;
}

/** Terceiros que processam dado a nosso mando. Citar é exigência da LGPD. */
export const SUBPROCESSORS: ReadonlyArray<{ name: string; role: string; where: string }> = [
  { name: "Supabase", role: "Banco de dados e autenticação", where: "Estados Unidos" },
  { name: "Vercel", role: "Hospedagem da aplicação", where: "Estados Unidos e Brasil" },
  { name: "Stripe", role: "Processamento de pagamentos", where: "Estados Unidos" },
  { name: "Resend", role: "Envio de e-mails da plataforma", where: "Estados Unidos" },
  { name: "Upstash", role: "Controle de uso e limites de requisição", where: "Estados Unidos" },
];
