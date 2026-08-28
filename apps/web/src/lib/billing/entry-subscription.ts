import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_PLAN_CODE } from "./plan-codes";

/**
 * O estado de cobranca com que uma conta NASCE.
 *
 * Existe porque havia tres portas de entrada — cadastro por e-mail, login com
 * Google (que tambem cria conta) e criacao pelo admin — e cada uma montava a
 * assinatura por conta propria, de um jeito diferente:
 *
 * - `auth/signup` e `auth/oauth-complete`: `.eq("code", "FREE")`, com o literal
 *   solto no meio da rota;
 * - `admin/tenants/create`: `.ilike("code", FREE_PLAN_CODE)`.
 *
 * As tres compartilhavam o mesmo defeito de forma: `if (plano) { insert }`. Nao
 * achar plano nao era erro — era um `if` que simplesmente nao acontecia. A conta
 * ficava sem assinatura, sem log, sem alerta. Foi assim que nasceram as duas
 * organizacoes sem `subscriptions` que existem em producao hoje, e ninguem
 * percebeu ate o teto de plano passar a depender disso (#148).
 *
 * O erro da consulta era descartado junto (`const { data } = await ...`), entao
 * banco fora do ar e catalogo vazio produziam exatamente o mesmo desfecho
 * silencioso.
 *
 * Com a decisao paid-first de 27/08/2026, isso deixa de ser detalhe: o plano
 * FREE saiu do catalogo (`active = false`), e a partir dai NENHUMA conta nova
 * encontra plano de entrada. Esse passou a ser o caminho normal, e nao a
 * excecao — o que torna inaceitavel que ele continue mudo.
 *
 * A busca continua existindo de proposito, mesmo sem nenhum plano para achar: a
 * decisao e reversivel por desenho. Se um dos gatilhos registrados na analise
 * disparar (refund >15%, ativacao <60% em 14d, compra no paywall <2%), reativar
 * um plano de entrada volta a ser um UPDATE no catalogo, sem tocar em codigo. Este modulo faz o desfecho ser explicito,
 * nomeado e registrado, para que o PR que apaga o FREE vire a chave mexendo
 * so em DADO, sem tocar em codigo nenhum.
 */

/** De onde veio a conta. Vai para `subscriptions.metadata.source`. */
export type EntrySource = "signup" | "google_oauth" | "admin";

export type EntrySubscription =
  /** Assinatura criada, apontando para um plano do catalogo. */
  | { kind: "subscribed"; planId: string }
  /**
   * A conta nasce SEM assinatura — o que, desde o PR #162, significa bloqueada
   * (`BLOCKED_LIMITS`) e nao ilimitada. E um desfecho legitimo no paid-first, e
   * por isso tem nome em vez de ser o silencio de um `if` que nao entrou.
   */
  | { kind: "blocked"; reason: EntryBlockedReason };

export type EntryBlockedReason =
  /** Nao ha plano de entrada no catalogo. Esperado depois de matar o FREE. */
  | "plan_missing"
  /** A consulta ao catalogo falhou. Desconhecido, nao fato. */
  | "lookup_failed"
  /** Achou o plano mas o insert da assinatura falhou. */
  | "insert_failed";

/**
 * Provisiona a assinatura de entrada de um tenant recem-criado.
 *
 * `ilike` e nao `eq` de proposito: o mesmo plano e escrito de dois jeitos no
 * repo (`FREE` em producao e no cadastro, `free` no seed), e `=` em text no
 * Postgres e case-sensitive. Casar exato fazia a busca falhar calada num
 * ambiente semeado — o defeito que `plan-codes.ts` documenta.
 */
export async function provisionEntrySubscription(
  supabase: SupabaseClient,
  tenantId: string,
  source: EntrySource,
  options: { chosenPlanId?: string | null } = {},
): Promise<EntrySubscription> {
  // O admin pode escolher o plano na criacao do tenant. Isso e uma DECISAO, nao
  // o plano de entrada: entra como `active`, e nao passa pela busca no catalogo.
  // Vive aqui, e nao inline na rota, para que a regra continue valendo — quem
  // cria organizacao nao monta assinatura por conta propria.
  if (options.chosenPlanId) {
    const { error } = await supabase.from("subscriptions").insert({
      tenant_id: tenantId,
      plan_id: options.chosenPlanId,
      status: "active",
      metadata: { source },
    });

    if (error) {
      console.error(
        `[billing] insert da assinatura escolhida falhou (tenant ${tenantId}, origem ${source}):`,
        error,
      );
      return { kind: "blocked", reason: "insert_failed" };
    }

    return { kind: "subscribed", planId: String(options.chosenPlanId) };
  }

  // `active` e o que desliga o plano de entrada sem apagar historico: as
  // assinaturas antigas continuam apontando para a linha, e reverter e um
  // UPDATE. Sem este filtro, desativar o FREE no catalogo nao teria efeito
  // nenhum aqui — a conta nova continuaria nascendo gratuita.
  const { data: plan, error: lookupError } = await supabase
    .from("plans")
    .select("id")
    .ilike("code", FREE_PLAN_CODE)
    .eq("active", true)
    .maybeSingle();

  if (lookupError) {
    // Diferente de "nao existe": aqui nao se sabe. Nao da para distinguir os
    // dois depois do fato, entao a distincao tem que ser feita agora, no log.
    console.error(
      `[billing] consulta ao plano de entrada falhou (tenant ${tenantId}, origem ${source}):`,
      lookupError,
    );
    return { kind: "blocked", reason: "lookup_failed" };
  }

  if (!plan?.id) {
    // Caminho NORMAL depois de o FREE sair do catalogo. Fica registrado assim
    // mesmo: e o que permite responder "por que esta conta nasceu bloqueada?"
    // sem ter que reconstruir o estado do catalogo naquele instante.
    console.info(
      `[billing] tenant ${tenantId} (origem ${source}) nasceu sem assinatura: nao ha plano de entrada no catalogo.`,
    );
    return { kind: "blocked", reason: "plan_missing" };
  }

  const { error: insertError } = await supabase.from("subscriptions").insert({
    tenant_id: tenantId,
    plan_id: plan.id,
    status: "free",
    metadata: { source },
  });

  if (insertError) {
    console.error(
      `[billing] insert da assinatura de entrada falhou (tenant ${tenantId}, origem ${source}):`,
      insertError,
    );
    return { kind: "blocked", reason: "insert_failed" };
  }

  return { kind: "subscribed", planId: String(plan.id) };
}
