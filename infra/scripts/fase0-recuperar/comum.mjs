// infra/scripts/fase0-recuperar/comum.mjs
// Peças comuns das ferramentas da Fase 0 do Recuperar (descartáveis; ver o plano da Fase 0).
// Regra de ouro: credencial só no ambiente; bruto só fora de qualquer repositório git.
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const PREFIXO_INSTANCIA = "fase0-recuperar-";
export const NOME_DO_AVISO = "girumo-fase0-recuperar";
const SUBPASTAS = ["eventos", "api", "redigido"];

export function pedirEnv(nome, env = process.env) {
  const valor = env[nome]?.trim();
  if (!valor) throw new Error(`${nome} ausente no ambiente (rode credenciais.ps1 na janela do Igor).`);
  return valor;
}

/** Cria as subpastas e recusa uma pasta que esteja dentro de um repositório git. */
export function prepararBruto(pasta) {
  const bruto = resolve(pasta);
  for (let d = bruto; ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) throw new Error("FASE0_BRUTO está dentro de um repositório git. Use uma pasta fora do repo.");
    if (dirname(d) === d) break;
  }
  for (const sub of SUBPASTAS) mkdirSync(join(bruto, sub), { recursive: true });
  return bruto;
}
export const dirBruto = () => prepararBruto(pedirEnv("FASE0_BRUTO"));

export const lerJson = (arq, padrao = null) => (existsSync(arq) ? JSON.parse(readFileSync(arq, "utf8")) : padrao);
export const gravarJson = (arq, obj) => writeFileSync(arq, JSON.stringify(obj, null, 2));
export const lerEstado = (bruto = dirBruto()) => lerJson(join(bruto, "estado.json"), {});
export const mesclarEstado = (patch, bruto = dirBruto()) => gravarJson(join(bruto, "estado.json"), { ...lerEstado(bruto), ...patch });

export const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const urlDoTunel = (linha) => String(linha).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;

