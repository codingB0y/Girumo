import {
  BarChart3,
  CalendarClock,
  Library,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

const FEATURES = [
  {
    icon: Send,
    title: "Uma publicação, todos os grupos",
    body: "Escreva uma vez, escolha os grupos e publique. Texto, imagem, vídeo ou áudio chegam aos destinos selecionados.",
    proof: "Seleção de grupos e confirmação de entrega",
    className: "lg:col-span-4 bg-paper-0 text-volt-950",
    iconClassName: "bg-acid-500 text-volt-950",
    proofClassName: "text-slate-600",
  },
  {
    icon: CalendarClock,
    title: "Agenda que sustenta a semana",
    body: "Defina dias e horários recorrentes para a oferta entrar no momento planejado, sem repetir a configuração.",
    proof: "Agenda semanal recorrente",
    className: "lg:col-span-2 bg-volt-900 text-paper-0",
    iconClassName: "bg-acid-500 text-volt-950",
    proofClassName: "text-canvas-100/60",
  },
  {
    icon: Library,
    title: "Biblioteca pronta para vender",
    body: "Use textos, criativos e páginas de captação como ponto de partida. Ajuste para a sua marca e publique.",
    proof: "Texto, criativo e página no mesmo fluxo",
    className: "lg:col-span-2 bg-canvas-100 text-volt-950",
    iconClassName: "bg-volt-950 text-paper-0",
    proofClassName: "text-slate-600",
  },
  {
    icon: BarChart3,
    title: "A origem acompanha a venda",
    body: "Cada link identifica o canal de entrada. O resultado mostra se o pedido começou no anúncio, no story ou na bio.",
    proof: "Origem rastreada do clique ao pedido",
    className: "lg:col-span-4 bg-paper-0 text-volt-950",
    iconClassName: "bg-cobalt-500 text-paper-0",
    proofClassName: "text-cobalt-700",
  },
  {
    icon: Plus,
    title: "Grupo lotou? O próximo continua",
    body: `Quando um grupo enche, a ${BRAND.name} cria o seguinte com o mesmo nome, foto e regras. O link da campanha passa a apontar para ele.`,
    proof: "Continuidade sem link morto",
    className: "lg:col-span-3 bg-volt-900 text-paper-0",
    iconClassName: "bg-acid-500 text-volt-950",
    proofClassName: "text-canvas-100/60",
  },
  {
    icon: Users,
    title: "Cada lead com contexto",
    body: "Quem entra pelo link vira contato identificado com nome, número, origem e histórico de compra disponível para a operação.",
    proof: "Base própria, organizada e consultável",
    className: "lg:col-span-3 bg-canvas-100 text-volt-950",
    iconClassName: "bg-volt-950 text-paper-0",
    proofClassName: "text-slate-600",
  },
] as const;

export function Features() {
  return (
    <div className="grid gap-px bg-volt-800 lg:grid-cols-6" data-reveal-group>
      {FEATURES.map((feature) => {
        const Icon = feature.icon;

        return (
          <article
            key={feature.title}
            className={cn("flex min-h-64 flex-col justify-between p-7 sm:p-9", feature.className)}
          >
            <div>
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)]", feature.iconClassName)}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-7 max-w-xl font-tech text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {feature.title}
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-75 sm:text-base">{feature.body}</p>
            </div>
            <p className={cn("mt-10 border-t border-current/15 pt-4 font-data text-[11px] uppercase tracking-[0.13em]", feature.proofClassName)}>
              {feature.proof}
            </p>
          </article>
        );
      })}
    </div>
  );
}
