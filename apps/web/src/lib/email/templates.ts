import "server-only";
import { BRAND, BRAND_COLORS, getBrandAssetUrl } from "@/lib/brand";
import { broadcastFailedCopy } from "@/lib/email/broadcast-failed-copy";

/**
 * Templates de email transacional da Girumo.
 * HTML inline simples — sem dependência de template engine.
 */

const LOGO_URL = getBrandAssetUrl(BRAND.emailLogoAsset);

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND_COLORS.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${BRAND_COLORS.volt}">
  <div style="max-width:560px;margin:40px auto;background:${BRAND_COLORS.paper};border-radius:16px;overflow:hidden;border:1px solid ${BRAND_COLORS.line}">
    <div style="padding:32px 32px 0">
      <img src="${LOGO_URL}" alt="${BRAND.name} — automação para grupos que vendem" width="320" height="80" style="display:block;width:320px;max-width:100%;height:auto;margin-bottom:24px" />
    </div>
    <div style="padding:0 32px 32px">
      ${content}
    </div>
    <div style="padding:16px 32px;background:${BRAND_COLORS.canvas};border-top:1px solid ${BRAND_COLORS.line};text-align:center">
      <p style="margin:0;font-size:11px;color:${BRAND_COLORS.volt}">${BRAND.emailFooter}</p>
    </div>
  </div>
</body>
</html>`;
}
function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:${BRAND_COLORS.acid};color:${BRAND_COLORS.volt};text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${text}</a>`;
}

// --- Welcome ---
export function welcomeEmail(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `Bem-vind(a) à ${BRAND.name}, ${firstName}!`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Bem-vind(a), ${firstName}!</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Sua conta foi criada com sucesso. Agora faltam 2 passos pra você começar a vender nos seus grupos:
      </p>
      <ol style="margin:12px 0;padding-left:20px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.8">
        <li><strong>Conecte seu WhatsApp</strong> — escaneie o QR Code no painel</li>
        <li><strong>Crie sua primeira campanha</strong> — escolha os grupos e publique</li>
      </ol>
      <p style="margin:0;font-size:14px;color:${BRAND_COLORS.volt}">
        Sua conta já está ativa, com 30 dias de garantia incondicional. Sem fidelidade.
      </p>
      ${button("Acessar meu painel", `${appUrl}/painel`)}
    `),
  };
}

// --- 24h sem conectar WhatsApp ---
export function nudgeConnectEmail(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `${firstName}, seu WhatsApp ainda não está conectado`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Conecte em 2 minutos</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Oi ${firstName}! Vi que você criou sua conta mas ainda não conectou o WhatsApp.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        É super rápido — basta escanear o QR Code nas configurações. Depois disso, seus grupos aparecem
        automaticamente e você já pode enviar sua primeira oferta.
      </p>
      <p style="margin:0;font-size:13px;color:${BRAND_COLORS.slate}">
        Nada técnico. Seu número de sempre, seus contatos são seus.
      </p>
      ${button("Conectar meu WhatsApp", `${appUrl}/painel/conectar`)}
    `),
  };
}

// --- WhatsApp desconectado há mais de 2h ---
export function disconnectAlertEmail(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: "Seu WhatsApp desconectou — reconecte pra não perder a novidade de hoje",
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Seu WhatsApp caiu</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Oi ${firstName}! Seu WhatsApp está desconectado há mais de 2 horas — enquanto isso, nenhuma campanha
        sai e nenhum contato novo entra nos grupos.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Reconectar leva 2 minutos — basta escanear o QR Code de novo nas configurações.
      </p>
      ${button("Reconectar agora", `${appUrl}/painel/conectar`)}
    `),
  };
}

/**
 * Envio de campanha que falhou. Sem este e-mail ele morre em silêncio: o status
 * vira `failed` no banco e o lojista só descobre se abrir a tela por conta própria.
 *
 * Não repete a mensagem de erro técnica da Evolution — ela não ajuda o lojista e
 * às vezes carrega identificador interno. O e-mail leva pra tela, que mostra o
 * detalhe.
 *
 * Recebe a URL pronta em vez de montar o caminho aqui de propósito: a rota
 * interna carrega um termo que o vocabulário público da Girumo aposentou
 * (guardado pelo teste "removes stale public email language"). O texto que o
 * lojista lê fala em campanha e mensagem; quem conhece a rota é o cron.
 */
export function broadcastFailedEmail(
  name: string,
  href: string,
  nomes: string[],
): { subject: string; html: string } {
  const { subject, headline, lista, firstName } = broadcastFailedCopy(name, nomes);
  const plural = nomes.length > 1;

  return {
    subject,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">${headline}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Oi ${firstName}! ${plural ? "Estas mensagens não saíram" : "Esta mensagem não saiu"}
        pros seus grupos: <strong>${lista}</strong>.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Ninguém nos seus grupos recebeu. Abra a tela pra ver o motivo e enviar de novo.
      </p>
      ${button("Ver o que aconteceu", href)}
    `),
  };
}

