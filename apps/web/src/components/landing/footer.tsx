import { Logo } from "@/components/landing/logo";

export function Footer({
  signupUrl,
  whatsappUrl,
}: {
  signupUrl: string;
  whatsappUrl: string;
}) {
  return (
    <footer className="border-t border-white/10 bg-breu">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 pb-28 sm:grid-cols-2 sm:pb-14 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo wordmarkClassName="text-white" />
          <p className="mt-3 max-w-xs text-sm text-bruma/50">
            Gerencie e venda em todos os seus grupos de WhatsApp — num clique só.
          </p>
        </div>
        <FooterCol
          title="Produto"
          links={[
            ["Recursos", "#recursos"],
            ["Planos", "#planos"],
            ["Dúvidas", "#duvidas"],
          ]}
        />
        <FooterCol
          title="Conta"
          links={[
            ["Entrar", "/login"],
            ["Criar conta", signupUrl],
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            ["Termos de uso", "/termos"],
            ["Política de privacidade", "/privacidade"],
            ["WhatsApp", whatsappUrl],
          ]}
        />
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-bruma/40 sm:flex-row">
          <span>© {new Date().getFullYear()} HubFlow. Todos os direitos reservados.</span>
          <span className="font-data uppercase tracking-wider">O fluxo que vende.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="font-data text-xs uppercase tracking-wider text-bruma/40">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-sm text-bruma/60 transition hover:text-white">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
