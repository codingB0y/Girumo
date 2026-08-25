# Squad OS — arquivado em 25/08/2026

Módulo de "equipe de IA interna" criado em **01/07/2026**: 8 agentes, 8 squads,
telas de missões/decisões/conhecimento. Removido do código e do banco em 25/08.

## Por que foi aposentado

Três medições, todas em produção:

1. **Nenhuma linha nova em 55 dias.** Nas 4 tabelas com conteúdo, `min(created_at)`
   e `max(created_at)` são o mesmo dia — 01/07/2026. É a carga inicial e nada
   depois. As outras 7 tabelas nunca tiveram uma linha.
2. **Nenhuma porta de entrada.** `grep` por `href="/painel/squad-os` em todo
   `apps/web/src` não devolveu nada fora do próprio módulo: nem sidebar, nem menu,
   nem botão. As 7 telas só eram alcançáveis digitando a URL.
3. **Nunca ganhou motor.** As telas liam dados; nada fazia os agentes trabalharem.

Manter custaria escrever e manter migrações para 11 tabelas sem uso, e a
alternativa — deixar como estava — obrigava a manter 12 exceções no gate de drift
de schema, o que enfraquece o alarme para todo o resto do projeto.

## O que está guardado aqui

- `schema.sql` — DDL das 12 tabelas exatamente como estavam em produção.
- `dados.json` — as 24 linhas que existiam (8 agents, 8 squads, 5 missions,
  3 decisions). As outras tabelas estavam vazias.

## Como restaurar

1. Rode `schema.sql` no banco.
2. Insira `dados.json` (cada chave do objeto é o nome da tabela).
3. Recupere as telas e rotas do Git: elas foram removidas num commit só, então
   `git revert` do commit que removeu traz tudo de volta.

## O que NÃO se perde com o arquivamento

As 3 decisões arquiteturais registradas em `decisions` — Next.js App Router,
pricing freemium e "Supabase RLS como isolamento multi-tenant" — já estão no
`CLAUDE.md` e no grafo de conhecimento, que são as fontes que o time consulta.
