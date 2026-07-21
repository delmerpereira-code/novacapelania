// Camada de dados sobre Supabase, substituindo o callScript()/Apps Script
// do sistema antigo. Só cobre o que já foi portado (login, Cadastro,
// Equipes) -- o resto do app.js ainda chama o backend antigo até ser
// portado tela a tela (ver README do repo).
const SUPABASE_URL = 'https://mujvhcodckoxbdxmhppx.supabase.co';
// Chave pública/anon -- segura pra expor no frontend, não dá acesso a nada
// que a RLS não libere.
const SUPABASE_ANON_KEY = 'sb_publishable_VcJnzpvfhKbhZEED7yGr9w_a9YmXjpq';

let supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function setAuthToken(token) {
  supabaseClient = token
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
    : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

async function apiLogin(matricula, senha) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, senha }),
  });
  const body = await res.json();
  if (!res.ok) {
    const mensagens = {
      credenciais_invalidas: 'Matrícula ou senha incorretos.',
      membro_inativo: 'Cadastro desativado. Fale com a liderança.',
    };
    throw new Error(mensagens[body.erro] || 'Erro ao entrar. Tente novamente.');
  }
  setAuthToken(body.access_token);
  localStorage.setItem('capelania_token', body.access_token);
  localStorage.setItem('capelania_membro', JSON.stringify(body.membro));
  return body.membro;
}

function restoreSession() {
  const token = localStorage.getItem('capelania_token');
  if (!token) return null;
  setAuthToken(token);
  const membroRaw = localStorage.getItem('capelania_membro');
  try {
    return membroRaw ? JSON.parse(membroRaw) : null;
  } catch {
    return null;
  }
}

function apiLogout() {
  localStorage.removeItem('capelania_token');
  localStorage.removeItem('capelania_membro');
  setAuthToken(null);
}

async function apiEquipesDoMembro(membroId) {
  const { data, error } = await supabaseClient
    .from('membro_equipe')
    .select('equipes(id, nome)')
    .eq('membro_id', membroId);
  if (error) throw error;
  return (data || []).map((r) => r.equipes).filter(Boolean);
}

