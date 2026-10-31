// infra/scripts/fase0-rastreio/cruzar.mjs
// Prova 5 do Rastreio: cruza os códigos de rastreio da Yampi com as etiquetas do Melhor Envio, em memória.
// Puro (sem rede nem disco). Nada que sai daqui carrega valor de etiqueta ou de pedido: só contagens e nomes de campo.

const UM_DIA = 864e5;
const PROBLEMA = new Set(["paused", "undelivered", "suspended"]);

export function normalizarCodigo(v) {
  if (typeof v !== "string") return null;
  const codigo = v.replace(/\s+/g, "").toUpperCase();
  return codigo || null;
}

// O dia `AAAA-MM-DD` de um `created_at` em texto ou no objeto `{ date }` que a Yampi devolve.
function diaDe(v) {
  const texto = typeof v === "string" ? v : typeof v?.date === "string" ? v.date : null;
  return texto && /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
}
const diaAntes = (agora, n) => new Date(agora - n * UM_DIA).toISOString().slice(0, 10);
const menor = (a, b) => (a === null || b < a ? b : a);
const maior = (a, b) => (a === null || b > a ? b : a);
const preenchido = (v) => v !== null && v !== undefined && v !== "";
// O status vira chave da saída: só aceita o formato dos status do Melhor Envio, nunca texto livre.
const statusDe = (e) => (typeof e?.status === "string" && /^[a-z_]{1,30}$/.test(e.status) ? e.status : "outro");

export function codigosEnviadosNaJanela(pedidos, agora) {
  const inicio = diaAntes(agora, 45);
  const fim = diaAntes(agora, 15);
  const codigos = new Set();
  let semData = 0;
  let naJanela = 0;
  let comCodigo = 0;
  let maisAntigo = null;
  let maisNovo = null;
  for (const p of pedidos) {
    const dia = diaDe(p?.created_at);
    if (!dia) {
      semData++;
      continue;
    }
    maisAntigo = menor(maisAntigo, dia);
    maisNovo = maior(maisNovo, dia);
    if (dia < inicio || dia > fim) continue;
    naJanela++;
    const codigo = normalizarCodigo(p.track_code);
    if (!codigo) continue;
    comCodigo++;
    codigos.add(codigo);
  }
  return { codigos: [...codigos], inicio, fim, baixados: pedidos.length, semData, naJanela, comCodigo, maisAntigo, maisNovo };
}

export function indexar(etiquetas) {
  const indice = new Map();
  for (const e of etiquetas) {
    const proprio = normalizarCodigo(e?.self_tracking);
    if (proprio && !indice.has(proprio)) indice.set(proprio, "self_tracking");
    const codigo = normalizarCodigo(e?.tracking);
    if (codigo) indice.set(codigo, "tracking");
  }
  return indice;
}

export function cruzar(codigos, indice) {
  let achadasTracking = 0;
  let achadasSelf = 0;
  const faltando = [];
  for (const c of codigos) {
    const campo = indice.get(normalizarCodigo(c));
    if (campo === "tracking") achadasTracking++;
    else if (campo === "self_tracking") achadasSelf++;
    else faltando.push(c);
  }
  return { achadasTracking, achadasSelf, faltando };
}

export function resumirEtiquetas(etiquetas) {
  const porStatus = {};
  const datasPorStatus = {};
  const chaves = new Set();
  const chavesEmProblema = new Set();
  let maisAntiga = null;
  for (const e of etiquetas) {
    if (!e || typeof e !== "object") continue;
    const status = statusDe(e);
    porStatus[status] = (porStatus[status] ?? 0) + 1;
    const datas = (datasPorStatus[status] ??= {});
    for (const [chave, valor] of Object.entries(e)) {
      chaves.add(chave);
      if (!preenchido(valor)) continue;
      if (chave.endsWith("_at")) datas[chave] = (datas[chave] ?? 0) + 1;
      if (PROBLEMA.has(status)) chavesEmProblema.add(chave);
    }
    const dia = diaDe(e.created_at);
    if (dia) maisAntiga = menor(maisAntiga, dia);
  }
  return { listadas: etiquetas.length, porStatus, datasPorStatus, chaves: [...chaves].sort(), chavesEmProblema: [...chavesEmProblema].sort(), maisAntiga };
}

export function veredito({ codigos, achadas, listadas }) {
  if (codigos === 0) return "SEM_CODIGOS";
  if (listadas === 0 || achadas === 0) return "NAO_PASSA";
  return achadas / codigos >= 0.8 ? "PASSA" : "DECIDIR";
}

const contagens = (obj) => Object.entries(obj ?? {}).map(([k, n]) => `\`${k}\`=${n}`).join(", ") || "—";
const nomes = (lista) => (lista ?? []).map((k) => `\`${k}\``).join(", ") || "—";
const ou = (v) => v ?? "—";

export function linhasDoResultado(m) {
  const achadas = m.achadasTracking + m.achadasSelf + m.achadasNaBusca;
  const pct = m.codigos ? Math.round((100 * achadas) / m.codigos) : 0;
  const datas = Object.entries(m.datasPorStatus ?? {}).map(([status, campos]) => `${status}: ${contagens(campos)}`).join("; ") || "—";
  return [
    `| M1 | Pedidos da Yampi criados de ${m.inicio} a ${m.fim} (variante ${m.variante}) | ${m.naJanela} na janela, ${m.comCodigo} com código, ${m.codigos} códigos únicos; ${m.baixados} baixados, de ${ou(m.maisAntigo)} a ${ou(m.maisNovo)}; ${m.semData} sem data |`,
    `| M2 | Etiquetas que o app da Girumo lista na conta da piloto | ${m.listadas} em ${m.paginas} página(s); a mais antiga de ${ou(m.maisAntiga)} |`,
    `| M3 | Códigos da Yampi achados no Melhor Envio | ${achadas} de ${m.codigos} (${pct}%): ${m.achadasTracking} pelo \`tracking\`, ${m.achadasSelf} pelo \`self_tracking\`, ${m.achadasNaBusca} só pela busca (${m.buscados} buscados) |`,
    `| M4 | Status das etiquetas listadas | ${contagens(m.porStatus)} |`,
    `| M5 | Campos de data preenchidos, por status | ${datas} |`,
    `| M6 | Campos preenchidos nas etiquetas \`paused\`, \`undelivered\` e \`suspended\` | ${nomes(m.chavesEmProblema)} |`,
    `| M7 | Veredito da prova 5 | ${m.veredito} |`,
  ].join("\n");
}
