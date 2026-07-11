import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { supabase } from './lib/supabase.mjs';

const path = process.env.CADASTRO_CSV_PATH;
const rows = parse(readFileSync(path), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const { data: membros, error: errMembros } = await supabase.from('membros').select('id, matricula');
if (errMembros) throw errMembros;
const membroIdPorMatricula = new Map(membros.map((m) => [m.matricula, m.id]));

const { data: equipes, error: errEquipes } = await supabase.from('equipes').select('id, nome');
if (errEquipes) throw errEquipes;

// Planilha antiga tem inconsistência de espaço (ex: NBSP U+00A0 em vez de
// espaço normal) entre o nome em Equipes e o nome referenciado em Cadastro.
// Normaliza só para fins de comparação -- o nome gravado em `equipes.nome`
// não muda.
const normalizaEspacos = (s) => s.replace(/\s+/g, ' ').trim();
const equipeIdPorNome = new Map(equipes.map((e) => [normalizaEspacos(e.nome), e.id]));

const vinculos = [];
const naoResolvidos = new Set();

for (const row of rows) {
  const matricula = (row.pin || '').trim();
  const membroId = membroIdPorMatricula.get(matricula);
  if (!membroId) continue;

  const nomesEquipes = (row.equipes || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const nome of nomesEquipes) {
    const equipeId = equipeIdPorNome.get(normalizaEspacos(nome));
    if (!equipeId) {
      naoResolvidos.add(nome);
      continue;
    }
    vinculos.push({ membro_id: membroId, equipe_id: equipeId });
  }
}

if (naoResolvidos.size) {
  console.warn(`[aviso] ${naoResolvidos.size} nomes de equipe em Cadastro não bateram com nenhuma equipe importada:`);
  for (const nome of naoResolvidos) console.warn(`  - "${nome}"`);
}

if (vinculos.length) {
  const { error } = await supabase
    .from('membro_equipe')
    .upsert(vinculos, { onConflict: 'membro_id,equipe_id', ignoreDuplicates: true });
  if (error) throw error;
}

console.log(`\nVínculos membro-equipe: ${vinculos.length} gravados de ${rows.length} linhas de Cadastro.`);
