import { LogoSymbol } from 'hubflow-web';

// Símbolo da corrente (dois elos formando "H") — versão Íris sobre Bruma.
export function Iris() {
  return (
    <div className="bg-bruma" style={{ padding: 48 }}>
      <LogoSymbol className="h-16 w-16 text-iris" />
    </div>
  );
}

// Símbolo em branco sobre Breu (uso em fundos escuros).
export function Branco() {
  return (
    <div className="bg-breu" style={{ padding: 48 }}>
      <LogoSymbol className="h-16 w-16 text-white" />
    </div>
  );
}
