"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/logo";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  context?: string;
  /** Quem já entrou neste aparelho não leva a promessa de vendas na cara de novo. */
  lembrado?: boolean;
};

/**
 * A porta de entrada da Vitrine Aberta (spec 12.1 desktop, 12.2 mobile).
 *
 * Fora é Volt: a rua, com a promessa e um recorte do que o painel faz. Dentro
 * é Paper: a porta acesa, onde só existe o formulário. É a única tela em que o
 * claro fica sobre o escuro — por isso os campos vêm dos primitivos `pn-porta*`
 * e não herdam nada do painel.
 *
 * A coluna da esquerda NÃO mostra dado de tenant. Os mockups traziam nomes de
 * clientes e contagens reais no ticker; numa tela sem autenticação isso é dado
 * de terceiro exposto a quem abrir a URL, então aqui a prova é o produto, não
 * a base de ninguém.
 */
export function AuthShellVitrine({ title, subtitle, children, footer, context, lembrado = false }: Props) {
  return (
    <div className="min-h-screen bg-volt-950 text-canvas-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col lg:flex-row">
        {/* A rua */}
        <section data-testid="porta-rua" className="flex flex-col justify-between px-4 pb-8 pt-5 lg:w-[58%] lg:px-16 lg:pb-12 lg:pt-12">
          <Link href="/" aria-label="Voltar ao início" className="inline-flex">
            <Logo className="text-xl text-paper-0 lg:text-28" />
          </Link>

          <div className="mt-8 lg:mt-0 lg:max-w-[520px]">
            <h1 className="font-brand text-[30px] font-extrabold leading-[34px] tracking-[-0.03em] text-paper-0 lg:text-[48px] lg:leading-[52px]">
              {lembrado ? (
                <>Bem-vinda de volta.</>
              ) : (
                <>
                  Seus grupos rodando.
                  <br />
                  Você vendendo.
                </>
              )}
            </h1>
            <p className="mt-4 max-w-[440px] text-15 text-line-200 lg:text-[16px] lg:leading-6">
              {lembrado
                ? "Sua loja continua do jeito que você deixou. Entre e siga de onde parou."
                : "Um painel para os seus grupos de WhatsApp: quem entrou, o que já foi postado e quanto entrou no mês — num número só."}
            </p>

            {/* Recorte do produto, não da base de ninguém: campanha de exemplo. */}
            <div className="mt-10 hidden max-w-[440px] lg:block">
              <div className="pn-etiqueta-preco">
                <p className="font-brand text-20 font-extrabold text-volt-950">REATIVAÇÃO DE SETEMBRO</p>
                <p className="font-data mt-1 text-13 text-cobalt-500">girumo.com.br/r/sua-campanha</p>
                <p className="font-data mt-3 text-13 text-slate-600">
                  Cada link enche um grupo e abre o próximo sozinho.
                </p>
              </div>
            </div>
          </div>

          <p className="font-data mt-8 hidden text-12 text-slate-600 lg:block">
            Girumo · painel de grupos para atacado
          </p>
        </section>

        {/* A porta */}
        <section className="flex flex-1 items-end justify-center lg:items-center lg:px-8 lg:py-12">
          <div className="pn-porta" data-testid="porta">
            <h2 className="font-brand text-[22px] font-bold text-volt-950 lg:text-[24px]">{title}</h2>
            <p className="mt-1 text-[14px] text-slate-600">{subtitle}</p>

            {context && (
              <p className="mt-4 rounded-[var(--radius-chip)] bg-canvas-100 px-3 py-2 text-13 text-volt-950">{context}</p>
            )}

            <div className="mt-6">{children}</div>

            {footer && <div className="mt-6 text-center text-[14px] text-slate-600">{footer}</div>}

            <p className="mt-4 text-center text-12 text-slate-600">
              Seus dados ficam só na sua loja.{" "}
              <Link href="/privacidade" className="pn-porta__link">
                Política de privacidade
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
