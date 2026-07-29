-- Smoke da máquina de estado de automation_runs (camada 1 do executor).
--
-- Roda tudo num bloco anônimo, cria a própria fixture e limpa no fim: pode ser
-- executado em DEV sem deixar resíduo. Qualquer cenário que falhe levanta
-- exceção e aborta (nada é commitado pela metade).
--
-- Uso:  psql "$DATABASE_URL" -f infra/tests/automation-runs-smoke.sql
--
-- Provado em hubflow-dev (wfjuwogxaupyadwhvoxy) em 2026-07-29: 12/12 cenários.
--
-- Ajuste v_tenant se o tenant semente não existir no seu ambiente.

do $$
declare
  v_tenant  uuid := '00000000-0000-0000-0000-000000000001';
  v_auto    uuid;
  v_run     uuid;
  v_claimed integer;
  v_runs    integer;
  v_status  text;
  v_step    integer;
  v_ok      boolean;
begin
  -- fixture: automação de 2 passos (wait 5min -> message)
  insert into automations (tenant_id, name, trigger, enabled, steps)
  values (v_tenant, '__smoke_automation_runs', 'lead_entered', true,
          '[{"id":"s1","type":"wait","delay_minutes":5},
            {"id":"s2","type":"message","delay_minutes":0,"message":"oi"}]'::jsonb)
  returning id into v_auto;

  -- ---------- A) CHECK anti-DM rejeita destino que não é grupo ----------
  -- Esta é a garantia estrutural que se perdeu ao sair de `broadcasts`
  -- (só-grupo por construção) para `engine_commands` (payload aceita phone).
  begin
    insert into automation_runs (tenant_id, automation_id, target_group_jid)
    values (v_tenant, v_auto, '5511999999999@s.whatsapp.net');
    raise exception 'FALHOU A: CHECK anti-DM deixou passar um JID de DM';
  exception when check_violation then
    null; -- esperado
  end;

  -- ---------- B) run válido em grupo é aceito ----------
  insert into automation_runs (tenant_id, automation_id, target_group_jid, dedupe_key)
  values (v_tenant, v_auto, '120363000000000000@g.us', 'smoke:1')
  returning id into v_run;

  -- ---------- C) dedupe_key é único por tenant ----------
  begin
    insert into automation_runs (tenant_id, automation_id, target_group_jid, dedupe_key)
    values (v_tenant, v_auto, '120363000000000000@g.us', 'smoke:1');
    raise exception 'FALHOU C: dedupe_key duplicado foi aceito';
  exception when unique_violation then
    null; -- esperado
  end;

  -- ---------- D) claim pega o run vencido e crava o lease ----------
  select count(*) into v_claimed from app.claim_automation_runs(10);
  if v_claimed < 1 then raise exception 'FALHOU D: claim nao retornou o run'; end if;
  select status, lease_expires_at is not null into v_status, v_ok
    from automation_runs where id = v_run;
  if v_status <> 'running' or not v_ok then
    raise exception 'FALHOU D: esperado running com lease, veio % / lease=%', v_status, v_ok;
  end if;

  -- ---------- E) claim nao repega run com lease ativo ----------
  select count(*) into v_claimed from app.claim_automation_runs(10);
  if v_claimed <> 0 then raise exception 'FALHOU E: claim repegou run com lease ativo'; end if;

  -- ---------- F) advance agenda o proximo passo (wait 5min) ----------
  perform app.advance_automation_run(v_run, 1, now() + interval '5 minutes');
  select status, current_step into v_status, v_step from automation_runs where id = v_run;
  if v_status <> 'pending' or v_step <> 1 then
    raise exception 'FALHOU F: esperado pending/step1, veio %/%', v_status, v_step;
  end if;

  -- ---------- G) claim NAO pega passo agendado pro futuro ----------
  -- É isto que faz `delay_minutes` funcionar sem timer em memória.
  select count(*) into v_claimed from app.claim_automation_runs(10);
  if v_claimed <> 0 then raise exception 'FALHOU G: claim pegou passo agendado pro futuro'; end if;

  -- ---------- H) fencing: advance so funciona com lease (status running) ----------
  if (select id from app.advance_automation_run(v_run, 2, now())) is not null then
    raise exception 'FALHOU H: advance funcionou sem o lease (status pending)';
  end if;

  -- ---------- I) requeue devolve lease vencido ----------
  update automation_runs
    set status='running', lease_expires_at = now() - interval '10 minutes'
    where id = v_run;
  if app.requeue_stale_automation_runs('5 minutes') <> 1 then
    raise exception 'FALHOU I: requeue nao devolveu o run orfao';
  end if;
  select status, attempts into v_status, v_step from automation_runs where id = v_run;
  if v_status <> 'pending' or v_step <> 1 then
    raise exception 'FALHOU I: esperado pending/attempts=1, veio %/%', v_status, v_step;
  end if;

  -- ---------- J) finish(done) contabiliza na automacao ----------
  perform app.claim_automation_runs(10);
  perform app.finish_automation_run(v_run, 'done');
  select status into v_status from automation_runs where id = v_run;
  select total_runs into v_runs from automations where id = v_auto;
  if v_status <> 'done' or v_runs <> 1 then
    raise exception 'FALHOU J: esperado done/total_runs=1, veio %/%', v_status, v_runs;
  end if;

  -- ---------- K) nao re-finaliza run terminal (nao infla total_runs) ----------
  perform app.finish_automation_run(v_run, 'done');
  select total_runs into v_runs from automations where id = v_auto;
  if v_runs <> 1 then raise exception 'FALHOU K: total_runs inflou para %', v_runs; end if;

  -- ---------- L) status invalido é rejeitado ----------
  begin
    perform app.finish_automation_run(v_run, 'banana');
    raise exception 'FALHOU L: status invalido foi aceito';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- limpeza
  delete from automation_runs where automation_id = v_auto;
  delete from automations where id = v_auto;

  raise notice 'TODOS OS 12 CENARIOS PASSARAM';
end $$;

-- Confirma que a fixture não deixou resíduo.
select 'smoke ok'                                                             as resultado,
       (select count(*) from automations where name = '__smoke_automation_runs') as automacoes_residuais;
