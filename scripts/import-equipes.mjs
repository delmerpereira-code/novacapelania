import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { supabase } from './lib/supabase.mjs';

const path = process.env.EQUIPES_CSV_PATH;
const rows = parse(readFileSync(path), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const { data: membros, error: errMembros } = await supabase
  .from('membros')
  .select('id, matricula');
if (errMembros) throw errMembros;

const idPorMatricula = new Map(membros.map((m) => [m.matricula, m.id]));

let ok = 0;
let semLider = 0;

for (const row of rows) {
  const legadoId = (row.id || '').trim();
  const nome = (row.Equipe || '').trim();
  const matriculaLider = (row.Lider || '').trim();
  const liderId = idPorMatricula.get(matriculaLider) ?? null;

  if (matriculaLider && !liderId) {
    console.warn(`[aviso] ${legadoId} (${nome}): líder com matrícula "${matriculaLider}" não encontrado em membros -- lider_id fica NULL`);
    semLider++;
  }

  const registro = {
    legado_id: legadoId || null,
    nome,
    hospital: (row.Hospital || '').trim() || null,
    hora: (row.Hora || '').trim() || null,
    lider_id: liderId,
  };

  const { error } = await supabase.from('equipes').upsert(registro, { onConflict: 'nome' });
  if (error) {
    console.error(`[erro] ${legadoId} (${nome}): ${error.message}`);
  } else {
    ok++;
  }
}

console.log(`\nImport de Equipes concluído: ${ok} ok de ${rows.length} linhas (${semLider} sem líder resolvido).`);
