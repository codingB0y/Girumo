// infra/scripts/fase0-recuperar/evolution.mjs
// Chamadas à Evolution de PRODUÇÃO, só para a instância de teste fase0-recuperar-<data>. Usa a chave global do ambiente e não a imprime.
//   node infra/scripts/fase0-recuperar/evolution.mjs <comando>
//   versao | criar | conectar | webhook | estado | config | numeros <rótulo>... | texto <B|C> "<texto>" [--jid] | texto-invalido | imagem <B|C> "<legenda>" | midia <imagem|audio> | apagar
import { join } from "node:path";
import { celulares, dirBruto, eventosDaRota, gravarJson, lerEstado, lerJson, mesclarEstado, nomeDaInstancia, pedirEnv } from "./comum.mjs";

const EVENTOS = ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"];
const INTERVALO_MINIMO_MS = 40_000; // a spec sorteia 40 a 120 s entre envios do número; a prova nunca fica abaixo disso
const NUMERO_QUE_NAO_EXISTE = "5500999990000"; // DDD 00 não existe: ninguém recebe a mensagem

const enc = encodeURIComponent;
const tipoDoJid = (jid) => (String(jid).endsWith("@lid") ? "@lid" : String(jid).endsWith("@s.whatsapp.net") ? "@s.whatsapp.net" : "outro");

async function evo(metodo, caminho, corpo) {
  const base = pedirEnv("EVOLUTION_API_URL").replace(/\/+$/, "");
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { apikey: pedirEnv("EVOLUTION_API_KEY"), ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON fica só em `texto`
  }
  return { status: r.status, json, texto };
}

/** B, C, B-SEM9 (JID sem o 9º dígito) ou invalido. O CHIP nunca é destino. */
function numeroDe(rotulo) {
  if (rotulo.toLowerCase() === "invalido") return NUMERO_QUE_NAO_EXISTE;
  const [base, variante] = rotulo.toUpperCase().split("-");
  const numero = base === "CHIP" ? undefined : celulares()[base];
  if (!numero) throw new Error(`rótulo desconhecido: ${rotulo} (use B, C, B-SEM9, C-SEM9 ou invalido)`);
  return variante === "SEM9" && numero.length === 13 ? numero.slice(0, 4) + numero.slice(5) : numero;
}

function exigirIntervalo() {
  const ultimo = lerEstado().ultimoEnvio;
  const falta = ultimo ? INTERVALO_MINIMO_MS - (Date.now() - Date.parse(ultimo)) : 0;
  if (falta > 0) throw new Error(`Espere mais ${Math.ceil(falta / 1000)} s: o ritmo mínimo entre envios é de ${INTERVALO_MINIMO_MS / 1000} s.`);
}

function registrarEnvio(rotulo, resposta, arquivo) {
  const bruto = dirBruto();
  gravarJson(join(bruto, "api", arquivo), resposta.json);
  const key = resposta.json?.key;
  if (!key?.id) return;
  const em = new Date().toISOString();
  mesclarEstado({ ultimoEnvio: em, enviados: [...(lerEstado(bruto).enviados ?? []), { keyId: key.id, para: rotulo, jid: key.remoteJid, em }] }, bruto);
}

function resumoDoEnvio(nome, r, numero) {
  const key = r.json?.key;
  console.log(
    `${nome} http=${r.status} key.id=${key?.id ? `${key.id.length} caracteres` : "ausente"} key.remoteJid=${tipoDoJid(key?.remoteJid)} key.remoteJidAlt=${key?.remoteJidAlt ? tipoDoJid(key.remoteJidAlt) : "ausente"} igual_ao_destino=${String(key?.remoteJid).split("@")[0] === numero} status=${r.json?.status ?? "-"}`,
  );
}

async function versao() {
  const r = await evo("GET", "/");
  console.log(`versao http=${r.status} version=${r.json?.version ?? "?"} (a fonte lida é a 2.3.7)`);
}

