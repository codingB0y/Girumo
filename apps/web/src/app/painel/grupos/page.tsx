"use client";

import { useCallback, useEffect, useState } from "react";
import { GruposVitrine } from "@/components/painel/grupos/vitrine/grupos-vitrine";
import type { Group } from "@/lib/mock-data";

export default function PainelGrupos() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  /**
   * O que o sync deixou de fora. Sem isto a contagem cai sozinha depois de
   * sincronizar (200 grupos viram 91) e parece defeito — quando é a regra: só
   * grupo que você administra entra no painel.
   */
  const [syncNote, setSyncNote] = useState<{ texto: string; alerta: boolean } | null>(null);

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/groups", { cache: "no-store" });
    const data = await res.json();
    setGroups(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    loadGroups()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadGroups]);

  /**
   * Importa os grupos da instância conectada.
   *
   * O sync é explícito porque a Evolution só avisa por webhook sobre grupos
   * criados DEPOIS da conexão (`groups.upsert`) — os que já existiam precisam
   * de um fetch. Também roda sozinho ao conectar, em /painel/conectar.
   */
  const syncGroups = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/groups/sync", { method: "POST" });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        synced?: number;
        ignorados?: number;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "Nao foi possivel sincronizar.");
      }
      const ignorados = payload.ignorados ?? 0;
      setSyncNote(
        ignorados === 0
          ? null
          : (payload.synced ?? 0) === 0
            ? {
                alerta: true,
                texto: `Voce participa de ${ignorados} grupo${ignorados > 1 ? "s" : ""}, mas nao administra nenhum. So grupo onde voce e admin pode receber campanha — peca admin no grupo e sincronize de novo.`,
              }
            : {
                alerta: false,
                texto: `${ignorados} grupo${ignorados > 1 ? "s" : ""} de fora: voce participa, mas nao e admin.`,
              },
      );
      await loadGroups();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [loadGroups]);

  // PR 5 da Vitrine Aberta: a prateleira e o romaneio. Todo o estado continua
  // aqui; só o desenho muda.
  return (
    <GruposVitrine
      grupos={groups}
      carregando={loading}
      sincronizando={syncing}
      erroDoSync={syncError}
      avisoDoSync={syncNote}
      onSincronizar={syncGroups}
      onRecarregar={loadGroups}
    />
  );
}
