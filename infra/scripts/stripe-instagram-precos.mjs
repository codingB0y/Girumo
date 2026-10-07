// infra/scripts/stripe-instagram-precos.mjs
// Cria (uma vez por modo: test e live) os preços do add-on Instagram e imprime os ids.
// Lê STRIPE_SECRET_KEY do ambiente; nunca a imprime. Rodar de novo não duplica:
// cada preço tem lookup_key e é reaproveitado se já existir.
//   node infra/scripts/stripe-instagram-precos.mjs
const chave = process.env.STRIPE_SECRET_KEY?.trim();
if (!chave) throw new Error("STRIPE_SECRET_KEY ausente no ambiente.");

const PRECOS = [
  { env: "STRIPE_PRICE_INSTAGRAM", lookup: "instagram_mensal", produto: "Instagram", valor: 29700, recorrente: true },
  { env: "STRIPE_PRICE_INSTAGRAM_IMPLANTACAO", lookup: "instagram_implantacao", produto: "Implementação Instagram", valor: 49700, recorrente: false },
];

async function stripe(method, path, campos) {
  const body = campos ? new URLSearchParams(campos).toString() : undefined;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${json?.error?.message ?? "erro"}`);
  return json;
}

console.log(`Modo: ${chave.startsWith("sk_live_") || chave.startsWith("rk_live_") ? "LIVE" : "test"}`);
for (const p of PRECOS) {
  const achados = await stripe("GET", `prices?active=true&lookup_keys[]=${p.lookup}&expand[]=data.product`);
  let preco = achados.data[0];
  if (!preco) {
    const produto = await stripe("POST", "products", { name: p.produto, "metadata[addon]": "instagram" });
    const campos = { product: produto.id, currency: "brl", unit_amount: String(p.valor), lookup_key: p.lookup, "metadata[addon]": "instagram" };
    if (p.recorrente) campos["recurring[interval]"] = "month";
    preco = await stripe("POST", "prices", campos);
    console.log(`criado   ${p.env}=${preco.id}  (produto ${produto.id})`);
  } else {
    const produtoId = typeof preco.product === "string" ? preco.product : preco.product.id;
    console.log(`existia  ${p.env}=${preco.id}  (produto ${produtoId})`);
  }
}
