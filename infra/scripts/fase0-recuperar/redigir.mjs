// infra/scripts/fase0-recuperar/redigir.mjs
// Transforma o bruto em material que a sessão pode ler e que, depois de conferido, pode ir para o repo público.
//   node infra/scripts/fase0-recuperar/redigir.mjs tudo                        eventos/ e api/ -> redigido/ (+ _indice.txt, mapa.json)
//   node infra/scripts/fase0-recuperar/redigir.mjs achar <regex>               procura "caminho = valor" em redigido/
//   node infra/scripts/fase0-recuperar/redigir.mjs conferir <arquivo|pasta>... sai com 1 se sobrar dado real
// Regra: toda folha de texto é MASCARADA, salvo vocabulário conhecido. A máscara mantém o formato (dígito vira dígito, letra
// vira letra, pontuação fica) e dá o mesmo resultado para o mesmo original, então igualdade e comprimento se preservam.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NOME_DO_AVISO, celulares, dirBruto, gravarJson, lerJson, marcadores, pedirEnv, tampaDeSegredo } from "./comum.mjs";

const FALSO_DA_LOJA = "loja-exemplo";
const FALSOS_TELEFONE = { CHIP: "5511999990001", B: "5511999990002", C: "5511999990003" };
const PALAVRAS = new Set(["pix", "billet", "boleto", "paid", "authorized", "created", "refused", "cancelled", "canceled", "approved", "pending", "failed", "true", "false", "null", "brl", "store", "delivered", "invoiced", "image", "video", "audio", "document", "conversation", "notify", "append", "android", "ios", "web", "unknown", "open", "close", "connecting", "read", "played", "error"]);
const CHAVES_DE_VOCABULARIO = /^(event|timezone|currency|type|kind|status|alias|payment_alias|last_transaction_status|messageType|mediaType|mimetype|source|state|reason|action|integration)$/i;
const CHAVES_DE_PESSOA = /(^|_)(name|nome|pushname|street|address|neighborhood|city|complement|text|conversation|caption|title|description|notes?)$/i;
const CHAVES_SECRETAS = /^(apikey|api_key|secret|secret_key|webhook_secret|password|senha|authorization|access_token|refresh_token|customertoken)$/i;
const CHAVES_NUMERICAS_DE_PESSOA = /^(cpf|cnpj|zipcode|zip|zip_code|cep|postal_code|postcode|ibge|number|numero|phone|telefone|celular|area_code|ddd)$/i;
const DOMINIOS_SEGUROS = ["example.com", "example", "yampi.io", "yampi.com.br", "dooki.com.br", "whatsapp.net", "whatsapp.com", "girumo.com.br"];
// rótulos de host que não identificam a loja; qualquer outro antes de um domínio seguro vira loja-exemplo
const ROTULOS_SEGUROS = new Set(["api", "www", "seguro", "checkout", "pay", "images", "img", "static", "cdn", "media", "mmg", "pps", "wa", "app", "web", "tunel"]);
// vocabulário que os planos 3 e 6 conferem pelo texto: fica legível em qualquer chave (name, events[], lid)
const SEMPRE_LEGIVEIS = new Set([
  ...["cart.reminder", "order.created", "order.paid", "order.status.updated", "transaction.payment.refused"],
  ...["messages.upsert", "messages.update", "send.message", "connection.update", "qrcode.updated"],
  "lid",
  NOME_DO_AVISO,
]);
const ROTAS = /^(r|c|p|api|v\d|cart|carrinho|checkout|pedido|pedidos|order|orders|recover|recuperar|simulate|unauth|pay|pix|track|rastreio|purchase)$/i;
const RE_JID = /^([\d-]+)(:\d+)?@(lid|hosted\.lid|s\.whatsapp\.net|c\.us|g\.us|broadcast)$/;
const RE_DATA = /^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?|\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2}(:\d{2})?)?)$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PECA_INI = "\uE000";
const PECA_FIM = "\uE001";
const MS_DIA = 86_400_000;

