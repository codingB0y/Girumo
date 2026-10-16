import { Logo } from "@/components/brand/logo";
import { SIGNUP_URL, WHATSAPP_URL } from "@/components/lp3/landing-data";
import { LEGAL_PAGES } from "@/lib/public-pages";

const COLUNAS: ReadonlyArray<{ titulo: string; links: ReadonlyArray<{ texto: string; href: string; whatsapp?: true }> }> = [
  {
    titulo: "Produto",
    links: [
      { texto: "Como funciona", href: "#como" },
      { texto: "Pra quem é", href: "#pra-quem" },
      { texto: "Perguntas frequentes", href: "#duvidas" },
    ],
  },
  {
    titulo: "Planos",
    links: [
      { texto: "Essencial, Growth e Operação", href: "#planos" },
      { texto: "Teste grátis", href: SIGNUP_URL },
    ],
  },
  {
    titulo: "Conta",
    links: [
      { texto: "Entrar", href: "/login" },
      { texto: "Fale com a gente", href: WHATSAPP_URL, whatsapp: true },
    ],
  },
  {
    titulo: "Legal",
    links: [
      { texto: "Termos de uso", href: LEGAL_PAGES.terms },
      { texto: "Privacidade", href: LEGAL_PAGES.privacy },
    ],
  },
];

/** Rodapé das duas homes (V4 e V3): marca à esquerda, quatro colunas, linha de baixo. */
export function HomeRodape() {
  return (
    <footer className="border-t border-[#E3EADF] bg-white px-[18px] pb-9 pt-12 lg:px-16 lg:pt-16">
      <div className="mx-auto max-w-[1312px]">
        <div className="grid grid-cols-2 gap-x-[18px] gap-y-7 lg:grid-cols-[1.5fr_repeat(4,1fr)] lg:gap-10">
          <div className="col-span-2 lg:col-span-1">
            <Logo className="font-brand text-[26px] text-volt-950" />
            <p className="mt-3.5 max-w-[22em] text-[14.5px] leading-relaxed text-slate-600">
              O painel pra quem vende em grupo de WhatsApp: um link pra todos os grupos, post em todos e cada venda com a origem.
            </p>
          </div>
          {COLUNAS.map((coluna) => (
            <nav key={coluna.titulo} aria-label={coluna.titulo}>
              <h2 className="mb-3.5 text-sm font-bold text-cobalt-500">{coluna.titulo}</h2>
              <ul className="grid gap-2.5 text-[14.5px] text-[#2F434C]">
                {coluna.links.map((link) => (
                  <li key={link.texto}>
                    <a
                      href={link.href}
                      {...(link.whatsapp ? { "data-outbound": "whatsapp_rodape", target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="hover:text-volt-950 hover:underline"
                    >
                      {link.texto}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-11 flex flex-col gap-1.5 border-t border-[#E3EADF] pt-5 text-[13px] text-slate-600 lg:flex-row lg:justify-between">
          <span>© 2026 Girumo</span>
          <span>Feito no Brasil pra quem vende no grupo</span>
        </div>
      </div>
    </footer>
  );
}
