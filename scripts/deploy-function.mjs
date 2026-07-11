import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const nomeFuncao = process.argv[2];
if (!nomeFuncao) {
  console.error('Uso: node scripts/deploy-function.mjs <nome-da-function>');
  process.exit(1);
}

const { SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN, JWT_SECRET } = process.env;
if (!SUPABASE_PROJECT_REF || !SUPABASE_ACCESS_TOKEN || !JWT_SECRET) {
  console.error('Defina SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN e JWT_SECRET no .env.');
  process.exit(1);
}

const bin = join(
  process.cwd(),
  'node_modules', '@supabase',
  process.platform === 'win32' ? 'cli-windows-x64/bin/supabase.exe' : 'cli-linux-x64/bin/supabase',
);
const env = { ...process.env };

console.log('-> Configurando secret JWT_SECRET na Edge Function...');
execFileSync(
  bin,
  ['secrets', 'set', '--project-ref', SUPABASE_PROJECT_REF, `JWT_SECRET=${JWT_SECRET}`],
  { stdio: 'inherit', env },
);

console.log(`\n-> Fazendo deploy da function "${nomeFuncao}"...`);
execFileSync(
  bin,
  ['functions', 'deploy', nomeFuncao, '--project-ref', SUPABASE_PROJECT_REF, '--no-verify-jwt', '--use-api'],
  { stdio: 'inherit', env },
);

console.log('\nDeploy concluído.');
