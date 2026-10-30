// infra/scripts/fase0-recuperar/captura.mjs
// Servidor local que recebe os avisos da Yampi e da Evolution, atrás de um túnel temporário do cloudflared.
//   node infra/scripts/fase0-recuperar/captura.mjs              sobe servidor + túnel
//   node infra/scripts/fase0-recuperar/captura.mjs --sem-tunel  só local (teste)
//   node infra/scripts/fase0-recuperar/captura.mjs --todos      grava avisos da Yampi sem marcador (só com ordem do Igor)
// Aviso da Yampi sem marcador (e-mail ou telefone do teste) é de cliente de verdade: nunca vai para o disco.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirBruto, gravarJson, marcadores, temMarcador, urlDoTunel, veredictoAssinatura } from "./comum.mjs";

const LIMITE_CORPO = 2 * 1024 * 1024;
const CABECALHOS_GUARDADOS = ["content-type", "user-agent", "x-yampi-hmac-sha256"];

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    const partes = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > LIMITE_CORPO) {
        falha(new Error("corpo grande demais"));
        req.destroy();
      } else partes.push(c);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", falha);
  });
}

/** Monta os dois servidores (sem ouvir porta): o público, atrás do túnel, e o de controle, só em 127.0.0.1. */
export function criarCaptura({ bruto, tokens, todos = false, marcas = [], imagem = join(bruto, "teste.jpg") }) {
  let segredo = null;
  let seq = readdirSync(join(bruto, "eventos")).length;
  let ignorados = 0;

  const publico = createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    const [, rota, tok, arquivo] = url.pathname.split("/");
    if (tok !== tokens.caminho || !["yampi", "evo", "img", "rejeita"].includes(rota)) return void res.writeHead(404).end();

    if (rota === "rejeita") {
      // endereço que sempre recusa (401), como o de produção faz com aviso sem assinatura: prova se a Yampi aceita criar o aviso assim
      const corpo = await lerCorpo(req).catch(() => Buffer.alloc(0));
      appendFileSync(join(bruto, "ignorados.log"), `${new Date().toISOString()}\trejeita\t${corpo.length}\t-\n`);
      console.log("rota /rejeita chamada (a Yampi bateu aqui); respondi 401");
      return void res.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
    }

    if (rota === "img") {
      // imita URL assinada: sem o parâmetro certo não serve
      if (arquivo !== "teste.jpg" || url.searchParams.get("assinatura") !== tokens.imagem || !existsSync(imagem)) return void res.writeHead(404).end();
      console.log("imagem servida (GET /img): quem baixou foi a Evolution, pela URL com assinatura");
      res.writeHead(200, { "content-type": "image/jpeg" });
      return void createReadStream(imagem).pipe(res);
    }
    if (req.method !== "POST") return void res.writeHead(405).end();

    const corpo = await lerCorpo(req).catch(() => null);
    if (!corpo) return void res.writeHead(413).end();
    const texto = corpo.toString("utf8");
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      // corpo que não é JSON fica só no bodyRaw
    }
    const evento = typeof json?.event === "string" ? json.event : "desconhecido";
    const assinatura = rota === "yampi" ? veredictoAssinatura(corpo, req.headers["x-yampi-hmac-sha256"], segredo) : "n/a";
    const chegada = new Date().toISOString(); // a hora do fato; o date_time da Evolution é hora de Brasília rotulada Z

    if (rota === "yampi" && !todos && !temMarcador(texto, marcas)) {
      ignorados++;
      appendFileSync(join(bruto, "ignorados.log"), `${chegada}\t${evento}\t${corpo.length}\t${assinatura}\n`);
    } else {
      seq++;
      const nome = `${String(seq).padStart(3, "0")}-${rota}-${evento.replace(/[^a-z0-9._-]/gi, "_")}.json`;
      const cabecalhos = Object.fromEntries(CABECALHOS_GUARDADOS.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
      gravarJson(join(bruto, "eventos", nome), { seq, rota, chegada, assinatura, cabecalhos, bodyRaw: texto, body: json });
      console.log(`#${String(seq).padStart(3, "0")} ${rota} ${evento} assinatura=${assinatura} ${corpo.length} B`);
    }
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}'); // sempre 2xx: a Yampi conta falha
  });

  const controle = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/segredo") {
      const dados = JSON.parse((await lerCorpo(req)).toString("utf8"));
      segredo = String(dados.segredo);
      return void res.writeHead(204).end();
    }
    if (req.method === "GET" && req.url === "/estado") {
      return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ salvos: seq, ignorados, temSegredo: Boolean(segredo) }));
    }
    res.writeHead(404).end();
  });

  return { publico, controle };
}

async function main() {
  const todos = process.argv.includes("--todos");
  const semTunel = process.argv.includes("--sem-tunel");
  const marcas = marcadores();
  if (!todos && marcas.length === 0) {
    console.error("FASE0_MARCADORES vazio: sem marcador o servidor não grava aviso da Yampi. Rode credenciais.ps1 ou use --todos.");
    process.exit(2);
  }
  const bruto = dirBruto();
  const porta = Number(process.env.FASE0_PORTA ?? 8787);
  const tokens = { caminho: randomBytes(12).toString("hex"), imagem: randomBytes(24).toString("hex") };
  const imagem = process.env.FASE0_IMAGEM || join(bruto, "teste.jpg");
  const { publico, controle } = criarCaptura({ bruto, tokens, todos, marcas, imagem });
  await new Promise((ok) => publico.listen(porta, "127.0.0.1", ok));
  await new Promise((ok) => controle.listen(porta + 1, "127.0.0.1", ok)); // não passa pelo túnel

  const anunciar = (base) => {
    gravarJson(join(bruto, "urls.json"), {
      publica: base,
      yampi: `${base}/yampi/${tokens.caminho}`,
      evolution: `${base}/evo/${tokens.caminho}`,
      rejeita: `${base}/rejeita/${tokens.caminho}`,
      imagem: `${base}/img/${tokens.caminho}/teste.jpg?assinatura=${tokens.imagem}`,
    });
    console.log(`Captura no ar em ${base} (URLs completas só em urls.json). Marcadores: ${marcas.length}. Modo: ${todos ? "TODOS" : "só marcadores"}.`);
  };
  if (semTunel) return anunciar(`http://127.0.0.1:${porta}`);

  const tunel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${porta}`], { stdio: ["ignore", "ignore", "pipe"] });
  let anunciado = false;
  tunel.stderr.on("data", (dados) => {
    const url = !anunciado && urlDoTunel(dados);
    if (url) {
      anunciado = true;
      anunciar(url);
    }
  });
  tunel.on("error", () => {
    console.error("cloudflared não encontrado. Instale: winget install --id Cloudflare.cloudflared -e (e abra um terminal novo).");
    process.exit(1);
  });
  tunel.on("exit", (codigo) => {
    console.error(`cloudflared saiu (${codigo}). Encerrando: o endereço público morreu.`);
    process.exit(1);
  });
  process.on("SIGINT", () => {
    tunel.kill();
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