/** Pares [original, falso] para cada forma de escrever um telefone (com/sem 55, com/sem o 9º dígito, só o número). */
export function variantesDeTelefone(real, falso) {
  const formas = (n) => ({
    com9: n.length === 13 ? n : `${n.slice(0, 4)}9${n.slice(4)}`,
    sem9: n.length === 12 ? n : n.slice(0, 4) + n.slice(5),
  });
  const [r, f] = [formas(real), formas(falso)];
  return ["com9", "sem9"].flatMap((k) => [
    [r[k], f[k]],
    [r[k].slice(2), f[k].slice(2)],
    [r[k].slice(4), f[k].slice(4)],
  ]);
}

/** Tudo que é real e sabemos de antemão: vira um falso fixo em qualquer lugar do texto. Os mais longos vêm primeiro. */
export function conhecidosDoAmbiente(env = process.env, urls = {}, instancia = env.FASE0_INSTANCIA) {
  const lista = [];
  const add = (original, falso) => original && String(original).length >= 3 && lista.push([String(original), falso]);
  add(env.YAMPI_ALIAS, FALSO_DA_LOJA);
  for (const nome of ["YAMPI_USER_TOKEN", "YAMPI_USER_SECRET_KEY", "EVOLUTION_API_KEY"]) add(env[nome], "REDACTED-SEGREDO");
  for (const termo of (env.FASE0_LOJA_TERMOS ?? "").split(",")) add(termo.trim(), "Loja Exemplo");
  for (const m of marcadores(env)) if (m.includes("@")) add(m, "cliente.teste@example.com");
  for (const [rotulo, numero] of Object.entries(celulares(env))) {
    for (const [original, falso] of variantesDeTelefone(numero, FALSOS_TELEFONE[rotulo] ?? "5511999990009")) add(original, falso);
  }
  if (urls.publica) add(new URL(urls.publica).host, "tunel.example");
  for (const url of [urls.yampi, urls.evolution, urls.imagem]) {
    for (const trecho of String(url ?? "").split(/[/?=]/).filter((t) => t.length >= 16)) add(trecho, "TOKEN");
  }
  add(instancia, "gr_smoke-test");
  return lista.sort((a, b) => b[0].length - a[0].length);
}

/** O redator e a conferência falham FECHADOS: sem estes valores, o alias e os telefones passariam e o conferir diria "ok". */
export function exigirAmbienteDoRedator(env = process.env) {
  for (const nome of ["YAMPI_ALIAS", "FASE0_CELULARES", "FASE0_LOJA_TERMOS"]) pedirEnv(nome, env);
  if (env.FASE0_LOJA_TERMOS.trim() === "sem-termos") throw new Error("FASE0_LOJA_TERMOS ainda no padrão sem-termos: rode credenciais.ps1 e digite o nome da loja e do domínio.");
  const fones = celulares(env);
  if (!fones.CHIP || !fones.B) throw new Error("FASE0_CELULARES precisa de CHIP=55... e B=55... (só dígitos, com 55).");
}

function hostSeguro(host) {
  const dominio = DOMINIOS_SEGUROS.find((d) => host === d || host.endsWith(`.${d}`));
  if (!dominio) return null;
  const rotulos = host.slice(0, host.length - dominio.length).split(".").filter(Boolean).map((r) => (ROTULOS_SEGUROS.has(r) ? r : FALSO_DA_LOJA));
  return [...rotulos.filter((r, i) => r !== FALSO_DA_LOJA || rotulos[i - 1] !== FALSO_DA_LOJA), dominio].join(".");
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function deslocarDatas(texto, dias) {
  const mover = (a, m, d) => new Date(Date.UTC(+a, +m - 1, +d) - dias * MS_DIA);
  return texto
    .replace(/(\d{4})-(\d{2})-(\d{2})/, (_, a, m, d) => mover(a, m, d).toISOString().slice(0, 10))
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/, (_, d, m, a) => {
      const x = mover(a, m, d);
      return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
    });
}

