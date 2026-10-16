import { FirstTouchCookie } from "@/components/analytics/first-touch-cookie";
import { OutboundTracker } from "@/components/lp3/outbound-tracker";
import { HomeCabecalho } from "@/components/home-shared/cabecalho";
import { HomeRodape } from "@/components/home-shared/rodape";
import { ProdutoCalculadora } from "@/components/home-produto/calculadora";
import { ProdutoDuvidas, ProdutoFecho } from "@/components/home-produto/fecho";
import { ProdutoPlanos } from "@/components/home-produto/planos";
import { ProdutoCartoes, ProdutoIntegracoes, ProdutoNoBolso } from "@/components/home-produto/produtos";
import { ProdutoGrade, ProdutoTudo } from "@/components/home-produto/recursos";
import { ProdutoFaixa, ProdutoHeroi } from "@/components/home-produto/topo";

/**
 * Home "Produto" (V3, ref. InfinitePay + Conta Azul), em /page2 desde 15/10/2026
 * — a segunda direção que o Igor aprovou junto com a Vitrine de "/". Mockup no
 * canvas "Girumo Home" (V3P, 1440 e 390). Base = celular, `lg:` = desktop.
 */
export function ProdutoLanding() {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-white font-body text-base text-volt-950 lg:text-[17px]">
      <ProdutoFaixa />
      <HomeCabecalho />
      <main>
        <ProdutoHeroi />
        <ProdutoIntegracoes />
        <ProdutoCartoes />
        <ProdutoNoBolso />
        <ProdutoCalculadora />
        <ProdutoTudo />
        <ProdutoGrade />
        <ProdutoPlanos />
        <ProdutoDuvidas />
        <ProdutoFecho />
      </main>
      <ProdutoFaixa decorativa />
      <HomeRodape />
      <FirstTouchCookie />
      <OutboundTracker />
    </div>
  );
}
