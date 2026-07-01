# Contexto: HubFlow — Agentes de IA

## Quem sou
Sou o dev do HubFlow. Preciso que você atue como AI engineer focado em implementar agentes especializados para o SaaS.

## Stack
- Next.js 15 API routes (serverless functions)
- Anthropic API (Claude) — model padrão: claude-haiku-4-5-20251001
- Supabase (persistência de configs e execuções)
- TypeScript strict

## Arquivos que você mexe
- `src/lib/agents/` — implementação dos agentes
- `src/app/api/agents/` — API routes dos agentes
- Tabela `agent_configs` no Supabase (config por tenant)

## Catálogo dos 22 agentes

### Atendimento & Vendas
- SDR Agent — qualificação automática de leads
- Sales Agent — follow-up e nutrição
- Support Agent — atendimento L1 com escalação
- Onboarding Agent — guia novos usuários
- Retention Agent — detecta churn, atua proativamente

### Marketing & Comunicação
- Content Agent — gera conteúdo pra campanhas
- SEO Agent — otimiza textos pra busca
- Social Media Agent — agenda e cria posts
- Email Marketing Agent — cria sequências de email
- Copy Agent — copywriting pra ads e mensagens ✅ (IMPLEMENTADO)

### Operações & Dados
- Data Analyst Agent — análise de métricas
- Integration Agent — conecta APIs
- Workflow Agent — cria automações
- QA Agent — testa fluxos
- DevOps Agent — monitora infra

### Inteligência & Análise
- Sentiment Agent — análise de sentimento
- Intent Agent — classifica intenção
- Summary Agent — resume conversas
- Recommendation Agent — sugere ações
- Forecast Agent — previsões de vendas

### Segurança & Compliance
- Compliance Agent — verifica LGPD/GDPR
- Fraud Agent — detecta comportamentos suspeitos

## Copy Agent (referência de implementação)
Já implementado em `src/lib/agents/copy-agent.ts`:
- Input tipado (type, product, tone, price, discount, extraContext)
- System prompt especializado
- Parsing de resposta (3 variações)
- Fallback com templates estáticos quando sem API key
- Usa claude-haiku-4-5 pra custo baixo

## Decisões já tomadas
- Cada agente é stateless (recebe input, retorna output)
- Config por tenant na tabela agent_configs (enabled, config jsonb)
- Haiku como model default (custo), Sonnet pra agentes complexos (Forecast, Recommendation)
- Fallback obrigatório quando API indisponível
- ANTHROPIC_API_KEY como env var (nunca no client)

## Estado atual
- Copy Agent: ✅ completo e funcional
- Outros 21: apenas catálogo visual no admin, sem lógica
- Tabela agent_configs: SQL definido, precisa rodar no Supabase
- Prioridade de implementação: SDR → Content → Support → Sentiment → Forecast

## Regras
- Cada agente segue o padrão do Copy Agent (input tipado, output tipado, fallback)
- Máximo 1024 tokens por chamada (controle de custo)
- Nunca enviar dados sensíveis do tenant pra API externa sem sanitizar
- Rate limit por tenant (evitar abuso)