/** Identifica o que é do teste: e-mail e telefone que o Igor usa nos checkouts de teste. */
export const marcadores = (env = process.env) => (env.FASE0_MARCADORES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export function temMarcador(texto, lista = marcadores()) {
  const baixo = String(texto).toLowerCase();
  const digitos = String(texto).replace(/\D/g, "");
  return lista.some((m) => baixo.includes(m.toLowerCase()) || (/^\d{6,}$/.test(m) && digitos.includes(m)));
}

/** FASE0_CELULARES="CHIP=55629...,B=55629...,C=55629..." (só dígitos, com 55). */
export function celulares(env = process.env) {
  const mapa = {};
  for (const par of (env.FASE0_CELULARES ?? "").split(",")) {
    const [rotulo, numero] = par.split("=").map((s) => s?.trim());
    if (rotulo && /^55\d{10,11}$/.test(numero ?? "")) mapa[rotulo.toUpperCase()] = numero;
  }
  return mapa;
}

/** Veredito da assinatura da Yampi: base64(HMAC-SHA256(corpo cru, segredo)). */
export function veredictoAssinatura(corpo, cabecalho, segredo) {
  if (!segredo) return "sem_segredo";
  if (!cabecalho) return "sem_cabecalho";
  // compara em bytes: cabeçalho com caractere fora do ASCII tem mais bytes que caracteres, e o timingSafeEqual lançaria
  const igual = (a, b) => {
    const [x, y] = [Buffer.from(a), Buffer.from(b)];
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const mac = (dados, formato) => createHmac("sha256", segredo).update(dados).digest(formato);
  if (igual(mac(corpo, "base64"), cabecalho)) return "ok";
  if (igual(mac(corpo, "hex"), cabecalho)) return "so_hex";
  try {
    const reserializado = JSON.stringify(JSON.parse(corpo.toString("utf8")));
    if (igual(mac(reserializado, "base64"), cabecalho)) return "so_json_reserializado";
  } catch {
    // corpo que não é JSON: sem variante a tentar
  }
  return "invalido";
}

/** Trava: a chave global da Evolution só mexe em instância de teste desta fase. */
export function assertNomeDeTeste(nome) {
  if (typeof nome !== "string" || !nome.startsWith(PREFIXO_INSTANCIA) || nome.length < PREFIXO_INSTANCIA.length + 4) {
    throw new Error(`Recusado: "${nome}" não é instância de teste (prefixo ${PREFIXO_INSTANCIA}).`);
  }
  return nome;
}
export function nomeDaInstancia(env = process.env) {
  const hoje = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return assertNomeDeTeste(env.FASE0_INSTANCIA?.trim() || `${PREFIXO_INSTANCIA}${hoje}`);
}

/** Trava: só apaga o aviso que esta fase criou (a loja pode ter avisos de outras integrações). */
export function assertAvisoNosso(aviso, idEsperado) {
  if (!aviso || aviso.name !== NOME_DO_AVISO || String(aviso.id) !== String(idEsperado)) {
    throw new Error("Recusado: esse aviso não é o que a Fase 0 criou.");
  }
}

export function caminhoNoObjeto(obj, caminho) {
  return caminho
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function lerEvento(bruto, seq) {
  const prefixo = `${String(seq).padStart(3, "0")}-`;
  const nome = readdirSync(join(bruto, "eventos")).find((n) => n.startsWith(prefixo));
  if (!nome) throw new Error(`Evento ${seq} não encontrado em eventos/.`);
  return lerJson(join(bruto, "eventos", nome));
}

export function eventosDaRota(bruto, rota) {
  return readdirSync(join(bruto, "eventos"))
    .filter((n) => n.includes(`-${rota}-`))
    .sort()
    .map((n) => lerJson(join(bruto, "eventos", n)));
}

// Provas do Rastreio (Y22 e Y23): dos pedidos criados entre 45 e 15 dias atrás, quantos foram enviados, quantos
// chegaram a "entregue" na Yampi e quantos têm código de rastreio. Recebe a lista crua e devolve só contagens.
// "Enviado" (Y22) = tem código de rastreio, passou por um alias de ALIASES_ENVIADO ou está entregue.
export const ALIASES_ENVIADO = ["shipped", "sent", "on_carriage", "in_transit"];

const diaDaYampi = (v) => /^(\d{4}-\d{2}-\d{2})/.exec(typeof v === "string" ? v : (v?.date ?? ""))?.[1] ?? null;
const janelaDeEntregues = (agora) => [45, 15].map((dias) => new Date(agora - dias * 864e5).toISOString().slice(0, 10));

export function pedidosDaJanela(pedidos, agora = Date.now()) {
  const [inicio, fim] = janelaDeEntregues(agora);
  return pedidos.filter((p) => {
    const dia = diaDaYampi(p.created_at ?? p.date);
    return dia !== null && dia >= inicio && dia <= fim;
  });
}

export function contarEntregues(pedidos, agora = Date.now(), aliasesEnviado = ALIASES_ENVIADO) {
  const [inicio, fim] = janelaDeEntregues(agora);
  const r = { baixados: pedidos.length, semData: 0, naJanela: 0, enviados: 0, entregues: 0, enviadosPorStatus: 0, comCodigo: 0, maisAntigo: null, maisNovo: null };
  for (const p of pedidos) {
    const dia = diaDaYampi(p.created_at ?? p.date);
    if (!dia) {
      r.semData++;
      continue;
    }
    if (!r.maisAntigo || dia < r.maisAntigo) r.maisAntigo = dia;
    if (!r.maisNovo || dia > r.maisNovo) r.maisNovo = dia;
    if (dia < inicio || dia > fim) continue;
    r.naJanela++;
    const aliases = [...JSON.stringify([p.status, p.statuses]).matchAll(/"alias":"([^"]+)"/g)].map((m) => m[1]);
    const entregue = p.delivered === true || aliases.includes("delivered");
    const porStatus = entregue || aliases.some((a) => aliasesEnviado.includes(a));
    if (porStatus || Boolean(p.track_code)) r.enviados++;
    if (entregue) r.entregues++;
    // Y23: aqui o código de rastreio não entra no critério de "enviado", senão a conta fica circular.
    if (porStatus) {
      r.enviadosPorStatus++;
      if (p.track_code) r.comCodigo++;
    }
  }
  return r;
}

// Y24 (Rastreio): tipo de cliente e documento. Só contagens e nomes de campo; de `type` sai o valor, mas só quando é
// um rótulo curto (f, j, company, 1…), nunca um texto livre.
export function perfilDosClientes(pedidos) {
  const r = { pedidos: pedidos.length, tipos: {}, camposDeDocumento: {}, semDocumento: 0, campos: [] };
  const campos = new Set();
  for (const p of pedidos) {
    const c = p.customer?.data ?? {};
    for (const k of Object.keys(c)) campos.add(k);
    const tipo = c.type == null ? "(vazio)" : /^(?:[a-z_]{1,20}|\d{1,2})$/i.test(String(c.type)) ? String(c.type) : "(outro)";
    r.tipos[tipo] = (r.tipos[tipo] ?? 0) + 1;
    const docs = Object.keys(c).filter((k) => /cpf|cnpj|document/i.test(k) && /\d/.test(String(c[k] ?? "")));
    for (const k of docs) r.camposDeDocumento[k] = (r.camposDeDocumento[k] ?? 0) + 1;
    if (!docs.length) r.semDocumento++;
  }
  r.campos = [...campos].sort();
  return r;
}

// Y26 (Rastreio): quantos pedidos da listagem estão dentro do intervalo pedido, pelo dia de `updated_at`.
export function dentroDoIntervalo(pedidos, inicio, fim) {
  const r = { dentro: 0, fora: 0, semData: 0 };
  for (const p of pedidos) {
    const dia = diaDaYampi(p.updated_at);
    if (!dia) r.semData++;
    else if (dia >= inicio && dia <= fim) r.dentro++;
    else r.fora++;
  }
  return r;
}
