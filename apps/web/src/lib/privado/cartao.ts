/**
 * O cartão do número do atendimento na página Conectar: o que se decide sem navegador.
 *
 * Puro e sem `server-only` — o componente (client) e a rota (`GET /api/privado/numero`) importam
 * os tipos daqui. Datas sempre no horário de Brasília, como o resto do painel.
 */

/** O número como a tela o recebe: o recorte da `instances` mais a pausa do `private_number_state`. */
export type NumeroNaTela = {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  qr_code: string | null;
  connected_at: string | null;
  metadata: Record<string, unknown> | null;
  /** `private_number_state.paused_until`, ou null. */
  pausadoAte: string | null;
};

/** Resposta de `GET /api/privado/numero`. */
export type CartaoDoNumero = { liberado: boolean; numero: NumeroNaTela | null };

export type CenaDoCartao = "oculto" | "sem-numero" | "pareando" | "conectado" | "desconectado";

/**
 * Valor de `instances.metadata.privado_recusado` quando o chip é o dos grupos. Repete
 * `CHIP_DOS_GRUPOS` de `privado/numero.ts`, que é `server-only` e não entra num módulo de cliente.
 */
const CHIP_DOS_GRUPOS = "numero_dos_grupos";

const FUSO = "America/Sao_Paulo";

/**
 * Qual cena o cartão mostra. Sem número e sem add-on o cartão some; com o número presente ele fica
 * mesmo com o add-on desligado, porque o lojista ainda precisa poder desconectar.
 */
export function cenaDoCartao(cartao: CartaoDoNumero | null): CenaDoCartao {
  if (!cartao) return "oculto";
  const { liberado, numero } = cartao;
  if (!numero) return liberado ? "sem-numero" : "oculto";
  if (numero.status === "connected") return "conectado";
  if (numero.status === "pending" || numero.status === "qr" || numero.status === "connecting") return "pareando";
  return "desconectado";
}

/**
 * A conferência recusou o chip por ser o dos grupos. Compara o VALOR: reconectar com outro chip
 * grava `privado_recusado: null`, e a chave continua lá.
 */
export function recusadoPeloChipDosGrupos(numero: Pick<NumeroNaTela, "metadata">): boolean {
  return numero.metadata?.privado_recusado === CHIP_DOS_GRUPOS;
}

/** Dia, mês, ano, hora e minuto de um instante em Brasília, como texto de dois dígitos (ano com quatro). */
function emBrasilia(instante: Date) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const pega = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return { dia: pega("day"), mes: pega("month"), ano: pega("year"), hora: pega("hour"), minuto: pega("minute") };
}

/** A pausa de proteção do número: ainda vale, e se acaba hoje ou outro dia (Brasília). */
export function textoDaSaude(numero: Pick<NumeroNaTela, "pausadoAte">, agora: Date): string {
  const sem = "Sem pausa de proteção";
  if (!numero.pausadoAte) return sem;
  const ate = new Date(numero.pausadoAte);
  if (Number.isNaN(ate.getTime()) || ate.getTime() <= agora.getTime()) return sem;

  const fim = emBrasilia(ate);
  const hoje = emBrasilia(agora);
  const hora = `${fim.hora}:${fim.minuto}`;
  if (fim.dia === hoje.dia && fim.mes === hoje.mes && fim.ano === hoje.ano) {
    return `Em pausa de proteção até ${hora}`;
  }
  return `Em pausa de proteção até ${fim.dia}/${fim.mes} às ${hora}`;
}

/** "No ar desde 01/10/2026" — o dia do primeiro pareamento em Brasília — ou null sem data. */
export function noArDesde(connectedAt: string | null): string | null {
  if (!connectedAt) return null;
  const quando = new Date(connectedAt);
  if (Number.isNaN(quando.getTime())) return null;
  const { dia, mes, ano } = emBrasilia(quando);
  return `No ar desde ${dia}/${mes}/${ano}`;
}