// --- Cadência de ativação: D3 (divulgar) ---
// Se já teve cliques, celebra e pede pra repetir; se zero, tira o atrito do 1º post.
export function activationD3Email(name: string, appUrl: string, clicks: number): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  const hasClicks = clicks > 0;
  const subject = hasClicks
    ? `${firstName}, seu link já teve ${clicks} clique${clicks > 1 ? "s" : ""} — 3 lugares pra divulgar hoje`
    : `${firstName}, o primeiro lugar pra postar seu link hoje`;
  const intro = hasClicks
    ? `Seu link de captação já recebeu <strong>${clicks} clique${clicks > 1 ? "s" : ""}</strong>. Isso é gente querendo entrar nos seus grupos — quanto mais você divulga, mais entra.`
    : `Seu link de captação ainda não recebeu cliques — e isso é normal no começo. O que destrava é aparecer: cada lugar que você posta é uma porta a mais pros seus grupos.`;
  return {
    subject,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">${hasClicks ? "Bora divulgar mais hoje" : "Poste em 1 lugar hoje"}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">Oi ${firstName}! ${intro}</p>
      <p style="margin:0 0 4px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">${hasClicks ? "3 lugares pra colar seu link ainda hoje:" : "Comece por um só:"}</p>
      <ol style="margin:8px 0;padding-left:20px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.8">
        <li>No seu status do WhatsApp</li>
        <li>Na bio do seu Instagram</li>
        <li>Num grupo onde seus clientes já estão</li>
      </ol>
      ${button("Ver meu link de captação", `${appUrl}/painel/campanhas`)}
    `),
  };
}

// --- Cadência de ativação: D7 (constância) ---
export function activationD7Email(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `${firstName}, grupos que enchem têm novidade todo dia`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Poste a novidade de hoje</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Uma semana de conta, ${firstName}! Os grupos que mais enchem têm uma coisa em comum: aparecem toda semana com uma novidade — chegada nova, promoção do dia, reposição.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Não precisa ser grande. Precisa ser constante. Publique a novidade de hoje pros seus grupos e mantenha o ritmo.
      </p>
      ${button("Publicar novidade de hoje", `${appUrl}/painel/campanhas`)}
    `),
  };
}

// --- Cadência de ativação: D14 (registrar vendas / funil em R$) ---
export function activationD14Email(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `${firstName}, metade da sua garantia — já viu suas vendas em R$?`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Veja o caminho até a venda</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        ${firstName}, você está na metade dos seus 30 dias de garantia. Esse é o momento de fechar o ciclo: registrar seus pedidos.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Quando você anota cada venda, a ${BRAND.name} mostra de qual grupo ela veio e quanto cada grupo te rendeu em R$ — do clique até o pedido. É aí que dá pra saber o que vale a pena repetir.
      </p>
      ${button("Registrar um pedido", `${appUrl}/painel/contatos`)}
    `),
  };
}

// --- Cadência de ativação: D21 (o que os melhores fizeram) ---
export function activationD21Email(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `${firstName}, falta 1 semana — o que os melhores fizeram até aqui`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Reta final da garantia</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Falta uma semana pro fim dos seus 30 dias, ${firstName}. Os lojistas que mais venderam até aqui fizeram três coisas simples:
      </p>
      <ol style="margin:8px 0;padding-left:20px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.8">
        <li>Divulgaram o link de captação em mais de um lugar</li>
        <li>Postaram novidade pros grupos toda semana</li>
        <li>Registraram os pedidos pra ver de qual grupo veio cada venda</li>
      </ol>
      <p style="margin:0;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Ainda dá tempo de fazer as três e terminar a garantia com resultado na mão.
      </p>
      ${button("Abrir meu painel", `${appUrl}/painel`)}
    `),
  };
}

