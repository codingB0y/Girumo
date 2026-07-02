import {
  BarChart3,
  CalendarClock,
  Check,
  Library,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Bento de recursos com mock-UIs construídas à mão (zero screenshot).
 * Cada card mostra o recurso FUNCIONANDO em miniatura, com status reais
 * (entregue / na fila) — prova visual, não print.
 */

export function Features() {
  return (
    <div className="grid gap-4 lg:grid-cols-6" data-reveal-group>
      {/* 1 — Disparo em massa (wide) */}
      <Card
        className="lg:col-span-4"
        icon={Send}
        title="Um disparo, todos os grupos"
        line="Escreva uma vez, escolha os grupos e envie. Texto, imagem, vídeo ou áudio — com confirmação de entrega em cada grupo."
      >
        <div className="rounded-2xl border border-white/10 bg-void p-4">
          <p className="rounded-xl bg-white/[0.05] px-4 py-3 text-sm text-white">
            🔥 Oferta relâmpago: 40% OFF só hoje. Corre que é por ordem de chegada!
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {["texto", "imagem", "áudio"].map((c) => (
                <span key={c} className="font-data rounded-md border border-white/10 px-2 py-1 text-[10px] uppercase tracking-wider text-bruma/50">
                  {c}
                </span>
              ))}
            </div>
            <span className="lp-btn lp-btn-light flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold">
              Disparar pra 47 grupos
            </span>
          </div>
          <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-3">
            {[
              ["VIP 01 · Atacado", "entregue"],
              ["VIP 02 · Varejo", "entregue"],
              ["VIP 03 · Outlet", "na fila"],
            ].map(([g, s]) => (
              <div key={g} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-bruma/60">
                  <WhatsAppIcon className="h-3.5 w-3.5 text-zap/70" /> {g}
                </span>
                <span
                  className={cn(
                    "font-data flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    s === "entregue" ? "bg-zap/10 text-zap" : "bg-atencao/10 text-atencao",
                  )}
                >
                  {s === "entregue" && <Check className="h-3 w-3" />}
                  {s}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 2 — Calendário (narrow) */}
      <Card
        className="lg:col-span-2"
        icon={CalendarClock}
        title="Semana no piloto automático"
        line="Configure uma vez. Posta em todos os grupos, nos dias e horários certos — pra sempre."
      >
        <div className="space-y-2">
          {[
            ["seg", "Oferta da semana", "09:00"],
            ["qua", "Esquenta + prova social", "12:30"],
            ["sex", "Fechamento de pedidos", "18:00"],
          ].map(([d, t, h]) => (
            <div key={d} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-void px-3.5 py-2.5">
              <span className="font-data w-8 shrink-0 text-[10px] uppercase tracking-wider text-bruma/40">{d}</span>
              <span className="flex-1 truncate text-xs text-white">{t}</span>
              <span className="font-data text-[10px] text-zap">{h}</span>
            </div>
          ))}
          <p className="font-data pt-1 text-center text-[10px] uppercase tracking-[0.2em] text-bruma/35">
            → replicado nos 47 grupos
          </p>
        </div>
      </Card>

      {/* 3 — Biblioteca (narrow) */}
      <Card
        className="lg:col-span-2"
        icon={Library}
        title="Copys que já converteram"
        line="Biblioteca de mensagens e criativos testados em quem vende todo dia. Copie, ajuste, dispare."
      >
        <div className="space-y-2">
          {[
            ["Oferta relâmpago", "8,2% de conversão"],
            ["Reativação de sumidos", "5,7% de conversão"],
          ].map(([t, m]) => (
            <div key={t} className="rounded-xl border border-white/[0.07] bg-void px-3.5 py-3">
              <p className="text-xs font-medium text-white">{t}</p>
              <p className="font-data mt-1 text-[10px] uppercase tracking-wider text-zap">{m}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 4 — Origem da venda (wide) */}
      <Card
        className="lg:col-span-4"
        icon={BarChart3}
        title="De onde vem cada real"
        line="Todo lead entra rastreado. Você vê qual anúncio enche grupo e qual gera venda — e realoca a verba com dado, não com achismo."
      >
        <div className="space-y-3">
          {[
            ["Anúncio · Meta", 82, "R$ 12.4k"],
            ["Story", 46, "R$ 6.2k"],
            ["Bio do Instagram", 22, "R$ 3.1k"],
          ].map(([label, pct, val]) => (
            <div key={label as string}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-bruma/60">{label}</span>
                <span className="font-data text-xs font-medium text-white">{val}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-zap/50 to-zap"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
          <p className="font-data pt-1 text-[10px] uppercase tracking-[0.2em] text-bruma/35">
            receita por origem · últimos 30 dias
          </p>
        </div>
      </Card>

      {/* 5 — Auto-criação (narrow) */}
      <Card
        className="lg:col-span-3"
        icon={Plus}
        title="Grupo lotou? O próximo já existe"
        line="Quando um grupo enche, o HubFlow cria o seguinte com o mesmo nome, foto e regras — e o link da campanha passa a apontar pra ele."
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-xl border border-white/[0.07] bg-void px-3.5 py-3">
            <p className="text-xs font-medium text-white">VIP 03</p>
            <p className="font-data mt-0.5 text-[10px] text-bruma/40">1.024 / 1.024</p>
            <div className="mt-2 h-1 rounded-full bg-white/10">
              <div className="h-full w-full rounded-full bg-white/40" />
            </div>
          </div>
          <span className="font-data shrink-0 text-bruma/30">→</span>
          <div className="flex-1 rounded-xl border border-zap/30 bg-zap/[0.06] px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-white">
              VIP 04 <span className="lp-pulse h-1.5 w-1.5 rounded-full bg-zap" />
            </p>
            <p className="font-data mt-0.5 text-[10px] text-zap">criado agora · 12 membros</p>
            <div className="mt-2 h-1 rounded-full bg-white/10">
              <div className="h-full w-[4%] rounded-full bg-zap" />
            </div>
          </div>
        </div>
      </Card>

      {/* 6 — IA (narrow) */}
      <Card
        className="lg:col-span-3"
        icon={Sparkles}
        title="A IA configura por você"
        line="Descreva o que quer em português. A IA monta a campanha, a agenda e as mensagens — você só aprova."
      >
        <div className="space-y-2.5">
          <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 text-xs text-white">
            Monta uma agenda de ofertas pra semana toda?
          </p>
          <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-white/[0.07] bg-void px-4 py-2.5">
            <p className="text-xs text-bruma/70">
              Feito ✓ — 5 posts agendados nos 47 grupos: oferta na segunda, esquenta na
              quarta e fechamento na sexta.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  line,
  children,
  className,
}: {
  icon: typeof Send;
  title: string;
  line: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("lp-card flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.02] p-7", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-bruma/70">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <h3 className="font-tech text-lg font-bold tracking-tight text-white sm:text-xl">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-bruma/55">{line}</p>
      <div className="mt-6 flex-1">{children}</div>
    </article>
  );
}
