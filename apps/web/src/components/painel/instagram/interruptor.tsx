/** Interruptor `role="switch"` no visual `pn-interruptor` (mesmas classes de configuracoes-vitrine). */
export function Interruptor({ ligado, aoMudar, rotulo, desabilitado = false }: { ligado: boolean; aoMudar: (ligado: boolean) => void; rotulo: string; desabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      className="pn-interruptor shrink-0"
    >
      <span className="pn-interruptor__bolinha" aria-hidden="true" />
    </button>
  );
}