// Converte MM/DD (schema novo) pro formato de exibição DD/MM que o
// front-end antigo já sabe renderizar.
function formatarAniversario(mes, dia) {
  if (!mes || !dia) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(dia)}/${p2(mes)}`;
}

// Adapta uma linha de `membros` (schema novo) pro formato de objeto que o
// app.js antigo espera (nomes de campo do sistema Google Sheets), pra não
// precisar reescrever as telas de Cadastro inteiras.
function adaptarMembro(m, nomesEquipes) {
  return {
    linha: m.id, // identificador único usado no lugar do número de linha da planilha
    id: m.legado_id || m.id,
    pin: m.matricula,
    usuario: m.matricula,
    nomeComp: m.nome_completo,
    nomeSoc: m.nome_social || '',
    sexo: m.sexo === 'M' ? 'Masculino' : m.sexo === 'F' ? 'Feminino' : m.sexo || '',
    tel: m.telefone || '',
    rg: m.rg || '',
    email: m.email || '',
    aniversario: formatarAniversario(m.aniversario_mes, m.aniversario_dia),
    declaMinist: m.declaracao_ministerio ? 'S' : '',
    liderGA: m.lider_ga || '',
    umComDeus: m.um_com_deus ? 'S' : '',
    batizado: m.batizado === true ? 'S' : m.batizado === false ? 'Não' : '',
    grupo: m.grupo || '',
    culto: m.culto || '',
    senib: m.senib || '',
    fazInteg: m.faz_integracao === true ? 'S' : m.faz_integracao === false ? 'N' : '',
    sit: m.ativo ? 'Ativo' : 'Inativo',
    obs: m.observacoes || '',
    perfil: m.perfil,
    foto: m.foto_url || '',
    equipes: (nomesEquipes || []).join(', '),
  };
}

// Não usar select('*') aqui: `senha_hash` foi propositalmente revogada pra
// authenticated/anon (ver 0002_rls.sql), então select('*') bate em 403.
const COLUNAS_MEMBRO_PUBLICAS = [
  'id', 'legado_id', 'matricula', 'foto_url', 'nome_completo', 'nome_social',
  'sexo', 'telefone', 'rg', 'email', 'declaracao_ministerio', 'lider_ga',
  'um_com_deus', 'batizado', 'grupo', 'culto', 'senib', 'aniversario_mes',
  'aniversario_dia', 'faz_integracao', 'ativo', 'observacoes', 'perfil',
].join(', ');

async function supaLerCadastro() {
  const { data: membros, error } = await supabaseClient.from('membros').select(COLUNAS_MEMBRO_PUBLICAS);
  if (error) throw error;

  const { data: vinculos, error: errVinculos } = await supabaseClient
    .from('membro_equipe')
    .select('membro_id, equipes(nome)');
  if (errVinculos) throw errVinculos;

  const equipesPorMembro = {};
  (vinculos || []).forEach((v) => {
    const nome = v.equipes && v.equipes.nome;
    if (!nome) return;
    (equipesPorMembro[v.membro_id] ||= []).push(nome);
  });

  return membros.map((m) => adaptarMembro(m, equipesPorMembro[m.id]));
}

async function supaLerEquipes() {
  const { data, error } = await supabaseClient
    .from('equipes')
    .select('*, lider:membros!lider_id(matricula)')
    .order('nome');
  if (error) throw error;
  return data.map((e) => ({
    linha: e.id,
    id: e.id,
    legadoId: e.legado_id || '',
    nome: e.nome,
    hospital: e.hospital || '',
    hora: e.hora || '',
    diaSemana: e.dia_semana || '',
    liderMatricula: (e.lider && e.lider.matricula) || '',
  }));
}

// ---------------------------------------------------------------------------
// Decisões
// ---------------------------------------------------------------------------

// Adapta uma linha de `decisoes` (join com equipes) pro formato que o
// app.js antigo espera. `linha`/`id` viram o mesmo uuid -- o sistema antigo
// concatenava linha+id pra formar um uid único, aqui já temos um id único.
function adaptarDecisao(d) {
  return {
    linha: d.id,
    id: d.id,
    equipe: (d.equipes && d.equipes.nome) || 'Sem equipe',
    assistido: d.tipo_assistido,
    nome: d.nome_assistido,
    sexo: d.sexo,
    tel: d.telefone || '',
    integ: d.quer_integracao ? 'S' : 'N',
    motivo: d.motivo_nao_integracao || '',
    obs: d.observacoes || '',
    semana: d.semana,
    capelaoId: d.capelao_id,
  };
}

async function supaLerDecisoesSemana(semana) {
  const { data, error } = await supabaseClient
    .from('decisoes')
    .select('id, tipo_assistido, nome_assistido, sexo, telefone, quer_integracao, motivo_nao_integracao, observacoes, semana, capelao_id, equipes(nome)')
    .eq('semana', semana)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(adaptarDecisao);
}

// Lança um erro com `.duplicata = true` quando a constraint única do banco
// (telefone_normalizado + semana) rejeita a gravação -- é a defesa real
// contra a condição de corrida do sistema antigo; a checagem no cliente é
// só uma otimização de UX pra não esperar o round-trip.
//
// Toda decisão (integrável ou não) fica guardada e editável em `decisoes`
// durante a semana em que foi registrada -- pode ter sido um erro de
// digitação e precisar de ajuste. Só na virada de semana (função
// arquivar_semana_fechada(), rodada pelo cron de domingo) é que ela vira
// só contador: integrável confirmada e não-integrável são arquivadas
// juntas; quem ainda não foi integrado continua vivo, pra cobrança
// continuar na semana seguinte.
async function supaGravarDecisao({ capelaoId, equipeId, dataVisita, assistido, nome, sexo, tel, integ, motivo, obs }) {
  const { error } = await supabaseClient.from('decisoes').insert({
    capelao_id: capelaoId,
    equipe_id: equipeId,
    data_visita: dataVisita,
    tipo_assistido: assistido,
    nome_assistido: nome,
    sexo,
    telefone: integ ? tel : '',
    quer_integracao: integ,
    motivo_nao_integracao: integ ? null : motivo,
    observacoes: integ ? obs : null,
  });
  if (error) {
    if (error.code === '23505') {
      const dup = new Error('Já existe decisão registrada para este telefone nesta semana.');
      dup.duplicata = true;
      throw dup;
    }
    throw error;
  }
}

async function supaEditarDecisao(id, { nome, tel, obs, assistido, sexo, integrar, motivo }) {
  const { error } = await supabaseClient
    .from('decisoes')
    .update({
      nome_assistido: nome,
      telefone: integrar === 'S' ? tel : '',
      observacoes: integrar === 'S' ? obs : null,
      tipo_assistido: assistido,
      sexo,
      quer_integracao: integrar === 'S',
      motivo_nao_integracao: integrar === 'S' ? null : motivo,
    })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') {
      const dup = new Error('Já existe decisão registrada para este telefone nesta semana.');
      dup.duplicata = true;
      throw dup;
    }
    throw error;
  }
}

async function supaExcluirDecisao(id) {
  const { error } = await supabaseClient.from('decisoes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Integração
// ---------------------------------------------------------------------------
function nomeMembro(m) {
  return (m && (m.nome_social || m.nome_completo)) || '';
}

function dataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function adaptarIntegracao(i) {
  const dec = i.decisao || {};
  return {
    id: i.id,
    idDecisao: dec.id,
    data: dataBR(dec.data_visita),
    hospital: (dec.equipe && (dec.equipe.hospital || dec.equipe.nome)) || '',
    equipe: (dec.equipe && dec.equipe.nome) || '',
    integrado: i.integrado ? 'Sim' : 'Não',
    capelao: nomeMembro(dec.capelao),
    assistido: dec.tipo_assistido,
    nome: dec.nome_assistido,
    tel: dec.telefone || '',
    sexo: dec.sexo,
    obs: dec.observacoes || '',
    integrador: nomeMembro(i.integrador),
  };
}

async function supaLerIntegracao() {
  const { data, error } = await supabaseClient
    .from('integracoes')
    .select(`
      id, integrado,
      integrador:membros!integrador_id(nome_completo, nome_social),
      decisao:decisoes!decisao_id(
        id, data_visita, tipo_assistido, nome_assistido, sexo, telefone, observacoes,
        capelao:membros!capelao_id(nome_completo, nome_social),
        equipe:equipes!equipe_id(nome, hospital)
      )
    `)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(adaptarIntegracao);
}

// "Fecha" a integração: a function no banco (SECURITY DEFINER) grava o
// contador em decisoes_arquivo e apaga a decisão detalhada original numa
// operação só (ver arquivar_integracao() em 0005_arquivamento_decisoes.sql).
// Só marca como integrado -- não arquiva nem apaga na hora. O card fica
// verde e continua na lista até a virada de semana (arquivar_semana_fechada()
// no cron de domingo), pra dar tempo de conferir/desfazer se precisar.
async function supaRegistrarIntegracao(integracaoId) {
  const { error } = await supabaseClient
    .from('integracoes')
    .update({ integrado: true, updated_at: new Date().toISOString() })
    .eq('id', integracaoId);
  if (error) throw error;
}

// Dispara o round-robin de distribuição (só liderança, ver RLS/função no
// banco). Retorna quantas decisões pendentes foram distribuídas.
async function supaDistribuirIntegracoes() {
  const { data, error } = await supabaseClient.rpc('distribuir_integracoes');
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Presença
// A dedup do sistema antigo era inconsistente (gravarPresenca_ checava por
// matrícula+semana, verificarPresenca_ checava por matrícula+data) -- aqui
// há uma regra única (membro+semana, ver 0001_init.sql), então "verificar"
// e "registrar" sempre olham pra mesma coisa: já tem presença nesta semana?
// ---------------------------------------------------------------------------
async function supaVerificarPresencaSemana(membroId, semana) {
  const { data, error } = await supabaseClient
    .from('presenca')
    .select('hora')
    .eq('membro_id', membroId)
    .eq('semana', semana)
    .maybeSingle();
  if (error) throw error;
  return data ? { registrado: true, hora: (data.hora || '').slice(0, 5) } : { registrado: false };
}

async function supaRegistrarPresenca({ membroId, equipeId, data, hora, semana }) {
  const { error } = await supabaseClient.from('presenca').insert({
    membro_id: membroId,
    equipe_id: equipeId,
    data,
    hora,
  });
  if (error) {
    if (error.code === '23505') {
      const existente = await supaVerificarPresencaSemana(membroId, semana);
      const dup = new Error(existente.hora ? `Presença já registrada hoje às ${existente.hora}` : 'Presença já registrada nesta semana.');
      dup.duplicata = true;
      dup.hora = existente.hora;
      throw dup;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Resumo de visitas
// ---------------------------------------------------------------------------
function adaptarResumo(r) {
  return {
    id: r.id,
    data: dataBR(r.data_visita),
    equipe: (r.equipes && r.equipes.nome) || '',
    lider: nomeMembro(r.lider),
    total: r.total_decisoes,
    lancadas: r.lancadas,
    saldo: r.saldo,
    foto: r.foto_url || '',
  };
}

async function supaLerResumos() {
  const { data, error } = await supabaseClient
    .from('resumo_visitas')
    .select('id, data_visita, total_decisoes, lancadas, saldo, foto_url, equipes(nome), lider:membros!lider_id(nome_completo, nome_social)')
    .order('data_visita', { ascending: false });
  if (error) throw error;
  return data.map(adaptarResumo);
}

// "lancadas"/"saldo" são um snapshot do momento do salvamento (não um
// valor sempre live), igual ao gravarResumo_ do sistema antigo -- por
// isso contamos as decisões aqui, no momento do salvar, em vez de deixar
// como coluna calculada.
async function supaGravarResumo({ equipeId, dataVisitaISO, liderId, total, fotoUrl }) {
  const { count, error: errCount } = await supabaseClient
    .from('decisoes')
    .select('id', { count: 'exact', head: true })
    .eq('equipe_id', equipeId)
    .eq('data_visita', dataVisitaISO);
  if (errCount) throw errCount;

  const lancadas = count || 0;
  const { error } = await supabaseClient.from('resumo_visitas').upsert(
    {
      equipe_id: equipeId,
      data_visita: dataVisitaISO,
      lider_id: liderId,
      total_decisoes: total,
      foto_url: fotoUrl || null,
      lancadas,
    },
    { onConflict: 'data_visita,equipe_id' },
  );
  if (error) throw error;
  return { lancadas, saldo: total - lancadas };
}

// ---------------------------------------------------------------------------
// Relatórios
// lerRelatorioSemana/lerRelatorioAnual/lerRelatorioPresenca nunca foram
// implementadas no backend antigo (chamadas pelo frontend, sempre
// retornavam erro) -- essas são implementadas do zero aqui, direto sobre
// as tabelas já existentes (sem tabela de agregação própria).
// ---------------------------------------------------------------------------
// Lê de v_decisoes_stats (decisões ainda pendentes + já arquivadas), não
// direto de `decisoes` -- uma decisão integrada e arquivada nesta mesma
// semana ainda precisa contar no total, mesmo já tendo sido apagada da
// tabela detalhada.
async function supaRelatorioSemana(semana) {
  const { data, error } = await supabaseClient
    .from('v_decisoes_stats')
    .select('sexo, quer_integracao, motivo_nao_integracao, integrado')
    .eq('semana', semana);
  if (error) throw error;

  const total = data.length;
  const comIntegracao = data.filter((d) => d.quer_integracao);
  const semIntegracao = data.filter((d) => !d.quer_integracao);
  const totalS = comIntegracao.length;
  const totalN = semIntegracao.length;
  const integ = comIntegracao.filter((d) => d.integrado).length;
  const pend = totalS - integ;
  const pctInteg = totalS ? Math.round((integ / totalS) * 100) : 0;

  const M = data.filter((d) => d.sexo === 'M').length;
  const F = data.filter((d) => d.sexo === 'F').length;
  const pctM = total ? Math.round((M / total) * 100) : 0;
  const pctF = total ? Math.round((F / total) * 100) : 0;

  const motivosMap = {};
  semIntegracao.forEach((d) => {
    const m = d.motivo_nao_integracao || '(sem motivo)';
    motivosMap[m] = (motivosMap[m] || 0) + 1;
  });
  const motivos = Object.entries(motivosMap)
    .map(([motivo, qtd]) => ({ motivo, qtd, pct: totalN ? Math.round((qtd / totalN) * 100) : 0 }))
    .sort((a, b) => b.qtd - a.qtd);

  return {
    total, totalS, totalN, integradas: integ, pendentes: pend, pctInteg,
    sexos: { M, F, pctM, pctF },
    motivos,
    semana,
  };
}

// Últimas 8 semanas (calendário, não "últimas semanas com dado" como no
// sistema antigo -- mais previsível) do desempenho de cada integrador:
// quantas decisões foram atribuídas, quantas ele já integrou, saldo
// pendente por semana. Substitui a leitura de "Historico_Integracao", que
// no sistema antigo era só leitura -- nunca populada por nenhuma ação do
// app (fonte de dado externa/manual não portada). Lê de v_decisoes_stats
// (pendentes + arquivadas) -- uma vez arquivada, a decisão continua
// contando pro integrador que a fechou, mesmo sem mais existir em
// `decisoes`.
async function supaRelatorioHistorico(semanaAtual) {
  const semanas = [];
  for (let i = 7; i >= 0; i--) semanas.push(semanaAtual - i);

  const { data, error } = await supabaseClient
    .from('v_decisoes_stats')
    .select('semana, integrado, integrador_id')
    .not('integrador_id', 'is', null)
    .gte('semana', semanas[0])
    .lte('semana', semanas[semanas.length - 1]);
  if (error) throw error;

  const integradorIds = [...new Set(data.map((r) => r.integrador_id))];
  const { data: membrosData, error: errMembros } = await supabaseClient
    .from('membros')
    .select('id, nome_completo, nome_social')
    .in('id', integradorIds.length ? integradorIds : ['00000000-0000-0000-0000-000000000000']);
  if (errMembros) throw errMembros;
  const nomePorId = Object.fromEntries(membrosData.map((m) => [m.id, nomeMembro(m) || m.nome_completo]));

  const porIntegrador = {};
  data.forEach((row) => {
    const sem = row.semana;
    if (!semanas.includes(sem)) return;
    const nome = nomePorId[row.integrador_id] || 'Sem integrador';
    porIntegrador[nome] ||= {};
    porIntegrador[nome][sem] ||= { semana: sem, total: 0, integradas: 0 };
    porIntegrador[nome][sem].total += 1;
    if (row.integrado) porIntegrador[nome][sem].integradas += 1;
  });

  let lista = Object.entries(porIntegrador).map(([capelao, porSemana]) => {
    const historico = semanas.map((s) => {
      const h = porSemana[s] || { semana: s, total: 0, integradas: 0 };
      return { ...h, saldo: h.total - h.integradas };
    });
    const totalGeral = historico.reduce((a, h) => a + h.total, 0);
    const integradasGeral = historico.reduce((a, h) => a + h.integradas, 0);
    const semNegativas = historico.filter((h) => h.saldo > 0).length;
    const pctGeral = totalGeral ? Math.round((integradasGeral / totalGeral) * 100) : 0;
    const ultima = historico[historico.length - 1];
    const alerta = ultima.saldo > 0;
    return { capelao, historico, totalGeral, integradasGeral, semNegativas, pctGeral, alerta };
  });

  lista = lista.sort((a, b) => (a.alerta === b.alerta ? a.pctGeral - b.pctGeral : a.alerta ? -1 : 1));

  return { lista, semanas };
}

// Grade membro x semana por equipe (últimas 8 semanas), substituindo a
// aba "Rel_Presença" do sistema antigo. Lá era uma tabela física
// reconstruída manualmente (atualizarRelPresenca/setupRelPresenca_) e a
// leitura (lerRelatorioPresenca) nunca foi implementada -- aqui não existe
// mais "atualizar": a grade é sempre calculada ao vivo em cima de
// `presenca`/`membro_equipe`, então não há nada pra reconstruir.
async function supaRelatorioPresenca(semanaAtual) {
  const semanas = [];
  for (let i = 7; i >= 0; i--) semanas.push(semanaAtual - i);
  const ultimaSemana = semanas[semanas.length - 1];

  const { data: equipes, error: errEquipes } = await supabaseClient
    .from('equipes')
    .select('id, nome')
    .order('nome');
  if (errEquipes) throw errEquipes;

  const { data: vinculos, error: errVinculos } = await supabaseClient
    .from('membro_equipe')
    .select('equipe_id, membros!inner(id, nome_completo, nome_social, ativo)')
    .eq('membros.ativo', true);
  if (errVinculos) throw errVinculos;

  const { data: presencas, error: errPresenca } = await supabaseClient
    .from('presenca')
    .select('membro_id, equipe_id, semana')
    .gte('semana', semanas[0])
    .lte('semana', ultimaSemana);
  if (errPresenca) throw errPresenca;

  const presencaSet = new Set(presencas.map((p) => `${p.membro_id}_${p.equipe_id}_${p.semana}`));
  const membrosPorEquipe = {};
  vinculos.forEach((v) => {
    (membrosPorEquipe[v.equipe_id] ||= []).push(v.membros);
  });

  let presGeral = 0, totalGeral = 0;

  const lista = equipes.map((eq) => {
    const membros = membrosPorEquipe[eq.id] || [];
    const totalMembros = membros.length;
    const totalPresentes = membros.filter((m) => presencaSet.has(`${m.id}_${eq.id}_${ultimaSemana}`)).length;
    const pct = totalMembros ? Math.round((totalPresentes / totalMembros) * 100) : 0;
    presGeral += totalPresentes;
    totalGeral += totalMembros;
    return {
      equipe: eq.nome,
      pct,
      totalPresentes,
      totalMembros,
      alerta: pct < 60,
      membros: membros
        .map((m) => ({
          nome: nomeMembro(m) || m.nome_completo,
          semanas: semanas.map((s) => ({ presente: presencaSet.has(`${m.id}_${eq.id}_${s}`) })),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    };
  }).filter((eq) => eq.totalMembros > 0);

  return {
    lista,
    semanas,
    presGeral,
    totalGeral,
    pctGeral: totalGeral ? Math.round((presGeral / totalGeral) * 100) : 0,
  };
}

// Comparativo de decisões por mês, incluindo anos anteriores à existência
// do sistema (2024/2025/início de 2026), guardados em
// decisoes_resumo_historico já que não há detalhe por trás desses números
// -- só a contagem apurada manualmente na planilha antiga. A function
// relatorio_anual_completo() (0010_resumo_historico.sql) resolve por mês
// se usa dado ao vivo (v_decisoes_stats) ou o número histórico; aqui só
// decide o intervalo de anos a pedir: do ano mais antigo com número
// histórico até o ano atual.
async function supaRelatorioAnual() {
  const anoAtual = new Date().getFullYear();

  const { data: hist, error: errHist } = await supabaseClient
    .from('decisoes_resumo_historico')
    .select('ano')
    .order('ano', { ascending: true })
    .limit(1);
  if (errHist) throw errHist;

  const anoIni = hist.length ? Math.min(hist[0].ano, anoAtual - 1) : anoAtual - 1;

  const { data, error } = await supabaseClient.rpc('relatorio_anual_completo', {
    p_ano_ini: anoIni,
    p_ano_fim: anoAtual,
  });
  if (error) throw error;

  const contagem = {};
  data.forEach((d) => { contagem[`${d.ano}-${d.mes}`] = d.qtde; });

  const anos = [];
  for (let a = anoIni; a <= anoAtual; a++) anos.push(a);

  return anos.map((ano) => {
    const meses = [];
    let total = 0;
    for (let m = 1; m <= 12; m++) {
      const valor = contagem[`${ano}-${m}`] || 0;
      total += valor;
      meses.push({ valor });
    }
    return { ano, total, meses };
  });
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

// senha_hash nunca é exposta a nenhum client (RLS revoga a coluna) --
// trocar senha só é possível via Edge Function, com service_role.
async function apiMudarSenha(senhaAtual, novaSenha) {
  const token = localStorage.getItem('capelania_token');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mudar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ senhaAtual, novaSenha }),
  });
  const body = await res.json();
  if (!res.ok) {
    const mensagens = {
      senha_atual_incorreta: 'Senha atual incorreta.',
      nova_senha_muito_curta: 'Nova senha deve ter ao menos 4 caracteres.',
      token_invalido: 'Sessão expirada. Faça login novamente.',
      token_ausente: 'Sessão expirada. Faça login novamente.',
    };
    throw new Error(mensagens[body.erro] || 'Erro ao trocar senha.');
  }
  return body;
}

// ---------------------------------------------------------------------------
// Aniversários -- a view v_aniversarios (0001_init.sql) já é exatamente o
// que essa tela precisa, sem duplicar dado como a aba "Aniv" antiga fazia.
// ---------------------------------------------------------------------------
async function supaLerAniversarios() {
  const { data, error } = await supabaseClient
    .from('v_aniversarios')
    .select('nome, foto_url, telefone, dia, mes');
  if (error) throw error;
  return data.map((m) => ({ nome: m.nome, mes: m.mes, dia: m.dia, foto: m.foto_url || '', tel: m.telefone || '' }));
}

// O upload em si (Cloudinary) é feito direto pelo cliente -- só a URL
// resultante é persistida aqui. Só liderança pode editar a foto de outro
// membro (RLS, ver 0004_membros_lideranca.sql).
async function supaAtualizarFotoMembro(membroId, fotoUrl) {
  const { error } = await supabaseClient
    .from('membros')
    .update({ foto_url: fotoUrl, updated_at: new Date().toISOString() })
    .eq('id', membroId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Cadastro -- escrita. supaLerCadastro já lia do Supabase desde sempre,
// mas criar/editar membro (openNovo/salvarNovo/salvarDados/salvarMin/
// salvarEq/alterarSit em app.js) ainda chamava o Apps Script antigo
// (gravar/atualizar) até este ponto -- ou seja, cadastrar ou editar um
// membro não gravava nada de verdade, só na sessão local do navegador.
// Criação passa por Edge Function porque precisa gravar senha_hash (senha
// padrão = a própria matrícula), coluna nunca exposta a nenhum client
// (0002_rls.sql); edição de membro já existente dá pra fazer com update
// direto, já que a RLS libera self-ou-liderança (0004_membros_lideranca.sql).
// ---------------------------------------------------------------------------
async function supaCriarMembro({ matricula, nomeCompleto, nomeSocial, sexo, telefone, email, perfil }) {
  const token = localStorage.getItem('capelania_token');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/criar-membro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ matricula, nomeCompleto, nomeSocial, sexo, telefone, email, perfil }),
  });
  const body = await res.json();
  if (!res.ok) {
    const mensagens = {
      matricula_ja_cadastrada: `Matrícula ${matricula} já cadastrada!`,
      campos_obrigatorios_faltando: 'Preencha os campos obrigatórios.',
      sem_permissao: 'Sem permissão para cadastrar membros.',
      token_invalido: 'Sessão expirada. Faça login novamente.',
      token_ausente: 'Sessão expirada. Faça login novamente.',
    };
    throw new Error(mensagens[body.erro] || 'Erro ao cadastrar.');
  }
  return adaptarMembro(body.membro, []);
}

function erroMatriculaDuplicada(error, matricula) {
  if (error.code === '23505') {
    const dup = new Error(`Matrícula ${matricula} já está em uso por outro membro.`);
    dup.duplicata = true;
    return dup;
  }
  return error;
}

// dropdowns Sim/Não (S/N) do formulário -> boolean/null do banco (domínio
// real inclui "vazio", ver comentário de cada coluna em 0001_init.sql).
function paraBooleanSN(v) {
  if (v === 'S') return true;
  if (v === 'N') return false;
  return null;
}

async function supaAtualizarMembroPessoal(membroId, { matricula, nomeCompleto, nomeSocial, sexo, telefone, rg, email, aniversarioDia, aniversarioMes }) {
  const { error } = await supabaseClient
    .from('membros')
    .update({
      matricula,
      nome_completo: nomeCompleto,
      nome_social: nomeSocial,
      sexo: sexo || null,
      telefone: telefone || null,
      rg: rg || null,
      email: email || null,
      aniversario_dia: aniversarioDia || null,
      aniversario_mes: aniversarioMes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', membroId);
  if (error) throw erroMatriculaDuplicada(error, matricula);
}

async function supaAtualizarMembroMinisterial(membroId, { declaMinist, liderGA, umComDeus, batizado, grupo, culto, senib, fazInteg, ativo, perfil, obs }) {
  const { error } = await supabaseClient
    .from('membros')
    .update({
      declaracao_ministerio: paraBooleanSN(declaMinist),
      lider_ga: liderGA || null,
      um_com_deus: paraBooleanSN(umComDeus),
      batizado: paraBooleanSN(batizado),
      grupo: grupo || null,
      culto: culto || null,
      senib: senib || null,
      faz_integracao: paraBooleanSN(fazInteg),
      ativo,
      perfil,
      observacoes: obs || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', membroId);
  if (error) throw error;
}

async function supaAtualizarEquipesMembro(membroId, nomesEquipes) {
  const { data: equipes, error: errEquipes } = await supabaseClient.from('equipes').select('id, nome');
  if (errEquipes) throw errEquipes;
  const idsAlvo = equipes.filter((e) => nomesEquipes.includes(e.nome)).map((e) => e.id);

  const { error: errDel } = await supabaseClient.from('membro_equipe').delete().eq('membro_id', membroId);
  if (errDel) throw errDel;

  if (idsAlvo.length) {
    const { error: errIns } = await supabaseClient
      .from('membro_equipe')
      .insert(idsAlvo.map((equipe_id) => ({ membro_id: membroId, equipe_id })));
    if (errIns) throw errIns;
  }
}

async function supaAlterarSituacaoMembro(membroId, ativo) {
  const { error } = await supabaseClient
    .from('membros')
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq('id', membroId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Gestão de equipes (CRUD) -- `salvarEquipe`/`atualizarEquipe`/
// `excluirEquipe` nunca foram implementadas no backend antigo (bug #4 do
// README); implementadas do zero aqui.
// ---------------------------------------------------------------------------
async function resolverLiderPorMatricula(matricula) {
  if (!matricula) return { liderId: null, avisoLider: null };
  const { data, error } = await supabaseClient.from('membros').select('id').eq('matricula', matricula).maybeSingle();
  if (error) throw error;
  if (!data) return { liderId: null, avisoLider: `Matrícula "${matricula}" não encontrada -- equipe salva sem líder vinculado.` };
  return { liderId: data.id, avisoLider: null };
}

function erroNomeDuplicado(error) {
  if (error.code === '23505') {
    const dup = new Error('Já existe uma equipe com esse nome.');
    dup.duplicata = true;
    return dup;
  }
  return error;
}

async function supaCriarEquipe({ nome, hospital, diaSemana, liderMatricula }) {
  const { liderId, avisoLider } = await resolverLiderPorMatricula(liderMatricula);
  const { error } = await supabaseClient.from('equipes').insert({
    nome, hospital: hospital || null, dia_semana: diaSemana || null, lider_id: liderId,
  });
  if (error) throw erroNomeDuplicado(error);
  return { avisoLider };
}

async function supaAtualizarEquipe(id, { nome, hospital, diaSemana, liderMatricula }) {
  const { liderId, avisoLider } = await resolverLiderPorMatricula(liderMatricula);
  const { error } = await supabaseClient
    .from('equipes')
    .update({ nome, hospital: hospital || null, dia_semana: diaSemana || null, lider_id: liderId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw erroNomeDuplicado(error);
  return { avisoLider };
}

async function supaExcluirEquipe(id) {
  const { error } = await supabaseClient.from('equipes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Crachá -- dados vêm de `membros` (mesma leitura de sempre). Sem QR code
// de propósito: cada capelão registra a própria presença hoje, então a
// verificação por quem escaneia o crachá (docs/verificar.html,
// 0009_verificacao_publica.sql) deixou de ser necessária -- página e view
// continuam existindo, só não são mais referenciadas daqui.
// ---------------------------------------------------------------------------
async function supaBuscarDadosCracha(membroId) {
  const { data, error } = await supabaseClient
    .from('membros')
    .select('id, nome_completo, nome_social, foto_url, rg')
    .eq('id', membroId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Membro não encontrado.');
  return {
    id: data.id,
    nome: data.nome_social || data.nome_completo,
    foto: data.foto_url || '',
    rg: data.rg || '',
  };
}
