import "server-only";

/**
 * Copy Agent — gera sugestões de texto de oferta para disparo em grupos de WhatsApp.
 *
 * Usa a API do Claude (Anthropic) para gerar copy otimizada baseada no contexto:
 * - Tipo de mensagem (oferta, novidade, reativação, lançamento)
 * - Produto/serviço
 * - Tom (direto, divertido, urgente, premium)
 * - Informações extras (preço, desconto, prazo)
 *
 * Retorna 3 variações para o lojista escolher.
 */

export type CopyInput = {
  type: "oferta" | "novidade" | "reativacao" | "lancamento" | "lembrete";
  product: string;
  tone: "direto" | "divertido" | "urgente" | "premium";
  price?: string;
  discount?: string;
  extraContext?: string;
};

type CopyVariation = {
  id: string;
  text: string;
  label: string;
};

export type CopyResult = {
  variations: CopyVariation[];
  model: string;
};

const SYSTEM_PROMPT = `Você é um copywriter especialista em vendas por WhatsApp para lojistas brasileiros.
Você escreve mensagens curtas, diretas e que vendem — otimizadas para grupos de WhatsApp.

Regras:
- Máximo 500 caracteres por mensagem
- Use emojis com moderação (2-4 por mensagem)
- Inclua sempre um call-to-action claro ("chama no privado", "manda oi", etc.)
- Adapte o tom conforme pedido
- NÃO use links (o lojista adiciona depois)
- NÃO use hashtags
- Formato: texto corrido, sem markdown
- Escreva em português brasileiro coloquial

Formato de resposta: retorne EXATAMENTE 3 variações, separadas por ---\nCada variação começa com um rótulo entre colchetes: [Curta], [Média], [Completa]`;

function buildUserPrompt(input: CopyInput): string {
  const typeLabels = {
    oferta: "oferta/promoção",
    novidade: "novidade/chegou produto novo",
    reativacao: "reativação de clientes inativos",
    lancamento: "lançamento de produto",
    lembrete: "lembrete/aviso",
  };

  const toneLabels = {
    direto: "direto e objetivo, sem enrolação",
    divertido: "leve e descontraído, com humor",
    urgente: "senso de urgência, escassez",
    premium: "sofisticado, exclusivo",
  };

  let prompt = `Gere 3 variações de mensagem para WhatsApp:

Tipo: ${typeLabels[input.type]}
Produto/serviço: ${input.product}
Tom: ${toneLabels[input.tone]}`;

  if (input.price) prompt += `\nPreço: R$ ${input.price}`;
  if (input.discount) prompt += `\nDesconto: ${input.discount}%`;
  if (input.extraContext) prompt += `\nContexto extra: ${input.extraContext}`;

  prompt += `\n\nLembre: máximo 500 caracteres cada, com CTA claro.`;

  return prompt;
}

function parseVariations(text: string): CopyVariation[] {
  const parts = text.split("---").map((p) => p.trim()).filter(Boolean);

  return parts.slice(0, 3).map((part, i) => {
    // Extrai label se existir [Label]
    const labelMatch = part.match(/^\[([^\]]+)\]\s*/);
    const label = labelMatch ? labelMatch[1] : ["Curta", "Média", "Completa"][i] ?? `Variação ${i + 1}`;
    const text = labelMatch ? part.replace(labelMatch[0], "").trim() : part.trim();

    return {
      id: `var-${i + 1}`,
      text,
      label,
    };
  });
}

/**
 * Gera sugestões de copy usando Claude API.
 * Requer ANTHROPIC_API_KEY no environment.
 */
export async function generateCopy(input: CopyInput): Promise<CopyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Fallback: retorna templates estáticos quando não tem API key
    return {
      variations: getFallbackCopy(input),
      model: "fallback-templates",
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserPrompt(input) },
      ],
    }),
  });

  if (!response.ok) {
    console.error("[copy-agent] Anthropic API error:", response.status, await response.text());
    return {
      variations: getFallbackCopy(input),
      model: "fallback-templates",
    };
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "";

  const variations = parseVariations(content);

  // Se parsing falhou, retorna fallback
  if (variations.length === 0) {
    return {
      variations: getFallbackCopy(input),
      model: "fallback-templates",
    };
  }

  return {
    variations,
    model: data.model ?? "claude-haiku-4-5",
  };
}

