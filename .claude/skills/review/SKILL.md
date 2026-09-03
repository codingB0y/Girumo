---
name: review
description: Use quando o usuário disser "/review" — roda lint, lê o diff contra main, checa contra decisões do knowledge graph e lista problemas por severidade.
---

Quando o usuário disser `/review`:

1. Rode `npm run web:lint`
2. Leia `git diff` vs main
3. Consulte `kg_query` pra verificar se alguma mudança contradiz decisões
4. Liste problemas com severidade (critical/warning/info)
5. Sugira fixes
