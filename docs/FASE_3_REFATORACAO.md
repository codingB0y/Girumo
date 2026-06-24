# Fase 3 - Refatoracao

## Objetivo Da Fase

Reorganizar o projeto para a arquitetura alvo sem recriar o sistema do zero e sem quebrar o app atual. A refatoracao deve ser incremental: primeiro estrutura, depois movimentacao controlada, depois adaptacoes de runtime.

## Estado Inicial

Antes desta fase:

- frontend/API atual em `hubflow-groups`;
- engine Baileys atual em `hubflow-engine`;
- estrutura alvo ainda inexistente;
- runtime data removido do indice Git e ignorado por `.gitignore`;
- documentos das Fases 1 e 2 criados.

## Estrutura Criada

```txt
apps/
  web/
packages/
  shared/
    constants/
    contracts/
    types/
infra/
  migrations/
  rls/
  scripts/
    seeds/
```

Observacao: a engine oficial continua em `hubflow-engine`. A pasta alvo `engine/` foi descartada neste momento para evitar duplicidade com a engine real existente.

## Estrategia

### Passo 1 - Scaffold Sem Quebra

Criar a estrutura alvo sem mover runtime existente.

Resultado esperado:

- `hubflow-groups` continua funcionando;
- `hubflow-engine` continua funcionando;
- novas pastas existem para guiar a migracao;
- nenhuma mudanca de comportamento em producao.

### Passo 2 - Mover Web Para `apps/web`

Mover `hubflow-groups` para `apps/web` em uma etapa separada.

Antes de mover:

- garantir que dados locais estao ignorados;
- confirmar que `.next`, `node_modules` e caches nao serao movidos;
- revisar imports com alias `@/`;
- validar `package.json`, `tsconfig`, `next.config` e scripts;
- rodar build/lint depois da movimentacao.

Resultado esperado:

- app Next.js continua buildando;
- estrutura antiga `hubflow-groups` deixa de ser fonte de verdade;
- docs registram a movimentacao.

### Passo 3 - Reestruturar `hubflow-engine`

Reestruturar a engine dentro de `hubflow-engine`, sem criar uma segunda pasta concorrente.

Antes de mover:

- garantir que `hubflow-engine/auth` esta fora do Git;
- separar codigo de runtime data;
- identificar arquivos que sao codigo e arquivos que sao estado;
- preservar scripts de start;
- validar boot local da engine.

Resultado esperado:

- engine inicia a partir de `hubflow-engine`;
- `sessions/` fica reservado para estrategia futura por `tenant_id + instance_id`;
- nenhum segredo/sessao e versionado.

### Passo 4 - Criar `packages/shared`

Extrair apenas contratos e tipos compartilhados.

Inicialmente:

- tipos de comandos da engine;
- tipos de eventos da engine;
- constantes de roles;
- constantes de planos;
- limites por plano.

Nao extrair componentes UI, logica de banco ou servicos nessa etapa.

### Passo 5 - Preparar Infra

Usar `infra/` para:

- migrations PostgreSQL;
- policies RLS;
- seeds de planos;
- scripts de manutencao.

As migrations reais entram na Fase 4.

## Regras Da Refatoracao

- Nao misturar movimentacao de pastas com troca de auth.
- Nao misturar movimentacao de pastas com criacao de schema.
- Nao alterar engine multi-instancia enquanto a engine ainda esta sendo movida.
- Nao mover `node_modules`, `.next`, caches ou dados locais.
- Toda mudanca estrutural deve ser registrada na auditoria.
- Toda etapa deve terminar com verificacao objetiva.

## Criterios De Aceite

Fase 3 sera considerada concluida quando:

- estrutura alvo estiver criada;
- app web estiver em `apps/web`;
- engine estiver reestruturada dentro de `hubflow-engine`;
- runtime data continuar fora do Git;
- docs atualizados;
- build/lint do app verificados, quando possivel;
- start da engine verificado, quando possivel.

## Status Atual

Status: iniciada.

Concluido nesta etapa:

- criado scaffold de `apps/`, `packages/` e `infra/`;
- adicionados READMEs de orientacao;
- adicionados `.gitkeep` para preservar diretorios vazios;
- movidos os arquivos rastreados do app web de `hubflow-groups` para `apps/web`;
- `hubflow-groups/data`, `hubflow-groups/node_modules` e `hubflow-groups/.next` ficaram fora da nova pasta;
- `hubflow-engine` permanece como engine oficial.

Proximo passo recomendado:

- ajustar scripts/workspace para operar a partir de `apps/web`;
- instalar dependencias em `apps/web`, se necessario;
- substituir o legado Prisma por Supabase Postgres com RLS antes de exigir build final;
- validar `lint` e `build` do app no novo caminho depois da remocao do Prisma legado.
