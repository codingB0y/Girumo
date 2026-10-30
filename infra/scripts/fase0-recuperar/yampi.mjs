// infra/scripts/fase0-recuperar/yampi.mjs
// Chamadas à API da Yampi com a credencial do lojista da piloto (só do ambiente). Não imprime token, segredo, telefone nem e-mail.
//   node infra/scripts/fase0-recuperar/yampi.mjs <comando>
//   ping | credenciais-formato | erro-401 | prova-401 | webhook-criar [evento,evento] | webhook-listar [sufixo] | webhook-desativar | webhook-apagar
//   pedido <seq> | pedidos-1 | pedidos-pix | carrinhos | entregues [alias,alias] | atualizados | copiar-link <seq> <caminho.do.campo>
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ALIASES_ENVIADO, NOME_DO_AVISO, assertAvisoNosso, caminhoNoObjeto, contarEntregues, dentroDoIntervalo, dirBruto, dormir, gravarJson, lerEstado, lerEvento, lerJson, mesclarEstado, pedidosDaJanela, pedirEnv, perfilDosClientes, temMarcador } from "./comum.mjs";

const BASE = process.env.FASE0_YAMPI_BASE ?? "https://api.dooki.com.br/v2";
const EVENTOS = ["cart.reminder", "order.created", "order.paid", "order.status.updated", "transaction.payment.refused"];
const INCLUDE_PEDIDO = "customer,items,transactions,status,statuses,shipping_address";
const UM_DIA = 864e5;

