-- 2026-11-03 - Orçamento de @todos: 2 → 0 posts por número por 24 h.
--
-- Por quê: a loja piloto (Moda kids do Sul) teve o número restringido pelo WhatsApp em 23/10 e em
-- 03/11/2026. Nos 30 dias anteriores a 03/11, 2.164 das 2.730 mensagens enviadas (79 %) marcavam
-- todos os participantes; o orçamento de 2 posts/dia (20261023120000) ainda deixava sair 1 post por
-- dia marcando ~6,4 mil pessoas, e o último post antes da 2ª restrição (02/11 14:16) era um deles.
-- Cada post custa 20-85 saídas voluntárias nas 3 h seguintes, com @todos no topo da faixa, e a tela
-- de sair oferece "Sair e denunciar". Decisão do Igor em 03/11: zerar.
--
-- O que muda: só o corpo de app.mention_all_daily_budget() (select 2 → select 0). Com 0, o predicado
-- do claim (`count(posts com @todos nas 24 h) >= app.mention_all_daily_budget()`, corpo de
-- 20261023120000, inalterado) é sempre verdadeiro para post novo: todo post com mentionAll sai SEM a
-- marcação e com payload.mentionAllCortado = true. A regra "post que já começou marcando segue
-- marcando nos grupos restantes" continua (é do claim, não do orçamento). O botão @todos segue na
-- tela; esconder ou desabilitar é PR da lane Frontend.
--
-- Não muda a baseline (o gate de drift não vê corpo de função). Conferir nos DOIS bancos com
-- infra/tests/antiban-saidas-e-todos-check.sql (expectativas atualizadas neste PR). Idempotente.

-- Trava: o corpo atual tem que ser o de 20261023120000 (select 2) ou o desta migração (select 0,
-- reaplicar passa). Normalização igual à de 20261023120000 (prosrc sem comentário de linha, espaço
-- reduzido a um, btrim). Qualquer outro corpo = correção aplicada à mão: parar e olhar.
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.mention_all_daily_budget()');
  if v_src is null then
    raise exception 'mention_all_budget_zero: app.mention_all_daily_budget não existe neste banco (falta 20261023120000)';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('8222fbf4485048374b8751d04bb6c90a', 'b4f398cba834c4637bf9315efdb95cb9') then
    raise exception 'mention_all_budget_zero: o corpo de app.mention_all_daily_budget neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração e aplique de novo.';
  end if;
end $$;

create or replace function app.mention_all_daily_budget()
returns integer
language sql
immutable
set search_path to 'public', 'app'
as $$ select 0 $$;

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.mention_all_daily_budget() from public, anon, authenticated;
grant execute on function app.mention_all_daily_budget() to service_role;
