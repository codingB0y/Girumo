# Ativacao inicial hibrida

Data: 2026-06-24

## Objetivo

Melhorar a ativacao self-service do HUBFLOW para que uma conta nova chegue ao primeiro valor operacional no mesmo dia: WhatsApp conectado, grupos sincronizados e uma campanha ativa com grupos escolhidos.

Este escopo nao tenta levar o cliente ate venda, pedido ou funil completo. Essas acoes continuam importantes, mas entram depois que a operacao basica esta pronta.

## Decisoes aprovadas

- O primeiro valor de ativacao e A+B: WhatsApp conectado e grupos sincronizados, mais campanha ativa configurada.
- A experiencia sera hibrida: uma rota de setup guiada, pulavel, e um lembrete compacto no painel enquanto a ativacao nao estiver completa.
- A primeira versao sera leve, baseada em sinais reais ja existentes, mas estruturada para receber persistencia por tenant no futuro.

## Experiencia do usuario

Depois do cadastro, o usuario deve ir para `/setup` em vez de cair direto em `/hoje`.

A rota `/setup` apresenta tres etapas grandes:

1. Conectar WhatsApp.
2. Sincronizar grupos.
3. Criar e ativar campanha.

O usuario pode escolher `Ir para o painel` a qualquer momento. Pular o setup nao marca ativacao como concluida. Enquanto faltar algum passo, `/hoje` mostra um card compacto no topo com a proxima etapa e um CTA para continuar o setup.

Quando a ativacao estiver completa, `/setup` mostra sucesso com CTA para `/hoje`, e `/hoje` deixa de mostrar o card de ativacao inicial.

## Arquitetura

Criar uma unidade pequena para centralizar a regra de ativacao, por exemplo `src/lib/activation.ts`.

Essa unidade deve calcular um `ActivationState` a partir dos dados reais existentes:

- `whatsappConnected`: `getSession()` + `isLive(session)`.
- `groupsSynced`: `listGroups().length > 0`.
- `campaignActive`: existe uma campanha configurada com `groupIds.length > 0`. Se houver um `dz_campanha` valido disponivel no contexto, ele deve ter prioridade; caso contrario, qualquer campanha com grupos conta como ativacao inicial suficiente.
- `complete`: todos os sinais anteriores concluidos.
- `nextStep`: `connect_whatsapp`, `sync_groups`, `create_campaign` ou `done`.

Tanto `/setup` quanto `/hoje` devem consumir essa mesma regra, sem duplicar condicoes em componentes diferentes. A leitura server-side do cookie `dz_campanha` pode ser adicionada nessa unidade ou em helper dedicado; a primeira versao nao deve depender exclusivamente do helper cliente `getActiveCampanhaId()`.

## Componentes e rotas

Adicionar:

- `apps/web/src/app/(app)/setup/page.tsx`: rota focada de configuracao inicial.
- Um componente de setup, por exemplo `ActivationSetup`, para renderizar as etapas e a area da etapa ativa.
- Um componente compacto para `/hoje`, por exemplo `ActivationPrompt`, exibido somente quando `ActivationState.complete` for falso.

Ajustar:

- `apps/web/src/app/signup/page.tsx`: apos criar conta, redirecionar para `/setup`.
- `apps/web/src/components/onboarding-checklist.tsx`: separar ativacao inicial de primeiro resultado. O checklist atual mistura conexao/campanha com captacao/oferta/pedido; a nova ativacao deve cobrir so A+B.

## Estados

### Nada conectado

Etapa ativa: conectar WhatsApp.

Texto deve ser curto e operacional: a engine precisa estar online e o QR Code precisa ser escaneado.

CTAs:

- Principal: ir para configuracoes.
- Secundario: verificar novamente.

### WhatsApp conectado, sem grupos

Etapa ativa: sincronizar grupos.

Mostrar que os grupos aparecem quando a engine sincroniza os grupos onde o numero e admin. Nao inventar dados se a lista estiver vazia.

CTAs:

- Verificar novamente.
- Ver grupos.

### Grupos existem, sem campanha ativa

Etapa ativa: criar campanha.

Permitir criar campanha com nome, loja e selecao de grupos. Ao salvar, a campanha criada deve ficar ativa no cliente quando possivel e, no minimo, deve existir como campanha com grupos para satisfazer a ativacao inicial.

Campanha sem grupos nao conta como ativacao.

### Ativacao completa

Mostrar sucesso em `/setup` e CTA para `/hoje`.

Em `/hoje`, nao mostrar mais o card de ativacao inicial. A tela volta a priorizar painel de controle, funil, proxima acao comercial e rotina.

## Erros e limites

- Falha ao carregar dados de sessao, grupos ou campanhas deve mostrar estado de erro com `Tentar novamente`.
- Sem grupos sincronizados deve explicar a dependencia da engine e de permissao admin nos grupos.
- Pular setup nao persiste conclusao.
- A primeira versao nao precisa salvar etapa vista, setup pulado ou conclusao por usuario. A estrutura deve permitir adicionar essa persistencia depois sem trocar a regra central.

## Preparacao para persistencia futura

Quando o produto precisar persistir estado de onboarding por tenant, adicionar uma tabela/API para eventos como:

- `setup_seen_at`.
- `setup_skipped_at`.
- `setup_completed_at`.
- `last_setup_step`.

A interface atual deve continuar derivando conclusao de sinais reais. O estado persistido deve servir para experiencia e analytics, nao para fingir que a operacao esta pronta.

## Verificacao

Validar:

- Funcao de `ActivationState` para os quatro estados: nada conectado, conectado sem grupos, grupos sem campanha ativa, completo.
- Signup redireciona para `/setup`.
- `/setup` renderiza a etapa correta para o estado atual.
- `/hoje` mostra o prompt compacto somente enquanto a ativacao estiver incompleta.
- Build e lint passam.

## Fora de escopo

- Persistencia completa de onboarding por tenant.
- Checkout, billing ou plano escolhido.
- Primeira oferta enviada.
- Captacao da primeira revendedora.
- Registro do primeiro pedido.
- Redesenho amplo da home publica.
