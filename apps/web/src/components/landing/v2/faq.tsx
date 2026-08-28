import { Plus } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const FAQ_ITEMS: [string, string][] = [
  [
    "Preciso trocar de número?",
    "Não. Funciona com o seu número de sempre, lendo um QR Code. Sem chip novo, sem app extra.",
  ],
  [
    "É difícil de usar?",
    `Se você usa WhatsApp, usa a ${BRAND.name}. O painel é em português e os modelos de página, mensagem e criativo já vêm prontos. Você quase não configura nada.`,
  ],
  [
    "Preciso de site ou programador pra captar leads?",
    `Não. A ${BRAND.name} tem modelos prontos de página de captação: troque logo, cores e fotos, publique no nosso domínio e pronto. O link já sai rastreando cada lead do anúncio até a venda.`,
  ],
  [
    "Quantos grupos consigo gerenciar?",
    "No Growth, grupos ilimitados. 50, 100 ou mais, todos num painel só, com publicação e agenda em 2 cliques. Quando um enche, o próximo nasce sozinho.",
  ],
  [
    "É seguro pro meu número?",
    `Sim. A ${BRAND.name} envia num ritmo inteligente, espaçado como um humano faria, exatamente pra manter sua operação saudável e rodando todo dia.`,
  ],
  [
    "Meus contatos ficam comigo se eu cancelar?",
    "Sim. O número é seu, os grupos são seus, os contatos são seus. Sem fidelidade, sem multa, sem pegadinha.",
  ],
  [
    "E se eu não gostar?",
    "Você cancela quando quiser, na própria tela de configurações — sem multa, sem fidelidade e sem falar com ninguém. O acesso vale até o fim do período já pago, e o número, os grupos e os contatos são seus de qualquer jeito.",
  ],
  [
    "Como eu sei de onde vieram as vendas?",
    "Cada link de campanha é rastreado. O painel mostra origem por anúncio, bio ou story. Você vê qual canal enche grupo e qual gera venda, sem planilha.",
  ],
];

export function Faq() {
  return (
    <div className="space-y-3">
      {FAQ_ITEMS.map(([question, answer]) => (
        <details
          key={question}
          className="group rounded-[var(--radius-panel)] border border-line-200 bg-paper-0 px-6 py-5 transition-colors open:border-cobalt-500 open:bg-canvas-100"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <span className="font-tech text-lg font-medium tracking-tight text-volt-950 sm:text-xl">{question}</span>
            <Plus className="h-5 w-5 shrink-0 text-slate-600 transition-transform duration-300 group-open:rotate-45 group-open:text-cobalt-500 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open:grid-rows-[1fr] motion-reduce:transition-none">
            <div className="overflow-hidden">
              <p className="max-w-2xl pt-4 leading-relaxed text-slate-600">{answer}</p>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
