-- ============================================================
-- Remove `release_engine_command` — função órfã, nunca chamada por ninguém
--
-- Contexto: ela nasceu numa tentativa de consumidor de `engine_commands` que foi
-- descartada. Aquele desenho guardava as janelas anti-ban EM MEMÓRIA no worker,
-- então precisava de um jeito de dizer "claimei, mas a instância está no teto do
-- minuto/hora/dia" — devolver o comando à fila sem contar tentativa, porque
-- `complete_engine_command(success => false)` incrementa `attempts` e gastaria as
-- 5 tentativas de um comando perfeitamente válido.
--
-- O que substituiu: a F4 (`20260729120000_engine_antiban_state.sql`) colocou o
-- anti-ban DENTRO do claim. `claim_send_commands` só devolve comando de número
-- pronto — não pausado, gap de espaçamento vencido, sob os caps e o warmup. O
-- worker nunca recebe um comando que não pode sair, então não existe o caso
-- "devolver sem contar tentativa". A função ficou sem chamador no mesmo dia.
--
-- Por que remover em vez de deixar quieta: ela é `security definer` sobre
-- `engine_commands` e reabre para `queued` uma linha em `processing`. Inofensiva
-- hoje (o `execute` está só com `service_role`), mas é superfície de ataque e
-- código morto que a próxima pessoa lendo o schema vai tentar entender.
--
-- A migração que a criou nunca entrou no `main` — o branch dela foi descartado —,
-- então dev e prod carregam uma função que o repositório não descreve. Por isso o
-- `if exists`: num ambiente novo, que nasce sem ela, isto é no-op.
-- ============================================================

drop function if exists public.release_engine_command(uuid, timestamptz);
drop function if exists app.release_engine_command(uuid, timestamptz);

-- Idempotente por construção: reaplicar não encontra nada e não falha.
