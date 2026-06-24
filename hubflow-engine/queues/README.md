# Queues

A primeira fila multi-tenant usa Supabase Postgres:

```txt
public.engine_commands
public.engine_events
app.claim_engine_commands()
app.complete_engine_command()
app.record_engine_event()
```

Redis continua opcional e pode substituir esta camada quando throughput, locks distribuidos ou workers paralelos justificarem.