async function criar() {
  const instancia = nomeDaInstancia();
  const chip = celulares().CHIP;
  if (!chip) throw new Error("FASE0_CELULARES precisa do CHIP=55... (o código de pareamento sai para esse número).");
  const r = await evo("POST", "/instance/create", { instanceName: instancia, integration: "WHATSAPP-BAILEYS", qrcode: true, number: chip });
  const ajustes = Object.fromEntries(Object.entries(r.json?.settings ?? {}).filter(([, v]) => typeof v === "boolean"));
  console.log(`criar http=${r.status} instancia=${instancia} pairingCode=${r.json?.qrcode?.pairingCode ?? "(ausente: rode conectar)"}`);
  console.log(`ajustes que o app também recebe por padrão: ${JSON.stringify(ajustes)}`);
}

async function conectar() {
  const r = await evo("GET", `/instance/connect/${enc(nomeDaInstancia())}?number=${celulares().CHIP}`);
  console.log(`conectar http=${r.status} pairingCode=${r.json?.pairingCode ?? "(ausente)"} count=${r.json?.count ?? "-"}`);
}

async function webhook() {
  const urls = lerJson(join(dirBruto(), "urls.json"));
  if (!urls?.evolution) throw new Error("Suba a captura antes (urls.json ausente).");
  const r = await evo("POST", `/webhook/set/${enc(nomeDaInstancia())}`, {
    webhook: { enabled: true, url: urls.evolution, byEvents: false, base64: false, events: EVENTOS },
  });
  console.log(`webhook http=${r.status} eventos=${EVENTOS.join(",")}`);
}

async function estado() {
  const instancia = nomeDaInstancia();
  const [conexao, lista] = [await evo("GET", `/instance/connectionState/${enc(instancia)}`), await evo("GET", `/instance/fetchInstances?instanceName=${enc(instancia)}`)];
  const i = Array.isArray(lista.json) ? lista.json[0] : lista.json;
  console.log(`estado conexao=${conexao.json?.instance?.state ?? conexao.status} connectionStatus=${i?.connectionStatus ?? "-"} dono_conectado=${Boolean(i?.ownerJid)} disconnectionReasonCode=${i?.disconnectionReasonCode ?? "-"} disconnectionAt=${i?.disconnectionAt ?? "-"}`);
}

async function config() {
  const r = await evo("GET", `/settings/find/${enc(nomeDaInstancia())}`);
  const ajustes = Object.fromEntries(Object.entries(r.json ?? {}).filter(([, v]) => typeof v === "boolean"));
  console.log(`config http=${r.status} ${JSON.stringify(ajustes)}`);
}

async function numeros(rotulos) {
  const lista = rotulos.map(numeroDe);
  const r = await evo("POST", `/chat/whatsappNumbers/${enc(nomeDaInstancia())}`, { numbers: lista });
  gravarJson(join(dirBruto(), "api", `numeros-${Date.now()}.json`), r.json);
  console.log(`numeros http=${r.status}`);
  (Array.isArray(r.json) ? r.json : []).forEach((x, i) => {
    const usuario = String(x.jid).split("@")[0];
    console.log(`  ${rotulos[i]} exists=${x.exists} jid=${tipoDoJid(x.jid)} (${usuario.length} dígitos; enviado com ${lista[i].length}) jid_igual_ao_enviado=${usuario === lista[i]} lid=${x.lid ?? "-"} nome_presente=${Boolean(x.name)}`);
  });
}

// Com --jid, o `number` do envio é o JID que o whatsappNumbers devolveu (a forma que o plano 3 pretende usar); sem, são os dígitos.
async function texto(rotulo, mensagem, comJid) {
  const alvo = String(rotulo).toUpperCase();
  if (!["B", "C"].includes(alvo) || !mensagem) throw new Error('uso: texto <B|C> "<texto>" [--jid]');
  exigirIntervalo();
  const instancia = nomeDaInstancia();
  const numero = numeroDe(alvo);
  let destino = numero;
  if (comJid) {
    const achado = await evo("POST", `/chat/whatsappNumbers/${enc(instancia)}`, { numbers: [numero] });
    const item = Array.isArray(achado.json) ? achado.json[0] : null;
    if (!item?.exists || !item.jid) throw new Error("whatsappNumbers não achou o número; nada foi enviado");
    destino = item.jid;
  }
  const r = await evo("POST", `/message/sendText/${enc(instancia)}`, { number: destino, text: mensagem });
  registrarEnvio(alvo, r, `envio-texto-${Date.now()}.json`);
  resumoDoEnvio(comJid ? "texto (number=jid)" : "texto", r, numero);
}

