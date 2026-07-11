import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { supabase } from './lib/supabase.mjs';

const path = process.env.CADASTRO_CSV_PATH;
const rows = parse(readFileSync(path), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const boolFromS = (v) => {
  const t = (v || '').trim().toUpperCase();
  if (t === 'S') return true;
  if (t === 'N' || t === 'NÃO') return false;
  return null;
};

const normalizaPerfil = (v) => {
  const t = (v || '').trim();
  if (/^lider$/i.test(t)) return 'Líder';
  if (/^membro$/i.test(t)) return 'Membro';
  return t || 'Membro';
};

const parseAniversario = (v) => {
  const t = (v || '').trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return { mes: null, dia: null };
  const mes = parseInt(m[1], 10);
  const dia = parseInt(m[2], 10);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return { mes: null, dia: null };
  return { mes, dia };
};

let ok = 0;
let falhas = 0;

for (const row of rows) {
  const legadoId = (row.id || '').trim();
  const matricula = (row.pin || '').trim();
  const senha = (row.senha || '').trim();

  if (!matricula || !senha) {
    console.warn(`[pular] ${legadoId || '(sem id)'}: sem matrícula ou senha`);
    falhas++;
    continue;
  }

  const { mes, dia } = parseAniversario(row.aniversario);
  const senhaHash = await bcrypt.hash(senha, 10);

  const registro = {
    legado_id: legadoId || null,
    matricula,
    senha_hash: senhaHash,
    foto_url: row.foto || null,
    nome_completo: (row.nome_comp || '').trim(),
    nome_social: (row.nome_soc || '').trim() || null,
    sexo: (row.sexo || '').trim() || null,
    telefone: (row.tel || '').trim() || null,
    rg: (row.rg || '').trim() || null,
    email: (row.email || '').trim() || null,
    declaracao_ministerio: boolFromS(row.decla_minist),
    lider_ga: (row.lider_ga || '').trim() || null,
    um_com_deus: boolFromS(row.um_com_deus),
    batizado: boolFromS(row.batizado),
    grupo: (row.grupo || '').trim() || null,
    culto: (row.culto || '').trim() || null,
    senib: (row.senib || '').trim() || null,
    aniversario_mes: mes,
    aniversario_dia: dia,
    faz_integracao: boolFromS(row.faz_integ),
    ativo: (row.sit || '').trim().toLowerCase() === 'ativo',
    observacoes: (row.obs || '').trim() || null,
    perfil: normalizaPerfil(row.perfil),
  };

  const { error } = await supabase.from('membros').upsert(registro, { onConflict: 'matricula' });
  if (error) {
    console.error(`[erro] ${legadoId} (matrícula ${matricula}): ${error.message}`);
    falhas++;
  } else {
    ok++;
  }
}

console.log(`\nImport de Cadastro concluído: ${ok} ok, ${falhas} falhas/pulados de ${rows.length} linhas.`);
