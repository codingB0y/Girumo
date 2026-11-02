const PASSOS = [
  "Conectar a Yampi",
  "Conectar o número do atendimento",
  "Definir como a loja assina as mensagens",
  "Testar no seu WhatsApp e ligar",
];

/** Loja com o Recuperar pago e ainda sem configurar. Os passos são só leitura até a configuração guiada existir. */
export function PagoFaltaConfigurar() {
  return (
    <section className="px-5 py-6 lg:px-8">
      <h1 className="text-20 font-semibold text-volt-950">Recuperar</h1>
      <p className="mt-1 text-15 text-volt-950">Liberado para a sua loja. Falta configurar.</p>
      <ol
        aria-label="Passos da configuração"
        className="pn-card mt-4 max-w-[560px] list-decimal divide-y divide-line-200 rounded-[var(--radius-porta)] py-1 pr-5 pl-10 text-sm text-volt-950 marker:font-semibold marker:text-slate-600"
      >
        {PASSOS.map((p) => (
          <li key={p} className="py-3 pl-1">
            {p}
          </li>
        ))}
      </ol>
      <p className="mt-3 max-w-[60ch] text-13 text-slate-600">
        A configuração guiada ainda está sendo construída. Cada passo abre aqui quando estiver pronto.
      </p>
    </section>
  );
}
