import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { supabase } from './lib/supabase.mjs';

const SEMANAS_ALVO = (process.env.SEMANAS_ALVO || '26,27,28').split(',').map((s) => s.trim());

const decisoesPath = process.env.DECISOES_CSV_PATH || './data/decisoes.csv';
const integracaoPath = process.env.INTEGRACAO_CSV_PATH || './data/integracao.csv';

const decisoes = parse(readFileSync(decisoesPath), { columns: true, skip_empty_lines: true, relax_column_count: true });
const integracoesCsv = parse(readFileSync(integracaoPath), { columns: true, skip_empty_lines: true, relax_column_count: true });

const normalizaEspacos = (s) => (s || '').replace(/\s+/g, ' ').trim();

// DecisaoID -> nome do integrador (pode estar atribuído mesmo se ainda pendente)
const integradorPorDecisaoId = new Map();
integracoesCsv.forEach((r) => {
  if (r.DecisaoID && r.Integrador) integradorPorDecisaoId.set(r.DecisaoID, r.Integrador.trim());
});

const { data: membros, error: errMembros } = await supabase.from('membros').select('id, matricula, nome_completo, nome_social');
if (errMembros) throw errMembros;
const membroPorMatricula = new Map(membros.map((m) => [m.matricula, m.id]));
const membroPorNome = new Map();
membros.forEach((m) => {
  [m.nome_completo, m.nome_social].filter(Boolean).forEach((n) => {
    membroPorNome.set(normalizaEspacos(n).toLowerCase(), m.id);
  });
});

const { data: equipes, error: errEquipes } = await supabase.from('equipes').select('id, nome');
if (errEquipes) throw errEquipes;
const equipePorNome = new Map(equipes.map((e) => [normalizaEspacos(e.nome), e.id]));

function parseDataBR(s) {
  const [d, m, y] = s.split('/');
  return { iso: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, ano: parseInt(y, 10), mes: parseInt(m, 10) };
}

const alvo = decisoes.filter((r) => SEMANAS_ALVO.includes(r.Semana));
console.log(`Processando ${alvo.length} decisões das semanas [${SEMANAS_ALVO.join(', ')}]...`);

let arquivadas = 0;
let pendentesOk = 0;
let pendentesDuplicadas = 0;
let semCapelao = 0;
let semEquipe = 0;
const semEquipeNomes = new Set();

const loteArquivo = [];

for (const r of alvo) {
  const capelaoId = membroPorMatricula.get((r.MatriculaCapelao || '').trim());
  if (!capelaoId && r.Integrar === 'S' && !((r.StatusdaIntegracao || '').toLowerCase().includes('sim'))) {
    // só bloqueia import de pendente (precisa capelao_id not null); arquivo aceita null
    semCapelao++;
    continue;
  }

  const equipeId = equipePorNome.get(normalizaEspacos(r.EquipeID)) || null;
  if (!equipeId) {
    semEquipe++;
    semEquipeNomes.add(r.EquipeID);
  }

  const { iso: dataVisita, ano, mes } = parseDataBR(r.DataVisita);
  const semana = parseInt(r.Semana, 10);
  const querInteg = r.Integrar === 'S';
  const jaIntegrada = querInteg && (r.StatusdaIntegracao || '').toLowerCase().includes('sim');

  if (!querInteg || jaIntegrada) {
    const integradorNome = integradorPorDecisaoId.get(r.ID);
    const integradorId = integradorNome ? membroPorNome.get(normalizaEspacos(integradorNome).toLowerCase()) || null : null;
    loteArquivo.push({
      semana, ano, mes,
      equipe_id: equipeId,
      sexo: r.Sexo_Assistido || null,
      quer_integracao: querInteg,
      motivo_nao_integracao: querInteg ? null : (r.MotivoNaoIntegrar || null),
      integrado: jaIntegrada,
      integrador_id: jaIntegrada ? integradorId : null,
    });
    arquivadas++;
    continue;
  }

  // pendente: quer integração e ainda não foi integrada -> registro detalhado real
  const { data: novaDecisao, error: errIns } = await supabase
    .from('decisoes')
    .insert({
      legado_id: r.ID,
      capelao_id: capelaoId,
      equipe_id: equipeId,
      carimbo_data: new Date().toISOString(),
      data_visita: dataVisita,
      tipo_assistido: r.AssistidoTipo || null,
      nome_assistido: r.Nome_Assistido,
      sexo: r.Sexo_Assistido || null,
      telefone: r.Telefone_Assistido || '',
      quer_integracao: true,
      observacoes: r.Obs || null,
    })
    .select('id')
    .single();

  if (errIns) {
    if (errIns.code === '23505') {
      pendentesDuplicadas++;
      continue;
    }
    console.error(`[erro] ${r.ID} (${r.Nome_Assistido}): ${errIns.message}`);
    continue;
  }

  // Só grava a linha em `integracoes` quando o integrador da planilha
  // antiga foi resolvido de verdade. Se não foi (nome não bateu com o
  // cadastro), NÃO cria a linha com integrador_id nulo -- isso deixaria a
  // decisão invisível pro distribuir_integracoes() (que só processa quem
  // ainda não tem linha em integracoes), presa sem integrador pra sempre.
  // Melhor deixar de fora e deixar o round-robin de verdade assumir.
  const integradorNome = integradorPorDecisaoId.get(r.ID);
  const integradorId = integradorNome ? membroPorNome.get(normalizaEspacos(integradorNome).toLowerCase()) : null;
  if (integradorId) {
    const { error: errInteg } = await supabase.from('integracoes').insert({
      decisao_id: novaDecisao.id,
      integrador_id: integradorId,
      integrado: false,
    });
    if (errInteg) console.error(`[erro integracoes] ${r.ID}: ${errInteg.message}`);
  }

  pendentesOk++;
}

if (loteArquivo.length) {
  const TAMANHO_LOTE = 500;
  for (let i = 0; i < loteArquivo.length; i += TAMANHO_LOTE) {
    const parte = loteArquivo.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from('decisoes_arquivo').insert(parte);
    if (error) throw error;
  }
}

console.log('\nImport concluído:');
console.log('  arquivadas (não integráveis + já integradas):', arquivadas);
console.log('  pendentes gravadas (vivas, aguardando integração):', pendentesOk);
console.log('  pendentes puladas por telefone duplicado na semana:', pendentesDuplicadas);
console.log('  puladas por capelão não encontrado:', semCapelao);
console.log('  sem equipe resolvida (gravadas com equipe_id nulo):', semEquipe);
if (semEquipeNomes.size) console.log('    nomes não resolvidos:', [...semEquipeNomes]);
console.log('\nAlgumas pendentes podem ter ficado sem integrador (nome da planilha');
console.log('antiga não bateu com o cadastro) -- dispare a distribuição (botão 🔀 na');
console.log('tela de Integração, só Líder) pra atribuir um integrador de verdade a elas.');