export function criarRedator({ sal, conhecidos = [], frases = [] }) {
  const originais = new Set();
  const dias = 30 + (parseInt(createHmac("sha256", sal).update("dias").digest("hex").slice(0, 6), 16) % 300);

  const bytes = (texto, n) => {
    const blocos = [];
    for (let i = 0; blocos.length * 32 < n; i++) blocos.push(createHmac("sha256", sal).update(`${i}:${texto}`).digest());
    return Buffer.concat(blocos);
  };
  const fpm = (texto) => {
    const b = bytes(texto, texto.length);
    let i = 0;
    return texto.replace(/[\p{L}\p{Nd}]/gu, (c) => {
      const r = b[i++];
      return /\p{Nd}/u.test(c) ? String(r % 10) : String.fromCharCode((/\p{Lu}/u.test(c) ? 65 : 97) + (r % 26));
    });
  };

  // conhecidos viram "peças" opacas, que nem a máscara nem as regras de formato tocam; voltam como o falso no fim
  const guardar = (texto) => {
    const pecas = [];
    let saida = texto;
    for (const [de, para] of conhecidos) {
      saida = saida.replace(new RegExp(escapar(de), "gi"), () => {
        pecas.push(para);
        return PECA_INI + String.fromCharCode(0xe100 + pecas.length - 1) + PECA_FIM;
      });
    }
    return { saida, pecas };
  };
  const devolver = (texto, pecas) => texto.replace(/\uE000(.)\uE001/g, (_, c) => pecas[c.charCodeAt(0) - 0xe100]);
  const mascararTexto = (texto) => {
    const { saida, pecas } = guardar(texto);
    return devolver(fpm(saida), pecas);
  };
  const temConhecido = (texto) => guardar(texto).pecas.length > 0;

  const mascararJid = (m) => {
    const [, usuario, aparelho = "", dominio] = m;
    const { saida, pecas } = guardar(usuario);
    const novo = pecas.length ? devolver(saida, pecas) : /^55\d{10,11}$/.test(usuario) ? `55${fpm(usuario.slice(2))}` : fpm(usuario);
    return `${novo}${aparelho}@${dominio}`;
  };

  const mascararUrl = (texto) => {
    let u;
    try {
      u = new URL(texto);
    } catch {
      return null;
    }
    const { saida, pecas } = guardar(u.hostname);
    const host = devolver(saida, pecas);
    const caminho = u.pathname.split("/").map((s) => (s === "" || ROTAS.test(s) ? s : mascararTexto(s))).join("/");
    const consulta = [...u.searchParams].map(([k, v]) => `${k}=${mascararTexto(v)}`).join("&");
    return `${u.protocol}//${hostSeguro(host.toLowerCase()) ?? `${FALSO_DA_LOJA}.example`}${caminho}${consulta ? `?${consulta}` : ""}`;
  };

  const ehVocabulario = (s) =>
    PALAVRAS.has(s.toLowerCase()) ||
    /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s) ||
    /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(s) ||
    /^[a-z]+([A-Z][a-z]+)*Message$/.test(s) ||
    /^(image|audio|video|application|text)\/[\w.+-]+(;.*)?$/.test(s);

  const texto = (s, chave) => {
    if (/^apikey$/i.test(chave)) return "REDACTED-INSTANCE-TOKEN";
    if (CHAVES_SECRETAS.test(chave)) return tampaDeSegredo(s);
    if (/^area_code$/i.test(chave)) return "11";
    if (SEMPRE_LEGIVEIS.has(s) || s.length <= 2 || frases.includes(s.trim())) return s;
    const jid = RE_JID.exec(s);
    if (jid) return mascararJid(jid);
    if (/^000201/.test(s)) return s.slice(0, 6) + fpm(s.slice(6)); // Pix copia e cola: mantém só o início do formato EMV
    if (s.length > 300) return `[REDIGIDO len=${s.length}]`;
    if (/^https?:\/\//i.test(s)) return mascararUrl(s) ?? mascararTexto(s);
    if (/birth|nasc|aniver/i.test(chave)) return mascararTexto(s); // nascimento: o deslocamento comum é recuperável pela data do commit
    if (RE_DATA.test(s)) return deslocarDatas(s, dias);
    if (RE_EMAIL.test(s) && !temConhecido(s)) {
      const arroba = s.lastIndexOf("@");
      return `${fpm(s.slice(0, arroba))}@example.com`;
    }
    const pessoa = CHAVES_DE_PESSOA.test(chave);
    const mantem = !temConhecido(s) && !pessoa && (CHAVES_DE_VOCABULARIO.test(chave) ? /^[A-Za-z][\w.:/-]{0,59}$/.test(s) : ehVocabulario(s));
    return mantem ? s : mascararTexto(s);
  };

  const mascararNumero = (n) => Number(fpm(String(Math.abs(n))).replace(/^0+/, "") || "1");
  const numero = (n, chave) => {
    if (!Number.isInteger(n)) return n; // dinheiro e fracionários passam
    // chave de pessoa antes do epoch: um CPF inteiro entre 1.4e9 e 2.2e9 seria só deslocado, e o deslocamento é recuperável
    if (CHAVES_NUMERICAS_DE_PESSOA.test(chave)) return mascararNumero(n);
    if (n >= 1.4e9 && n <= 2.2e9) return n - dias * 86_400; // epoch em segundos
    if (String(Math.abs(n)).length >= 10) return mascararNumero(n);
    return n;
  };

  // buffer serializado (miniatura da foto, chaves de mídia de 32 bytes): array de bytes ou objeto {"0":255,"1":216,...}
  const tamanhoDeBytes = (x) => {
    const chaves = Array.isArray(x) ? x : x && typeof x === "object" ? Object.keys(x) : [];
    const eBytes = Array.isArray(x) ? x.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) : chaves.every((k) => /^\d+$/.test(k));
    return chaves.length >= 16 && eBytes ? chaves.length : 0;
  };

  const mantidos = new Set();
  const valor = (x, chave = "", caminho = "") => {
    const bytesLen = tamanhoDeBytes(x);
    if (bytesLen) return `[REDIGIDO bytes len=${bytesLen}]`;
    if (Array.isArray(x)) return x.map((v) => valor(v, chave, `${caminho}[]`));
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, valor(v, k, caminho ? `${caminho}.${k}` : k)]));
    if (typeof x === "number") return numero(x, chave);
    if (typeof x !== "string") return x;
    const saida = texto(x, chave);
    if (saida !== x && x.length >= 6) originais.add(x);
    // o que passou sem máscara e não é vocabulário fixo vai para o relatório (só o caminho), para a sessão conferir
    if (saida === x && x.length >= 6 && !SEMPRE_LEGIVEIS.has(x) && !frases.includes(x.trim())) mantidos.add(caminho);
    return saida;
  };

  return { valor, data: (iso) => deslocarDatas(String(iso), dias), originais: () => [...originais], mantidos: () => [...mantidos].sort() };
}

