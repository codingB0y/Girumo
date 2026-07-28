# ProcessDueSchedules

**Type:** method

A function that identifies pending schedules past their execution time and queues associated broadcasts.<SEP>A function imported from @/lib/schedules-store to process due schedules when Supabase is not in use.<SEP>An asynchronous function that identifies and processes pending schedules that have reached their execution time.

## Neighbors
- [[routets|Route.ts]]
- [[broadcasts|Broadcasts]]
- [[schedules|Schedules]]
- [[schedules-storets|Schedules-store.ts]]
- [[schedulesjson|Schedules.json]]
- [[nextoccurrence|NextOccurrence]]

## Appears in
- `apps » web » src » lib » stores » schedules.ts`
- `apps » web » src » app » api » dispatch » pending » route.ts`
- `apps » web » src » lib » schedules-store.ts`
