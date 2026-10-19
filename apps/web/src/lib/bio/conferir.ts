import "server-only";

import type { DadosRender, DocumentoBio, LinkBio } from "@/lib/bio/documento";
import { midiasPublicasDaLoja } from "@/lib/media-store";
import { chaveDoTelefone } from "@/lib/pages/phone";
import { listCampaignGroups, type CampaignGroup } from "@/lib/stores/campaign-groups";
import { listInstances } from "@/lib/stores/instances";
import { listTrackedLinksBySlugs } from "@/lib/stores/tracked-links";

/**
 * O que o schema não sabe conferir sozinho porque depende da loja (spec 2026-10-19-link-da-bio
 * §4 e §10): a mídia é desta loja, a campanha é desta loja, e nenhum botão abre o WhatsApp do
 * número que a Girumo usa para postar (risco de banimento). No salvar recusa (400); no render,
 * `estadoDosLinks` esconde o que mudou depois.
 */

export const NUMERO_CONECTADO =
  "Esse é o número que a Girumo usa para postar nos grupos. Use o número de atendimento.";

/** O número que um endereço do WhatsApp abre (`wa.me/<n>`, `api.whatsapp.com/send?phone=<n>`); senão null. */
export function numeroDoLinkWhatsapp(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const numero =
    host === "wa.me"
      ? url.pathname.split("/")[1]
      : host === "api.whatsapp.com" || host === "web.whatsapp.com" || host === "whatsapp.com"
        ? url.searchParams.get("phone")
        : null;
  const digitos = numero?.replace(/\D/g, "") ?? "";
  return digitos || null;
}

function numeroDoLink(link: LinkBio): string | null {
  if (link.tipo === "whatsapp") return link.numero;
  if (link.tipo === "link") return numeroDoLinkWhatsapp(link.url);
  return null;
}

/** Chaves (DDD + 8 últimos) de toda instância da loja, conectada ou não. */
async function chavesDasInstancias(tenantId: string): Promise<Set<string>> {
  const instancias = await listInstances(tenantId);
  return new Set(instancias.map((i) => chaveDoTelefone(i.phone)).filter((c): c is string => c !== null));
}

function ehDaLoja(chaves: Set<string>, numero: string): boolean {
  const chave = chaveDoTelefone(numero);
  return chave !== null && chaves.has(chave);
}

/** Cada mídia do documento com o caminho do campo, na ordem da página. */
function midiasDoDocumento(d: DocumentoBio): { campo: string; id: string }[] {
  const lista: { campo: string; id: string }[] = [];
  const doPerfil = { capa: d.perfil.capa, logoClara: d.perfil.logoClara, logoEscura: d.perfil.logoEscura };
  for (const [campo, midia] of Object.entries(doPerfil)) if (midia) lista.push({ campo: `perfil.${campo}`, id: midia.id });
  d.links.forEach((l, i) => {
    if (l.tipo === "link") l.fotos.forEach((f, j) => lista.push({ campo: `links.${i}.fotos.${j}`, id: f.id }));
    if (l.tipo === "endereco" && l.foto) lista.push({ campo: `links.${i}.foto`, id: l.foto.id });
  });
  return lista;
}

/**
 * Antes de salvar (`PATCH /api/link-da-bio`, PR 5): o primeiro problema, com o caminho do campo.
 * Só consulta o que o documento usa — sem mídia, sem grupo e sem WhatsApp, nenhuma query.
 */
export async function conferirDocumentoDaLoja(
  tenantId: string,
  documento: DocumentoBio,
): Promise<{ ok: true } | { ok: false; error: string; campo: string }> {
  const midias = midiasDoDocumento(documento);
  const grupos = documento.links.flatMap((l, i) => (l.tipo === "grupo" ? [{ i, campanhaId: l.campanhaId }] : []));
  const numeros = documento.links.flatMap((l, i) => {
    const numero = numeroDoLink(l);
    return numero ? [{ i, numero, campo: l.tipo === "whatsapp" ? "numero" : "url" }] : [];
  });
  const [daLoja, campanhas, chaves] = await Promise.all([
    midias.length ? midiasPublicasDaLoja(tenantId, midias.map((m) => m.id)) : new Set<string>(),
    grupos.length ? listCampaignGroups(tenantId) : [],
    numeros.length ? chavesDasInstancias(tenantId) : new Set<string>(),
  ]);

  const alheia = midias.find((m) => !daLoja.has(m.id));
  if (alheia) return { ok: false, error: "Essa imagem não está na sua loja. Envie de novo.", campo: alheia.campo };

  const idsDaLoja = new Set(campanhas.map((c) => c.id));
  const semCampanha = grupos.find((g) => !idsDaLoja.has(g.campanhaId));
  if (semCampanha) return { ok: false, error: "Essa campanha não existe mais. Escolha outra.", campo: `links.${semCampanha.i}.campanhaId` };

  const conectado = numeros.find((n) => ehDaLoja(chaves, n.numero));
  if (conectado) return { ok: false, error: NUMERO_CONECTADO, campo: `links.${conectado.i}.${conectado.campo}` };

  return { ok: true };
}

/**
 * campanhaId → slug do link mestre. Link mestre = a linha de `tracked_links` com o slug da
 * campanha e o id dela (`lib/campaigns/master-link.ts`; é ela que faz `/r/<slug>` abrir).
 * Campanha sem essa linha não entra — inclusive quando o slug dela está num link de outra
 * campanha. Busca pelos slugs (no máximo uma linha cada, sem o corte de 1000 do
 * `listTrackedLinks`). O GET do painel (PR 5) pode usar esta mesma função no seletor de
 * campanhas: painel e página nunca discordam sobre qual campanha tem link.
 */
export async function linksMestresDasCampanhas(
  tenantId: string,
  campanhas: readonly Pick<CampaignGroup, "id" | "slug">[],
): Promise<Record<string, string>> {
  const links = await listTrackedLinksBySlugs(tenantId, campanhas.map((c) => c.slug));
  const mestres = new Set(links.map((l) => `${l.campaign_group_id}/${l.slug}`));
  const slugs: Record<string, string> = {};
  for (const c of campanhas) if (mestres.has(`${c.id}/${c.slug}`)) slugs[c.id] = c.slug;
  return slugs;
}

/**
 * Para o render (cache) e para o GET do painel: o slug do link mestre de cada campanha usada e
 * os links que não saem — campanha apagada ou sem link mestre, número que virou da Girumo
 * depois de salvo. Vale para todo link, ativo ou não (o painel avisa nos desligados também).
 */
export async function estadoDosLinks(
  tenantId: string,
  documento: DocumentoBio,
): Promise<Pick<DadosRender, "campanhas" | "linksEscondidos">> {
  const usadas = new Set(documento.links.flatMap((l) => (l.tipo === "grupo" ? [l.campanhaId] : [])));
  const comNumero = documento.links.some((l) => numeroDoLink(l) !== null);
  const [campanhas, chaves] = await Promise.all([
    usadas.size
      ? listCampaignGroups(tenantId).then((daLoja) => linksMestresDasCampanhas(tenantId, daLoja.filter((c) => usadas.has(c.id))))
      : ({} as Record<string, string>),
    comNumero ? chavesDasInstancias(tenantId) : new Set<string>(),
  ]);

  const linksEscondidos = documento.links
    .filter((l) => {
      if (l.tipo === "grupo") return !Object.hasOwn(campanhas, l.campanhaId);
      const numero = numeroDoLink(l);
      return numero !== null && ehDaLoja(chaves, numero);
    })
    .map((l) => l.id);
  return { campanhas, linksEscondidos };
}
