import type { AfterSignupSection, WhyFreeSection } from "@/lib/pages/sections";
import { WhatsAppIcon } from "@/components/landing/icons";
import { Card, Wrap } from "@/components/pages/templates/v3/primitives";
import { SECTION, T } from "@/components/pages/templates/v3/tokens";

/** "Por que é gratuito" (Rico com iPhone): um card curto que mata a desconfiança. */
export function WhyFree({ section }: { section: WhyFreeSection }) {
  const { title, text } = section.data;
  return (
    <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
      <Wrap>
        <Card className="max-w-3xl p-6 lg:p-9">
          <p className={T.eyebrow}>Sem pegadinha</p>
          <h2 className={`mt-3 ${T.h2} lg:text-[1.9rem]`}>{title}</h2>
          <p className={`mt-4 ${T.lead}`}>{text}</p>
        </Card>
      </Wrap>
    </section>
  );
}

/**
 * "O que acontece depois" (Projeto Yield): o aviso sobre o grupo do WhatsApp
 * antes da pessoa cair nele. Tom de marca pra ler como parte do fluxo, não como
 * letra miúda.
 */
export function AfterSignup({ section }: { section: AfterSignupSection }) {
  const { title, text } = section.data;
  return (
    <section className={`bg-[var(--lp-bg)] ${SECTION}`}>
      <Wrap>
        <Card tone="brand" className="max-w-3xl p-6 lg:p-9">
          <div className="flex items-center gap-2.5">
            <WhatsAppIcon className="h-5 w-5 text-[color:var(--lp-accent)]" aria-hidden />
            <p className={T.eyebrow}>Depois do cadastro</p>
          </div>
          <h2 className={`mt-3 ${T.h2} lg:text-[1.9rem]`}>{title}</h2>
          <p className={`mt-4 ${T.lead} !text-[color:var(--lp-ink)]/85`}>{text}</p>
        </Card>
      </Wrap>
    </section>
  );
}
