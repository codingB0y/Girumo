import type { NodePatch } from "@/lib/ig/flow/edit";
import type { FlowDef, FlowNode } from "@/lib/ig/flow/types";
import type { Issue } from "@/lib/ig/flow/validate";

export type CampanhaOpcao = { slug: string; name: string };

/** O que cada formulário de bloco recebe. `editarDef` serve às operações que mexem nas ligações. */
export type Confirmar = (pedido: { titulo: string; texto: string; rotulo: string; destrutivo?: boolean }) => Promise<boolean>;

export type FormProps = {
  node: FlowNode;
  def: FlowDef;
  /** Pergunta antes de uma troca que solta ligações (o `useConfirmacao` do painel). */
  confirmar: Confirmar;
  primeiroDepoisDoComentario: boolean;
  campanhas: CampanhaOpcao[];
  issues: Issue[];
  /** Campos da ficha que o próprio fluxo já usa, para sugerir ao digitar. */
  chaves: string[];
  aoMudar: (patch: NodePatch) => void;
  editarDef: (fn: (d: FlowDef) => FlowDef) => void;
};

export const rotulo = "text-13 font-medium text-volt-950";
export const campo = "w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 py-2 text-13 text-volt-950 outline-none focus:border-slate-600";
export const ajuda = "mt-1 text-12 text-slate-600";
export const erro = "mt-1 text-12 text-warning-700";
export const botaoTexto = "text-13 font-medium text-volt-950 underline underline-offset-2";

export function Problemas({ issues }: { issues: Issue[] }) {
  return issues.length ? <ul>{issues.map((i, n) => <li key={`${i.code}-${n}`} className={erro}>{i.text}</li>)}</ul> : null;
}

/** Nome acessível único por bloco: dois diretos têm o mesmo título, o id desempata. */
export const nomeAcessivel = (titulo: string, id: string) => (campoNome: string) => `${campoNome}: ${titulo} (${id})`;
