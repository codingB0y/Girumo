import { Logo } from 'hubflow-web';

// Lockup sobre fundo claro (Bruma) — wordmark em Breu, símbolo em Íris.
export function NoClaro() {
  return (
    <div className="bg-bruma" style={{ padding: 48 }}>
      <Logo wordmarkClassName="text-breu" />
    </div>
  );
}

// Lockup sobre fundo escuro (Breu) — wordmark em branco, símbolo em Íris.
export function NoBreu() {
  return (
    <div className="bg-breu" style={{ padding: 48 }}>
      <Logo wordmarkClassName="text-white" />
    </div>
  );
}
