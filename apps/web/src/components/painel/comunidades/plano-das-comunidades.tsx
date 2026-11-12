import { numero } from "@/lib/painel/grupos";
import { TETO_DA_COMUNIDADE } from "@/lib/communities/lotacao";
import { GRUPO_GRANDE_A_PARTIR_DE, GRUPOS_POR_COMUNIDADE, TETO_DO_GRUPO, type PlanoDeComunidades } from "@/lib/communities/plano";

type Props = {
  plano: PlanoDeComunidades;
  /** Nomes dos grupos que não são grandes mas podem dobrar até o teto do grupo (pedem comunidade própria). */
  medios: readonly string[];
};

/** Passo 2 (a tabela por comunidade) e passo 3 (o que fazer no celular) do "Montar comunidades". */
export function PlanoDasComunidades({ plano, medios }: Props) {
  const total = plano.comunidades.length;

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-16 font-semibold text-volt-950">2 · O plano</h3>
          <p className="text-13 text-slate-600">
            Teto do WhatsApp: {numero(TETO_DA_COMUNIDADE)} pessoas e {GRUPOS_POR_COMUNIDADE} grupos por comunidade.
          </p>
        </div>

        {plano.naoCabem.length > 0 && (
          <p role="alert" className="rounded-xl border border-alerta/20 bg-alerta/[0.06] px-4 py-3 text-13 text-alerta">
            {plano.naoCabem.map((g) => `${g.name} (${numero(g.members)})`).join(", ")}{" "}
            {plano.naoCabem.length === 1 ? "passa" : "passam"} sozinho do teto de {numero(TETO_DA_COMUNIDADE)} pessoas e
            não {plano.naoCabem.length === 1 ? "cabe" : "cabem"} em comunidade nenhuma.
          </p>
        )}

        {total === 0 ? (
          <p className="pn-card rounded-xl px-4 py-6 text-center text-14 text-slate-600">Marque ao menos um grupo para montar o plano.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line-200">
            <table className="w-full min-w-[760px] border-collapse text-14">
              <thead>
                <tr className="bg-canvas-100 text-left text-12 text-slate-600">
                  <th scope="col" className="px-3 py-2 font-medium">Comunidade</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Grupos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Pessoas hoje</th>
                  <th scope="col" className="px-3 py-2 font-medium">Pior caso (de {numero(TETO_DA_COMUNIDADE)})</th>
                  <th scope="col" className="px-3 py-2 font-medium">Grupos que vão nela</th>
                </tr>
              </thead>
              <tbody>
                {plano.comunidades.map((c) => (
                  <tr key={c.numero} className="border-t border-line-200 align-top">
                    <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-volt-950">
                      Comunidade {c.numero}
                    </th>
                    <td className="font-data px-3 py-2.5 text-right tabular-nums">{c.grupos.length}</td>
                    <td className="font-data px-3 py-2.5 text-right tabular-nums">
                      {c.pessoasEstimadas ? "até " : ""}
                      {numero(c.pessoasHoje)}
                    </td>
                    <td className="min-w-[170px] px-3 py-2.5">
                      <span className="font-data tabular-nums">{numero(c.piorCaso)}</span>
                      <div className="mt-1 h-1.5 rounded-full bg-line-200" aria-hidden="true">
                        <div
                          className="h-1.5 rounded-full bg-cobalt-500"
                          style={{ width: `${Math.min(100, Math.round((c.piorCaso / TETO_DA_COMUNIDADE) * 100))}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-13 leading-relaxed text-volt-950">
                      {c.grupos.map((g) => `${g.name} (${numero(g.members)})`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <p className="rounded-xl bg-canvas-100 px-3.5 py-3 text-13 leading-relaxed text-slate-700">
              <strong className="text-volt-950">Pior caso</strong> é cada grupo grande ({GRUPO_GRANDE_A_PARTIR_DE}+) cheio a{" "}
              {numero(TETO_DO_GRUPO)} e cada pequeno dobrando. Por isso nenhuma comunidade tem dois grupos grandes: juntos eles
              passam de {numero(TETO_DA_COMUNIDADE)} quando enchem, e o WhatsApp barra quem tentar entrar.
            </p>
            {medios.length > 0 && (
              <p className="rounded-xl bg-canvas-100 px-3.5 py-3 text-13 leading-relaxed text-slate-700">
                <strong className="text-volt-950">{medios.join(", ")}</strong> {medios.length === 1 ? "pode" : "podem"} dobrar até{" "}
                {numero(TETO_DO_GRUPO)}, então não {medios.length === 1 ? "cabe" : "cabem"} junto com um grupo grande e{" "}
                {medios.length === 1 ? "fica numa comunidade" : "ficam em comunidades"} sem grupo grande.
              </p>
            )}
            {plano.pessoasEstimadas && <NotaEstimativa />}
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-16 font-semibold text-volt-950">3 · No celular do número da loja</h3>
          <ol className="list-decimal space-y-1 pl-5 text-14 leading-relaxed text-volt-950">
            <li>
              WhatsApp → aba <strong>Comunidades</strong> → <strong>Nova comunidade</strong>. Dê um nome, por exemplo
              “Comunidade 1”.
            </li>
            <li>
              <strong>Adicionar grupos</strong> → <strong>Adicionar grupos existentes</strong>. Marque os grupos da linha 1 da
              tabela e confirme.
            </li>
            <li>
              Abra a Girumo em <strong>Grupos → Sincronizar</strong>. A comunidade e o grupo de Avisos aparecem aqui sozinhos.
            </li>
            <li>
              Só então passe para a próxima.{" "}
              <strong>Uma comunidade por vez, com alguns minutos entre elas</strong>: são ações de admin no número
              {total > 1 ? `, e fazer as ${total} em sequência rápida chama atenção` : ""}.
            </li>
            <li>Se o WhatsApp recusar algum grupo, pare e monte o plano de novo aqui: a recusa não custa nada ao número.</li>
          </ol>
          <p className="rounded-xl border border-cobalt-500/25 bg-cobalt-500/[0.06] px-3.5 py-3 text-14 leading-relaxed text-volt-950">
            Depois de vinculada: num post com <strong>todos os grupos da comunidade no alvo</strong>, a Girumo manda uma vez só
            pelo Avisos, sem @todos (o Avisos já avisa todo mundo). Faltou um grupo no alvo? Aí ela posta grupo por grupo,
            como hoje.
          </p>
        </div>
      )}
    </>
  );
}

function NotaEstimativa() {
  return (
    <p className="rounded-xl bg-canvas-100 px-3.5 py-3 text-13 leading-relaxed text-slate-700">
      <strong className="text-volt-950">“Até”</strong> quer dizer estimativa por cima: alguns grupos ainda não têm a lista de
      participantes lida, então quem está em dois deles conta duas vezes. Um <strong>Sincronizar</strong> em Grupos acerta o
      número.
    </p>
  );
}
