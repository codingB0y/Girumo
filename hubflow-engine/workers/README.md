# Workers

Workers devem ser pequenos e isolados por responsabilidade:

```txt
connection-worker
message-worker
campaign-worker
sync-worker
```

A primeira implementacao adicionada nesta fase e o consumidor de comandos Supabase em `queues/supabase-command-worker.js`.

