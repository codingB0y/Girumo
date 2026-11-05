-- Reentrega do mesmo direct não soma não lida de novo (PR 2a-2): ig_conversations guarda o id da última mensagem
-- recebida e ig_conversation_touch ganha p_message_id; evento do robô passa a ser único por (conversa, mensagem).
-- Conferir com infra/tests/ig-conversations-check.sql. Reversão: voltar a função anterior, drop da coluna e do índice.

set lock_timeout = '5s';

alter table public.ig_conversations add column if not exists last_in_message_id text;

-- NULL continua livre: evento sem id de mensagem (waiting, paused...) não conflita.
create unique index if not exists ig_conversation_events_msg_uniq
  on public.ig_conversation_events (conversation_id, zernio_message_id);

drop function if exists public.ig_conversation_touch(uuid, text, text, uuid, text, text, text, timestamptz, text, text);

create or replace function public.ig_conversation_touch(
  p_tenant uuid,
  p_zernio_conversation_id text,
  p_ig_user_id text,
  p_ig_account_id uuid,
  p_username text,
  p_display_name text,
  p_direction text,
  p_at timestamptz,
  p_preview text,
  p_status text,
  p_message_id text default null
)
returns public.ig_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz := least(coalesce(p_at, now()), now() + interval '5 minutes');
  v_row public.ig_conversations;
begin
  -- Mesma mensagem recebida de novo (reentrega da Zernio): devolve a linha sem mexer em nada.
  -- ponytail: só guarda o último id; reentrega de mensagem mais velha depois de uma nova conta de novo (aceitável).
  if p_direction = 'in' and p_message_id is not null then
    select * into v_row from public.ig_conversations c
     where c.tenant_id = p_tenant and c.zernio_conversation_id = p_zernio_conversation_id
       and c.last_in_message_id = p_message_id;
    if found then return v_row; end if;
  end if;

  insert into public.ig_conversations as c
    (tenant_id, zernio_conversation_id, ig_user_id, ig_account_id, username, display_name,
     status, unread_count, last_message_at, last_direction, last_preview, last_in_message_id)
  values (
    p_tenant, p_zernio_conversation_id, p_ig_user_id, p_ig_account_id, nullif(p_username, ''), nullif(p_display_name, ''),
    coalesce(p_status, 'open'),
    case when p_direction = 'in' then 1 else 0 end,
    v_at, p_direction, left(p_preview, 200),
    case when p_direction = 'in' then p_message_id end
  )
  on conflict (tenant_id, zernio_conversation_id) do update set
    ig_user_id      = p_ig_user_id,
    ig_account_id   = coalesce(p_ig_account_id, c.ig_account_id),
    username        = coalesce(nullif(p_username, ''), c.username),
    display_name    = coalesce(nullif(p_display_name, ''), c.display_name),
    status          = coalesce(p_status, c.status),
    unread_count    = c.unread_count + case when p_direction = 'in' then 1 else 0 end,
    -- A última mensagem só anda para frente: aviso atrasado não desfaz a lista.
    last_direction  = case when c.last_message_at is null or v_at >= c.last_message_at then p_direction else c.last_direction end,
    last_preview    = case when c.last_message_at is null or v_at >= c.last_message_at then left(p_preview, 200) else c.last_preview end,
    last_message_at = greatest(c.last_message_at, v_at),
    last_in_message_id = case when p_direction = 'in' and p_message_id is not null then p_message_id else c.last_in_message_id end
  returning c.* into v_row;
  return v_row;
end;
$$;

revoke all on function public.ig_conversation_touch(uuid, text, text, uuid, text, text, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.ig_conversation_touch(uuid, text, text, uuid, text, text, text, timestamptz, text, text, text) to service_role;
