// infra/scripts/fase0-rastreio/melhor-envio.mjs
// Prova 5 do Rastreio: o app da Girumo enxerga as etiquetas da piloto no Melhor Envio e acha os códigos da Yampi?
// Credenciais só do ambiente (credenciais-me.ps1). Imprime só contagens e nomes de campo; nada vai para o disco.
//   node infra/scripts/fase0-rastreio/melhor-envio.mjs ping | medir [plana|filters|sem-filtro]
import { codigosEnviadosNaJanela, cruzar, indexar, linhasDoResultado, resumirEtiquetas, veredito } from "./cruzar.mjs";

const USO = "uso: melhor-envio.mjs ping | medir [plana|filters|sem-filtro]";
const YAMPI = "https://api.dooki.com.br/v2";
const ME = "https://melhorenvio.com.br/api/v2/me";
const UM_DIA = 864e5;
const MAX_PAGINAS_YAMPI = 12;
const MAX_PAGINAS_ME = 60;
const MAX_BUSCAS = 50;
const VARIANTES = ["plana", "filters", "sem-filtro"];

function pedirEnv(nome) {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente no ambiente (rode credenciais-me.ps1 na janela do Igor).`);
  // o fetch recusa cabeçalho com NUL/CR/LF citando o valor inteiro na mensagem: barrar antes, sem citar
  if (/[\0\r\n]/.test(v)) throw new Error(`${nome} tem caractere inválido (rode credenciais-me.ps1 de novo).`);
  return v;
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const dia = (ms) => new Date(ms).toISOString().slice(0, 10);

// Devolve só status e JSON: quem chama nunca imprime o corpo.
async function chamar(url, headers, pausaMs, tentouDeNovo = false) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  let json = null;
  try {
    json = await r.json();
  } catch {
    // corpo que não é JSON fica de fora
  }
  await dormir(pausaMs);
  if (r.status === 429 && !tentouDeNovo) {
    await dormir(60_000);
    return chamar(url, headers, pausaMs, true);
  }
  return { status: r.status, json };
}

function falha(servico, status) {
  if (status === 401) return new Error(`${servico} recusou a credencial (401): refaça credenciais-me.ps1.`);
  return new Error(`${servico} respondeu http=${status}.`);
}

const cabecalhosYampi = () => ({
  "User-Token": pedirEnv("YAMPI_USER_TOKEN"),
  "User-Secret-Key": pedirEnv("YAMPI_USER_SECRET_KEY"),
  Accept: "application/json",
});
const cabecalhosMe = () => ({
  Accept: "application/json",
  Authorization: `Bearer ${pedirEnv("MELHORENVIO_TOKEN")}`,
  "User-Agent": process.env.MELHORENVIO_USER_AGENT || "Girumo (contato@girumo.com.br)",
});
const chamarMe = (caminho) => chamar(`${ME}${caminho}`, cabecalhosMe(), 300); // ~200/min; o limite é 250/min

// Pedidos criados na janela, sem `include`: só `created_at` e `track_code` interessam.
async function pedidosDaYampi(variante, agora) {
  const periodo = `created_at:${dia(agora - 45 * UM_DIA)}|${dia(agora - 15 * UM_DIA)}`;
  const filtro = { plana: { date: periodo }, filters: { "filters[date]": periodo }, "sem-filtro": {} }[variante];
  const pedidos = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_YAMPI; pagina++) {
    const url = new URL(`${YAMPI}/${encodeURIComponent(pedirEnv("YAMPI_ALIAS"))}/orders`);
    for (const [chave, valor] of Object.entries({ ...filtro, limit: 100, page: pagina })) url.searchParams.append(chave, String(valor));
    const r = await chamar(url, cabecalhosYampi(), 1100);
    if (r.status !== 200) throw falha("Yampi", r.status);
    if (Array.isArray(r.json?.data)) pedidos.push(...r.json.data);
    if (pagina >= (r.json?.meta?.pagination?.total_pages ?? 1)) break;
  }
  return pedidos;
}

// Etiquetas da conta, da mais nova para a mais antiga, até a última página, até 75 dias atrás ou até o teto.
async function etiquetasDoMelhorEnvio(agora) {
  const limite = dia(agora - 75 * UM_DIA);
  const etiquetas = [];
  let pagina = 0;
  while (pagina < MAX_PAGINAS_ME) {
    pagina++;
    const r = await chamarMe(`/orders?page=${pagina}`);
    if (r.status !== 200) throw falha("Melhor Envio", r.status);
    const desta = Array.isArray(r.json?.data) ? r.json.data : [];
    etiquetas.push(...desta);
    const maisAntiga = resumirEtiquetas(desta).maisAntiga;
    if (pagina >= (r.json?.last_page ?? 1) || (maisAntiga && maisAntiga < limite)) break;
  }
  return { etiquetas, paginas: pagina };
}

// A busca não olha o `self_tracking`: só conta o que a lista não achou.
async function buscar(codigos) {
  let achadas = 0;
  for (const codigo of codigos) {
    const r = await chamarMe(`/orders/search?q=${encodeURIComponent(codigo)}`);
    if (r.status === 400) continue; // "Not Found"
    if (r.status !== 200) throw falha("Melhor Envio", r.status);
    const lista = Array.isArray(r.json) ? r.json : Array.isArray(r.json?.data) ? r.json.data : [];
    if (lista.length) achadas++;
  }
  return achadas;
}

async function ping() {
  const r = await chamarMe("/orders?page=1");
  if (r.status !== 200) throw falha("Melhor Envio", r.status);
  const desta = Array.isArray(r.json?.data) ? r.json.data : [];
  const num = (v) => (Number.isFinite(v) ? v : "?");
  console.log(`ping http=200 total=${num(r.json?.total)} per_page=${num(r.json?.per_page)} last_page=${num(r.json?.last_page)} nesta_pagina=${desta.length} chaves=[${resumirEtiquetas(desta).chaves.join(",")}]`);
}

async function medir(variante = "plana") {
  for (const nome of ["YAMPI_ALIAS", "YAMPI_USER_TOKEN", "YAMPI_USER_SECRET_KEY", "MELHORENVIO_TOKEN"]) pedirEnv(nome);
  const agora = Date.now();
  const pedidos = await pedidosDaYampi(variante, agora);
  const janela = codigosEnviadosNaJanela(pedidos, agora);
  pedidos.length = 0;
  const { etiquetas, paginas } = await etiquetasDoMelhorEnvio(agora);
  const resumo = resumirEtiquetas(etiquetas);
  const achou = cruzar(janela.codigos, indexar(etiquetas));
  etiquetas.length = 0;
  const buscados = achou.faltando.slice(0, MAX_BUSCAS);
  const achadasNaBusca = await buscar(buscados);
  const achadas = achou.achadasTracking + achou.achadasSelf + achadasNaBusca;
  console.log(
    linhasDoResultado({
      ...janela,
      variante,
      codigos: janela.codigos.length,
      ...resumo,
      paginas,
      achadasTracking: achou.achadasTracking,
      achadasSelf: achou.achadasSelf,
      achadasNaBusca,
      buscados: buscados.length,
      veredito: veredito({ codigos: janela.codigos.length, achadas, listadas: resumo.listadas }),
    }),
  );
}

const [comando, a] = process.argv.slice(2);
const comandos = { ping, medir: () => medir(a) };
if (!comandos[comando] || (comando === "medir" && a !== undefined && !VARIANTES.includes(a))) {
  console.error(USO);
  process.exit(2);
}
try {
  await comandos[comando]();
} catch (e) {
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
