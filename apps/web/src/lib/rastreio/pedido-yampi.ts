/**
 * Pedido da Yampi (item de `GET /orders?include=customer,status,statuses`) → `PedidoParaGravar`.
 * Puro. Aceita o include com e sem `data` e a data em texto ou no objeto da Yampi.
 * Documento, nome e telefone só saem daqui como HMAC / valor já limpo; nada vai a log.
 */
import { z } from "zod";
import { telefoneCanonico } from "@/lib/vendas/telefone";
import { docHmac, normalizarDocumento } from "@/lib/rastreio/documento";
import { etapaDaYampi } from "@/lib/rastreio/etapas";
import type { EventoDaLinha, PedidoParaGravar } from "@/lib/rastreio/tipos";

const DATA = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]{0,19}$/; // vai no texto do WhatsApp: nada de link, @ ou número
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ISO de uma data da Yampi (texto ou `{ date, timezone }`); sem fuso = Brasília (-03:00, sem horário de verão). */
export function dataDaYampi(v: unknown): string | null {
  let texto: unknown = v;
  let utc = false;
  if (v && typeof v === "object" && "date" in v) {
    texto = (v as { date: unknown }).date;
    utc = (v as { timezone?: unknown }).timezone === "UTC";
  }
  if (typeof texto !== "string") return null;
  const m = DATA.exec(texto.trim());
  if (!m) return null;
  let fuso = m[3] ?? (utc ? "Z" : "-03:00");
  if (/^[+-]\d{4}$/.test(fuso)) fuso = `${fuso.slice(0, 3)}:${fuso.slice(3)}`;
  const t = Date.parse(`${m[1]}T${m[2]}${fuso}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const desembrulha = (v: unknown): unknown => (v && typeof v === "object" && "data" in v ? (v as { data: unknown }).data : v);
// `{ data: [] }` é o include vazio da Yampi (array, não objeto): vale como ausente, não derruba o pedido.
const incluido = z.preprocess((v) => {
  const d = desembrulha(v);
  return Array.isArray(d) && d.length === 0 ? null : d;
}, z.record(z.string(), z.unknown()).nullish());

const texto = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  return String(v).trim() || null;
};

const SEM_CONTROLE = /[\u0000-\u001f\u007f-\u009f]/g;
const MAX_TEXTO = 80;
const EMAIL_MAX = 254; // RFC 5321; também evita o regex quadrático em texto gigante
// Vão literais no WhatsApp. Código acima do teto não é código de rastreio de verdade → null;
// serviço de envio é só rótulo → trunca.
const codigoDeRastreio = (v: unknown): string | null => {
  const t = texto(v)?.replace(SEM_CONTROLE, "").trim();
  return t && t.length <= MAX_TEXTO ? t : null;
};
const servicoDeEnvio = (v: unknown): string | null => texto(v)?.replace(SEM_CONTROLE, "").trim().slice(0, MAX_TEXTO) || null;

const schema = z.object({
  id: z.unknown().transform(texto).pipe(z.string()),
  number: z.unknown().transform(texto).pipe(z.string()),
  created_at: z.unknown().transform(dataDaYampi).pipe(z.string()),
  updated_at: z.unknown().transform(dataDaYampi).pipe(z.string()),
  status: incluido.pipe(z.object({ alias: z.unknown().transform(texto).pipe(z.string()) })),
  track_code: z.unknown().transform(codigoDeRastreio),
  track_url: z.unknown().transform(texto),
  delivered: z.unknown(),
  shipment_service: z.unknown().transform(servicoDeEnvio),
  customer: incluido,
  statuses: z.preprocess(desembrulha, z.array(z.unknown()).nullish()),
});

const registro = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function urlHttp(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function telefoneDe(phone: unknown): string | null {
  const p = registro(phone);
  return telefoneCanonico(String(texto(p.full_number) ?? "")) ?? telefoneCanonico(`${texto(p.area_code) ?? ""}${texto(p.number) ?? ""}`);
}

function historicoDe(itens: unknown[], atual: PedidoParaGravar["etapa"], atualizadoNaYampi: string): EventoDaLinha[] {
  const eventos: EventoDaLinha[] = [];
  for (const it of itens) {
    const r = registro(it);
    const alias = texto(registro(desembrulha(r.status)).alias) ?? texto(r.alias);
    const at = dataDaYampi(r.created_at);
    const etapa = at ? etapaDaYampi({ statusAlias: alias, trackCode: null, delivered: false }) : null;
    if (etapa && at) eventos.push({ etapa, at });
  }
  eventos.sort((a, b) => a.at.localeCompare(b.at));
  const limpo = eventos.filter((e, i) => i === 0 || e.etapa !== eventos[i - 1].etapa);
  // A RPC só completa a etapa atual com now() se faltar: aqui ela entra com o updated_at.
  if (limpo.length > 0 && atual && limpo[limpo.length - 1].etapa !== atual) limpo.push({ etapa: atual, at: atualizadoNaYampi });
  return limpo;
}

export function pedidoDaYampi(payload: unknown, pepper: string): PedidoParaGravar | null {
  const lido = schema.safeParse(payload);
  if (!lido.success) return null;
  const p = lido.data;
  const c = registro(p.customer);

  const cpf = texto(c.cpf), cnpj = texto(c.cnpj);
  const candidatos = /^j/i.test(texto(c.type) ?? "") ? [cnpj, cpf] : [cpf, cnpj];
  let doc: ReturnType<typeof normalizarDocumento> = null;
  for (const cand of candidatos) {
    doc = cand ? normalizarDocumento(cand) : null;
    if (doc) break;
  }

  const nomeBruto = texto(c.first_name) ?? (doc?.tipo === "cnpj" ? null : texto(c.name));
  const primeira = nomeBruto?.split(/\s+/)[0] ?? "";
  const email = texto(c.email);
  const etapa = etapaDaYampi({ statusAlias: p.status?.alias ?? null, trackCode: p.track_code, delivered: p.delivered === true || p.delivered === 1 });

  return {
    externalId: p.id,
    numero: p.number,
    orderCreatedAt: p.created_at,
    statusRaw: p.status?.alias ?? "",
    etapa,
    trackingCode: p.track_code,
    trackingUrl: urlHttp(p.track_url),
    shipmentService: p.shipment_service,
    buyerFirstName: NOME.test(primeira) ? primeira : null,
    buyerPhone: telefoneDe(c.phone),
    buyerEmail: email && email.length <= EMAIL_MAX && EMAIL.test(email) ? email : null,
    docHmac: doc ? docHmac(doc.digitos, pepper) : null,
    historico: historicoDe(p.statuses ?? [], etapa, p.updated_at),
    atualizadoNaYampi: p.updated_at,
  };
}
