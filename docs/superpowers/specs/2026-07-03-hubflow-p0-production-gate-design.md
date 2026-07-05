# HubFlow P0 Production Gate — Design

**Data:** 2026-07-03

**Status:** aprovado para planejamento

**Escopo:** segurança, isolamento multi-tenant, crons, configuração de produção, migrações e CI.

## Objetivo

Eliminar os bloqueadores P0 que permitem acesso cross-tenant, tornam jobs de produção inoperantes ou fazem o gate local reportar sucesso após uma falha. A entrega deve preservar os fluxos atuais da UI e evitar uma reescrita do backend.

## Fora de escopo

- Migração completa dos stores legados para Supabase/RLS.
- Engine multi-instância e supervisor por socket.
- Refatoração dos shells de frontend, design tokens ou Client Components.
- Cache, paginação ampla, Lighthouse e observabilidade avançada.
- Alterações externas nos painéis Vercel, Supabase, Stripe, GitHub ou Coolify.

## Princípios

1. Toda autenticação privilegiada falha fechada.
2. Todo dado operacional é resolvido com um tenant explícito.
3. Métodos exclusivos da engine não aceitam sessão de usuário como fallback.
4. Correções P0 são incrementais, testáveis e reversíveis.
5. Nenhum dado legado global é atribuído automaticamente a um tenant.

## Arquitetura

### 1. Política de acesso HTTP

Uma unidade pura de política classifica a combinação `pathname + method` como:

- pública;
- autenticação pública com rate limit;
- cron;
- exclusiva da engine;
- compartilhada entre engine e usuário;
- exclusiva de usuário autenticado.

Quando o header `x-engine-token` estiver presente em uma rota compatível com engine, ele deve ser validado antes de qualquer fallback. Token inválido retorna `401`. Métodos exclusivos da engine sem credenciais de engine retornam `403`, ainda que exista cookie ou Bearer de usuário.

O matcher do middleware passa a incluir `/api/auth/*`, permitindo que o rate limit de login, signup e account seja realmente executado. Rotas de cron chegam ao handler sem autenticação de usuário e validam seu próprio secret.

### 2. Contexto da engine

A engine recebe uma nova variável obrigatória em produção, `ENGINE_TENANT_ID`, e envia em cada chamada:

```text
x-engine-token: <secret compartilhado>
x-tenant-id: <UUID do tenant>
```

O app valida token, formato do tenant e existência de organização ativa antes de executar operações persistentes. O contexto da engine é independente de cookie e Supabase Bearer.

### 3. Contexto do usuário

Rotas de usuário continuam usando membership para resolver `tenantId` e `role`. Mutações sensíveis aplicam permissões no servidor. Esconder botões permanece uma conveniência de UX, nunca uma barreira de segurança.

Os primeiros pontos obrigatórios de enforcement são:

- administração da plataforma;
- billing e membros;
- configurações de conexão/webhook;
- criação, edição e exclusão de campanhas;
- configuração e remoção de conta;
- leitura de mídia por propriedade.

### 4. Estado tenant-scoped

No P0, `leads`, `optout` e `welcome` continuam usando arquivos, mas cada função exige `tenantId` e resolve um caminho isolado sob o diretório legado. Nenhuma API poderá chamar esses stores sem tenant.

`groups`, `session`, `activity` e mídia recebem tenant explicitamente:

- chamadas da engine usam `ENGINE_TENANT_ID`;
- chamadas da UI usam a membership;
- consultas Supabase incluem `tenant_id`;
- mídia valida o tenant codificado no path antes do download.

### 5. Migração dos arquivos globais

Será criado um comando operacional explícito que recebe o tenant de destino. O comando:

1. valida o UUID informado;
2. recusa executar se os arquivos tenant-scoped já existirem;
3. cria backup dos arquivos globais;
4. copia os dados para o diretório do tenant;
5. não apaga os originais automaticamente;
6. produz um resumo verificável.

Sem tenant informado, a migração não executa. Isso impede atribuição acidental de dados ao cliente errado.

### 6. Crons

