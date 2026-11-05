-- 2026-11-05 — Rastreio do pedido, PR 8 · Parte 1: banco do Melhor Envio (spec
-- docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md §1.1 "Marcos do Melhor Envio" e §2.4; plano
-- docs/superpowers/plans/2026-10-29-rastreio-pedidos-pr8-melhor-envio.md, Parte 1). Depende do PR 1 do Rastreio
-- (20261031120000): tracking_orders e app.rastreio_etapa_pode_mudar.
--
-- A conexão OAuth da loja com o Melhor Envio (melhorenvio_connections), o state do OAuth com hash e uso único
-- (melhorenvio_oauth_states, cópia de bling_oauth_states) e a gravação do marco do Melhor Envio (entregue,
-- problema) sob a mesma trava de linha e a mesma regra "a etapa não volta" da rastreio_gravar_pedido
-- (public.rastreio_gravar_marco).
--
-- Tudo aqui é lido e escrito só pelo servidor (service_role): as duas tabelas têm RLS ligado e NENHUMA policy
-- nem grant para anon/authenticated. access_token_enc e refresh_token_enc chegam já selados pela store
-- (lib/security/secret-box.ts, AES-256-GCM): o banco nunca vê o token em texto. A função executa só como
-- service_role. Toda store filtra por tenant_id.
--
-- Idempotente (if not exists, or replace): o job pode morrer entre aplicar e registrar, e o próximo run reaplica
-- o arquivo. Muda a baseline (t|melhorenvio_connections, t|melhorenvio_oauth_states, f|rastreio_gravar_marco).
-- O gate de drift não vê RLS, ACL, CHECK nem corpo de função: conferir com
-- infra/tests/rastreio-melhor-envio-check.sql nos dois bancos.

-- 1) Tabelas e privilégios.

-- Uma conexão por loja. Desconectar apaga a linha (não existe status 'desconectada'). has_labels nulo = ainda
-- não se sabe se a conta tem etiqueta; first_pass_at nulo = a primeira passada (sem aviso) ainda não rodou;
-- last_check_at é a passada de 30 min, reivindicada por update condicional.
create table if not exists public.melhorenvio_connections (
  tenant_id          uuid primary key references public.organizations(id) on delete cascade,
  status             text not null default 'ativa' check (status in ('ativa', 'reautorizar')),
  access_token_enc   text not null,      -- selado (lib/security/secret-box.ts)
  refresh_token_enc  text not null,      -- selado (lib/security/secret-box.ts)
  expires_at         timestamptz not null,
  refresh_expires_at timestamptz not null,
  account_name       text,
  account_email      text,
  has_labels         boolean,
  first_pass_at      timestamptz,
  last_check_at      timestamptz,
  last_error         text,
  connected_by       uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.melhorenvio_connections is
  'Conexão OAuth da loja com o Melhor Envio (só leitura). Tokens selados (secret-box). Desconectar apaga a linha. Só service_role.';

create table if not exists public.melhorenvio_oauth_states (
  state_hash text primary key,
  tenant_id  uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

comment on table public.melhorenvio_oauth_states is
  'state do OAuth do Melhor Envio (sha256). Consumido por delete ... returning: o código de autorização nunca é trocado duas vezes. Só service_role.';

alter table public.melhorenvio_connections enable row level security;
alter table public.melhorenvio_oauth_states enable row level security;

revoke all on public.melhorenvio_connections, public.melhorenvio_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.melhorenvio_connections, public.melhorenvio_oauth_states
  to service_role;

-- 2) Gravar o marco do Melhor Envio num pedido já existente (o Melhor Envio não cria pedido). Mesma trava de
--    linha e mesma regra da rastreio_gravar_pedido; data própria (delivered_at / updated_at da etiqueta), nunca
--    no futuro. Devolve o mesmo formato da rastreio_gravar_pedido; null quando o pedido não é daquela loja.
create or replace function public.rastreio_gravar_marco(p_tenant uuid, p_order uuid, p_etapa text, p_em timestamptz,
                                                        p_status_raw text)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'app'
as $$
declare
  v_linha public.tracking_orders;
  v_em    timestamptz := least(coalesce(p_em, now()), now());
  v_mudou boolean;
begin
  if p_tenant is null or p_order is null then raise exception 'rastreio_gravar_marco: loja e pedido obrigatórios'; end if;
  if p_etapa is null or p_etapa not in ('entregue', 'problema') then
    raise exception 'rastreio_gravar_marco: % não é marco do Melhor Envio', p_etapa; end if;
  if p_status_raw is null or p_status_raw !~ '^melhorenvio:[a-z_]{1,30}$' then
    raise exception 'rastreio_gravar_marco: status_raw fora do formato'; end if;
  -- A mesma trava e a mesma regra do rastreio_gravar_pedido: quem chega depois espera e lê a etapa gravada.
  select * into v_linha from public.tracking_orders t where t.tenant_id = p_tenant and t.id = p_order for update;
  if not found then return null; end if;
  v_mudou := app.rastreio_etapa_pode_mudar(v_linha.etapa, p_etapa);
  if v_mudou then
    update public.tracking_orders t set etapa = p_etapa, etapa_at = v_em, status_raw = p_status_raw, updated_at = now(),
      events = t.events || jsonb_build_array(jsonb_build_object('etapa', p_etapa, 'at', v_em)),
      purge_after = case when p_etapa = 'entregue' then v_em + interval '90 days' end
    where t.id = v_linha.id;
  end if;
  return jsonb_build_object('id', v_linha.id, 'etapa', case when v_mudou then p_etapa else v_linha.etapa end,
    'etapa_anterior', v_linha.etapa, 'mudou', v_mudou, 'link_token', v_linha.link_token,
    'notices_stopped_at', v_linha.notices_stopped_at, 'tem_telefone', v_linha.buyer_phone is not null,
    'tem_email', v_linha.buyer_email_enc is not null);
end;
$$;

revoke all on function public.rastreio_gravar_marco(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.rastreio_gravar_marco(uuid, uuid, text, timestamptz, text) to service_role;
