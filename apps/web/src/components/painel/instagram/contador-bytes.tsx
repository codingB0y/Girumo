import { utf8Bytes } from "@/lib/ig/flow/bytes";
import { cn } from "@/lib/utils";

/** "95 de 1.000": bytes por padrão (regra da Meta); caracteres quando a mensagem tem botão. */
export function ContadorBytes({ texto, max, reserva = 0, emCaracteres = false }: { texto: string; max: number; reserva?: number; emCaracteres?: boolean }) {
  const usado = (emCaracteres ? [...texto].length : utf8Bytes(texto)) + reserva;
  const estourou = usado > max;
  return (
    <span aria-live="polite" className={cn("font-data text-12 tabular-nums", estourou ? "text-danger-700" : "text-slate-600")}>
      {usado.toLocaleString("pt-BR")} de {max.toLocaleString("pt-BR")}
      {reserva > 0 && <span className="ml-1">(com o link)</span>}
    </span>
  );
}
