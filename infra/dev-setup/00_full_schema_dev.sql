-- ============================================================
-- HUBFLOW — SCHEMA COMPLETO PARA PROJETO SUPABASE DEV
-- ============================================================
-- Executar INTEIRO no SQL Editor do Supabase DEV.
-- NÃO executar em produção!
--
-- Ordem:
--   1. Extensions + schema + functions
--   2. Tabelas base
--   3. Tabelas adicionais (groups, broadcasts, etc.)
--   4. Tabelas Squad OS
--   5. RLS policies
--   6. Storage
--   7. Seed de planos
-- ============================================================

-- =========================
-- 1. EXTENSIONS + FUNCTIONS
-- =========================

create extension if not exists "pgcrypto";
create schema if not exists app;

-- Enums
do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'operator');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.organization_status as enum ('active', 'suspended', 'canceled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('free', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.instance_status as enum ('pending', 'qr', 'connected', 'disconnected', 'blocked', 'error');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.funnel_status as enum ('draft', 'active', 'paused', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_status as enum ('draft', 'queued', 'running', 'paused', 'sent', 'failed', 'canceled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_direction as enum ('inbound', 'outbound');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.message_status as enum ('queued', 'sending', 'sent', 'delivered', 'read', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.upload_kind as enum ('media', 'document', 'avatar', 'campaign');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.log_level as enum ('debug', 'info', 'warn', 'error');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.engine_command_status as enum ('queued', 'processing', 'done', 'failed', 'canceled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.engine_command_failure_kind as enum ('retryable', 'permanent', 'uncertain');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.engine_event_status as enum ('received', 'processed', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.group_engagement as enum ('alto', 'medio', 'baixo');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.broadcast_status as enum ('draft', 'queued', 'running', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_message_type as enum ('text', 'image', 'video', 'audio', 'file', 'poll');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_message_status as enum ('draft', 'scheduled', 'queued', 'running', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.schedule_recurrence as enum ('none', 'daily', 'weekly');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.schedule_status as enum ('pending', 'running', 'done', 'failed');
exception when duplicate_object then null;
end $$;

-- Helper functions
create or replace function app.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function app.set_organization_tenant_id()
returns trigger language plpgsql as $$
begin
  if new.id is null then new.id = gen_random_uuid(); end if;
  if new.tenant_id is null then new.tenant_id = new.id; end if;
  if new.created_by is null then new.created_by = auth.uid(); end if;
  return new;
end;
$$;
