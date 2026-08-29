/**
 * Rótulo permanente do modo demonstração.
 *
 * Não é decoração e não pode virar opcional: este repositório já publicou prova
 * social fabricada em produção. Uma tela que mostra números inventados sem
 * dizer que são inventados é a mesma falha com roupa nova.
 */
export function DemoBadge() {
  return (
    <p
      data-testid="demo-badge"
      className="inline-flex items-center gap-2 rounded-full bg-cobalt-500/[0.07] px-3 py-1 text-xs font-medium text-cobalt-500"
    >
      <span aria-hidden="true">●</span>
      Demonstração — dados simulados
    </p>
  );
}
