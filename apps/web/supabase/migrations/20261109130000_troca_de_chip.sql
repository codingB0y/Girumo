-- 09/11/2026: troca de chip na mesma vaga.
--
-- A loja piloto trocou o chip da instância dos grupos em 05/11 às 13:49 (556282146218 → 556283145300),
-- horas depois de o WhatsApp banir o anterior. O número novo herdou tudo o que o antigo tinha conquistado:
-- numero_perfil 'antigo', aquecimento graduado, tetos de veterano (10/min, 111/h, 555/dia), 37 grupos. Para
-- o WhatsApp isso é a assinatura de fuga de restrição: outro número assume os mesmos grupos e posta no
-- mesmo ritmo no mesmo dia. A convalescença (20261105130000) de propósito não se aplica a chip trocado,
-- porque não é o número derrubado voltando — mas nada reiniciava o aquecimento.
--
-- public.registrar_troca_de_chip(tenant, instance, phone_novo): o webhook chama quando a sessão abre com
-- wuid diferente de instances.phone na instância dos grupos. Grava o telefone novo, numero_perfil = 'novo'
-- (app.instance_caps aplica a rampa de 7 dias mesmo com grupos de sobra), reinicia instance_send_state
-- (warmup_started_at = now(), warmup_graduated = false, pausa e falhas zeradas), apaga a convalescença da
-- instância (era do chip antigo), notifica a loja (antiban_chip_trocado) e registra em logs. Idempotente: o
-- mesmo chip de novo responde mesmo_chip e não repete nada; primeira conexão (phone nulo) e número do
-- atendimento não são troca. Função nova em public: a baseline de drift precisa ser regerada depois do
-- migrate-dev. Conferir nos DOIS bancos com infra/tests/troca-de-chip-check.sql.

create or replace function public.registrar_troca_de_chip(p_tenant uuid, p_instance uuid, p_phone_novo text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_inst public.instances;
  v_novo text := nullif(btrim(coalesce(p_phone_novo, '')), '');
  v_conv integer := 0;
begin
  select i.* into v_inst
    from public.instances i
   where i.id = p_instance
     and i.tenant_id = p_tenant
   for update;
  if not found then
    return jsonb_build_object('aplicado', false, 'motivo', 'instancia_desconhecida');
  end if;
  if v_inst.purpose is distinct from 'grupos' then
    return jsonb_build_object('aplicado', false, 'motivo', 'nao_e_numero_dos_grupos');
  end if;
  if v_novo is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'sem_telefone');
  end if;
  -- Primeira conexão da instância: não há chip anterior, não é troca. O aquecimento começa pelo caminho
  -- normal (record_send cria o estado) com o perfil que a loja declarou.
  if v_inst.phone is null then
    return jsonb_build_object('aplicado', false, 'motivo', 'primeira_conexao');
  end if;
  if v_inst.phone = v_novo then
    return jsonb_build_object('aplicado', false, 'motivo', 'mesmo_chip');
  end if;

  update public.instances
     set phone = v_novo,
         numero_perfil = 'novo',
         updated_at = now()
   where id = p_instance;

  insert into public.instance_send_state (
    instance_id, tenant_id, warmup_started_at, warmup_graduated, next_send_allowed_at, paused_until, consecutive_failures
  )
  values (p_instance, p_tenant, now(), false, now(), null, 0)
  on conflict (instance_id) do update set
    warmup_started_at = now(),
    warmup_graduated = false,
    next_send_allowed_at = now(),
    paused_until = null,
    consecutive_failures = 0,
    updated_at = now();

  -- A convalescença era do chip que caiu; o novo começa pelo aquecimento, não pela pausa do outro.
  delete from app.convalescenca where instance_id = p_instance;
  get diagnostics v_conv = row_count;

  insert into public.notifications (tenant_id, type, title, body, href)
  values (
    p_tenant,
    'antiban_chip_trocado',
    'Número trocado: aquecimento reiniciado',
    format('O WhatsApp ligado aos grupos mudou de %s para %s. Para o WhatsApp não tratar a troca como fuga de restrição, o número novo começa como número novo: o teto de mensagens por dia volta ao inicial e sobe sozinho a cada dia até o 7º.',
           v_inst.phone, v_novo),
    '/painel/conectar'
  );

  insert into public.logs (tenant_id, instance_id, level, event, message, metadata)
  values (
    p_tenant, p_instance, 'warn', 'antiban_chip_trocado',
    'Chip trocado na mesma instância: aquecimento reiniciado',
    jsonb_build_object('phone_antigo', v_inst.phone, 'phone_novo', v_novo, 'convalescenca_removida', v_conv > 0)
  );

  return jsonb_build_object('aplicado', true, 'phone_antigo', v_inst.phone, 'phone_novo', v_novo,
                            'convalescenca_removida', v_conv > 0);
end;
$$;

revoke all on function public.registrar_troca_de_chip(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_troca_de_chip(uuid, uuid, text) to service_role;
