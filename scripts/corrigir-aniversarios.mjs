import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { supabase } from './lib/supabase.mjs';

// A planilha antiga usava D/M (dia/mês, padrão brasileiro) na maioria das
// linhas, mas 15 registros foram digitados como M/D por engano (só
// detectável porque o "mês" resultante em D/M seria inválido, >12) -- ver
// README pra mais detalhes. Essa correção reprocessa a partir do CSV
// original com a regra certa, em vez de confiar no que import-cadastro.mjs
// gravou errado (mes/dia invertidos) na primeira vez.
const cadastroPath = process.env.CADASTRO_CSV_PATH || './data/cadastro.csv';
const rows = parse(readFileSync(cadastroPath), { columns: true, skip_empty_lines: true, relax_column_count: true });

let corrigidos = 0;
let mantidosComoEstavam = 0;
let semAniversario = 0;

for (const r of rows) {
  const t = (r.aniversario || '').trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) { semAniversario++; continue; }

  const primeiro = parseInt(m[1], 10);
  const segundo = parseInt(m[2], 10);

  let mes, dia;
  if (segundo >= 1 && segundo <= 12) {
    // D/M válido: primeiro=dia, segundo=mês
    dia = primeiro;
    mes = segundo;
    corrigidos++;
  } else {
    // segundo >12 não pode ser mês -- essa linha foi digitada M/D na
    // planilha antiga; mantém a leitura que já estava no banco
    mes = primeiro;
    dia = segundo;
    mantidosComoEstavam++;
  }

  const { error } = await supabase
    .from('membros')
    .update({ aniversario_mes: mes, aniversario_dia: dia })
    .eq('matricula', (r.pin || '').trim());
  if (error) console.error(`[erro] ${r.pin}: ${error.message}`);
}

console.log('\nCorreção de aniversários concluída:');
console.log('  corrigidos (invertidos pra D/M):', corrigidos);
console.log('  mantidos como estavam (M/D genuíno, mês>12 seria inválido):', mantidosComoEstavam);
console.log('  sem aniversário na planilha:', semAniversario);
