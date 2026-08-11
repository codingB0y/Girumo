-- F1/PR-3: liga os links rastreados antigos à campanha por ID.
--
-- A atribuição de cliques era feita comparando a STRING do nome da campanha
-- (`link.campaignName === campanha.name`), então renomear a campanha zerava o
-- histórico dela (achado A6). `tracked_links.campaign_group_id` já existia e
-- nunca era escrito.
--
-- A criação de link agora grava o ID. Isto aqui é o backfill best-effort do que
-- ficou para trás: casa `metadata->>'campaignName'` com `campaign_groups.name`
-- DENTRO DO MESMO TENANT.
--
-- Só liga quando o nome casa com EXATAMENTE UMA campanha do tenant. Nome
-- ambíguo fica sem vínculo de propósito: link sem atribuição é um buraco
-- visível; link atribuído à campanha errada é um número mentiroso.
update tracked_links tl
set campaign_group_id = m.id
from (
  select cg.tenant_id, lower(btrim(cg.name)) as nome, min(cg.id::text)::uuid as id
  from campaign_groups cg
  group by cg.tenant_id, lower(btrim(cg.name))
  having count(*) = 1
) m
where tl.campaign_group_id is null
  and tl.tenant_id = m.tenant_id
  and lower(btrim(coalesce(tl.metadata->>'campaignName', ''))) = m.nome
  and coalesce(tl.metadata->>'campaignName', '') <> '';
