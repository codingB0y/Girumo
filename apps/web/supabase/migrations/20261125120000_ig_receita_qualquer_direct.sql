-- Receita nova dos Fluxos do Instagram: "Respondeu qualquer direct" (dm_any).
-- Só a CHECK de ig_flows.recipe muda. O gate de drift não hasheia CHECK:
-- conferir nos dois bancos com pg_get_constraintdef depois de aplicar.
-- Reversão: a CHECK sem 'dm_any' (só sem fluxo dela).

alter table public.ig_flows drop constraint if exists ig_flows_recipe_check;
alter table public.ig_flows add constraint ig_flows_recipe_check
  check (recipe in ('comment_invite', 'comment_confirm_invite', 'comment_follow_invite', 'comment_choose_group', 'dm_invite', 'dm_any', 'blank'));
