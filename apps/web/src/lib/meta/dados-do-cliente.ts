/**
 * Dados do cliente → hashes do Meta (API de Conversões e lista de clientes).
 *
 * Por que existe: o Meta só casa a compradora com quem viu o anúncio se o dado
 * chegar normalizado do jeito dele e em SHA-256. Normalizar diferente dá outro
 * hash, e outro hash não casa com ninguém — sem erro nenhum. Regras da doc do
 * `user_data` da CAPI (spec 2026-10-13-integracao-bling §4).
 *
 * Puro e sem Bling: quem chama converte o contato dele em `DadosDoCliente`.
 * Minimização, não anonimização: nascimento, sexo, UF e CEP se recuperam por
 * força bruta.
 */
import { createHash } from "node:crypto";

import { variantesDoTelefone } from "@/lib/vendas/telefone";

export type DadosDoCliente = {
  nome: string | null;
  /** Só pessoa física leva nome, nascimento e sexo; PJ e estrangeiro, não. */
  pessoaFisica: boolean;
  emails: readonly string[];
  telefones: readonly string[];
  /** YYYY-MM-DD */
  nascimento: string | null;
  sexo: "M" | "F" | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  pais: string | null;
};

/** Tudo em SHA-256 hex. `doby`/`dobm`/`dobd` são do CSV de público; a CAPI só usa `db`. */
export type HashesMeta = {
  em?: string[];
  ph?: string[];
  fn?: string;
  ln?: string;
  db?: string;
  doby?: string;
  dobm?: string;
  dobd?: string;
  ge?: string;
  ct?: string;
  st?: string;
  zp?: string;
  country?: string;
  external_id?: string;
};

export function sha256Hex(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UF = /^[a-z]{2}$/;
const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** O mesmo "é" tem duas grafias em Unicode (composta e decomposta), e cada uma dá um hash. */
function minusculas(texto: string | null): string {
  return (texto ?? "").normalize("NFC").toLowerCase();
}

/** O Bling aceita mais de um e-mail no mesmo campo ("a@x.com; b@y.com"). */
function emailsNormalizados(emails: readonly string[]): string[] {
  const todos = emails.flatMap((e) => e.split(/[,;\s]+/)).map((e) => e.trim().toLowerCase());
  return [...new Set(todos.filter((e) => EMAIL.test(e)))];
}

/**
 * 55 + DDD + número, com e sem o 9: não dá para saber qual dos dois o Meta tem.
 * O `length >= 12` separa o 55 do país do DDD 55 (Santa Maria/RS): com 10 ou 11
 * dígitos a variante é o número nacional, sem país.
 */
function telefonesNormalizados(telefones: readonly string[]): string[] {
  const variantes = telefones.flatMap((t) => variantesDoTelefone(t) ?? []);
  return [...new Set(variantes.filter((v) => v.startsWith("55") && v.length >= 12))];
}

/** Sem pontuação nem dígito ("D'Ávila" → "dávila"); o acento fica, como pede a doc. */
function palavrasDoNome(nome: string | null): string[] {
  return minusculas(nome)
    .replace(/[^\p{L}\p{M}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Data que existe no calendário, de 1900 até hoje: nascimento no futuro (mesmo neste ano) é data torta. */
function nascimentoValido(data: string | null, agora: Date): { ano: string; mes: string; dia: string } | null {
  const partes = DATA.exec((data ?? "").trim());
  if (!partes) return null;
  const [, ano, mes, dia] = partes;
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  const existe = d.getUTCMonth() === Number(mes) - 1 && d.getUTCDate() === Number(dia);
  const noIntervalo = Number(ano) >= 1900 && d.getTime() <= agora.getTime();
  return existe && noIntervalo ? { ano, mes, dia } : null;
}

/** Sem país ou Brasil → "br". Outro país fica de fora: só o código do Brasil é certo aqui. */
function paisNormalizado(pais: string | null): string {
  const nome = (pais ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return nome === "" || nome === "brasil" || nome === "brazil" ? "br" : "";
}

/** Nunca hash de "": campo sem valor fica de fora. */
function hash(valor: string | null | undefined): string | undefined {
  return valor ? sha256Hex(valor) : undefined;
}

function hashes(valores: string[]): string[] | undefined {
  return valores.length > 0 ? valores.map(sha256Hex) : undefined;
}

/** Campo ausente não vai nem como `undefined` (o jsonb e o JSON do Meta comparam chaves). */
function semAusentes(h: HashesMeta): HashesMeta {
  return Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined)) as HashesMeta;
}

/** `chave` = phone_key da pessoa (vira external_id). `agora` só decide a data máxima do nascimento. */
export function hashesDoCliente(d: DadosDoCliente, chave: string | null, agora: Date = new Date()): HashesMeta {
  const nome = d.pessoaFisica ? palavrasDoNome(d.nome) : [];
  const nasc = d.pessoaFisica ? nascimentoValido(d.nascimento, agora) : null;
  const uf = minusculas(d.uf).trim();
  const cep = (d.cep ?? "").replace(/\D/g, "");
  return semAusentes({
    em: hashes(emailsNormalizados(d.emails)),
    ph: hashes(telefonesNormalizados(d.telefones)),
    fn: hash(nome[0]),
    ln: hash(nome.length >= 2 ? nome[nome.length - 1] : null),
    db: hash(nasc && nasc.ano + nasc.mes + nasc.dia),
    doby: hash(nasc?.ano),
    dobm: hash(nasc?.mes),
    dobd: hash(nasc?.dia),
    ge: hash(d.pessoaFisica ? d.sexo?.toLowerCase() : null),
    // "São José dos Campos" → "sãojosédoscampos": sem dígito, pontuação nem espaço.
    ct: hash(minusculas(d.cidade).replace(/[^\p{L}\p{M}]/gu, "")),
    st: hash(UF.test(uf) ? uf : null),
    zp: hash(cep.length === 8 ? cep : null),
    country: hash(paisNormalizado(d.pais)),
    external_id: hash(chave),
  });
}
