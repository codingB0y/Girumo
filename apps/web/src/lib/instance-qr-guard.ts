// Quando um QR novo pode substituir o estado da instância.
//
// Sem `server-only`/Supabase de propósito — regra pura, testável isolada
// (mesmo padrão de session-select.ts e instance-disconnect-reason.ts).

/**
 * Um QR só faz sentido quando NÃO existe sessão aberta.
 *
 * A Evolution emite `qrcode.updated` em rajada enquanto ninguém escaneia, e a
 * entrega desses webhooks não é ordenada: o QR que estava em voo quando o
 * celular pareou chega DEPOIS do `connection.update` com `open`. Como
 * `update_instance_status` grava o status sem comparar com o atual, esse QR
 * atrasado rebaixava a instância de `connected` de volta para `qr`.
 *
 * O efeito para o lojista é o pior possível: ele pareia, vê "conectado", e na
 * próxima visita à tela encontra um QR de novo — como se nada tivesse
 * acontecido. E não adianta esperar, porque o celular já está pareado e o
 * WhatsApp não emite outro `open`; a única saída aparente é escanear de novo,
 * que é justamente o que substitui a conexão boa (`440 connectionReplaced`) e
 * inicia o ciclo de pareamento que não fecha.
 *
 * Vale para os dois caminhos que gravam QR — o webhook e a ação `refresh_qr` —
 * porque a regra é do domínio, não de quem chamou.
 */
export function podeAplicarQr(statusAtual: string | null | undefined): boolean {
  return statusAtual !== "connected";
}
