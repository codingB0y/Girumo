import { LOTADO_REASONS } from "@/lib/campaigns/entry-page";
import type { LotadoDestino } from "@/lib/campaigns/settings";
import type { BlockedReason } from "@/lib/links/resolve-click-target";

/** Os motivos de link parado que a aba explica ("cap-reached" é de link comum, não de campanha). */
export type Parada = Exclude<BlockedReason, "cap-reached">;

/** Por que o link não manda ninguém para grupo nenhum. */
const PARADO: Record<Parada, string> = {
  "empty-pool": "A campanha ainda não tem grupos",
  "no-invite": "Nenhum grupo da campanha tem convite configurado",
  "no-admin": "Seu número não é admin de nenhum grupo da campanha",
  // "all-full" é o que sobra no diagnóstico: um pool misto (cheio, sem convite,
  // de outro número) também cai aqui, então a frase não pode dizer só "cheios".
  "all-full": "Nenhum grupo da campanha tem vaga: os que têm convite e são do seu número passaram de 95%",
  closed: "A campanha passou da data de encerramento",
};

const NAO_ENTRA = "quem clicar agora não entra em grupo nenhum.";

/**
 * O que acontece com quem clica quando o link não acha grupo, como o `/r/` faz
 * (`lotadoRedirect`): lotado ou encerrado vai para a lista de espera, o outro
 * link ou o aviso; o resto não entra em lugar nenhum. `grave` = ninguém entra e
 * ninguém fica guardado, sem ser o fim planejado da campanha.
 *
 * `gruposNaTela` é quantos grupos a página conseguiu ler: ela recebe `[]` também
 * quando /api/groups falha, e aí a aba não pode afirmar que os grupos sumiram.
 */
export function paradoDoLink(
  motivo: Parada,
  groupIds: readonly string[],
  gruposNaTela: number,
  lotado: LotadoDestino,
): { texto: string; grave: boolean } {
  if (motivo === "empty-pool" && groupIds.length > 0) {
    return gruposNaTela === 0
      ? { texto: `Os grupos da campanha não apareceram aqui. Confira a aba Grupos: se eles saíram da sua conta, ${NAO_ENTRA}`, grave: false }
      : { texto: `Os grupos desta campanha não estão mais na sua conta: ${NAO_ENTRA}`, grave: true };
  }
  if (!LOTADO_REASONS.has(motivo)) return { texto: `${PARADO[motivo]}: ${NAO_ENTRA}`, grave: true };
  const aviso = motivo === "closed" ? "vê o aviso de que a campanha encerrou" : "vê o aviso de que os grupos estão cheios";
  const destino =
    lotado.modo === "pagina" ? "vai para a sua lista de espera" : lotado.modo === "url" ? "vai para o outro link que você configurou" : aviso;
  return { texto: `${PARADO[motivo]}: quem clicar agora ${destino}.`, grave: motivo !== "closed" && lotado.modo === "aviso" };
}
