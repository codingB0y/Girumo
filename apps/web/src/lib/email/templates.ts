import "server-only";

/**
 * Templates de email transacional do HubFlow.
 * HTML inline simples — sem dependência de template engine.
 */

const BRAND_COLOR = "#6a4bf0";
const LOGO_URL = "https://hubflow.com.br/icon.svg";

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e9eaf2">
    <div style="padding:32px 32px 0">
      <img src="${LOGO_URL}" alt="HubFlow" width="36" height="36" style="display:block;margin-bottom:24px" />
    </div>
    <div style="padding:0 32px 32px">
      ${content}
    </div>
    <div style="padding:16px 32px;background:#f7f8fb;border-top:1px solid #e9eaf2;text-align:center">
      <p style="margin:0;font-size:11px;color:#9ca3af">HubFlow · WhatsApp Growth OS</p>
    </div>
  </div>
</body>
</html>`;
}

function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px">${text}</a>`;
}

// --- Welcome ---
export function welcomeEmail(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `Bem-vind(a) ao HubFlow, ${firstName}! 🚀`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:#0b0d1a">Bem-vind(a), ${firstName}!</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#3a3f5c;line-height:1.6">
        Sua conta foi criada com sucesso. Agora faltam 2 passos pra você começar a vender nos seus grupos:
      </p>
      <ol style="margin:12px 0;padding-left:20px;font-size:14px;color:#3a3f5c;line-height:1.8">
        <li><strong>Conecte seu WhatsApp</strong> — escaneie o QR Code no painel</li>
        <li><strong>Crie sua primeira campanha</strong> — escolha os grupos e dispare</li>
      </ol>
      <p style="margin:0;font-size:14px;color:#3a3f5c">
        Seu trial de 7 dias já está ativo. Sem cartão, sem compromisso.
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
      <h1 style="margin:0 0 12px;font-size:22px;color:#0b0d1a">Conecte em 2 minutos ⚡</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#3a3f5c;line-height:1.6">
        Oi ${firstName}! Vi que você criou sua conta mas ainda não conectou o WhatsApp.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#3a3f5c;line-height:1.6">
        É super rápido — basta escanear o QR Code nas configurações. Depois disso, seus grupos aparecem
        automaticamente e você já pode disparar sua primeira oferta.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280">
        Nada técnico. Seu número de sempre, seus contatos são seus.
      </p>
      ${button("Conectar meu WhatsApp", `${appUrl}/painel/conectar`)}
    `),
  };
}

// --- Trial acabando (2 dias) ---
export function trialEndingEmail(name: string, appUrl: string, daysLeft: number): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `⏰ Seu trial termina em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}, ${firstName}`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:#0b0d1a">Seu trial está acabando</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#3a3f5c;line-height:1.6">
        ${firstName}, seu período grátis no HubFlow termina em <strong>${daysLeft} dia${daysLeft > 1 ? "s" : ""}</strong>.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#3a3f5c;line-height:1.6">
        Pra continuar usando seus grupos, disparos e automações sem interrupção, assine um plano.
        A partir de R$ 47/mês.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280">
        Seus dados ficam guardados por 30 dias após o trial — mas os disparos param.
      </p>
      ${button("Ver planos e assinar", `${appUrl}/painel/configuracoes`)}
    `),
  };
}

// --- Primeiro disparo feito! ---
export function firstBroadcastEmail(name: string, appUrl: string): { subject: string; html: string } {
  const firstName = name.split(" ")[0] || "lojista";
  return {
    subject: `🎉 Primeiro disparo feito, ${firstName}!`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:#0b0d1a">Parabéns! 🎉</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#3a3f5c;line-height:1.6">
        ${firstName}, seu primeiro disparo foi enviado com sucesso!
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#3a3f5c;line-height:1.6">
        Agora é só acompanhar os resultados no painel. Dicas pra maximizar:
      </p>
      <ul style="margin:12px 0;padding-left:20px;font-size:14px;color:#3a3f5c;line-height:1.8">
        <li>Agende disparos recorrentes (terça e sexta funcionam bem)</li>
        <li>Use o programa de indicação pra crescer mais rápido</li>
        <li>Monitore a taxa de entrega — acima de 80% está saudável</li>
      </ul>
      ${button("Ver resultados", `${appUrl}/painel/resultados`)}
    `),
  };
}
