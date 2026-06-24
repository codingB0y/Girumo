# Events

Eventos emitidos pela engine devem sempre carregar:

```txt
tenant_id
instance_id
event_id
type
payload
created_at
```

Nesta fase, `queues/supabase-command-worker.js` grava eventos em `public.engine_events` via RPC.

