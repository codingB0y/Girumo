import "server-only";
import { BRAND, BRAND_COLORS, getBrandAssetUrl } from "@/lib/brand";

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

// --- Trial acabando (2 dias) ---
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
