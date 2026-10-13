/**
 * Eventos do Meta para os pedidos do Bling (spec 2026-10-13-integracao-bling §4).
 *
 * Venda fechada pela vendedora no WhatsApp: `action_source: "chat"`, dados do
 * cliente em hash. O `event_id` é fixo por pedido: o Meta deduplica por
 * `event_id` + `event_name`, então reenviar o mesmo pedido não conta outra compra.
 *
 * Puro: monta os eventos e escolhe o pixel. Quem envia é o motor, pelo
 * `sendCapiEvent`.
 */
import { temSinalDeCasamento, type CapiEvent, type CapiUserData } from "@/lib/campaigns/meta-capi";
import { readIntegracoes } from "@/lib/campaigns/settings";
import type { HashesMeta } from "@/lib/meta/dados-do-cliente";

export type EntradaEvento = {
  pedidoBlingId: number;
  numero: string | null;
  total: number;
  quando: Date;
  hashes: HashesMeta;
  fbc: string | null;
  fbp: string | null;
  origem: "anuncio" | "grupo" | "sem_origem";
  faixa: "alto" | "normal";
};

export type PixelEscolhido = { campaignId: string; pixelId: string; token: string; testCode: string | null };
export type CampanhaComMetadata = { id: string; name: string | null; metadata: Record<string, unknown> | null };

/** Campo ausente não vai nem como `undefined`. */
function semAusentes(u: CapiUserData): CapiUserData {
  return Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)) as CapiUserData;
}

/** Lista nominal de propósito: `doby`/`dobm`/`dobd` são só do CSV, a CAPI usa `db`. */
function dadosDoUsuario(h: HashesMeta, fbc: string | null, fbp: string | null): CapiUserData {
  const { em, ph, fn, ln, db, ge, ct, st, zp, country, external_id } = h;
  return semAusentes({
    em: em?.length ? em : undefined,
    ph: ph?.length ? ph : undefined,
    fn,
    ln,
    db,
    ge,
    ct,
    st,
    zp,
    country,
    external_id,
    fbc: fbc || undefined,
    fbp: fbp || undefined,
  });
}

/** A mesma regra da guarda do `sendCapiEvent`: o que passa aqui, a guarda deixa ir. */
export function temDadosDeCasamento(h: HashesMeta, fbc: string | null, fbp: string | null): boolean {
  return temSinalDeCasamento(dadosDoUsuario(h, fbc, fbp));
}

export function faixaDoValor(total: number, alto: number | null): "alto" | "normal" {
  return alto !== null && total >= alto ? "alto" : "normal";
}

function evento(nome: string, id: string, e: EntradaEvento, extra: Record<string, string>): CapiEvent {
  return {
    event_name: nome,
    event_time: Math.floor(e.quando.getTime() / 1000), // a Meta quer SEGUNDOS
    event_id: id,
    action_source: "chat",
    user_data: dadosDoUsuario(e.hashes, e.fbc, e.fbp),
    custom_data: {
      // O total do Bling já vem em centavos; o arredondamento só tira o ruído do ponto flutuante.
      value: Math.round(e.total * 100) / 100,
      currency: "BRL",
      order_id: e.numero?.trim() || String(e.pedidoBlingId),
      ...extra,
    },
  };
}

export function eventoInitiateCheckout(e: EntradaEvento): CapiEvent {
  return evento("InitiateCheckout", `bling-ic-${e.pedidoBlingId}`, e, {});
}

export function eventoPurchase(e: EntradaEvento): CapiEvent {
  return evento("Purchase", `bling-${e.pedidoBlingId}`, e, { origem: e.origem, faixa: e.faixa });
}

/** Campanhas com pixel E token: sem o token não há como enviar pelo servidor. */
export function opcoesDePixel(campanhas: readonly CampanhaComMetadata[]): PixelEscolhido[] {
  return campanhas.flatMap((c) => {
    const { pixel_id, capi_token, test_code } = readIntegracoes(c.metadata).meta;
    if (!pixel_id || !capi_token) return [];
    return [{ campaignId: c.id, pixelId: pixel_id, token: capi_token, testCode: test_code || null }];
  });
}

/**
 * Escolhida válida → ela; senão um pixel único → o da campanha de menor id; senão o motivo para o
 * cartão pedir a escolha. Só a escolhida leva `test_code`: modo de teste ligado sem a loja ter
 * escolhido a campanha mandaria as compras de verdade para "Eventos de teste".
 */
export function escolherPixel(
  campanhas: readonly CampanhaComMetadata[],
  escolhida: string | null,
): { ok: true; pixel: PixelEscolhido } | { ok: false; motivo: "sem_pixel" | "varios" } {
  const opcoes = opcoesDePixel(campanhas);
  const marcada = opcoes.find((o) => o.campaignId === escolhida);
  if (marcada) return { ok: true, pixel: marcada };
  if (opcoes.length === 0) return { ok: false, motivo: "sem_pixel" };
  // O mesmo pixel em várias campanhas é um pixel só: não há o que escolher.
  if (new Set(opcoes.map((o) => o.pixelId)).size > 1) return { ok: false, motivo: "varios" };
  // Menor id, não a primeira da lista: a ordem da consulta muda, e o token usado não pode mudar junto.
  const primeira = opcoes.reduce((menor, o) => (o.campaignId < menor.campaignId ? o : menor));
  return { ok: true, pixel: { ...primeira, testCode: null } };
}
