-- ============================================================
-- Habilitar Supabase Realtime nas tabelas do Squad OS
-- Rodar no SQL Editor do Supabase Dashboard
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE squads;
ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE memories;
ALTER PUBLICATION supabase_realtime ADD TABLE handoffs;
