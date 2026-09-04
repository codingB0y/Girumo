"use client";

import { useState } from "react";
import { Smartphone, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NumeroPerfilDeclarado } from "@/lib/instances/numero-perfil";

type Props = { onEscolher: (perfil: NumeroPerfilDeclarado) => void; ocupado?: boolean };

const OPCOES: Array<{ valor: NumeroPerfilDeclarado; titulo: string; texto: string; Icone: typeof Smartphone }> = [
  {
    valor: "antigo",
    titulo: "Uso este número há mais de 30 dias",
    texto: "O WhatsApp já confia nele. Você posta nos seus grupos desde o primeiro dia, no ritmo da sua base.",
    Icone: Smartphone,
  },
  {
    valor: "novo",
    titulo: "É um número novo (menos de 30 dias)",
    texto: "Número novo que dispara muito é o que o WhatsApp bloqueia. Ele começa com 40 mensagens por dia e o teto sobe sozinho por 7 dias.",
    Icone: Clock,
  },
];

/**
 * Pergunta obrigatória antes do primeiro QR: sem ela a instância nasce sem
 * `numero_perfil` e o warm-up trata todo número como veterano — inclusive o
 * que acabou de nascer, que é exatamente o que o WhatsApp bloqueia.
 */
export function PerguntaPerfilNumero({ onEscolher, ocupado }: Props) {
  const [escolha, setEscolha] = useState<NumeroPerfilDeclarado | null>(null);
  return (
    <section aria-labelledby="perfil-titulo" className="space-y-4">
      <h2 id="perfil-titulo" className="text-lg font-semibold">Antes do QR code: esse número é novo?</h2>
      <p className="text-sm text-aco/70">
        A resposta define o ritmo de envio. Você não perde nada respondendo com honestidade — um número
        antigo libera mais; um número novo é protegido enquanto aquece.
      </p>
      <div role="radiogroup" aria-labelledby="perfil-titulo" className="grid gap-3 sm:grid-cols-2">
        {OPCOES.map(({ valor, titulo, texto, Icone }) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={escolha === valor}
            onClick={() => setEscolha(valor)}
            className={cn(
              "rounded-lg border p-4 text-left transition focus-visible:outline focus-visible:outline-2",
              escolha === valor ? "border-cobalt-500 bg-cobalt-500/5" : "border-poco hover:border-aco/30",
            )}
          >
            <Icone className="mb-2 h-5 w-5 text-cobalt-700" aria-hidden />
            <div className="font-medium">{titulo}</div>
            <div className="mt-1 text-sm text-aco/70">{texto}</div>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!escolha || ocupado}
        onClick={() => escolha && onEscolher(escolha)}
        className="rounded-md bg-cobalt-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Gerar QR code
      </button>
    </section>
  );
}
