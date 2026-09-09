---
name: decide
description: Use quando o usuário disser "/decide <texto>" — registra uma decisão arquitetural no knowledge graph do HubFlow via kg_insert_text.
---

Quando o usuário disser `/decide <texto>`:

1. Insira no grafo via `kg_insert_text(texto, source="decisao-YYYY-MM-DD")`
2. Confirme o que foi inserido
3. Sugira `rag export --clean` se relevante pro Obsidian
