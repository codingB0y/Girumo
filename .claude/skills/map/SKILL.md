---
name: map
description: Use quando o usuário disser "/map <módulo>" — mapeia como um módulo do HubFlow funciona via knowledge graph, listando arquivos e fluxo de dados.
---

Quando o usuário disser `/map <módulo>`:

1. Rode `kg_query("como funciona <módulo>, quais componentes, fluxo de dados", mode="local")`
2. Liste arquivos envolvidos
3. Mostre diagrama simplificado do fluxo
