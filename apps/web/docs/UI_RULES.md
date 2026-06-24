# UI_RULES — DevZap Groups

Regras visuais e de UX da lane **Frontend + UI**. Servem para **evitar regressão visual** e manter
identidade consistente. Antes de criar/alterar tela, confira aqui. Mudou uma regra? Atualize este arquivo.

## Princípios
- **Minimalista e direto.** Layout limpo, pouco texto, bordas suaves, respiro generoso. Uma ação principal por tela.
- **Pra lojista leigo.** Português de gente, sem jargão (nada de CTR/UTM/CPA). Botões grandes, mobile-first.
- **Cada tela responde:** "tô crescendo? / vendendo mais? / o que faço agora?". Se não responde, repensar.
- **Honestidade de dado.** Nunca número inventado. Dado que não temos → empty state ou etapa "em breve",
  não um placeholder fake.

## Identidade (cores)
- **Violeta = marca / ação / CTA.** Paleta `brand-50..800` (acento `#7C5CFF`). Botão primário, item ativo,
  foco, ícones de marca, chips.
- **Verde = sucesso / crescimento (semântico) — só isso.** Conectado, "comprou", "enviada", concluído,
  saudável. Nunca usar verde como cor de marca.
- **Não introduzir cor fora dos tokens** do `globals.css`. Vermelho/âmbar só para alerta/atenção.

## Componentes (usar, não recriar)
- Primitivos em `src/components/ui/*`: **Button, Card, Input, Badge**. Toda tela compõe a partir deles.
- **Card:** `rounded-2xl`, `shadow-card` em camadas, hover sutil, `backdrop-blur` quando sobre fundo.
- **Button primário:** gradiente violeta + `shadow-brand` + hover `-translate-y-px`, `rounded-xl`.
  Secundário: borda + texto, sem peso. Botão morto é proibido (sem ação → não existe).
- **Input/Textarea:** foco com `ring-4` violeta.
- **Badge:** tons com `ring`; tom `brand` para marca, verde só para sucesso.
- Ícones: **lucide-react**. Ícone-botão precisa de `aria-*` e foco visível.

## Layout & navegação
- **Mobile-first.** Sidebar no desktop; drawer/MobileNav no celular. Topbar sticky com blur.
- **HOME `/hoje`** = Central de Resultados: hero (card gradiente escuro premium) → **funil visual** (peça
  central, afunila por proporção real) → próxima ação única → saúde do negócio/número.
- **Funil honesto:** etapas medidas (tráfego→entraram→compraram) com valor real; etapas sem dado
  (interagiram/recompra/cliente fiel) como camadas "em breve" — mantêm a forma, não mentem.
- **Próxima ação única** por tela/contexto (mata paralisia do leigo). Não empilhar 5 CTAs.
- Estados de carregamento: preferir skeleton a piscar vazio (dívida aberta, ver `system/NEXT.md`).

## Acessibilidade
- Foco visível em tudo que é interativo (já global no Button). Contraste adequado. `aria-label` em ícone-botão.
- Modais: fechar no Esc + trap de foco (dívida aberta).

## Marketing / landing (regra durável)
- **Nada de "medo de ban"** como gancho — assusta o cliente. Eixo = crescimento + venda + simplicidade.
- CTA da landing → WhatsApp humano (converte melhor que formulário para esse público).

## Não alterar (sem decisão explícita do Igor)
- A **direção Light Premium** (claro elevado + acento violeta — não dark full).
- A **responsividade** das telas existentes.
- A hierarquia da HOME (funil como coração).

> Referências de implementação: `src/app/globals.css` (tokens), `src/components/ui/*` (primitivos),
> `src/components/funnel-visual.tsx`. Decisão de design registrada na memória [[feedback_design_light_premium]].
</content>
