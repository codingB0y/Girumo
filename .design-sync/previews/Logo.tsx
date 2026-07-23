import { Logo } from "hubflow-web";

export function Principal() {
  return (
    <div className="bg-volt-950 p-12 text-paper-0">
      <Logo className="text-paper-0" />
    </div>
  );
}

export function Impacto() {
  return (
    <div className="bg-acid-500 p-12 text-volt-950">
      <Logo className="text-volt-950" />
    </div>
  );
}

export function Institucional() {
  return (
    <div className="bg-paper-0 p-12 text-volt-950">
      <Logo className="text-volt-950" />
    </div>
  );
}
