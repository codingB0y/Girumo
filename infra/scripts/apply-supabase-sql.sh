#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "Uso: ./infra/scripts/apply-supabase-sql.sh '<DATABASE_URL>'"
  exit 1
fi

DATABASE_URL="$1"

for file in \
  infra/migrations/202606240001_base_schema.sql \
  infra/rls/202606240002_rls_policies.sql \
  infra/seeds/202606240003_seed_plans.sql \
  infra/rls/202606240004_storage_policies.sql \
  infra/migrations/202606240005_engine_rpc.sql \
  infra/migrations/202606240006_membership_invites.sql
do
  echo "Aplicando $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "SQL Supabase aplicado com sucesso."
