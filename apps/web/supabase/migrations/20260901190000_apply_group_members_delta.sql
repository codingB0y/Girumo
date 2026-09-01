-- Contagem de membros viva: aplica o delta de uma entrada/saída de grupo.
--
-- Irmã de `apply_group_admin_delta`, com UMA diferença deliberada: não escreve
-- em `admins_counted_at`. Aquele carimbo responde "quando conferimos este grupo
-- contra o WhatsApp pela última vez", e um delta não é conferência — é notícia
-- de uma mudança. Movê-lo faria a tela dizer "conferido agora" para um número
-- que ninguém conferiu, que é exatamente o engano que a contagem viva pode
-- introduzir.
--
-- A soma acontece dentro do UPDATE porque ler-somar-escrever do app perderia
-- eventos concorrentes de um grupo movimentado — e grupo movimentado é a razão
-- de existir da função.
--
-- `admins_counted_at is not null` é o mesmo portão da irmã: sem uma conferência
-- anterior não há base sobre a qual somar, e o resultado seria um número
-- inventado a partir do default 0 da coluna.
create or replace function public.apply_group_members_delta(
  target_tenant_id uuid,
  target_group_id text,
  delta integer
)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  update public.groups
     set members = greatest(0, members + delta)
   where tenant_id = target_tenant_id
     and whatsapp_group_id = target_group_id
     and admins_counted_at is not null;
$function$;

-- Toda função nova de `public` nasce executável por `authenticated` (default
-- privilege do grantor). Esta escreve numa tabela com `tenant_id` e recebe o
-- tenant como argumento: deixá-la exposta seria dar a qualquer usuário logado
-- a chance de mexer na contagem de outro tenant.
revoke all on function public.apply_group_members_delta(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.apply_group_members_delta(uuid, text, integer) to service_role;