/** Procura dado real em um texto. Devolve descrições SEM o valor (só o começo e o tamanho). */
export function problemas(conteudo, { conhecidos = [], originais = [] } = {}) {
  const achados = [];
  const baixo = conteudo.toLowerCase();
  const dica = (v) => `${v.slice(0, 2)}…(${v.length} caracteres)`;
  for (const [de] of conhecidos) if (baixo.includes(de.toLowerCase())) achados.push(`valor conhecido presente: ${dica(de)}`);
  for (const o of originais) {
    if (o.length >= 6 && (conteudo.includes(o) || conteudo.includes(JSON.stringify(o).slice(1, -1)))) achados.push(`valor original presente: ${dica(o)}`);
  }
  for (const m of conteudo.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) {
    if (!/^(example\.com|s\.whatsapp\.net|c\.us|g\.us)$/i.test(m[1])) achados.push(`e-mail ou JID fora do padrão: ${dica(m[0])}`);
  }
  if (/eyJ[\w-]{8,}\.[\w-]{8,}/.test(conteudo)) achados.push("token JWT");
  if (/trycloudflare\.com/.test(conteudo)) achados.push("endereço do túnel");
  if (new RegExp("(sk|rk)_(live|test)_|whsec_").test(conteudo)) achados.push("chave com cara de segredo");
  return achados;
}

function* folhas(x, caminho = "") {
  if (Array.isArray(x)) for (const [i, v] of x.entries()) yield* folhas(v, `${caminho}[${i}]`);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) yield* folhas(v, caminho ? `${caminho}.${k}` : k);
  else yield [caminho, x];
}

function arquivosDe(caminhos) {
  return caminhos.flatMap((c) =>
    statSync(c).isDirectory() ? arquivosDe(readdirSync(c).map((n) => join(c, n))) : /\.(json|md|mjs)$/.test(c) ? [c] : [],
  );
}