// --- Trial acabando (2 dias) — APOSENTADO ---
// A oferta atual (30 dias de garantia, sem trial) não usa mais este e-mail. A
// função fica versionada pra referência/histórico, mas o cron não a dispara —
// a cadência de ativação (D3/D7/D14/D21) tomou o lugar.
export function trialEndingEmail(name: string, appUrl: string, daysLeft: number): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `⏰ Seu trial termina em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}, ${firstName}`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Seu trial está acabando</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        ${firstName}, seu período grátis na ${BRAND.name} termina em <strong>${daysLeft} dia${daysLeft > 1 ? "s" : ""}</strong>.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Pra continuar usando seus grupos, campanhas e automações sem interrupção, escolha o plano ideal para sua operação.
      </p>
      <p style="margin:0;font-size:13px;color:${BRAND_COLORS.slate}">
        Seus dados ficam guardados por 30 dias após o trial — mas os envios programados param.
      </p>
      ${button("Ver planos e assinar", `${appUrl}/painel/configuracoes`)}
    `),
  };
}

// --- Relatório semanal ---
export type WeeklyReportStats = {
  weekLabel: string;
  newContacts: number;
  newContactsChangePct: number | null;
  ordersCount: number;
  ordersChangePct: number | null;
  revenue: number;
  revenueChangePct: number | null;
  clicksTotal: number;
  topGroup: { name: string; count: number } | null;
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatChange(pct: number | null): string {
  if (pct === null) return "";
  const color = pct >= 0 ? BRAND_COLORS.success : BRAND_COLORS.danger;
  const arrow = pct >= 0 ? "↑" : "↓";
  return ` <span style="color:${color};font-weight:600;font-size:12px">${arrow} ${Math.abs(pct)}%</span>`;
}

function statRow(label: string, value: string, changeHtml: string): string {
  return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND_COLORS.line};font-size:14px;color:${BRAND_COLORS.slate}">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${BRAND_COLORS.line};font-size:16px;font-weight:700;color:${BRAND_COLORS.volt};text-align:right">${value}${changeHtml}</td>
      </tr>`;
}

export function weeklyReportEmail(
  name: string,
  appUrl: string,
  stats: WeeklyReportStats,
): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  const topGroupLine = stats.topGroup
    ? `<p style="margin:16px 0 0;font-size:13px;color:${BRAND_COLORS.slate}">
        Grupo destaque da semana: <strong style="color:${BRAND_COLORS.volt}">${stats.topGroup.name}</strong>
        (${stats.topGroup.count} novo${stats.topGroup.count === 1 ? "" : "s"} contato${stats.topGroup.count === 1 ? "" : "s"})
      </p>`
    : "";

  return {
    subject: `📊 Seu resumo da semana na ${BRAND.name}`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Seu resumo da semana</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Oi ${firstName}! Aqui está o que aconteceu nos seus grupos em ${stats.weekLabel}.
      </p>
      <table role="presentation" width="100%" style="border-collapse:collapse">
        ${statRow("Novos contatos", String(stats.newContacts), formatChange(stats.newContactsChangePct))}
        ${statRow("Pedidos", String(stats.ordersCount), formatChange(stats.ordersChangePct))}
        ${statRow("Faturamento", formatCurrency(stats.revenue), formatChange(stats.revenueChangePct))}
        ${statRow("Cliques totais nos seus links", String(stats.clicksTotal), "")}
      </table>
      ${topGroupLine}
      ${button("Ver relatório completo", `${appUrl}/painel/resultados`)}
      <p style="margin:20px 0 0;font-size:12px;color:${BRAND_COLORS.slate}">
        Não quer mais receber esse resumo? Desative em
        <a href="${appUrl}/painel/configuracoes?secao=notificacoes" style="color:${BRAND_COLORS.slate}">Configurações</a>.
      </p>
    `),
  };
}
