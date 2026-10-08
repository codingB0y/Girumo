-- Receita nova dos Fluxos do Instagram: "Comentou, confirma e entra no grupo"
-- (pergunta se a pessoa quer o link, espera o "sim" e manda o convite com botão).
-- Só a CHECK de ig_flows.recipe muda. O gate de drift não hasheia CHECK:
-- conferir nos dois bancos com pg_get_constraintdef depois de aplicar.

alter table public.ig_flows drop constraint if exists ig_flows_recipe_check;
alter table public.ig_flows add constraint ig_flows_recipe_check
  check (recipe in ('comment_invite', 'comment_confirm_invite', 'comment_follow_invite', 'dm_invite', 'blank'));