`/api/cron/emails` e `/api/notifications/alerts` implementam `GET`, pois Vercel Cron usa HTTP GET. Ambos exigem:

```text
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` é obrigatório em produção. O job de alertas deixa de aceitar POST autenticado apenas por sessão comum. Falhas por tenant são registradas e acumuladas no resultado sem abortar o processamento dos demais tenants.

### 7. Secrets e ambiente

`AUTH_SECRET`, `ENGINE_TOKEN`, `ENGINE_TENANT_ID` e `CRON_SECRET` não têm defaults em produção. Defaults locais permanecem apenas em `development` e `test`.

Os templates Vercel e Coolify passam a documentar todas as variáveis necessárias, incluindo `RESEND_API_KEY`, `RESEND_FROM_EMAIL` e `PLATFORM_ADMIN_EMAILS`.

### 8. Migrações do banco

Uma única lista ordenada será a fonte de verdade para provisionamento Supabase. O script de aplicação e a documentação consumirão ou refletirão essa mesma lista. O gate verificará que todo SQL de migração/RLS/seed esperado aparece exatamente uma vez.

### 9. Gate local e CI

O scanner de secrets examina arquivos versionados pelo Git, ignorando `.env` locais não rastreados e exemplos deliberadamente permitidos. Encontrar um secret real retorna código diferente de zero.

`verify:local` valida `$LASTEXITCODE` após cada processo externo e encerra imediatamente na primeira falha. O gate inclui:

- validação JSON e templates de ambiente;
- scanner de secrets;
- testes automatizados;
- TypeScript;
- build Next.js;
- sintaxe/testes da engine;
- consistência da ordem de migrações.

Um workflow de pull request executa o mesmo gate e impede merge quando qualquer etapa falha.

## Tratamento de erros

| Condição | Resposta |
|---|---|
| Token de engine inválido | `401` |
| Engine sem tenant | `400` |
| Tenant da engine inválido/inativo | `403` |
| Usuário em método exclusivo da engine | `403` |
| Mídia pertencente a outro tenant | `404` |
| Cron sem secret válido | `401` |
| Secret obrigatório ausente em produção | falha de configuração/boot |
| Migração legada sem tenant ou com destino ocupado | recusa sem mutação |

## Estratégia de testes

O projeto ganha um comando `npm test` determinístico. Os testes cobrem:

- matriz de rotas e métodos para engine versus usuário;
- token inválido sem fallback;
- execução real do rate limit em `/api/auth`;
- resolução de caminhos por tenant e rejeição de tenant inválido;
- autorização administrativa, RBAC e propriedade de mídia;
- autenticação e método HTTP dos crons;
- falha de produção quando secrets obrigatórios estão ausentes;
- propagação de exit code no gate;
- completude e unicidade da ordem de migrações.

Cada mudança de comportamento segue RED → GREEN → refactor. Testes de unidade usam funções puras quando possível; testes de rota exercitam handlers com dependências injetáveis ou fakes mínimos, sem acessar produção.

## Rollout

1. Entregar política de acesso e testes sem alterar dados.
2. Configurar `ENGINE_TENANT_ID` e `CRON_SECRET` nos ambientes antes da promoção.
3. Executar a migração explícita de arquivos legados para o tenant correto.
4. Promover app e engine coordenadamente, mantendo versões anteriores disponíveis para rollback.
5. Rodar smoke de dois tenants, crons, engine e mídia.
6. Somente então alterar o GO/NO-GO.

## Critérios de aceite

- Usuário autenticado não acessa métodos exclusivos da engine.
- Token de engine inválido nunca cai para autenticação comum.
- Dois tenants não leem nem modificam leads, opt-outs, welcome, sessão, grupos ou mídia um do outro.
- Login/signup recebem `429` ao exceder o limite definido.
- Os dois crons respondem a GET autenticado e rejeitam secret inválido.
- Produção não inicia sem secrets obrigatórios.
- Scanner e gate retornam código não zero em falha real.
- CI executa e bloqueia PR com gate vermelho.
- Todos os SQLs definidos para provisionamento constam na ordem canônica.
- Build, TypeScript, testes web e testes da engine passam.
