---
name: status
description: Use quando o usuário disser "/status" — mostra tamanho do knowledge graph, git status resumido, TODOs/FIXMEs no código e se o build passa.
---

Quando o usuário disser `/status`:

1. Rode `kg_stats`
2. Mostre git status resumido
3. Liste TODOs/FIXMEs no código (`grep -r`)
4. Verifique se build passa
