import { requireAdmin } from "@/lib/admin-guard";
import { lojasComBling } from "@/lib/stores/bling-conexoes";

import { TesteDeHomologacao } from "./teste-de-homologacao";

export const dynamic = "force-dynamic";

/** A homologação do app no Bling: o teste técnico roda daqui, com a conexão de uma loja. */
export default async function AdminBlingPage() {
  await requireAdmin();
  const lojas = await lojasComBling();

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Bling: homologação do app</h1>
        <p className="mt-2 max-w-2xl text-sm text-aco/70">
          No Bling, abra o app em Central de Extensões › Área do Integrador › aba Homologação e clique para iniciar o
          teste. Em seguida, rode o teste aqui: a Girumo faz as 5 chamadas que o Bling pede (consultar, criar, alterar,
          mudar a situação e apagar um produto de mentira), com o acesso da loja escolhida, em até 10 segundos. Nada é
          criado na conta.
        </p>
      </div>
      <TesteDeHomologacao lojas={lojas} />
    </div>
  );
}
