# Setup do Supabase DEV

Arquivos SQL para configurar um projeto Supabase DEV **do zero**.

## Passo a passo

### 1. Criar projeto no Supabase

- Acesse https://supabase.com/dashboard
- Clique "New Project"
- Nome: `hubflow-dev`
- Região: qualquer (preferencialmente próxima)
- Anote: URL, Anon Key, Service Role Key

### 2. Executar SQL no SQL Editor

Abra o SQL Editor do projeto e execute **na ordem**:

```
00_full_schema_dev.sql   → Enums, extensions, functions
01_tables.sql            → Todas as tabelas
02_indexes_triggers.sql  → Índices e triggers
03_rls_policies.sql      → RLS + helper functions
04_storage_rpc_seed.sql  → Storage, RPCs, planos base
```

> ⚠️ Execute um por vez. Se der erro, corrija antes de prosseguir.

### 3. Atualizar .env.local

Em `apps/web/.env.local`, substitua os placeholders:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto-dev.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_URL=https://seu-projeto-dev.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Subir app e rodar seed

```bash
# Terminal 1
cd apps/web && npm run dev

# Terminal 2
curl -X POST http://localhost:3000/api/admin/seed/dev
```

### 5. Login

- Email: `admin@localhost.dev`
- Senha: `DevOnly123!`

## Ordem de dependência

```
00 (enums/functions) → 01 (tables) → 02 (indexes) → 03 (RLS) → 04 (storage/seed)
```

Cada arquivo é idempotente (`IF NOT EXISTS`, `ON CONFLICT`).
Pode re-executar sem problemas.
