# Campanha de Grupos 360

Data: 2026-06-25

## Objetivo

Melhorar o modulo de grupos do HUBFLOW usando a inspiracao de sistemas de captacao por campanhas, sem copiar a interface literalmente.

A primeira fatia deve transformar campanhas de grupos em um cockpit operacional: o lojista entende quais campanhas existem, quais grupos estao recebendo leads, quais estao cheios, quais estao sem convite e qual link deve divulgar.

## Referencias analisadas

As referencias mostram tres padroes uteis:

- Campanhas em cards com link, progresso de preenchimento, grupos, limite de membros, membros e cliques.
- Detalhe da campanha com grupos em cards, capacidade, link do WhatsApp, ultima sincronizacao e status operacional.
- Menus de acoes simples para editar, atualizar membros, revisar links, arquivar e operar grupos.

O HUBFLOW deve adotar a mecanica de produto, mas manter linguagem simples e a identidade light premium atual.

## Decisoes aprovadas

- Primeira fatia = lista de campanhas em cards operacionais + detalhe da campanha com foco em grupos + criacao/edicao melhorada.
- Configuracoes avancadas ficam para depois: limite de cliques, cache/dedupe, randomizador, pixel, pagina de entrada, pagina de espera, ajuda e automacoes em massa.
- A tela pode deixar espaco para uma area futura de configuracoes avancadas, mas sem implementar controles falsos.
- O foco inicial e grupos: disponibilidade, lotacao, convites e link mestre.

## Experiencia do usuario

### Lista de campanhas

`/campanhas` deixa de parecer apenas uma tela de configuracao e passa a ser a visao operacional das campanhas de grupos.

Cada campanha deve aparecer como card com:

- nome da campanha;
- loja;
- badge de campanha ativa quando aplicavel;
- link da campanha `/r/<slug>` com acao de copiar;
- barra de preenchimento usando `membros / limite total dos grupos`;
- metricas compactas:
  - grupos;
  - limite de membros;
  - membros;
  - cliques, quando houver dado real;
- botao principal `Ver campanha` ou `Grupos`;
- menu de acoes simples:
  - editar;
  - atualizar grupos;
  - revisar links;
  - arquivar ou excluir, mantendo a confirmacao de seguranca.

O topo da tela deve manter busca e `Nova campanha`. Filtros podem ficar simples nesta fatia.

### Criacao e edicao

Ao criar uma campanha, o usuario deve informar:

- nome da campanha;
- loja;
- grupos iniciais.

Criar uma campanha vazia deve continuar possivel apenas quando o usuario escolher explicitamente salvar sem grupos. O caminho recomendado deve ser criar ja com grupos selecionados.

Depois de salvar, a campanha criada deve expor imediatamente seu link mestre e permitir ativar a campanha.

### Detalhe da campanha

Criar a rota `apps/web/src/app/(app)/campanhas/[id]/page.tsx`.

O detalhe da campanha deve abrir com foco em grupos.

Topo:

- nome da campanha;
- loja;
- status ativa/inativa;
- link mestre com copiar;
- acao principal contextual:
  - `Escolher grupos`, se nao houver grupos;
  - `Configurar convites`, se houver grupos sem convite e nenhum disponivel;
  - `Copiar link da campanha`, se houver grupo disponivel;
  - `Adicionar grupos`, se todos os grupos estiverem cheios.

KPIs:

- cliques, quando houver dado real para o slug;
- entradas, quando houver dado real confiavel;
- saidas como indisponivel ou `em breve`, caso nao exista evento real;
- participantes;
- grupos;
- grupos cheios;
- grupos disponiveis.

O detalhe nao deve inventar numero. Dado indisponivel deve aparecer como `--`, `em breve` ou texto curto.

### Cards de grupos

Cada grupo da campanha deve mostrar:

- nome do grupo;
- status:
  - `Disponivel`: tem `inviteUrl` e `members < capacity * 0.95`;
  - `Cheio`: `members >= capacity * 0.95`;
  - `Sem convite`: nao tem `inviteUrl`;
  - `Desconectado` ou `Sem sync recente`, somente se houver dado real para sustentar isso;
