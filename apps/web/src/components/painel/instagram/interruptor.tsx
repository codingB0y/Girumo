/** Interruptor `role="switch"` no visual `pn-interruptor` (mesmas classes de configuracoes-vitrine). */
export function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: (ligado: boolean) => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoMudar(!ligado)}
      className="pn-interruptor shrink-0"
    >
      <span className="pn-interruptor__bolinha" />
    </button>
  );
}