async function textoInvalido() {
  const instancia = nomeDaInstancia();
  const antes = await evo("POST", `/chat/whatsappNumbers/${enc(instancia)}`, { numbers: [NUMERO_QUE_NAO_EXISTE] });
  if (antes.json?.[0]?.exists !== false) throw new Error("abortado: o número inventado não voltou como inexistente");
  const r = await evo("POST", `/message/sendText/${enc(instancia)}`, { number: NUMERO_QUE_NAO_EXISTE, text: "Teste da Fase 0 (numero que nao existe)" });
  gravarJson(join(dirBruto(), "api", "envio-numero-inexistente.json"), { status: r.status, corpo: r.json ?? r.texto });
  console.log(`texto-invalido http=${r.status} chaves=${Object.keys(r.json ?? {}).join(",")}`);
}

async function imagem(rotulo, legenda) {
  const alvo = String(rotulo).toUpperCase();
  if (!["B", "C"].includes(alvo) || !legenda) throw new Error('uso: imagem <B|C> "<legenda>"');
  exigirIntervalo();
  const urls = lerJson(join(dirBruto(), "urls.json"));
  if (!urls?.imagem) throw new Error("Suba a captura antes (urls.json ausente).");
  const numero = numeroDe(alvo);
  const r = await evo("POST", `/message/sendMedia/${enc(nomeDaInstancia())}`, {
    number: numero,
    mediatype: "image",
    mimetype: "image/jpeg",
    caption: legenda,
    fileName: "teste.jpg",
    media: urls.imagem,
  });
  registrarEnvio(alvo, r, `envio-imagem-${Date.now()}.json`);
  resumoDoEnvio("imagem", r, numero);
}

async function midia(tipo) {
  const bruto = dirBruto();
  const chave = tipo === "audio" ? "audioMessage" : "imageMessage";
  const recebida = eventosDaRota(bruto, "evo").reverse().find((e) => e.body?.event === "messages.upsert" && !e.body.data?.key?.fromMe && e.body.data?.message?.[chave]);
  if (!recebida) throw new Error(`nenhuma ${chave} recebida ainda`);
  const r = await evo("POST", `/chat/getBase64FromMediaMessage/${enc(nomeDaInstancia())}`, { message: { key: { id: recebida.body.data.key.id } } });
  gravarJson(join(bruto, "api", `base64-${tipo}.json`), r.json);
  const base64 = String(r.json?.base64 ?? "");
  const magic = Buffer.from(base64.slice(0, 16), "base64").subarray(0, 4).toString("hex");
  console.log(`midia ${tipo} http=${r.status} mediaType=${r.json?.mediaType} mimetype=${r.json?.mimetype} base64=${base64.length} caracteres magic=${magic}`);
}

async function apagar() {
  const instancia = nomeDaInstancia();
  const saida = await evo("DELETE", `/instance/logout/${enc(instancia)}`);
  const apagada = await evo("DELETE", `/instance/delete/${enc(instancia)}`);
  const lista = await evo("GET", `/instance/fetchInstances?instanceName=${enc(instancia)}`); // nunca sem o nome: sem ele devolve as instâncias de produção
  const sobrou = Array.isArray(lista.json) ? lista.json.length : 0;
  console.log(`apagar logout=${saida.status} delete=${apagada.status} instancias_com_esse_nome=${sobrou}`);
  if (sobrou) process.exit(1);
}

const [comando, a, ...resto] = process.argv.slice(2);
const comandos = {
  versao,
  criar,
  conectar,
  webhook,
  estado,
  config,
  numeros: () => numeros([a, ...resto].filter(Boolean)),
  texto: () => texto(a, resto.filter((x) => x !== "--jid").join(" "), resto.includes("--jid")),
  "texto-invalido": textoInvalido,
  imagem: () => imagem(a, resto.join(" ")),
  midia: () => midia(a),
  apagar,
};
if (!comandos[comando]) {
  console.error(`uso: evolution.mjs ${Object.keys(comandos).join(" | ")}`);
  process.exit(2);
}
try {
  await comandos[comando]();
} catch (e) {
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