async function api(metodo, caminho, { consulta = {}, corpo } = {}) {
  const url = new URL(`${BASE}/${pedirEnv("YAMPI_ALIAS")}${caminho}`);
  for (const [chave, valor] of Object.entries(consulta)) url.searchParams.append(chave, String(valor));
  const inicio = Date.now();
  const r = await fetch(url, {
    method: metodo,
    headers: {
      "User-Token": pedirEnv("YAMPI_USER_TOKEN"),
      "User-Secret-Key": pedirEnv("YAMPI_USER_SECRET_KEY"),
      Accept: "application/json",
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON fica só em `texto`
  }
  await dormir(1100); // ~55 req/min: a doc fala em 60/min por rota
  const limiteObj = Object.fromEntries([...r.headers].filter(([k]) => /rate|limit|retry|remaining/i.test(k)));
  const limite = Object.entries(limiteObj).map(([k, v]) => `${k}=${v}`);
  return { status: r.status, json, texto, ms: Date.now() - inicio, limite, limiteObj };
}
const dados = (r) => (Array.isArray(r.json?.data) ? r.json.data : r.json?.data ? [r.json.data] : []);
const erro = (r) => `http=${r.status} ${String(r.json?.message ?? r.texto).slice(0, 160)}`;
const hostDe = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
};
const dia = (data) => data.toISOString().slice(0, 10);

async function ping() {
  const r = await api("GET", "/checkout/statuses");
  console.log(`ping http=${r.status} ms=${r.ms} status_de_pedido=[${dados(r).map((s) => s.alias).join(",")}]`);
  console.log(`cabeçalhos de limite: ${r.limite.join(" ") || "nenhum"}`);
  gravarJson(join(dirBruto(), "api", "limite-cabecalhos.json"), r.limiteObj);
}

// Só o formato das credenciais (tamanho e classe de caracteres), nunca o valor.
function credenciaisFormato() {
  const forma = (nome) => {
    const v = pedirEnv(nome);
    return { tamanho: v.length, soImprimivelAscii: /^[\x21-\x7e]+$/.test(v), temArroba: v.includes("@") };
  };
  const saida = { userToken: forma("YAMPI_USER_TOKEN"), userSecretKey: forma("YAMPI_USER_SECRET_KEY") };
  gravarJson(join(dirBruto(), "api", "credenciais-formato.json"), saida);
  console.log(`credenciais-formato ${JSON.stringify(saida)}`);
}

// Credencial errada de propósito (valores inventados): como a API responde a um 401.
async function erro401() {
  const r = await fetch(`${BASE}/${pedirEnv("YAMPI_ALIAS")}/checkout/statuses`, {
    headers: { "User-Token": "invalido-fase0", "User-Secret-Key": "invalido-fase0", Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let corpo = texto;
  try {
    corpo = JSON.parse(texto);
  } catch {
    // corpo que não é JSON fica como texto
  }
  gravarJson(join(dirBruto(), "api", "erro-401.json"), { status: r.status, corpo });
  console.log(`erro-401 http=${r.status} (esperado 401)`);
  await dormir(1100);
}

// S11 do plano 6: o endpoint de produção recusa (401) aviso sem assinatura. A Yampi aceita criar um aviso cuja URL responde 401?
async function prova401() {
  const urls = lerJson(join(dirBruto(), "urls.json"));
  if (!urls?.rejeita) throw new Error("Suba a captura antes (urls.json sem a rota /rejeita).");
  const r = await api("POST", "/webhooks", { corpo: { name: NOME_DO_AVISO, url: urls.rejeita, events: ["order.paid"] } });
  const aviso = dados(r)[0];
  console.log(`prova-401 criar http=${r.status} ${aviso?.id ? `id=${aviso.id}` : erro(r)}`);
  if (!aviso?.id) return;
  await dormir(5000); // tempo para uma chamada de teste da Yampi, se existir, bater na rota /rejeita
  assertAvisoNosso(aviso, aviso.id);
  const d = await api("DELETE", `/webhooks/${aviso.id}`);
  console.log(`prova-401 apagar http=${d.status} (esperado 204). Veja na Aba A se a rota /rejeita foi chamada na criação.`);
}

async function entregarSegredo(segredo) {
  const porta = Number(process.env.FASE0_PORTA ?? 8787) + 1;
  const r = await fetch(`http://127.0.0.1:${porta}/segredo`, { method: "POST", body: JSON.stringify({ segredo }) });
  if (r.status !== 204) throw new Error(`o servidor de captura recusou o segredo (${r.status})`);
}

async function webhookCriar(lista) {
  const bruto = dirBruto();
  const urls = lerJson(join(bruto, "urls.json"));
  if (!urls?.yampi) throw new Error("Suba a captura antes (urls.json ausente).");
  const eventos = lista ? lista.split(",") : EVENTOS;
  const r = await api("POST", "/webhooks", { corpo: { name: NOME_DO_AVISO, url: urls.yampi, events: eventos } });
  const aviso = dados(r)[0];
  if (![200, 201].includes(r.status) || !aviso?.id) {
    console.log(`webhook-criar ${erro(r)}`);
    process.exit(1);
  }
  try {
    await entregarSegredo(aviso.secret_key);
  } catch (e) {
    await api("DELETE", `/webhooks/${aviso.id}`);
    console.log(`webhook-criar: ${e.message}. O aviso foi apagado.`);
    process.exit(1);
  }
  const { secret_key: _segredo, ...semSegredo } = aviso; // a chave nunca vai para o disco
  gravarJson(join(bruto, "api", "webhook-criado.json"), { status: r.status, data: semSegredo });
  mesclarEstado({ yampiWebhookId: aviso.id }, bruto);
  console.log(`webhook-criar http=${r.status} id=${aviso.id} active=${aviso.active} eventos=${eventos.length} secret_key=${String(aviso.secret_key).length} caracteres (entregue ao servidor local, não gravada)`);
}

async function webhookListar(sufixo) {
  const r = await api("GET", "/webhooks", { consulta: { include: "events", limit: 100 } });
  if (r.status !== 200) return console.log(`webhook-listar ${erro(r)}`);
  // com sufixo, grava só o NOSSO aviso (a loja pode ter avisos de outras integrações)
  if (sufixo) gravarJson(join(dirBruto(), "api", `webhooks-lista-${sufixo}.json`), { ...r.json, data: dados(r).filter((w) => w.name === NOME_DO_AVISO) });
  for (const w of dados(r)) {
    console.log(`${w.id}  ${w.name}  active=${w.active}  disabled_at=${w.disabled_at ? "sim" : "não"}  eventos=${w.events?.data?.length ?? "?"}  host=${hostDe(w.url)}${w.name === NOME_DO_AVISO ? "  <- da Fase 0" : ""}`);
  }
}

// A doc não lista `active` no corpo do PUT: é uma tentativa. Se continuar `true`, não há como desativar por API.
async function webhookDesativar() {
  const bruto = dirBruto();
  const id = lerEstado(bruto).yampiWebhookId;
  const urls = lerJson(join(bruto, "urls.json"));
  if (!id || !urls?.yampi) throw new Error("estado.json não tem aviso criado por esta fase.");
  assertAvisoNosso(dados(await api("GET", `/webhooks/${id}`))[0], id);
  const r = await api("PUT", `/webhooks/${id}`, { corpo: { name: NOME_DO_AVISO, url: urls.yampi, events: EVENTOS, active: false } });
  console.log(`webhook-desativar http=${r.status} active_depois=${dados(r)[0]?.active ?? "?"}`);
}

async function webhookApagar() {
  const id = lerEstado().yampiWebhookId;
  if (!id) throw new Error("estado.json não tem aviso criado por esta fase.");
  assertAvisoNosso(dados(await api("GET", `/webhooks/${id}`))[0], id);
  const r = await api("DELETE", `/webhooks/${id}`);
  console.log(`webhook-apagar http=${r.status} (esperado 204)`);
  if (r.status === 204) mesclarEstado({ yampiWebhookId: null });
}

async function pedido(seq) {
  const bruto = dirBruto();
  const id = lerEvento(bruto, seq).body?.resource?.id;
  if (!id) throw new Error("o aviso não tem resource.id");
  const nome = String(seq).padStart(3, "0");
  for (const [sufixo, caminho, consulta] of [["", `/orders/${id}`, { include: INCLUDE_PEDIDO }], ["-transacoes", `/orders/${id}/transactions`, {}]]) {
    const r = await api("GET", caminho, { consulta });
    const meu = r.status === 200 && temMarcador(r.texto);
    if (meu) gravarJson(join(bruto, "api", `pedido-seq${nome}${sufixo}.json`), r.json);
    console.log(`pedido ${seq}${sufixo} http=${r.status} ms=${r.ms} ${meu ? `gravado status=${dados(r)[0]?.status?.data?.alias ?? "-"}` : "NÃO gravado (sem marcador)"}`);
  }
}

// A leitura barata do teste de conexão do plano 6 (`GET /orders?limit=1`). Só grava se o pedido mais novo for do teste.
async function pedidos1() {
  const r = await api("GET", "/orders", { consulta: { limit: 1, include: "customer,transactions,status" } });
  const meu = r.status === 200 && temMarcador(r.texto);
  if (meu) gravarJson(join(dirBruto(), "api", "pedidos-1.json"), r.json);
  console.log(`pedidos-1 http=${r.status} ms=${r.ms} ${meu ? "gravado (o pedido mais novo é do teste)" : "NÃO gravado: o pedido mais novo não é do teste; criar outro pedido de teste e repetir"}`);
}

async function paginar(caminho, consulta, maxPaginas = 12) {
  const itens = [];
  let total = null;
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const r = await api("GET", caminho, { consulta: { ...consulta, limit: 100, page: pagina } });
    if (r.status !== 200) return { status: r.status, itens, total, falha: erro(r) };
    itens.push(...dados(r));
    total = r.json?.meta?.pagination?.total ?? total;
    if (pagina >= (r.json?.meta?.pagination?.total_pages ?? 1)) break;
  }
  return { status: 200, itens, total, falha: null };
}

// Baixa a lista, mas só grava e comenta o que for do teste: o resto é cliente de verdade e fica só na memória.
async function variantes(nome, caminho, lista, resumo) {
  const bruto = dirBruto();
  for (const [rotulo, consulta] of lista) {
    const r = await paginar(caminho, consulta);
    const meus = r.itens.filter((item) => temMarcador(JSON.stringify(item)));
    console.log(`${nome} variante=${rotulo} http=${r.status} total=${r.total ?? "?"} baixados=${r.itens.length} do_teste=${meus.length}${r.falha ? ` ${r.falha}` : ""}`);
    if (meus.length) gravarJson(join(bruto, "api", `${nome}-${rotulo}.json`), { data: meus, meta: { total: r.total, baixados: r.itens.length } });
    for (const item of meus) console.log(`  ${resumo(item)}`);
  }
}

async function pedidosPix() {
  const agora = new Date();
  const periodo = `created_at:${dia(new Date(agora - UM_DIA))}|${dia(agora)}`;
  const aguardando = dados(await api("GET", "/checkout/statuses")).find((s) => s.alias === "waiting_payment")?.id;
  const inc = { include: "customer,transactions,status" };
  await variantes(
    "lista-pedidos",
    "/orders",
    [
      ["plana", { ...inc, date: periodo, "payment_method[]": "pix", ...(aguardando ? { "status_id[]": aguardando } : {}) }],
      ["filters", { ...inc, "filters[date]": periodo, "filters[payment_method][]": "pix", ...(aguardando ? { "filters[status_id][]": aguardando } : {}) }],
      ["sem-filtro", inc],
    ],
    (p) => `pedido de teste: status=${p.status?.data?.alias ?? "-"} pix=${JSON.stringify(p.transactions ?? {}).includes('"is_pix":true')}`,
  );
}

async function carrinhos() {
  const agora = new Date();
  const inc = { include: "customer,items,transactions,payment,search" };
  await variantes(
    "lista-carrinhos",
    "/checkout/carts",
    [
      ["tres-dias", { ...inc, date: `created_at:${dia(new Date(agora - 3 * UM_DIA))}|${dia(agora)}` }],
      ["sem-filtro", inc],
    ],
    (c) => `carrinho de teste: total_transactions=${c.total_transactions} last_transaction_status=${c.last_transaction_status ?? "-"} unauth_simulate_url=${Boolean(c.unauth_simulate_url)} simulate_url=${Boolean(c.simulate_url)}`,
  );
}

const porcento = (parte, todo) => (todo ? `${Math.round((100 * parte) / todo)}%` : "-");

// Provas do Rastreio (Y22 a Y24): baixa os pedidos da janela e imprime só contagens e nomes de campo; nenhum pedido
// vai para o disco.
async function entregues(aliases) {
  const agora = new Date();
  const lista = aliases ? aliases.split(",").map((s) => s.trim()).filter(Boolean) : ALIASES_ENVIADO;
  const periodo = `created_at:${dia(new Date(agora - 45 * UM_DIA))}|${dia(new Date(agora - 15 * UM_DIA))}`;
  const inc = { include: "customer,status,statuses" };
  for (const [rotulo, consulta] of [
    ["plana", { ...inc, date: periodo }],
    ["filters", { ...inc, "filters[date]": periodo }],
    ["sem-filtro", inc],
  ]) {
    const r = await paginar("/orders", consulta);
    const c = contarEntregues(r.itens, agora.getTime(), lista);
    const perfil = perfilDosClientes(pedidosDaJanela(r.itens, agora.getTime()));
    const [taxa, taxaCodigo] = [porcento(c.entregues, c.enviados), porcento(c.comCodigo, c.enviadosPorStatus)];
    gravarJson(join(dirBruto(), "api", `entregues-${rotulo}.json`), { http: r.status, aliasesEnviado: lista, ...c, taxa, taxaCodigo, perfil });
    console.log(`entregues variante=${rotulo} http=${r.status} ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join(" ")} taxa=${taxa} taxaCodigo=${taxaCodigo}${r.falha ? ` ${r.falha}` : ""}`);
    console.log(`  perfil pedidos=${perfil.pedidos} tipos=${JSON.stringify(perfil.tipos)} camposDeDocumento=${JSON.stringify(perfil.camposDeDocumento)} semDocumento=${perfil.semDocumento} campos=${perfil.campos.join(",")}`);
  }
}

// Y26 (Rastreio): o filtro `date=updated_at:` filtra mesmo, aceita hora e inclui o dia do fim? O pedido de teste,
// atualizado hoje, é a testemunha (`doTeste`). Dia de Brasília (UTC-3), o mesmo das datas da Yampi. Só contagens.
async function atualizados() {
  const diaBrasilia = (diasAtras) => dia(new Date(Date.now() - 3 * 36e5 - diasAtras * UM_DIA));
  const [hoje, antes] = [diaBrasilia(0), diaBrasilia(2)];
  const variantes = [["sem-filtro", {}, antes, hoje]];
  for (const [chave, prefixo] of [["date", "plana"], ["filters[date]", "filters"]]) {
    variantes.push(
      [`${prefixo}-dias`, { [chave]: `updated_at:${antes}|${hoje}` }, antes, hoje],
      [`${prefixo}-hoje`, { [chave]: `updated_at:${hoje}|${hoje}` }, hoje, hoje],
      [`${prefixo}-hora`, { [chave]: `updated_at:${hoje} 00:00:00|${hoje} 23:59:59` }, hoje, hoje],
    );
  }
  for (const [rotulo, filtro, inicio, fim] of variantes) {
    const r = await paginar("/orders", { include: "customer", ...filtro }, 3);
    const c = dentroDoIntervalo(r.itens, inicio, fim);
    const doTeste = r.itens.filter((p) => temMarcador(JSON.stringify(p))).length;
    gravarJson(join(dirBruto(), "api", `atualizados-${rotulo}.json`), { http: r.status, total: r.total, baixados: r.itens.length, inicio, fim, ...c, doTeste });
    console.log(`atualizados variante=${rotulo} http=${r.status} total=${r.total ?? "?"} baixados=${r.itens.length} dentro=${c.dentro} fora=${c.fora} semData=${c.semData} doTeste=${doTeste}${r.falha ? ` ${r.falha}` : ""}`);
  }
}

function copiarLink(seq, caminho) {
  const url = caminhoNoObjeto(lerEvento(dirBruto(), seq).body, caminho);
  if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error(`${caminho} não é uma URL https neste aviso`);
  spawnSync("clip", { input: url });
  console.log(`link copiado para a área de transferência (${url.length} caracteres; não impresso).`);
}

const [comando, a, b] = process.argv.slice(2);
const comandos = {
  ping,
  "credenciais-formato": credenciaisFormato,
  "erro-401": erro401,
  "prova-401": prova401,
  "webhook-criar": () => webhookCriar(a),
  "webhook-listar": () => webhookListar(a),
  "webhook-desativar": webhookDesativar,
  "webhook-apagar": webhookApagar,
  pedido: () => pedido(a),
  "pedidos-1": pedidos1,
  "pedidos-pix": pedidosPix,
  carrinhos,
  entregues: () => entregues(a),
  atualizados,
  "copiar-link": () => copiarLink(a, b),
};
if (!comandos[comando]) {
  console.error(`uso: yampi.mjs ${Object.keys(comandos).join(" | ")}`);
  process.exit(2);
}
try {
  await comandos[comando]();
} catch (e) {
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
