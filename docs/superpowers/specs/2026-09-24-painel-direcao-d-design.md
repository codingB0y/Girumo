# Painel na direção D — design e plano

- **Data:** 24/09/2026 · **Card:** `painel-direcao-d` (quadro de produção)
- **Mockup aprovado:** https://claude.ai/artifact/NBriFKi8KBbPx9tydzPLVq — coluna **D · Campanha (escuro)**, desktop 1440 e celular 390
- **Brief, dados de exemplo e fontes das pranchetas (fora do repo):** `C:/Users/Igor/Desktop/girumo-design-refs/painel-devzapp-2026-09-23/`

## Por que

O Igor recusou as direções editoriais (A Conversas, B Quadro do dia, C Balcão: metáfora de papel, pouca
informação) e escolheu a D: a **estrutura do painel do DevZapp** — menu com seções, cabeçalho da campanha
com o status do número, abas, faixa de números com comparação, gráficos de entrada/saída e cliques,
tabela de grupos — com acabamento de produto sênior, densa e escura.

## Decisões

1. **Tema noite no painel inteiro, pela camada de tokens.** Dentro de `[data-testid=painel-root]` as
   variáveis de cor do `@theme` ganham valores de noite: `--color-canvas-100` vira o fundo, `--color-paper-0`
   a superfície, `--color-volt-950` a tinta clara, `--color-line-200` o fio, `--color-slate-600` o texto de
   apoio. As 13 telas trocam de tema sem mexer nos componentes; o que não inverter certo vira ajuste por
   seletor, listado no PR A (link `text-cobalt-*` precisa de tom claro, verde/vermelho de texto idem; a bolha
   do WhatsApp continua clara). Consequência aceita: dentro do painel, `volt-950` passa a significar "tinta",
   e `bg-volt-950` vira botão claro sobre fundo escuro. Trocar tela por tela custaria 13 PRs.
2. **Archivo no painel** (a mesma família das landings). Números em Archivo tabular: `.font-data` passa a
   apontar para Archivo dentro do painel. O root continua com Manrope/Plex (`brand-css.test.ts`).
3. **Acid só em Postar, AO VIVO e LOTOU** (já é regra do `vitrine-lint`: no máximo 2 `bg-acid` por arquivo).
4. **Postar na barra de cima só no contexto de uma campanha** ("Postar em 40 grupos"), abrindo a
   `FolhaPostar` em qualquer largura com a campanha já escolhida. Não aparece na Início (contrato: Início sem
   `bg-acid`) nem em Disparos (contrato: um único `/^Postar/` na tela).
5. **Abas da campanha:** Visão geral (padrão) · Grupos · Posts · Agendados · Resultados · Configurar.
   "Link e cliques" entra no PR C. Relâmpago e Contatos por campanha ficam fora: `flash_offers` não tem
   campanha e `/api/leads` não filtra por grupo (o PR B acrescenta esse filtro só para "Últimas entradas").
