-- ============================================================
-- Quadro: coluna "finalizado" (destino final).
--
-- Revisa a D3 do spec 2026-08-12-quadro-scrumban-design.md com o aval do Igor (23/09/2026):
-- o "Feito" que a D3 recusava volta, mas sem poder mentir — o banco cobra
--   1. prova datada (igual no_ar_verificado), carimbada por move_card com p_ref novo;
--   2. blocker vazio: card com trava não está finalizado.
-- Diferente de no_ar_verificado, finalizado não vence em 30 dias (a UI não dá selo).
-- Idempotente.
-- ============================================================

alter table public.board_features drop constraint if exists board_features_status_valido;
alter table public.board_features add constraint board_features_status_valido
  check (status in ('nao_existe','em_construcao','no_ar_nao_verificado','no_ar_verificado','quebrado','finalizado'));

alter table public.board_features drop constraint if exists board_features_finalizado_exige_prova;
alter table public.board_features add constraint board_features_finalizado_exige_prova
  check (status <> 'finalizado'
         or (evidence is not null and evidence_at is not null and blocker is null));

create or replace function public.move_card(
  p_key    text,
  p_status text,
  p_note   text,
  p_ref    text default null,
  p_actor  text default 'claude'
) returns public.board_features
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.board_features;
  v_com_prova boolean := p_status in ('no_ar_verificado', 'finalizado');
begin
  if p_note is null or btrim(p_note) = '' then
    raise exception 'move_card exige motivo em p_note';
  end if;

  -- Prova NOVA a cada verificação/finalização. Sem isto, um card verificado um dia
  -- carrega a prova velha para sempre e zera o relógio com evidência de meses atrás.
  if v_com_prova and (p_ref is null or btrim(p_ref) = '') then
    raise exception 'mover para % exige prova em p_ref', p_status;
  end if;

  perform set_config('app.board_note',  p_note, true);
  perform set_config('app.board_ref',   coalesce(p_ref, ''), true);
  perform set_config('app.board_actor',
                     case when p_actor = 'igor' then 'igor' else 'claude' end, true);

  update public.board_features
     set status      = p_status,
         evidence    = case when v_com_prova then p_ref else evidence end,
         evidence_at = case when v_com_prova then now() else evidence_at end
   where key = p_key
  returning * into v_row;

  if v_row.id is null then
    raise exception 'card % nao existe', p_key;
  end if;

  return v_row;
end;
$$;

-- create or replace não preserva ACL em todo banco: revogar de novo, sempre.
revoke all on function public.move_card(text, text, text, text, text)
  from public, anon, authenticated;
