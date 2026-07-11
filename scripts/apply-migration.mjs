import 'dotenv/config';
import { readFileSync } from 'node:fs';

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/apply-migration.mjs supabase/migrations/000X_nome.sql');
  process.exit(1);
}

const { SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN } = process.env;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN) {
  console.error('Defina SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN no .env.');
  process.exit(1);
}

const sql = readFileSync(arquivo, 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
console.log('status', res.status);
console.log(body);
if (!res.ok) process.exit(1);
