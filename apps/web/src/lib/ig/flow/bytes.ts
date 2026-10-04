/**
 * Tamanho em BYTES UTF-8. O limite da Meta para um direct é em bytes, não em
 * caracteres: "ç" custa 2 e um emoji custa 4. `text.length` deixaria passar
 * mensagem que a Meta recusa.
 */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
