import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const matricula = process.argv[2];
const senha = process.argv[3];

if (!matricula || !senha) {
  console.error('Uso: node scripts/test-login.mjs <matricula> <senha>');
  process.exit(1);
}

console.log('1. Chamando a Edge Function de login...');
const resLogin = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ matricula, senha }),
});
const loginBody = await resLogin.json();
console.log(`   status ${resLogin.status}:`, loginBody);

if (!resLogin.ok) process.exit(1);

const { access_token } = loginBody;

console.log('\n2. Usando o token pra ler a própria linha em `membros` (deve funcionar)...');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${access_token}` } },
});
const { data: self, error: errSelf } = await supabase
  .from('membros')
  .select('id, matricula, nome_completo, perfil')
  .eq('matricula', matricula)
  .maybeSingle();
console.log('   resultado:', errSelf ? errSelf.message : self);

console.log('\n3. Tentando ler `senha_hash` diretamente (deve ser bloqueado pela revoke de coluna)...');
const { data: comSenha, error: errSenha } = await supabase
  .from('membros')
  .select('id, senha_hash')
  .eq('matricula', matricula)
  .maybeSingle();
console.log('   resultado:', errSenha ? `bloqueado como esperado -> ${errSenha.message}` : comSenha);

console.log('\n4. Lendo `equipes` (select liberado pra qualquer autenticado)...');
const { data: equipes, error: errEquipes } = await supabase.from('equipes').select('nome').limit(3);
console.log('   resultado:', errEquipes ? errEquipes.message : equipes);
