// apps/web/src/components/painel/configuracoes/yampi-painel-texto.ts
import type { ResultadoDaConferencia } from "@/lib/yampi/conferir";
import type { StatusYampi } from "@/lib/yampi/tipos";
import type { Tom } from "./bling-painel-texto";

/** O chip ao lado do título, por estado da conexão. */
export function chipDaYampi(status: Exclude<StatusYampi, "desconectada">): { texto: string; tom: Tom } {
  if (status === "ativa") return { texto: "Conectada", tom: "ok" };
  if (status === "aviso_desativado") return { texto: "Aviso desligado", tom: "alerta" };
  return { texto: "Acesso recusado", tom: "erro" };
}

/** O toast do Testar conexão. */
export function mensagemDoTeste(r: ResultadoDaConferencia): { texto: string; tom: "ok" | "erro" } {
  if (r.credenciais === "invalida") return { texto: "A Yampi recusou o acesso. Cole o token e a chave de novo.", tom: "erro" };
  if (r.credenciais === "erro") return { texto: "A Yampi não respondeu agora. Tente de novo em instantes.", tom: "erro" };
  if (r.aviso === "recriado") return { texto: "A Yampi respondeu e o aviso estava desligado. Religamos.", tom: "ok" };
  if (r.aviso === "falhou") {
    return { texto: "A Yampi respondeu, mas não conseguimos religar o aviso. Tentamos de novo daqui a pouco.", tom: "erro" };
  }
  return { texto: "Tudo certo: a Yampi respondeu e o aviso está ligado.", tom: "ok" };
}
