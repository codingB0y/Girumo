// infra/scripts/zernio-webhook.mjs
// Cria, lista ou apaga o webhook da Girumo na Zernio. Lê ZERNIO_API_KEY e ZERNIO_WEBHOOK_SECRET do ambiente; nunca imprime os dois.
//   node infra/scripts/zernio-webhook.mjs list
//   node infra/scripts/zernio-webhook.mjs create https://app.girumo.com.br/api/ig/webhook girumo-prod
//   node infra/scripts/zernio-webhook.mjs delete <webhookId>
const [acao, arg1, arg2] = process.argv.slice(2);
const chave = process.env.ZERNIO_API_KEY?.trim();
const segredo = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
if (!chave) throw new Error("ZERNIO_API_KEY ausente no ambiente.");
const EVENTOS = ["comment.received", "message.received", "account.connected", "account.disconnected"];

async function zernio(method, path, body) {
  const r = await fetch(`https://zernio.com/api/${path}`, { method, headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

if (acao === "list") {
  const r = await zernio("GET", "v1/webhooks/settings");
  const lista = Array.isArray(r) ? r : r?.webhooks ?? r?.data ?? [];
  for (const w of lista) console.log(w._id, w.name, w.url, (w.events ?? []).join(","), w.isActive === false ? "(inativo)" : "");
} else if (acao === "create") {
  if (!segredo) throw new Error("ZERNIO_WEBHOOK_SECRET ausente no ambiente.");
  if (!arg1?.startsWith("https://")) throw new Error("Uso: create <url https> [nome]");
  const r = await zernio("POST", "v1/webhooks/settings", { name: arg2 ?? "girumo", url: arg1, secret: segredo, events: EVENTOS });
  console.log("criado:", r?._id ?? r?.webhook?._id ?? JSON.stringify(r).slice(0, 200));
} else if (acao === "delete") {
  if (!arg1) throw new Error("Uso: delete <webhookId>");
  await zernio("DELETE", `v1/webhooks/settings?webhookId=${encodeURIComponent(arg1)}`);
  console.log("apagado:", arg1);
} else {
  throw new Error("Ações: list | create <url> [nome] | delete <id>");
}