/** Templates estáticos de fallback quando a API não está disponível. */
function getFallbackCopy(input: CopyInput): CopyVariation[] {
  const product = input.product || "[seu produto]";
  const price = input.price ? `R$ ${input.price}` : "preço especial";

  const templates: Record<CopyInput["type"], CopyVariation[]> = {
    oferta: [
      {
        id: "var-1",
        label: "Curta",
        text: `🔥 ${product} por ${price}! Só hoje. Chama no privado pra garantir.`,
      },
      {
        id: "var-2",
        label: "Média",
        text: `🔥 OFERTA RELÂMPAGO\n\n${product} saindo por ${price}${input.discount ? ` (${input.discount}% OFF)` : ""}\n\n⚡ Pouquíssimas unidades. Quem chamar primeiro leva!`,
      },
      {
        id: "var-3",
        label: "Completa",
        text: `🔥 OFERTA DO DIA\n\n${product}\n💰 ${price}${input.discount ? ` — ${input.discount}% de desconto` : ""}\n\n✅ Pronta entrega\n✅ Envio hoje\n\n⏰ Válido só hoje! Manda um "quero" no privado.`,
      },
    ],
    novidade: [
      {
        id: "var-1",
        label: "Curta",
        text: `✨ Chegou ${product}! Primeiras unidades já disponíveis. Manda oi pra ver.`,
      },
      {
        id: "var-2",
        label: "Média",
        text: `✨ NOVIDADE\n\n${product} acabou de chegar!\n\nQuem já conhece sabe — e quem não conhece vai se surpreender.\n\n📩 Chama no privado pra saber mais.`,
      },
      {
        id: "var-3",
        label: "Completa",
        text: `✨ TÁ FRESQUINHO\n\n${product} chegou na loja!\n\n🆕 Lançamento\n💰 A partir de ${price}\n📦 Pronta entrega\n\nPrimeiros pedidos saem com mimo surpresa 🎁\nManda "quero ver" no privado!`,
      },
    ],
    reativacao: [
      {
        id: "var-1",
        label: "Curta",
        text: `👋 Sumiu! Volta que tem ${product} com condição especial só pra quem é do grupo.`,
      },
      {
        id: "var-2",
        label: "Média",
        text: `👋 Ei, faz tempo!\n\nSeparei uma condição especial de ${product} pra quem tá quietinho no grupo.\n\n🎁 Manda "voltei" no privado pra liberar.`,
      },
      {
        id: "var-3",
        label: "Completa",
        text: `👋 Oi, sumidx!\n\nNotei que faz um tempo que você não pede nada. Tá tudo bem?\n\nSeparei algo especial pra você:\n🎁 ${product}${input.discount ? ` com ${input.discount}% OFF` : " com desconto exclusivo"}\n\nVálido só essa semana. Manda "quero" no privado!`,
      },
    ],
    lancamento: [
      {
        id: "var-1",
        label: "Curta",
        text: `🚀 LANÇAMENTO: ${product}! Quem pedir primeiro garante ${price}. Chama!`,
      },
      {
        id: "var-2",
        label: "Média",
        text: `🚀 É HOJE\n\n${product} acabou de ser lançado!\n\nPrimeiros clientes levam com condição especial de lançamento.\n\n📩 Manda "quero" no privado.`,
      },
      {
        id: "var-3",
        label: "Completa",
        text: `🚀 LANÇAMENTO OFICIAL\n\n${product}\n\n✅ [Benefício 1]\n✅ [Benefício 2]\n✅ [Benefício 3]\n\n💰 Preço de lançamento: ${price}\n⏰ Condição válida só essa semana\n\nManda "lançamento" no privado!`,
      },
    ],
    lembrete: [
      {
        id: "var-1",
        label: "Curta",
        text: `⏰ Lembrete: ${product} ainda disponível! Últimas unidades. Corre!`,
      },
      {
        id: "var-2",
        label: "Média",
        text: `⏰ Oi! Passando pra lembrar:\n\n${product} ainda tá disponível — mas por pouco tempo.\n\nSe tava pensando, agora é a hora. Manda oi!`,
      },
      {
        id: "var-3",
        label: "Completa",
        text: `⏰ ÚLTIMO AVISO\n\n${product}\n\n🔴 Últimas unidades\n💰 ${price}\n📦 Envio amanhã pra quem fechar hoje\n\nDepois disso, só mês que vem.\nManda "quero" no privado!`,
      },
    ],
  };

  return templates[input.type] ?? templates.oferta;
}
