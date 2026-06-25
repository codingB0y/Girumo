# Assistente simples de campanha

## Objetivo

Simplificar a experiencia de campanhas de grupos para um usuario leigo. A tela nao deve pedir que ele entenda cache, randomizador, limite de cliques ou configuracoes tecnicas. O sistema deve diagnosticar a campanha e mostrar o proximo passo em linguagem direta.

## Principio de UX

Cada campanha mostra uma mensagem principal e uma acao principal. O usuario deve bater o olho e saber se pode divulgar o link ou se precisa corrigir algo.

Estados:

- `ready`: "Tudo pronto para divulgar"
- `empty`: "Escolha grupos para liberar o link"
- `needs_invites`: "Corrija convites antes de divulgar"
- `full`: "Todos os grupos estao cheios"

Acoes:

- `ready`: copiar link da campanha
- `empty`: escolher grupos
- `needs_invites`: corrigir agora
- `full`: adicionar grupo

## Tela `/campanhas`

Os cards continuam mostrando metricas e link, mas devem priorizar:

- bloco de proximo passo com frase curta;
- uma acao principal visivel;
- detalhes tecnicos abaixo, com menos destaque.

As metricas continuam uteis, mas nao competem com a decisao principal.

## Tela `/campanhas/[id]`

Adicionar um bloco no topo chamado "Proximo passo" com:

- status em linguagem simples;
- explicacao de uma frase;
- botao principal correspondente;
- link de copiar quando a campanha estiver pronta.

A lista de grupos continua disponivel para resolver o problema, mas a pagina deve apontar primeiro o que falta.

## Fora do escopo

- Limite de cliques.
- Dias em cache.
- Pixel e integracoes.
- Randomizador configuravel.
- Grupos automaticos.
- Alteracoes no backend.

Esses itens devem ficar automatizados ou escondidos em uma area avancada futura.

## Criterios de aceite

- Usuario leigo consegue entender o estado da campanha sem ler metricas.
- Cada campanha tem uma acao primaria clara.
- `/campanhas` e `/campanhas/[id]` usam a mesma linguagem de diagnostico.
- Build, TypeScript e lint continuam passando.
