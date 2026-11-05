import { fieldLabel } from "./names";
import { MAX_WAIT_MINUTES, choiceIndex, type FlowNode, type FlowOut } from "./types";

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
      if (node.choices?.length) return "Pergunta com escolhas";
      return node.wait ? "Direct que pede resposta" : "Direct";
    case "invite":
      return "Convite pro grupo";
    case "tag":
      return "Etiqueta";
    case "handoff":
      return "Passar pra loja";
    case "condition":
      if (node.check === "clicked") return "Clicou no link?";
      if (node.check === "field") return node.field ? `Se ${fieldLabel(node.field)} for…` : "Se o campo for…";
      if (node.check === "tag") return "Tem a etiqueta?";
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
    case "tag": {
      const partes = [node.add.length ? `Põe: ${node.add.join(", ")}` : "", node.remove.length ? `Tira: ${node.remove.join(", ")}` : ""].filter(Boolean);
      return partes.length ? partes.join(" · ") : "sem etiqueta ainda";
    }
    case "handoff":
      return node.text?.trim() ? (node.text.length > 90 ? `${node.text.slice(0, 90)}…` : node.text) : "Passa a conversa pra loja, sem mensagem";
    case "condition":
      if (node.check === "clicked") return "Confere se a pessoa já clicou em algum convite";
      if (node.check === "field") return node.values?.length ? node.values.join(", ") : "sem valores ainda";
      if (node.check === "tag") return node.tag ? `Etiqueta: ${node.tag}` : "sem etiqueta ainda";
      return "Confere na hora se a pessoa segue a loja";
  }
}

/** O texto da escolha (ou do valor do Se…) que a saída `v<i>` representa. */
function rotuloDaEscolha(i: number, node: FlowNode): string {
  const lista = node.type === "message" ? node.choices : node.type === "condition" ? node.values : undefined;
  return lista?.[i]?.trim() || `Escolha ${i + 1}`;
}

export function rotuloDaSaida(out: FlowOut, node: FlowNode): string {
  const escolha = choiceIndex(out);
  if (escolha !== null) return rotuloDaEscolha(escolha, node);
  switch (out) {
    case "other":
      return "Outra resposta";
    case "next":
      return "Segue";
    case "replied":
      return "Respondeu";
    case "timeout":
      return `Não respondeu em ${horas(node.type === "message" && node.wait ? node.wait.minutes : MAX_WAIT_MINUTES)}`;
    case "yes":
      if (node.type === "condition" && node.check === "tag") return "Tem a etiqueta";
      if (node.type === "condition" && node.check === "clicked") return "Clicou";
      return "Segue a loja";
    case "no":
      if (node.type === "condition" && node.check === "tag") return "Não tem";
      if (node.type === "condition" && node.check === "clicked") return "Não clicou";
      return "Não segue";
    case "clicked":
      return "Clicou no link";
    case "not_clicked":
      return node.type === "invite" && node.remindAfterMinutes ? `Não clicou em ${horas(node.remindAfterMinutes)}` : "Não clicou";
    default:
      return out; // v0…v12 já saíram acima; o tipo não sabe disso
  }
}
