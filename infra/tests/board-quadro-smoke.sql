-- ============================================================
-- Smoke do quadro (20260812120000_board_quadro.sql).
-- Como rodar: contra o Supabase de DEV, via MCP execute_sql, ou
--   psql -d <db> -v ON_ERROR_STOP=1 -f infra/tests/board-quadro-smoke.sql
-- Usa a key fixa 'smoke-quadro' e limpa tudo no fim.
--
-- Em PRODUÇÃO: só logo depois de aplicar a migração, enquanto as tabelas estão vazias.
-- Foi assim que ele rodou em 12/08/2026 (6/6). Depois que houver card de verdade, não
-- rode: o passo 6 conta eventos órfãos no banco inteiro e daria falso negativo se algum
-- outro processo estiver mexendo ao mesmo tempo.
-- ============================================================
do $$
declare
  v_events integer;
  v_note   text;
  v_actor  text;
  v_erro   text;
begin
  delete from public.board_features where key = 'smoke-quadro';

  insert into public.board_features (key, title, area, status)
  values ('smoke-quadro', 'Smoke', 'Infra', 'nao_existe');

  -- 1) verificado sem prova é recusado pela constraint
  begin
    update public.board_features set status = 'no_ar_verificado' where key = 'smoke-quadro';
    raise exception 'FALHOU: aceitou verificado sem prova';
  exception when check_violation then
    null; -- esperado
  end;

  -- 2) move_card sem motivo é recusado
  begin
    perform public.move_card('smoke-quadro', 'em_construcao', '   ');
    raise exception 'FALHOU: aceitou move_card sem motivo';
  exception when raise_exception then
    get stacked diagnostics v_erro = message_text;
    if v_erro not like '%exige motivo%' then raise; end if;
  end;

  -- 3) move_card grava o evento com motivo e ator
  perform public.move_card('smoke-quadro', 'em_construcao', 'comecou', 'PR #999', 'igor');
  select count(*), max(note), max(actor) into v_events, v_note, v_actor
    from public.board_events e
    join public.board_features f on f.id = e.feature_id
   where f.key = 'smoke-quadro';
  if v_events <> 1 then raise exception 'FALHOU: esperava 1 evento, veio %', v_events; end if;
  if v_note  <> 'comecou' then raise exception 'FALHOU: motivo nao gravado (%)', v_note; end if;
  if v_actor <> 'igor'    then raise exception 'FALHOU: ator nao gravado (%)', v_actor; end if;

  -- 4) move_card para verificado carimba a prova e passa na constraint
  perform public.move_card('smoke-quadro', 'no_ar_verificado', 'verifiquei em prod', 'query X');
  if not exists (
    select 1 from public.board_features
     where key = 'smoke-quadro' and evidence = 'query X' and evidence_at is not null
  ) then
    raise exception 'FALHOU: prova nao foi carimbada';
  end if;

  -- 5) update cru gera evento com note nulo
  -- Reset das GUCs de transação: move_card (passos 3-4) setou app.board_note/ref/actor
  -- com set_config(nome, valor, true) -- escopo de TRANSACAO, nao de statement. Como
  -- este smoke inteiro roda dentro de uma unica transacao (um so bloco "do"), sem este
  -- reset o "update cru" abaixo herdaria o motivo deixado pelo move_card do passo 4.
  -- Em uso real cada chamada RPC abre transacao propria, entao isso nao ocorre -- aqui
  -- e so pra simular corretamente um update fora do move_card dentro do mesmo bloco.
  perform set_config('app.board_note',  '', true);
  perform set_config('app.board_ref',   '', true);
  perform set_config('app.board_actor', '', true);
  update public.board_features set status = 'quebrado' where key = 'smoke-quadro';
  if not exists (
    select 1 from public.board_events e
      join public.board_features f on f.id = e.feature_id
     where f.key = 'smoke-quadro' and e.to_status = 'quebrado' and e.note is null
  ) then
    raise exception 'FALHOU: update cru nao gerou evento sem motivo';
  end if;

  -- 6) delete do card leva os eventos junto
  delete from public.board_features where key = 'smoke-quadro';
  select count(*) into v_events from public.board_events
   where feature_id not in (select id from public.board_features);
  if v_events <> 0 then raise exception 'FALHOU: % evento(s) orfao(s)', v_events; end if;

  -- 7) verificado exige prova NOVA: nao da pra reciclar a prova antiga.
  -- Sem este guard, um card ja verificado um dia mantinha `evidence` para sempre;
  -- mover para quebrado e voltar para verificado sem p_ref passava na constraint
  -- E zerava evidence_at, exibindo "verificado ha 0 dias" com a prova de meses atras.
  insert into public.board_features (key, title, area, status, evidence, evidence_at)
  values ('smoke-quadro', 'Smoke', 'Infra', 'no_ar_nao_verificado',
          'prova velha', now() - interval '200 days');

  begin
    perform public.move_card('smoke-quadro', 'no_ar_verificado', 'reciclando a prova velha');
    raise exception 'FALHOU: aceitou verificado reciclando prova antiga';
  exception when raise_exception then
    get stacked diagnostics v_erro = message_text;
    if v_erro not like '%exige prova%' then raise; end if;
  end;

  perform public.move_card('smoke-quadro', 'no_ar_verificado', 'verifiquei agora', 'prova nova');
  if not exists (
    select 1 from public.board_features
     where key = 'smoke-quadro' and evidence = 'prova nova'
       and evidence_at > now() - interval '1 minute'
  ) then
    raise exception 'FALHOU: prova nova nao substituiu a antiga';
  end if;

  delete from public.board_features where key = 'smoke-quadro';

  raise notice 'SMOKE DO QUADRO: 7/7 OK';
end $$;
