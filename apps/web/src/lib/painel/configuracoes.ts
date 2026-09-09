import { iniciais } from "@/lib/painel/inicio";

/**
 * As portas de Configurações na Vitrine Aberta (spec 12.6).
 *
 * O redesign pede que cada porta mostre o próprio estado ANTES do clique —
 * "Conexão · conectado", "Equipe · 2 pessoas", "Plano · GROWTH". Derivar esse
 * texto é o que mora aqui; a tela só desenha.
 */

export type Porta = "Conexão" | "Equipe" | "Notificações" | "Plano" | "Conta";

const PAPEIS: Record<string, string> = {
  owner: "Dono",
  admin: "Administração",
  operator: "Atendimento",
};

/**
 * "owner" e "operator" nunca chegam à tela (regra da spec 12.6). Papel que não
 * conhecemos vira "Equipe" — melhor genérico do que o identificador do banco
 * vazando para quem contrata o produto.
 */
export function papelEmPortugues(papel: string | null | undefined): string {
  return PAPEIS[(papel ?? "").trim().toLowerCase()] ?? "Equipe";
}

/**
 * Iniciais para o avatar da ficha de equipe, a partir do e-mail.
 *
 * A tela antiga fazia `(email ?? "?").slice(0, 2)`, que devolve "A@" para
 * "a@x.com" — a arroba ia parar dentro do avatar.
 */
export function iniciaisDoEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const partes = local.split(/[._-]+/).filter(Boolean);
  if (partes.length === 0) return "•";
  // Com separador o e-mail já traz nome e sobrenome: "igor.toledo" → "IT".
  if (partes.length >= 2) return iniciais(partes.join(" "));
  return partes[0].slice(0, 2).toUpperCase();
}

/**
 * Cada bloco traz o `ok` da própria rota porque todos os cinco fetches desta
 * tela têm `catch` silencioso: sem o `ok`, `/api/session` fora do ar deixava
 * `live` em false e a porta afirmava "desconectado" — a mesma frase de quando o
 * número cai de verdade.
 */
export type LeituraDasPortas = {
  conexao: { ok: boolean; live: boolean };
  equipe: { ok: boolean; aceitos: number; pendentes: number };
  avisos: { ok: boolean; ligados: number; total: number };
  plano: { ok: boolean; nome: string | null; vigente: boolean };
  /** Vem do `useRole()`, que a casca já carregou: `null` enquanto não sabe. */
  conta: { papel: string | null };
};

/** O texto de cada porta. `null` = ainda não sei, e aí a porta não escreve nada. */
export function resumoDasPortas(leitura: LeituraDasPortas): Record<Porta, string | null> {
  return {
    "Conexão": leitura.conexao.ok ? (leitura.conexao.live ? "conectado" : "desconectado") : null,
    Equipe: resumoDaEquipe(leitura.equipe),
    "Notificações": resumoDosAvisos(leitura.avisos),
    Plano: resumoDoPlano(leitura.plano),
    Conta: leitura.conta.papel ? papelEmPortugues(leitura.conta.papel) : null,
  };
}

function resumoDaEquipe({ ok, aceitos, pendentes }: LeituraDasPortas["equipe"]): string | null {
  if (!ok) return null;
  // Convite pendente não é pessoa na equipe: quem não aceitou não opera nada.
  const pessoas = aceitos > 1 ? `${aceitos} pessoas` : "só você";
  if (pendentes <= 0) return pessoas;
  return `${pessoas} · ${pendentes} ${pendentes === 1 ? "convite" : "convites"}`;
}

function resumoDosAvisos({ ok, ligados, total }: LeituraDasPortas["avisos"]): string | null {
  if (!ok) return null;
  if (ligados <= 0) return "nenhuma ligada";
  // Todas ligadas é o padrão: dizer "3 de 3" seria ruído. O que informa é o
  // desvio — alguém desligou alguma coisa.
  if (ligados >= total) return `${ligados} ligadas`;
  return `${ligados} ${ligados === 1 ? "ligada" : "ligadas"} de ${total}`;
}

function resumoDoPlano({ ok, nome, vigente }: LeituraDasPortas["plano"]): string | null {
  if (!ok) return null;
  if (!nome) return "sem plano";
  // `plan_id` é o plano ESCOLHIDO no checkout, não o pago. Anunciar o nome sem
  // o estado faz o cliente ler promessa e tomar 402 em tudo sem entender.
  return vigente ? nome : `${nome} · inativo`;
}
