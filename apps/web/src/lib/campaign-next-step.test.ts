import assert from "node:assert/strict";
import { getCampaignNextStep } from "./campaign-next-step";

assert.deepEqual(getCampaignNextStep("ready"), {
  title: "Tudo pronto para divulgar",
  description: "Copie o link da campanha e envie para suas clientes.",
  actionLabel: "Copiar link",
});

assert.deepEqual(getCampaignNextStep("empty"), {
  title: "Escolha grupos para liberar o link",
  description: "Selecione os grupos que vao receber novas revendedoras.",
  actionLabel: "Escolher grupos",
});

assert.deepEqual(getCampaignNextStep("needs_invites"), {
  title: "Corrija convites antes de divulgar",
  description: "Algum grupo esta sem link de convite. Corrija isso para nao perder leads.",
  actionLabel: "Corrigir agora",
});

assert.deepEqual(getCampaignNextStep("full"), {
  title: "Todos os grupos estao cheios",
  description: "Adicione outro grupo para continuar recebendo novas revendedoras.",
  actionLabel: "Adicionar grupo",
});

console.log("campaign-next-step tests passed");
