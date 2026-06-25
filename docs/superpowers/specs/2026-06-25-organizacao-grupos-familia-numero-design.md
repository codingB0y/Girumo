# Organizacao de grupos por familia e numero

## Objetivo

Permitir que o lojista organize grupos com nomes internos simples, sem alterar o nome real do WhatsApp. Isso reduz o risco de selecionar grupos errados no assistente de campanha.

## Modelo

Cada grupo pode ter dois campos opcionais:

- `displayNameBase`: nome interno da familia, como `Promocoes`, `VIP`, `Atacado`.
- `displayNumber`: numero da sequencia, como `1`, `2`, `3`.

Nome exibido no SaaS:

- com base e numero: `Promocoes 1`
- com base sem numero: `Promocoes`
- sem base: nome real sincronizado do WhatsApp

O nome real do WhatsApp continua preservado e aparece como contexto secundario.

## UX

Na tela `/groups`, cada grupo ganha uma acao simples para editar:

- Nome interno
- Numero

Na selecao de grupos da campanha e no detalhe da campanha, o SaaS passa a exibir o nome interno como principal e o nome real do WhatsApp como referencia secundaria quando existir nome interno.

## Fora do escopo

- Criacao automatica de novos grupos.
- Tags/categorias avancadas.
- Arquivar grupos.
- Regras de auto-grow por familia.

Esses recursos ficam mais faceis depois que familia e numero existirem.

## Criterios de aceite

- Usuario consegue salvar `Promocoes` + `1` em um grupo.
- O grupo aparece como `Promocoes 1` no SaaS.
- O nome real do WhatsApp nao e perdido.
- Sync da engine preserva os campos internos.
- Campanhas usam o nome interno nas listas de grupos.
