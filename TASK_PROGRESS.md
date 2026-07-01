# Objetivo

Corrigir vulnerabilidades de segurança críticas identificadas pelo AppSec Engineer + Backend Architect.
Depois avançar para feature gating, growth, e qualidade.

# Plano

## Sprint 1 — Segurança (P0)
1. Rotacionar Service Role Key no Supabase
2. Fix middleware Bearer validation (validar token contra Supabase Auth)
3. Rate limiting em auth routes (login, signup, account)
4. Security headers (CSP, X-Frame-Options, HSTS)

## Sprint 2 — Produto/Growth
5. Feature gating por plano
6. Email nurturing (welcome + 24h sem conectar)
7. Referral no painel + sidebar
8. Funnel dashboard no admin

## Sprint 3 — Qualidade
9. Remover stores legados não usados
10. UI de webhook config no painel
11. Testes automatizados (auth + billing)
12. Audit log de impersonation
13. Remover /painel/ds da sidebar em produção

---

# Checklist

## Sprint 1 — Segurança
- [ ] 1. Rotacionar Service Role Key (manual no Supabase Dashboard)
- [ ] 2. Fix middleware — validar Bearer token contra Supabase Auth
- [ ] 3. Rate limiting em /api/auth/* (5 tentativas/min login, 3 signup/min por IP)
- [ ] 4. Security headers no next.config

## Sprint 2 — Produto/Growth
- [ ] 5. Feature gating por plano
- [ ] 6. Email nurturing
- [ ] 7. Referral no painel
- [ ] 8. Funnel dashboard admin

## Sprint 3 — Qualidade
- [ ] 9. Limpar stores legados
- [ ] 10. UI webhook config
- [ ] 11. Testes automatizados
- [ ] 12. Audit log impersonation
- [ ] 13. Remover /painel/ds da sidebar

---

# Em andamento

(nenhum)

---

# Decisões

(nenhuma ainda)

---

# Arquivos alterados

(nenhum ainda)

---

# Próximos passos

Iniciar item 2 (fix middleware Bearer). Item 1 é manual no dashboard.