- barra de capacidade;
- `members / capacity`;
- link de convite com copiar quando existir;
- ultima sincronizacao se houver esse campo;
- cliques por grupo quando houver dado real.

Se um grupo estiver sem convite, o card deve indicar a acao `Adicionar convite`.

## Arquitetura

Criar um helper para manter a regra fora dos componentes, por exemplo:

`apps/web/src/lib/campaign-groups-overview.ts`

Responsabilidades:

- receber uma campanha e a lista de grupos;
- resolver quais grupos pertencem a campanha;
- calcular limite total, membros totais, grupos cheios, grupos disponiveis e grupos sem convite;
- calcular `fillPct`;
- definir `operationalStatus`;
- definir `primaryAction`.

Tipos sugeridos:

```ts
type CampaignGroupStatus = "available" | "full" | "missing_invite" | "unknown";
type CampaignOperationalStatus = "empty" | "needs_invites" | "ready" | "full";
```

Reaproveitar dados existentes:

- `Campanha.slug`;
- `Campanha.groupIds`;
- `Group.members`;
- `Group.capacity`;
- `Group.inviteUrl`;
- `/r/<slug>`;
- `/api/campanhas`;
- `/api/groups`.

Se a contagem de cliques por campanha ja estiver acessivel via store/analytics existente, usa-la. Se nao estiver limpa para consumo, deixar o campo preparado e exibir indisponivel.

## Navegacao

Na primeira fatia, evitar excesso de abas. O detalhe pode mostrar uma navegacao compacta com:

- `Grupos` ativo;
- `Mensagens`, apontando para ofertas existentes quando fizer sentido;
- `Agendamentos`, apontando para agendamentos existentes;
- `Configurar`, marcado como futuro ou exibindo apenas informacoes basicas reais.

Nao implementar paginas completas de entrada, espera, integracao, ajuda, pixel ou acoes em massa nesta fatia.

## Linguagem

Usar termos de lojista:

- `Link da campanha`;
- `Grupo disponivel`;
- `Grupo cheio`;
- `Sem convite`;
- `Recebe novas revendedoras`;
- `Adicionar convite`;
- `Copiar link`;
- `Escolher grupos`.

Evitar na primeira camada:

- randomizador;
- URL cookie;
- deep link;
- redirect tecnico;
- protecao contra bloqueio;
- pixel como promessa central.

## Estados

### Sem campanhas

Mostrar estado vazio com CTA `Criar campanha de grupos`.

### Campanha vazia

Sem grupos selecionados.

CTA principal: `Escolher grupos`.

Texto: `A campanha precisa de grupos para receber novas revendedoras pelo link.`

### Campanha com grupos sem convite

Mostra os grupos, mas status `Sem convite`.

CTA principal: `Configurar convites`.

O link mestre pode existir, mas a tela deve avisar que ele ainda nao consegue enviar visitantes para grupos.

### Campanha pronta

Pelo menos um grupo tem `inviteUrl` e esta abaixo do limite de lotacao.

CTA principal: `Copiar link da campanha`.

### Campanha lotada

Todos os grupos com convite estao cheios.

CTA principal: `Adicionar grupos`.

Texto: `Novos visitantes podem ver aviso de grupos cheios ate liberar ou adicionar outro grupo.`

## Fora de escopo

- Limite de cliques editavel por campanha.
- Dias de cache/dedupe.
- Distribuicao/randomizador configuravel.
- Pixel e integracoes de anuncios.
- Pagina de entrada customizada.
- Pagina de espera customizada.
- Trancar/destrancar grupos em massa.
- Atualizar membros diretamente na engine.
- Promover/despromover administradores.
- Criar grupos automaticos pela engine.
- Redesign amplo de `/hoje`, `/groups`, `/campaigns` ou landing publica.

## Verificacao

Validar:

- `/campanhas` com estado vazio.
- `/campanhas` com uma campanha sem grupos.
- `/campanhas` com campanhas prontas e quase cheias.
- `/campanhas/[id]` para campanha vazia.
- `/campanhas/[id]` para campanha com grupos sem convite.
- `/campanhas/[id]` para campanha pronta.
- `/campanhas/[id]` para campanha cheia.
- Copia do link mestre.
- Criacao de campanha com selecao inicial de grupos.
- Responsividade mobile.
- Build e lint.

