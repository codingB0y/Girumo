import { FirstTouchCookie } from "@/components/analytics/first-touch-cookie";
import { OutboundTracker } from "@/components/lp3/outbound-tracker";
import { HomeCabecalho } from "@/components/home-shared/cabecalho";
import { HomeRodape } from "@/components/home-shared/rodape";
import { VitrineComparacao } from "@/components/home-vitrine/comparacao";
import { VitrineConexoes, VitrinePassos, VitrineSelos } from "@/components/home-vitrine/confianca";
import { VitrineCadastro, VitrineDuvidas } from "@/components/home-vitrine/fecho";
import { VitrineOperacao } from "@/components/home-vitrine/operacao";
import { VitrinePaginas, VitrineBalcao } from "@/components/home-vitrine/paginas-balcao";
import { VitrinePainel, VitrineRamos, VitrineRecursos, VitrineTamanhos } from "@/components/home-vitrine/painel";
import { VitrinePlanos } from "@/components/home-vitrine/planos";
import { VitrineHeroi, VitrineNovidade } from "@/components/home-vitrine/topo";

/**
 * Home "Vitrine" (V4, ref. Tray), no ar em "/" desde 15/10/2026. Mockup aprovado
 * no canvas "Girumo Home" (V4P, 1440 e 390). Uma árvore só: base = celular,
 * `lg:` = desktop. A Cartaz+ que estava aqui foi guardada em /lp4.
 */
export function VitrineLanding() {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-white font-body text-base text-volt-950 lg:text-[17px]">
      <HomeCabecalho />
      <VitrineNovidade />
      <main>
        <VitrineHeroi />
        <VitrineRamos />
        <VitrinePainel />
        <VitrineTamanhos />
        <VitrineRecursos />
        <VitrineConexoes />
        <VitrineSelos />
        <VitrinePassos />
        <VitrinePaginas />
        <VitrineBalcao />
        <VitrinePlanos />
        <VitrineOperacao />
        <VitrineComparacao />
        <VitrineDuvidas />
        <VitrineCadastro />
      </main>
      <HomeRodape />
      <FirstTouchCookie />
      <OutboundTracker />
    </div>
  );
}
