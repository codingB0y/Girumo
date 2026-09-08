import { precisaParearDeNovo } from "@/lib/instance-disconnect-reason";

/**
 * A casa do número na Vitrine Aberta (spec 12.6, aba Conexão).
 *
 * O que dá pra decidir sem navegador mora aqui: qual das cenas mostrar, o
 * estado da conexão como etiqueta e o número no formato do cartão. A tela só
 * desenha.
 */

/** O recorte da instância que a tela usa para decidir. */
export type InstanciaDaTela = {
  status: string;
  phone: string | null;
  qr_code: string | null;
  /** Primeiro pareamento bem-sucedido. Nunca volta a ser null. */
  connected_at: string | null;
  /** Guarda `lastDisconnectReason` — ver o webhook de `connection.update`. */
  metadata?: Record<string, unknown> | null;
};

export type LeituraDaConexao = {
  instancia: InstanciaDaTela | null;
  carregando: boolean;
  erro: string | null;
};

export type CenaDaConexao = "conectado" | "reconexao" | "primeiro-acesso" | "indefinido";

/**
 * Qual tela mostrar.
 *
 * `indefinido` existe porque `instancia === null` responde a duas perguntas
 * diferentes: "este tenant nunca pareou" e "a consulta ainda não respondeu (ou
 * falhou)". Sem separar as duas, quem está conectado há meses recebia o
 * onboarding de boas-vindas sempre que `/api/instances` engasgava.
 */
export function cenaDaConexao({ instancia, carregando, erro }: LeituraDaConexao): CenaDaConexao {
  if (instancia) {
    if (instancia.status === "connected") return "conectado";
    return instancia.connected_at ? "reconexao" : "primeiro-acesso";
  }
  // Só sem instância na mão é que não saber importa: com ela, recarregar em
  // segundo plano não pode apagar a cena que já está na tela.
  if (carregando || erro) return "indefinido";
  return "primeiro-acesso";
}

export type TomDaEtiqueta = "conectado" | "andamento" | "espera" | "atencao" | "indefinido";

export type EtiquetaDaConexao = {
  texto: string;
  tom: TomDaEtiqueta;
};

/**
 * O estado da conexão em uma etiqueta.
 *
 * A ordem importa. `precisaParearDeNovo` (o `401`, sessão removida no celular)
 * vem antes da espera pela leitura: pedir outro código no meio de um pareamento
 * é o que dispara o `440 connectionReplaced` e prende a sessão em ciclo, então a
 * etiqueta precisa dizer que há ação a tomar mesmo com um QR já na tela.
 */
export function etiquetaDaConexao({
  instancia,
  carregando,
  erro,
}: LeituraDaConexao): EtiquetaDaConexao {
  if (!instancia) {
    if (erro) return { texto: "Sem resposta", tom: "indefinido" };
    if (carregando) return { texto: "Consultando", tom: "indefinido" };
    return { texto: "Sem número", tom: "espera" };
  }

  if (instancia.status === "connected") return { texto: "Conectado", tom: "conectado" };
  if (precisaParearDeNovo(instancia.metadata)) {
    return { texto: "Parear de novo", tom: "atencao" };
  }
  if (instancia.status === "connecting") return { texto: "Conectando", tom: "andamento" };
  if (instancia.qr_code) return { texto: "Aguardando leitura", tom: "espera" };
  if (instancia.status === "disconnected" || instancia.status === "blocked") {
    return { texto: "Desconectado", tom: "atencao" };
  }
  if (instancia.status === "error") return { texto: "Sem resposta", tom: "indefinido" };
  return { texto: "Gerando código", tom: "espera" };
}

/** Abaixo disto não há DDI + DDD + número para separar. */
const MINIMO_DE_DIGITOS = 10;

/**
 * O número como o cartão mostra: `+55 62 9819•1314`.
 *
 * Devolve `null` — e não uma string torta — quando o dado não dá: a tela cai no
 * nome da instância. Centralizado aqui porque `String(null).replace` derruba o
 * cartão inteiro, não só a linha do telefone.
 */
export function telefoneNaVitrine(phone: string | null | undefined): string | null {
  const digitos = String(phone ?? "").replace(/\D/g, "");
  if (digitos.length < MINIMO_DE_DIGITOS) return null;
  const ddi = digitos.slice(0, 2);
  const ddd = digitos.slice(2, 4);
  const resto = digitos.slice(4);
  return `+${ddi} ${ddd} ${resto.slice(0, -4)}•${resto.slice(-4)}`;
}