function obterSal(bruto) {
  const arq = join(bruto, "sal.txt");
  if (!existsSync(arq)) writeFileSync(arq, randomBytes(16).toString("hex"));
  return readFileSync(arq, "utf8").trim();
}

function contexto(bruto) {
  const urls = lerJson(join(bruto, "urls.json"), {});
  return { urls, conhecidos: conhecidosDoAmbiente(process.env, urls) };
}

function tudo() {
  exigirAmbienteDoRedator();
  const bruto = dirBruto();
  const { conhecidos } = contexto(bruto);
  const frases = (process.env.FASE0_FRASES ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const red = criarRedator({ sal: obterSal(bruto), conhecidos, frases });
  const indice = [];
  let maiorCorpo = 0;
  for (const nome of readdirSync(join(bruto, "eventos")).sort()) {
    const ev = lerJson(join(bruto, "eventos", nome));
    gravarJson(join(bruto, "redigido", nome), red.valor(ev.body));
    // os cabeçalhos do aviso da Yampi (a assinatura tem o formato base64 de 44 caracteres; a máscara mantém o formato)
    if (ev.rota === "yampi") gravarJson(join(bruto, "redigido", nome.replace(/\.json$/, ".cabecalhos.json")), red.valor(ev.cabecalhos ?? {}));
    maiorCorpo = Math.max(maiorCorpo, ev.bodyRaw?.length ?? 0);
    indice.push([String(ev.seq).padStart(3, "0"), ev.rota, ev.body?.event ?? "?", red.data(ev.chegada), `assinatura=${ev.assinatura}`, `${ev.bodyRaw?.length ?? 0} B`].join("\t"));
  }
  for (const nome of readdirSync(join(bruto, "api")).sort()) gravarJson(join(bruto, "redigido", `api-${nome}`), red.valor(lerJson(join(bruto, "api", nome))));
  writeFileSync(join(bruto, "redigido", "_indice.txt"), `${indice.join("\n")}\n`);
  writeFileSync(join(bruto, "redigido", "_mantidos.txt"), `${red.mantidos().join("\n")}\n`);
  gravarJson(join(bruto, "mapa.json"), { originais: red.originais() });
  console.log(`redigidos: ${indice.length} avisos e ${readdirSync(join(bruto, "api")).length} respostas de API. Índice em redigido/_indice.txt. Maior corpo de aviso: ${maiorCorpo} B.`);
  console.log(`sem máscara (fora o vocabulário fixo): ${red.mantidos().length} caminho(s) em redigido/_mantidos.txt, para conferir.`);
}

function achar(expressao) {
  const pasta = join(dirBruto(), "redigido");
  const re = new RegExp(expressao, "i");
  for (const nome of readdirSync(pasta).filter((n) => n.endsWith(".json"))) {
    for (const [caminho, valor] of folhas(lerJson(join(pasta, nome)))) {
      const linha = `${caminho} = ${valor}`;
      if (re.test(linha)) console.log(`${nome}  ${linha.slice(0, 160)}`);
    }
  }
}

function conferir(caminhos) {
  exigirAmbienteDoRedator();
  const bruto = dirBruto();
  const { conhecidos } = contexto(bruto);
  const originais = lerJson(join(bruto, "mapa.json"), { originais: [] }).originais;
  let ruins = 0;
  const arquivos = arquivosDe(caminhos);
  for (const arq of arquivos) {
    for (const achado of problemas(readFileSync(arq, "utf8"), { conhecidos, originais })) {
      ruins++;
      console.log(`VAZAMENTO ${arq}: ${achado}`);
    }
  }
  console.log(ruins ? `${ruins} problema(s) em ${arquivos.length} arquivo(s). NÃO commitar.` : `ok: ${arquivos.length} arquivo(s) sem dado real.`);
  process.exit(ruins ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [comando, ...args] = process.argv.slice(2);
  if (comando === "tudo") tudo();
  else if (comando === "achar" && args[0]) achar(args[0]);
  else if (comando === "conferir" && args.length) conferir(args);
  else console.error("uso: redigir.mjs tudo | achar <regex> | conferir <arquivo|pasta>...");
}
