import { MAX_WAIT_MINUTES, type FlowNode, type FlowOut } from "./types";

export function horas(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos % 60 === 0) return `${minutos / 60} h`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

export function tituloDoBloco(node: FlowNode): string {
  switch (node.type) {
    case "trigger":
      return node.on === "comment" ? "Quando alguém comenta" : "Quando alguém manda a palavra no direct";
    case "message":
      return node.wait ? "Direct que pede resposta" : "Direct";
    case "invite":
      return "Convite pro grupo";
    case "condition":
      return "Segue a loja?";
  }
}

/** Uma linha, para o bloco do mapa e a lista. */
export function resumoDoBloco(node: FlowNode): string {
  switch (node.type) {
    case "trigger":
      return node.keywords.length ? node.keywords.join(", ") : "sem palavra ainda";
    case "message":
    case "invite":
      return node.text.trim() ? (node.text.length > 90 ? `${node.text.slice(0, 90)}…` : node.text) : "sem texto ainda";
    case "condition":
      return "Confere na hora se a pessoa segue a loja";
  }
}

export function rotuloDaSaida(out: FlowOut, node: FlowNode): string {
  switch (out) {
    case "next":
      return "Segue";
    case "replied":
      return "Respondeu";
    case "timeout":
      return `Não respondeu em ${horas(node.type === "message" && node.wait ? node.wait.minutes : MAX_WAIT_MINUTES)}`;
    case "yes":
      return "Segue a loja";
    case "no":
      return "Não segue";
    case "clicked":
      return "Clicou no link";
    case "not_clicked":
      return node.type === "invite" && node.remindAfterMinutes ? `Não clicou em ${horas(node.remindAfterMinutes)}` : "Não clicou";
  }
}
