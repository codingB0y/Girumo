import type { PessoaDto } from "@/lib/ig/pessoas-tipos";

/** Célula que o Excel/Sheets leria como fórmula (`=`, `+`, `-`, `@`, tab, CR no começo) ganha um `'` na frente. */
function celula(valor: string): string {
  const seguro = /^\s*[=+\-@]|^[\t\r]/.test(valor) ? `'${valor}` : valor;
  // Tudo entre aspas: vírgula, quebra de linha e aspas no texto da loja não quebram a linha do CSV.
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * CSV das pessoas (UTF-8 com BOM para o Excel abrir acento certo). O @ sai SEM o "@": um "@ana" no
 * começo da célula seria fórmula. Os campos da loja viram colunas, na ordem alfabética.
 */
export function csvDePessoas(pessoas: PessoaDto[]): string {
  const campos = [...new Set(pessoas.flatMap((p) => Object.keys(p.fields)))].sort();
  const cabecalho = ["usuario", "etiquetas", ...campos, "primeira_conversa", "ultima_conversa", "ultima_mensagem", "veio_por"];
  const linhas = pessoas.map((p) => [
    p.username ?? "",
    p.tags.join(";"),
    ...campos.map((c) => (p.fields[c] === undefined ? "" : String(p.fields[c]))),
    p.firstSeenAt,
    p.lastSeenAt,
    p.lastDmAt ?? "",
    p.sourceFlowName ?? "",
  ]);
  return `﻿${[cabecalho, ...linhas].map((l) => l.map(celula).join(",")).join("\r\n")}\r\n`;
}
