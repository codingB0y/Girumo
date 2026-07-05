# Engine Boot e Node Pinado — Design

## Objetivo

Eliminar a dependência implícita de `require(esm)` do Node 22.12+ e tornar o build Docker da engine
reproduzível, sem reescrever o núcleo anti-ban nem alterar seu comportamento.

## Decisão

A engine continuará CommonJS. Os quatro módulos internos hoje escritos como ESM (`anti-ban-queue`,
`warmup`, `group-guard` e `delivery-tracker`) passarão a exportar com `module.exports`. O Baileys, que é uma
dependência ESM, será carregado explicitamente com `import()` dentro de uma função assíncrona de bootstrap.
Assim, o formato de cada módulo deixa de depender da detecção automática do runtime.

O `Dockerfile` usará a mesma versão exata de Node e Alpine nos estágios `deps` e `runner`. A versão escolhida
deve ser Node 22 LTS e suportar as dependências registradas no lockfile; não dependeremos da tag móvel
`node:22-alpine`.

## Escopo

- Padronizar os módulos de produção e seus testes em CommonJS.
- Substituir o `require("@whiskeysockets/baileys")` por `await import(...)` em bootstrap explícito.
- Preservar o carregamento e a validação de ambiente antes de abrir o fluxo de conexão.
- Fixar a imagem Docker por versão completa de Node e variante Alpine.
- Adicionar um teste automatizado que rejeite sintaxe ESM nos módulos CommonJS e `require()` do Baileys.
- Atualizar roadmap e checklist somente após a verificação passar.

Ficam fora deste item: semântica do `/health`, integração do watchdog, execução non-root, limites de recursos,
multi-instância e migração integral para ESM.

## Fluxo de boot

1. O processo registra as rotas HTTP e valida o ambiente como hoje.
2. `bootstrap()` carrega o Baileys com `await import()`.
3. O módulo importado é normalizado para a API já consumida pela engine.
4. A conexão WhatsApp e os workers seguem o fluxo existente.
5. Uma rejeição no bootstrap é registrada e encerra o processo com código diferente de zero.

## Tratamento de falhas

Falhas ao importar o Baileys ou iniciar a engine não podem virar uma Promise rejeitada silenciosamente. O
entrypoint deve capturar a rejeição, registrar uma mensagem objetiva e definir saída não zero para que o
orquestrador reinicie o container.

## Testes e gate

O ciclo TDD começa com um teste estático que falha no estado atual ao encontrar `import`/`export` nos módulos
CommonJS, `require()` do Baileys e a tag Docker móvel. Depois da implementação, serão executados os testes da
engine, os checks de sintaxe, `npm run verify:local` na raiz e `git diff --check`.

## Critério de aceite

- Nenhum módulo do caminho de produção mistura CommonJS e ESM implicitamente.
- Baileys é carregado por `import()` explícito.
- Os dois estágios Docker usam a mesma tag Node completa e imutável quanto a major/minor/patch.
- Testes da engine e gate local passam sem alterar o comportamento anti-ban.
