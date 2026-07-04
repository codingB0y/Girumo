import { Plus } from "lucide-react";

export const FAQ_ITEMS: [string, string][] = [
  [
    "Preciso trocar de número?",
    "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem app extra.",
  ],
  [
    "É difícil de usar?",
    "Se você usa WhatsApp, usa o HubFlow. O painel é em português e os modelos — de página, de mensagem e de criativo — já vêm prontos: você quase não configura nada.",
  ],
  [
    "Preciso de site ou programador pra captar leads?",
    "Não. O HubFlow tem modelos prontos de página de captação: troque logo, cores e fotos, publique no nosso domínio e pronto. O link já sai rastreando cada lead do anúncio até a venda.",
  ],
  [
    "Quantos grupos consigo gerenciar?",
    "No Growth, grupos ilimitados. 50, 100 ou mais — todos num painel só, com disparo e agenda em 2 cliques. E quando um enche, o próximo nasce sozinho.",
  ],
  [
    "É seguro pro meu número?",
    "Sim. O HubFlow envia num ritmo inteligente, espaçado como um humano faria, exatamente pra manter sua operação saudável e rodando todo dia.",
  ],
  [
    "Meus contatos ficam comigo se eu cancelar?",
    "Sim. O número é seu, os grupos são seus, os contatos são seus. Sem fidelidade, sem multa, sem pegadinha.",
  ],
  [
    "Como eu sei de onde vieram as vendas?",
    "Cada link de campanha é rastreado. O painel mostra origem por anúncio, bio ou story — você vê qual canal enche grupo e qual gera venda, sem planilha.",
  ],
];

/** FAQ v2 — details/summary nativo (acessível, zero JS), visual editorial. */
export function Faq() {
  return (
    <div className="space-y-3">
      {FAQ_ITEMS.map(([q, a]) => (
        <details key={q} className="lp-faq group rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <span className="font-tech text-lg font-medium tracking-tight text-white sm:text-xl">{q}</span>
            <Plus className="h-5 w-5 shrink-0 text-bruma/50 transition-transform duration-300 group-open:rotate-45 group-open:text-zap" aria-hidden />
          </summary>
          <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open:grid-rows-[1fr]">
            <div className="overflow-hidden">
              <p className="max-w-2xl pt-4 leading-relaxed text-bruma/60">{a}</p>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
