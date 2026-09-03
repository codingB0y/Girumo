---
name: kg
description: Use quando o usuário disser "/kg" — mostra o tamanho do knowledge graph do HubFlow (LightRAG), resumo geral do sistema, top entidades conectadas e decisões arquiteturais registradas.
---

Quando o usuário disser `/kg`:

1. Rode `kg_stats` pra ver o tamanho do grafo
2. Rode `kg_query("resumo geral do sistema e módulos principais", mode="global")`
3. Mostre top 10 entidades mais conectadas
4. Liste decisões arquiteturais registradas
