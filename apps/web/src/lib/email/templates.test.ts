import assert from "node:assert/strict";
import test from "node:test";
import {
  broadcastFailedEmail,
  nudgeConnectEmail,
  weeklyReportEmail,
} from "./templates";

// O nome do grupo do WhatsApp é editável por qualquer membro (padrão do
// WhatsApp) e chega cru do banco. Sem escape, vira link de phishing num e-mail
// assinado pela marca.
const NOME_DE_GRUPO_MALICIOSO = 'VIP</strong><a href="https://golpe.x">Sua conta foi suspensa</a>';

const stats = {
  weekLabel: "6 a 12 de out",
  newContacts: 3,
  newContactsChangePct: null,
  ordersCount: 0,
  ordersChangePct: null,
  revenue: 0,
  revenueChangePct: null,
  clicksTotal: 0,
  topGroup: { name: NOME_DE_GRUPO_MALICIOSO, count: 3 },
};

test("relatório semanal escapa o nome do grupo destaque", () => {
  const { html } = weeklyReportEmail("Ana", "https://app.x", stats);
  assert.doesNotMatch(html, /<a href="https:\/\/golpe\.x"/);
  assert.match(html, /VIP&lt;\/strong&gt;&lt;a href=&quot;https:\/\/golpe\.x&quot;&gt;/);
});

test("relatório semanal escapa o primeiro nome do lojista", () => {
  const { html } = weeklyReportEmail("<b>Ana Souza", "https://app.x", { ...stats, topGroup: null });
  assert.doesNotMatch(html, /<b>Ana/);
  assert.match(html, /Oi &lt;b&gt;Ana!/);
});

test("aviso de envio falho escapa nomes das mensagens e o primeiro nome", () => {
  const { html } = broadcastFailedEmail("<i>Bia", "https://app.x/painel", [NOME_DE_GRUPO_MALICIOSO]);
  assert.doesNotMatch(html, /<a href="https:\/\/golpe\.x"/);
  assert.doesNotMatch(html, /<i>Bia/);
  assert.match(html, /Oi &lt;i&gt;Bia!/);
});

test("o assunto leva o primeiro nome como texto puro, sem entidade HTML", () => {
  // Assunto não é HTML: escapar ali mostraria "&#39;" na caixa de entrada.
  const { subject, html } = nudgeConnectEmail("D'Ávila Souza", "https://app.x");
  assert.equal(subject, "D'Ávila, seu WhatsApp ainda não está conectado");
  assert.match(html, /Oi D&#39;Ávila!/);
});
