# Funnel Events

**Type:** data

Records capturing specific user journey actions, such as signups or payments, linked to tenants and individual users.<SEP>A database table tracking specific user interactions, such as the WhatsApp connection status.<SEP>A database table containing funnel event records cleared during the database reset.<SEP>A database table storing event logs related to funnels.

## Neighbors
- [[supabase|Supabase]]
- [[tenants|Tenants]]
- [[email-notification-system|Email Notification System]]
- [[reset-route|Reset Route]]

## Appears in
- `apps » web » src » app » api » admin » seed » route.ts`
- `apps » web » src » app » api » cron » emails » route.ts`
- `apps » web » src » app » api » admin » dev-tools » reset » route.ts`
- `apps » web » src » app » api » admin » tenants » bulk » route.ts`
