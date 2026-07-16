import { LogoSymbol } from "hubflow-web";

export function Avatar() {
  return (
    <div className="flex h-56 w-56 items-center justify-center rounded-full bg-acid-500 text-volt-950">
      <LogoSymbol className="h-32 w-32 text-volt-950" title="Girumo" />
    </div>
  );
}

export function Reverso() {
  return (
    <div className="bg-volt-950 p-12 text-paper-0">
      <LogoSymbol className="h-24 w-24 text-paper-0" title="Girumo" />
    </div>
  );
}
