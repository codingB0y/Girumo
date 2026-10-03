"use client";

import { useOferta } from "@/components/painel/relampago/use-oferta";
import { FilaVitrine } from "@/components/painel/relampago/vitrine/fila-vitrine";

const POLL_MS = 5000;

export function FilaClient({ offerId }: { offerId: string }) {
  const { dados, erro, aviso, ocupado, agora, agir, pegarProxima, fechar } = useOferta(offerId, {
    pollMs: POLL_MS,
  });

  if (erro) {
    return <p className="px-4 py-8 text-sm text-alerta sm:px-8">{erro}</p>;
  }

  if (!dados) {
    return (
      <div className="px-4 py-8 sm:px-8" role="status" aria-label="Carregando a oferta">
        <div className="pn-skeleton h-64 rounded-xl" data-testid="painel-skeleton" />
      </div>
    );
  }

  const { offer, queue, me } = dados;

  return (
    <FilaVitrine
      oferta={offer}
      fila={queue}
      me={me}
      agora={agora}
      ocupado={ocupado}
      aviso={aviso}
      aoPegarProxima={() => void pegarProxima()}
      aoAgir={agir}
      aoFechar={() => void fechar()}
    />
  );
}
