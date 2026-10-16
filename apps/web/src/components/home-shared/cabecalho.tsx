import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SIGNUP_URL } from "@/components/lp3/landing-data";
import { CTA_TESTE_CURTO } from "@/components/home-shared/home-data";
import { FOCO } from "@/components/home-shared/estilo";
import { cn } from "@/lib/utils";

const LINKS = [
  { texto: "Como funciona", href: "#como" },
  { texto: "Planos", href: "#planos" },
  { texto: "Pra quem é", href: "#pra-quem" },
  { texto: "Dúvidas", href: "#duvidas" },
] as const;

/**
 * Cabeçalho branco das duas homes. No celular, os links vão pro menu: um
 * <details> nativo, sem JavaScript — o menu fecha ao tocar no X.
 */
export function HomeCabecalho() {
  return (
    <header className="mx-auto flex h-16 max-w-[1440px] items-center gap-1.5 pl-[18px] pr-2.5 lg:h-[76px] lg:px-16">
      <Link href="/" className={cn("mr-auto rounded-md lg:mr-[30px]", FOCO)}>
        <Logo className="text-[22px] lg:text-[25px]" />
      </Link>
      <nav aria-label="Principal" className="hidden gap-0.5 lg:flex">
        {LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={cn("inline-flex h-11 items-center rounded-md px-[13px] text-[15.5px] font-medium text-[#2B3F48] hover:text-volt-950", FOCO)}
          >
            {link.texto}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-1.5 lg:ml-auto lg:gap-5">
        <a href="/login" className={cn("hidden rounded-md text-[15.5px] font-semibold lg:inline", FOCO)}>
          Entrar
        </a>
        <a
          href={SIGNUP_URL}
          className={cn(
            "inline-flex h-10 items-center whitespace-nowrap rounded-full bg-acid-500 px-[15px] text-sm font-bold hover:bg-[#B8FF5C] lg:h-[46px] lg:px-[22px] lg:text-[15px]",
            FOCO,
          )}
        >
          {CTA_TESTE_CURTO}
        </a>
        <details className="group relative lg:hidden">
          <summary
            aria-label="Menu"
            className={cn("grid size-11 cursor-pointer list-none place-items-center rounded-md [&::-webkit-details-marker]:hidden", FOCO)}
          >
            <Menu aria-hidden className="size-6 group-open:hidden" />
            <X aria-hidden className="hidden size-6 group-open:block" />
          </summary>
          <nav
            aria-label="Menu"
            className="absolute right-0 top-12 z-20 grid w-56 gap-0.5 rounded-2xl border border-[#E3EADF] bg-white p-2 shadow-[0_24px_48px_-20px_rgba(7,25,35,.35)]"
          >
            {[...LINKS, { texto: "Entrar", href: "/login" }].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn("flex h-11 items-center rounded-lg px-3 text-[15.5px] font-medium hover:bg-[#F4FAEA]", FOCO)}
              >
                {link.texto}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