6. **Nada de controle falso.** Sem busca Ctrl K e sem seletor de loja enquanto não existirem (não há rota que
   liste as lojas do usuário; a command palette saiu no #209). O bloco da loja mostra nome e plano, sem seta.
7. **Contagem honesta.** Até o PR D, "entraram" é **pessoas novas**: `leads.entered_at` guarda só a 1ª
   entrada e `source_group_id` só o 1º grupo. O rótulo diz "Novas pessoas". Saída só aparece quando houver
   evento de saída gravado (PR D): `metadata.left_at` guarda só a última saída e só de quem tem telefone.
8. **Entrega por grupo sem posição na fila.** A ordem entre os grupos de um disparo é aleatória (claim por
   `priority, created_at, id`, e o fan-out insere tudo com o mesmo `created_at`). A tela mostra entregue /
   enviando / na fila / falhou, nunca "12º na fila".

## PRs, na ordem

### PR A — Tema noite + casca D (sem dado novo)

- **Menu lateral (248 px):**
  - bloco da loja com o nome e o plano;
  - grupos Vender / Lotar / Loja com ícone de 16 px e título em frase;
  - "Campanhas" com as campanhas embaixo (nome e número de grupos, de `/api/campanhas`);
  - cartão "Seu número" (conectado/desconectado + veterano, de `/api/instances/health`);
  - Configurações e a linha do plano (`romaneioDoPlano`).
  - O modo recolhido de 64 px entre 1024 e 1279 continua.
- **Barra de cima:**
  - trilha (cada página informa a sua);
  - "Atualizado HH:MM" com o botão de atualizar;
  - o sino atual (`NotificationBell`);
  - Postar só em campanha (decisão 4).
- **Celular:** barra de app (voltar, título, mais) e a `BarraMobile` atual repintada.
- **Revisão visual das 13 telas** em 1440, 1280, 1100 e 390, com captura, e a lista de ajustes por seletor.
- **Contratos:**
  - mantidos: `painel-root`, `painel-corredor`, os headings Vender/Lotar/Loja, o link `/Seu número/`, `painel-romaneio`, `painel-postar`, `painel-mobile-nav` e a folha Mais;
  - removido: `painel-ticker` (a D não tem ticker), com o teste atualizado no mesmo PR.

### PR B — Página da campanha no layout D (dado que já existe)

- **Cabeçalho:**
  - nome da campanha;
  - link `/r/` com copiar e QR;
  - "N grupos · N pessoas";
  - "Grupo lotou → abre outro: ligado/desligado", com o toggle ali mesmo (o `PATCH /api/campanhas` já aceita);
  - número conectado;
  - Editar campanha e Mais.
- **Abas** da decisão 5. O funil em preenchimento sobrevive à troca de aba (mesmo mecanismo de manter montado).
- **Visão geral:**
  - faixa de números com o que existe: cliques acumulados do link, pessoas e % das vagas, grupos com a barra lotados/quase/com vaga;
  - tabela "Grupos da campanha" (Grupo, Pessoas, Lotação, Status, ações), com os filtros Todos / Lotados / Quase / Com vaga;
  - "Hoje na campanha": posts do dia e agendados, de `GET /api/campanhas/[slug]/messages`;
  - "Últimas entradas": `/api/leads` ganha `groupIds`, validado no servidor e filtrado por tenant.
- **Limiares únicos:** QUASE a 85%, LOTOU a 95%. Hoje o cartão do detalhe usa 80%.
- **Celular 390** conforme a prancheta DMobile.
- **Contratos que mudam:**
  - a aba padrão vira Visão geral (`painel-campanha-acoes-em-massa` passa a clicar em "Grupos");
  - "Mensagens" vira "Posts" (`painel-funil`, `painel-funis`, `painel-funil-resultados` atualizados);
  - `?abrir=funil` continua abrindo Posts → Funil.

### PR C — Séries por hora e por dia (DDL nos dois bancos)

- **SQL, aplicado nos dois bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`) e registrado no `apply-order.txt`:**
  - índice `link_click_events (tenant_id, campaign_group_id, occurred_at desc)`;
  - função `app.campaign_activity(p_tenant uuid, p_campaign uuid, p_group_ids text[], p_from timestamptz, p_to timestamptz, p_bucket text)`, que devolve `(bucket, novas_pessoas, cliques)` no fuso America/Sao_Paulo, com `security definer`, `search_path` fixo e execução só para `service_role`.
- **Rota** `GET /api/campanhas/[slug]/atividade?periodo=hoje|7d|mes`, com filtro explícito por tenant.
- **Tela:**
  - a faixa de números ganha "hoje", a comparação com o mesmo horário da semana passada e a sparkline de 7 dias;
  - seção Análise (Hoje por hora · 7 dias · mês), em colunas SVG, com:
    - marcas de evento (post, grupo aberto);
    - "agora";
    - horas futuras apagadas;
    - tooltip;
  - aba "Link e cliques".
- **Sem lib de gráfico:** um componente SVG com escala, eixo e rótulo direto. Teste de unidade da escala e do agrupamento.

### PR D — Entradas e saídas de verdade (DDL + webhook)

- Tabela `group_member_events (tenant_id, group_jid, participant, kind join|leave, occurred_at)`, com RLS no padrão `app.has_membership` e índices por `(tenant_id, occurred_at)` e `(tenant_id, group_jid, occurred_at)`.
- O webhook da Evolution grava nela em `group-participants.update` (add/remove).
- `app.campaign_activity` passa a contar entradas e saídas pelos eventos: "Novas pessoas" vira "Entraram" e "Saíram", e o gráfico ganha as barras divergentes.
- Conta a partir do deploy: não existe histórico para trás.

### PR E — Entrega do post por grupo

- **Rota** `GET /api/disparos/[id]/grupos`: `engine_commands` do disparo (`origin_id` + `origin_run_id`, filtro por tenant; o índice já existe) → status por grupo.
- **Tela:**
  - coluna "Post das HH:MM" na tabela de grupos;
  - progresso "27 de 40";
  - previsão de término com `etaDisparo`, que já existe e nenhuma tela usa.

## Fora desta série

- Busca Ctrl K e seletor de loja.
- Relâmpago por campanha (`flash_offers` sem campanha).
- Pedidos e meta por campanha (`orders.campaign_id` fica null porque `lead.source_campaign` é sempre null).
- Central de notificações em página.
- Início redesenhada: fica o conteúdo atual, no tema noite.

## Riscos

- **Cor fixa fora dos tokens** não inverte. São os hex soltos (`bg-[#25D366]`) e os aliases de compatibilidade (`aco`, `papel`, `poco`, ainda usados no detalhe da campanha). A revisão visual do PR A é o que pega isso.
- **`* { border-color: var(--color-line-200) }` fica fora de `@layer`.** Ao inverter `line-200`, todas as bordas invertem juntas, o que aqui ajuda.
- **O menu passa a buscar `/api/campanhas` em toda página.** Se pesar, vira provider.
- **Nome acessível é contrato de teste.** Toda troca de rótulo vai no mesmo PR que o teste.

## Verificação, por PR

- `tsc` (app + e2e), eslint nos arquivos tocados, `npm test`, vitrine-lint e `infra/scripts/verify-local.ps1`.
- Captura das telas afetadas em 1440, 1280, 1100 e 390.
- Card `painel-direcao-d` movido com a prova (PR e captura em produção).
