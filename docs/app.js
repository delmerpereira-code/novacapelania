// ═══════════════════════════════════════
// CONFIGURAÇÃO — troque pela URL do seu Apps Script
// ═══════════════════════════════════════
const SCRIPT = 'https://script.google.com/macros/s/AKfycbyU9YZ5aTr3oor26IyElApioM2nK15ifBY7xxPNlUiO7jS_tkAsvv97oj95X0XhFNkphQ/exec';

// ═══════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════
const S = {
  user: null, equipe: null, equipeId: null, dv: null,
  _membroAtual: null,
  dec: { assistido:'Paciente', sexo:'Masculino', integ:false },
  decSession: [],
  cadAll: [], cad: [], eqList: [],
  cadFiltEq: 'todas',
  eqFiltEq: 'todas',
  _integEqFiltro: 'todas',
  cur: null  // membro atual
};

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════
const $ = id => document.getElementById(id);
function load(m)  { $('lov').classList.add('on'); $('lov-p').textContent = m||'Carregando...'; }
function unload() { $('lov').classList.remove('on'); }

function msg(m, t) {
  const el = $('toast');
  el.textContent = m; el.className = 'toast on ' + (t||'');
  clearTimeout(el._t); el._t = setTimeout(() => el.className = 'toast', 3200);
}

function fD(d) {
  return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
}
function toISODate(d) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function isoFromBR(str) {
  const p = (str||'').split('/');
  if(p.length!==3) return null;
  return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}
function gId() { return Math.random().toString(36).substr(2,8); }
function ini(n) {
  return (n||'').trim().split(' ').filter(Boolean).slice(0,2).map(x => x[0].toUpperCase()).join('');
}
function normPerfil(r) {
  const s = (r||'').toString().trim().toUpperCase().replace(/Í/g,'I');
  return (s==='LIDER'||s==='LÍDER') ? 'Líder' : 'Membro';
}
function setOpt(id, val) {
  const sel = $(id); if(!sel||val===undefined||val===null) return;
  const v = (val||'').toString().trim();
  // Tentar setar direto primeiro
  sel.value = v;
  if(sel.value === v) return;
  // Tentar case-insensitive
  const vUp = v.toUpperCase();
  for(const opt of sel.options) {
    if(opt.value.toUpperCase()===vUp || opt.text.toUpperCase()===vUp) {
      sel.value = opt.value; return;
    }
  }
  // Mapeamentos especiais
  const MAP = {
    'M':'Masculino','MASCULINO':'Masculino',
    'F':'Feminino','FEMININO':'Feminino',
    'LIDER':'LIDER','LÍDER':'LIDER',
    'MEMBRO':'Membro',
    'S':'S','N':'N',
    'SIM':'Sim','NÃO':'Não','NAO':'Não',
    'ATIVO':'Ativo','INATIVO':'Inativo'
  };
  const mapped = MAP[vUp];
  if(mapped){
    sel.value = mapped;
    if(sel.value !== mapped){
      for(const opt of sel.options){
        if(opt.value===mapped||opt.text===mapped){ sel.value=opt.value; return; }
      }
    }
  }
}
function getSemana() {
  const h = new Date(), d = h.getDay();
  const dom = new Date(h); dom.setDate(h.getDate()-d);
  const sab = new Date(dom); sab.setDate(dom.getDate()+6);
  return {ini:dom, fim:sab};
}
function calcDv(eq) {
  const MAP = {seg:1,ter:2,qua:3,qui:4,sex:5,sab:6,dom:0};
  const s = (eq||'').toLowerCase();
  let alvo = -1;
  for(const k in MAP){ if(s.indexOf(k)>=0){ alvo=MAP[k]; break; } }
  const h = new Date();
  if(alvo<0) return h;
  const dv = new Date(h); dv.setDate(h.getDate()+(alvo-h.getDay()));
  return dv;
}
// Calcula semana igual ao Google Sheets NÚMSEMANA(data;2) — semana começa na segunda
function numSemana(d) {
  const data = d || new Date();
  const anoIni = new Date(data.getFullYear(), 0, 1);
  // Ajustar para segunda como primeiro dia (modo 2 do Sheets)
  const diaSemAnoIni = anoIni.getDay() || 7; // 1=seg...7=dom
  const diasPassados = Math.floor((data - anoIni) / 86400000);
  return Math.ceil((diasPassados + diaSemAnoIni) / 7);
}

function naSemanAtual(str) {
  const p = str.split('/'); if(p.length<3) return false;
  const d = new Date(p[2],p[1]-1,p[0]);
  const sw = getSemana();
  sw.ini.setHours(0,0,0,0); sw.fim.setHours(23,59,59,999);
  return d>=sw.ini && d<=sw.fim;
}

// ═══════════════════════════════════════
// API via JSONP — funciona sem CORS
// ═══════════════════════════════════════
function callScript(params, _retry) {
  // Tenta fetch primeiro (mais confiável em mobile), fallback para JSONP
  const qs = Object.entries(params)
    .map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const url = SCRIPT + '?' + qs;

  return fetch(url, {redirect:'follow'})
    .then(r => r.json())
    .catch(() => {
      // Fallback JSONP se fetch falhar (CORS em alguns ambientes)
      return new Promise((ok, er) => {
        const cb = '_cb' + Date.now() + Math.floor(Math.random()*9999);
        const sc = document.createElement('script');
        const timer = setTimeout(() => {
          cleanup();
          if(!_retry) {
            // Uma segunda tentativa automática após 3s
            callScript(params, true).then(ok).catch(er);
          } else {
            er(new Error('Sem resposta do servidor. Verifique sua conexão.'));
          }
        }, 25000);
        function cleanup() { clearTimeout(timer); delete window[cb]; if(sc.parentNode) sc.remove(); }
        window[cb] = data => { cleanup(); ok(data||{}); };
        sc.onerror = () => {
          cleanup();
          if(!_retry) {
            setTimeout(() => callScript(params, true).then(ok).catch(er), 2000);
          } else {
            er(new Error('Erro ao conectar. Verifique sua internet e tente novamente.'));
          }
        };
        const qsCb = qs + '&callback=' + encodeURIComponent(cb);
        sc.src = SCRIPT + '?' + qsCb;
        document.head.appendChild(sc);
      });
    });
}

async function lerCadastro() {
  return await supaLerCadastro();
}
async function lerEquipes() {
  return await supaLerEquipes();
}
async function gravar(aba, vals) {
  await callScript({acao:'gravar', aba, dados: JSON.stringify(vals)});
  return true;
}
async function atualizar(aba, linha, vals) {
  await callScript({acao:'atualizar', aba, linha: String(linha), dados: JSON.stringify(vals)});
  return true;
}

// ═══════════════════════════════════════
// NAVEGAÇÃO
// ═══════════════════════════════════════
function ir(name, navIdx, btn) {
  document.querySelectorAll('.sc').forEach(s => s.classList.remove('on'));
  const scMap = {'integ-det':'sc-integ-det','resumo-det':'sc-resumo-det'};
  const scId = scMap[name] || 'sc-'+name;
  const sc = $(scId); if(sc) sc.classList.add('on');
  if(btn) {
    const nav = btn.closest('nav');
    if(nav) nav.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
  }
  if(name==='home') verificarPresencaHoje();
  if(name==='decisoes') loadDecSemana();
  if(name==='integracao') loadIntegracao();
  if(name==='resumo') loadResumo();
  if(name==='relatorios') loadRelatorios();
  if(name==='aniversarios') loadAniv();
  if(name==='cadastro' && !S.cad.length) loadCad();
  if(name==='equipes') loadEquipes();
}

// ═══════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════
async function doLogin() {
  const u = $('lu').value.trim(), p = $('lp').value.trim();
  const errEl = $('lerr');
  errEl.style.display = 'none';
  if(!u||!p){ errEl.textContent='Informe usuário e PIN.'; errEl.style.display='block'; return; }

  load('Verificando...');
  let membro;
  try { membro = await apiLogin(u, p); }
  catch(e) { unload(); errEl.textContent=e.message; errEl.style.display='block'; return; }

  let equipes = [];
  try { equipes = await apiEquipesDoMembro(membro.id); }
  catch(e) { /* segue sem equipes pré-carregadas; tela de equipes tenta de novo depois */ }
  unload();

  const nome = membro.nome_social||membro.nome_completo;
  const perfil = normPerfil(membro.perfil);
  S.user = {codigo:membro.id, matricula:membro.matricula, nome, perfil};
  S._membroAtual = membro;

  if(!equipes.length){ errEl.textContent='Sem equipe cadastrada.'; errEl.style.display='block'; return; }

  if(equipes.length===1){ S.equipe=equipes[0].nome; S.equipeId=equipes[0].id; startSession(); return; }

  const sel = $('leq');
  sel.innerHTML = '<option value="">Selecione sua equipe</option>';
  equipes.forEach(eq => { const o=document.createElement('option'); o.value=eq.id; o.textContent=eq.nome; sel.appendChild(o); });
  $('leqc').style.display='block';
  const btn = $('lbtn');
  btn.textContent = 'Entrar ✝';
  btn.onclick = () => {
    const eq = equipes.find(e=>e.id===sel.value);
    if(!eq){ errEl.textContent='Selecione a equipe.'; errEl.style.display='block'; return; }
    S.equipe=eq.nome; S.equipeId=eq.id; startSession();
  };
}

function resolverHospital() {
  // Busca o hospital (col C) correspondente à equipe atual no eqList
  if(!S.eqList || !S.eqList.length) return S.equipe||'';
  const eq = S.eqList.find(e => (e.nome||e) === S.equipe);
  return (eq && eq.hospital) ? eq.hospital : S.equipe||'';
}

function startSession() {
  const h = new Date(), sw = getSemana(), dv = calcDv(S.equipe||'');
  S.dv = dv;
  $('h-name').textContent = S.user.nome;
  $('h-eq').textContent   = '📍 ' + S.equipe;
  $('h-dv').textContent   = fD(dv);
  $('h-sw').textContent   = fD(sw.ini).slice(0,5)+' – '+fD(sw.fim).slice(0,5);
  // Foto já veio junto com o login (S._membroAtual), sem precisar buscar de novo.
  const fotoUser = (S._membroAtual&&S._membroAtual.foto_url) ? converterUrlFoto(S._membroAtual.foto_url) : '';

  const mods = [];
  if(S.user.perfil==='Líder'){
    mods.push({ico:'👥',lbl:'Cadastro',id:'cadastro'});
    mods.push({ico:'⚙️',lbl:'Equipes',id:'equipes'});
    mods.push({ico:'📊',lbl:'Resumo',id:'resumo'});
    mods.push({ico:'📈',lbl:'Relatórios',id:'relatorios'});
  }
  mods.push({ico:'✝',lbl:'Decisões',id:'decisoes'});
  mods.push({ico:'🔗',lbl:'Integração',id:'integracao'});
  mods.push({ico:'🎂',lbl:'Aniversários',id:'aniversarios'});

  $('mods').innerHTML = mods.map(m =>
    `<div class="mod" onclick="ir('${m.id}')"><div class="mico">${m.ico}</div><div class="mlbl">${m.lbl}</div></div>`
  ).join('');

  document.querySelectorAll('.sc').forEach(s=>s.classList.remove('on'));
  $('sc-home').classList.add('on');
  msg('Bem-vindo(a), '+S.user.nome.split(' ')[0]+'! 🙏','ok');

  // Avatar/foto do banner (clicável -> mudar senha, ainda não portado)
  const av = $('h-av');
  if(av){
    av.onclick = function(e){ e.stopPropagation(); abrirMudarSenha(); };
    av.style.cursor = 'pointer';
    av.title = 'Mudar senha';
    if(fotoUser){
      av.innerHTML = `<img src="${fotoUser}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none" onerror="if(this.parentElement)this.parentElement.innerHTML='<span style=&quot;font-size:18px;font-weight:700;pointer-events:none&quot;>${ini(S.user.nome)}</span>'">`;
    } else {
      av.innerHTML = `<span style="font-size:18px;font-weight:700;pointer-events:none">${ini(S.user.nome)}</span>`;
    }
  }
  verificarPresencaHoje();
}


// ═══════════════════════════════════════
// PRESENÇA
// ═══════════════════════════════════════
async function verificarPresencaHoje() {
  const btn   = $('btn-presenca');
  const label = $('presenca-label');
  if(!btn || !label) return;

  const hoje   = fD(new Date());
  const diaVis = fD(S.dv || new Date());
  const eDiaVisita = (hoje === diaVis);

  // Estado já gravado na sessão — aplicar direto sem chamar servidor
  if(S._presencaRegistrada) {
    _setPresencaRegistrada(S._presencaHora || '');
    return;
  }

  // Consultar servidor pela semana atual + membro
  try {
    const res = await supaVerificarPresencaSemana(S.user.codigo, numSemana(new Date()));
    if(res.registrado){
      S._presencaRegistrada = true;
      S._presencaHora = res.hora || '';
      _setPresencaRegistrada(res.hora);
      return;
    }
  } catch(e) { /* silencioso — continua para estado padrão */ }

  // Não registrou — só liberar se hoje É o dia da visita
  if(eDiaVisita) {
    btn.disabled         = false;
    btn.style.background = 'rgba(255,255,255,.1)';
    btn.style.border     = '2px solid rgba(255,255,255,.25)';
    btn.style.cursor     = 'pointer';
    btn.style.opacity    = '1';
    btn.textContent      = '📋';
    btn.title            = 'Registrar presença';
    label.textContent    = 'Presença';
  } else {
    // Fora do dia da visita e sem registro — bloquear
    btn.disabled         = true;
    btn.style.background = 'rgba(255,255,255,.06)';
    btn.style.border     = '2px solid rgba(255,255,255,.1)';
    btn.style.cursor     = 'default';
    btn.style.opacity    = '0.4';
    btn.textContent      = '📋';
    btn.title            = 'Presença disponível apenas no dia da visita (' + diaVis.slice(0,5) + ')';
    label.textContent    = diaVis.slice(0,5);
  }
}

function _setPresencaRegistrada(hora) {
  const btn   = $('btn-presenca');
  const label = $('presenca-label');
  if(!btn || !label) return;
  btn.disabled         = true;
  btn.style.background = 'rgba(39,174,96,.55)';
  btn.style.border     = '2px solid rgba(39,174,96,.9)';
  btn.style.cursor     = 'default';
  btn.style.opacity    = '1';
  btn.textContent      = '✅';
  btn.title            = 'Presença já registrada';
  label.textContent    = hora ? 'às '+hora : 'Registrado';
}

async function registrarPresenca() {
  const btn   = $('btn-presenca');
  const label = $('presenca-label');
  if(!btn || btn.disabled) return;
  btn.disabled      = true;
  btn.textContent   = '⏳';
  label.textContent = 'Salvando...';
  try {
    const agora = new Date();
    const hora  = agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    await supaRegistrarPresenca({
      membroId: S.user.codigo,
      equipeId: S.equipeId,
      data:     toISODate(agora),
      hora,
      semana:   numSemana(agora)
    });
    S._presencaRegistrada = true;
    S._presencaHora = hora;
    _setPresencaRegistrada(hora);
    msg('✅ Presença registrada às '+hora,'ok');
  } catch(e) {
    if(e.duplicata){
      S._presencaRegistrada = true;
      S._presencaHora = e.hora || '';
      _setPresencaRegistrada(e.hora);
      msg(e.message,'ok');
      return;
    }
    btn.disabled      = false;
    btn.textContent   = '📋';
    label.textContent = 'Presença';
    msg('Erro ao registrar presença: '+e.message,'er');
  }
}

function doSair() {
  apiLogout();
  S.user=null; S.equipe=null; S.equipeId=null; S._membroAtual=null; S.decSession=[];
  S.cad=[]; S.cadAll=[]; S.eqList=[]; S.cur=null;
  S._presencaRegistrada=false; S._presencaHora='';
  $('lu').value=''; $('lp').value=''; $('leqc').style.display='none';
  $('lbtn').textContent='Verificar acesso'; $('lbtn').onclick=doLogin; $('lerr').style.display='none';
  document.querySelectorAll('.sc').forEach(s=>s.classList.remove('on'));
  $('sc-login').classList.add('on');
}

// ═══════════════════════════════════════
// MUDAR SENHA
// ═══════════════════════════════════════
function abrirMudarSenha() {
  $('s-atual').value=''; $('s-nova').value=''; $('s-conf').value='';
  $('sh-senha').classList.add('on');
}

async function confirmarMudarSenha() {
  const atual = $('s-atual').value.trim();
  const nova  = $('s-nova').value.trim();
  const conf  = $('s-conf').value.trim();
  if(!atual){ msg('Informe a senha atual.','er'); return; }
  if(!nova || nova.length < 4){ msg('Nova senha deve ter ao menos 4 caracteres.','er'); return; }
  if(nova !== conf){ msg('As senhas não coincidem.','er'); return; }
  const btn = document.querySelector('#sh-senha .btn-p');
  if(btn){ btn.disabled=true; btn.textContent='Salvando...'; }
  load('Salvando...');
  try {
    await apiMudarSenha(atual, nova);
    unload();
    if(btn){ btn.disabled=false; btn.textContent='💾 Salvar Nova Senha'; }
    $('sh-senha').classList.remove('on');
    msg('✅ Senha alterada com sucesso!','ok');
  } catch(e){
    unload();
    if(btn){ btn.disabled=false; btn.textContent='💾 Salvar Nova Senha'; }
    msg(e.message,'er');
  }
}

// ═══════════════════════════════════════
// DECISÕES
// ═══════════════════════════════════════
function fillDecInfo() {
  $('d-dt').textContent = fD(S.dv||new Date());
  $('d-cp').textContent = S.user?.nome||'-';
  $('d-eq').textContent = S.equipe||'-';
}

// ═══════════════════════════════════════
// SUGESTÃO DE SEXO PELO NOME
// ═══════════════════════════════════════
const NOMES_F = new Set([
  'ana','maria','jose','josélia','josefa','francisca','antonia','adriana','juliana','marcia',
  'fernanda','patricia','aline','sandra','camila','amanda','bruna','larissa','leticia','luciana',
  'daniela','claudia','cristina','andrea','fatima','aparecida','rosana','rosangela','jessica',
  'vanessa','priscila','simone','renata','fabiana','gabriela','beatriz','natalia','roberta',
  'alice','paula','carolina','rita','elaine','debora','viviane','monica','sueli','sonia',
  'regiane','gisele','tatiane','cintia','elisangela','silvia','vera','sueli','isabel','irene',
  'luana','rafaela','isabela','vitoria','giovanna','bianca','valentina','sarah','julia','laura',
  'livia','mariana','nathalia','thais','thaisa','thaiane','taiane','taiane','lara','heloisa',
  'luisa','luiza','ester','esther','ruth','rebeca','raquel','miriam','noemia','debora',
  'sulamita','abigail','elisabete','elizabete','tereza','teresa','ivone','iara','iolanda',
  'iracema','iraci','irma','ivana','ivete','jacqueline','jaqueline','janaina','janete',
  'josiane','josiely','josilene','joyce','judith','kelly','leilane','leila','leonora','ligia',
  'lindomar','lourdes','luciene','lucilene','lucimara','lucineia','lucinara','luzia','madalena',
  'magda','maira','maisa','marcelina','marcia','margarete','margareth','marilia','marina',
  'maristela','marlene','marta','meire','milena','mirela','nadia','nelma','neuza','nilza',
  'noely','norma','odete','olivia','orlanda','palmira','penelope','poliana','queila','quenia',
  'rachel','raissa','regiane','regilane','roseli','rosemeire','rosilda','rosilene','rosilei',
  'samara','samira','selma','shirley','silvana','soraya','suenia','susana','suzana','tania',
  'tatiana','telma','valdirene','valeria','valquiria','vania','vilma','wanessa','wanderlea',
  'yara','yasmin','yasmine','zelia','zeneide','zenaide','zilda','zuila','zuileide',
  // nomes menos comuns mas presentes
  'edna','edinalva','edineia','edinara','edineide','edwiges','elida','eliene','eliete',
  'elisa','elisia','elissandra','elizia','eliziane','elza','emilia','enilda','ercilia',
  'ericka','erika','erlane','eucilene','eunice','evandra','eveline','evelyn','fabiola',
  'flavia','flor','florencia','floripes','franciele','francieli','francilene','francisca',
  'geisa','geisiane','geovana','geovanna','gilmara','giselia','gislaine','glacilene',
  'gleice','gleiciane','glenia','gloria','graciele','gracieli','graziela','graziella',
  'helena','helia','hildre','hilda','idalina','idalva','idatiane','ines','ingrid',
  'ioneide','ionice','iranice','iranildes','iranilde','irani','iranete','iraneide',
  'irineia','islane','islania','islene','ivana','ivanir','ivanilde','ivanildes',
  'jandira','jandir','jaqueline','jenifer','jennifer','jocelia','joceliane','joelma',
  'joenia','joice','jonilda','jordana','jucelia','judite','jussara','karina','karla',
  'katia','katiane','katieli','keila','keily','leia','leide','leidiane','leila','lena',
  'leonice','leonilda','lessandra','letice','licia','lidiane','lidiane','liene','lisandra',
  'lisiane','lissandra','lorena','lourdes','lucelia','lucenildes','luciana','luciene',
  'lucimare','lucinara','lucivanda','luene','lurdes','lygia','maeli','maely','magali',
  'magnolia','maiara','maiane','maiane','maiele','mailane','mailene','mailze','mainá',
  'maisa','maisinha','malvina','manuela','mara','maraisa','maraiza','marcela','marcelia',
  'marcelina','marcelinda','marcilene','marciley','margarida','mari','mariangela',
  'maricleia','mariel','mariele','mariely','marieta','marilac','marilene','marilice',
  'marilsa','mariluze','marilza','marilze','marinalva','marinara','marinete','marineuza',
  'marinildes','marinilde','marinilza','mariza','marlei','marluce','marlucia','marluze',
  'marly','marolia','marsia','marycleide','meiry','melania','melissa','mercia','merice',
  'meriele','mikaela','mikele','milene','milla','mirela','mirian','miriã','naiara',
  'nailza','naira','nairana','nairobi','nanci','nanci','nara','narcisa','natali',
  'natalice','natalina','nataniele','nathalia','nelia','nelice','nelinda','nelita',
  'nelma','nely','neusa','nilceia','nilcemara','nildete','nildinha','nilmar','nilmara',
  'nilsa','nilza','nirce','nirce','nirlei','nirlene','nirmalva','nizia','noemi',
  'norma','odelia','odenise','odete','odineia','odineide','oleide','oleisa','olenaide',
  'olenice','olinda','olimpia','olinda','onilda','onilza','orilda','orivalda','osnilda',
  'ozana','ozelia','paola','patricia','pricila','priscila','rafaele','raiane','raíssa',
  'ramona','rania','raniely','raquelzinha','rasilda','rayane','rayne','rayssa','rene',
  'renilda','renice','renilda','rilda','rilma','rita','roberla','roberta','rocilda',
  'ronilda','rosali','rosalia','rosaline','rosalva','rosana','rosangela','rosaria',
  'roseleide','roseli','roselinda','roselita','roselma','rosely','rosemara','rosemeire',
  'rosemira','rosena','rosenilda','rosilei','rosilene','rosimar','rosinalda','rosinei',
  'rosinete','rosinilda','rosivalda','rosivania','rosivane','rosivania','rosivânia',
  'rossana','roxana','rozana','rozangela','rozelia','sabrina','salomé','samela','samile',
  'samires','samylle','sania','sarita','sarlete','selmara','senia','sergia','sidcley',
  'sidcleia','sidineia','sidneide','sidineia','sidneia','sidneia','silair','silaine',
  'silamara','silane','silara','sileia','silene','silenilde','sileuza','silmara','silmares',
  'silvia','silvana','simara','simare','simarize','simeia','simiele','simone','sinara',
  'sineide','sineia','sineta','sirlandia','sirley','sirlei','sirlene','sirlecia',
  'solange','soleni','solenice','solenira','solenice','sonali','sonia','sueli','suenia',
  'suiane','suilane','sulamita','sulane','sulenir','sylene','taina','tainara','tainã',
  'talita','tamara','tamires','tamyris','tania','tanila','tanise','tanis','tarsila',
  'tassia','tassiana','tassiele','tatyane','tecia','teila','telma','terezinha','tercia',
  'tiara','tirzah','toninha','tuana','tuane','ubiraci','udiane','udiara','ueslane',
  'uliane','uliana','uliara','ully','ursula','ursulina','valdenia','valdenira',
  'valdenice','valdineia','valdineia','valdinete','valdirene','valentina','valeria',
  'valesca','valeska','valkiria','valnice','valnir','vanderleia','vanderlene','vanessa',
  'vania','vanilda','vanilce','vanildes','vanilde','vanilza','vanilze','vanusa',
  'vanuza','vasilica','vera','veridiana','veridiane','veronica','vilani','vilania',
  'vilene','vilma','virgínia','virginia','viviane','viviani','wagna','waleska',
  'walkiria','wanda','wanderlea','wanessa','wellington','wilza','xenia','yasmim',
  'yasmin','yolanda','yolandia','zaira','zelma','zeneide','zenaide','zilda','zuila'
]);

const NOMES_M = new Set([
  'jose','joao','antonio','francisco','carlos','paulo','pedro','lucas','luiz','marcos',
  'luis','gabriel','rafael','daniel','marcelo','bruno','eduardo','felipe','raimundo',
  'rodrigo','manoel','manuel','nelson','fernando','anderson','andre','leandro','leonardo',
  'alexandro','alexandre','alex','alan','alan','ailton','ailton','ademir','adilson',
  'adilson','adimilson','adimir','adonis','adriano','afonso','agostinho','ailton',
  'airton','alailson','alan','alberito','alberto','albi','alcides','aldo','aldrin',
  'alecio','alecsandro','alecxandro','alef','aleilson','aleixo','alelson','alencar',
  'alender','alenis','alenquar','alenquer','alequison','alesandro','aleson','alex',
  'alexis','alexsander','alexsandro','alfredo','alicio','alinton','alisson','alister',
  'alistor','almir','aloisio','altair','altemir','altemiro','alton','alvaro','alves',
  'alves','alvinton','amaro','amauris','amauri','amaury','americo','amilcar','amilton',
  'aminadabe','amintas','amir','amisson','anderson','anilton','anisio','antonio',
  'aparecido','aquiles','aquino','arcenio','ardilson','argemiro','ariel','arlindo',
  'armenio','arnaldo','arnaldo','arno','aroldino','arquimedes','artur','arthur',
  'augusto','aurelio','aurisvaldo','avelino','azael','bartolomeu','belmiro','benedito',
  'benjamim','bento','bernardo','caio','calebe','calisto','camilo','caue','celio',
  'celso','cezar','charles','cicero','claudio','cleber','cleiton','cleidimar',
  'cleidson','cleimar','cleinton','cleison','clemente','cleumar','cleuton','clevis',
  'clezio','clodoaldo','cloves','clovis','crisanto','cristiano','cristovao','dario',
  'davi','david','demilson','demisson','demivaldo','denilson','denis','denison',
  'deomar','deovaldo','deraldo','dercio','derlan','derley','derlei','derson','deusdete',
  'deusilmar','deusmario','deusnilton','deusnei','deusmar','diassis','diego','diogo',
  'diovane','dirceu','domingos','donizete','dorival','douglas','durval','edgar',
  'edgard','edmilson','edmir','edivaldo','edivar','edilson','edilberto','edilan',
  'ediles','edilmar','edimilson','edimir','edinaldo','edinalvo','edinei','edinho',
  'edivaldo','edivam','edivar','edivandro','edmar','edmilson','edmundo','edner',
  'ednilson','ednildo','ednil','ednaldo','edoardo','eduardo','edvaldo','edvan',
  'edvandro','edvison','edwaldo','edward','edwaldo','egidio','elano','elber','elias',
  'elielson','eliezer','elinilton','elinton','elio','elionaldo','elionardo','eliomar',
  'elisan','eliseu','elisson','elivaldo','elomar','elpidio','elson','elton','elvano',
  'elves','elvino','elvio','emerson','emilio','enock','enoque','erico','eron','eroni',
  'eroni','eroni','eroni','ervan','erves','ervis','estevao','ethan','etienne','euler',
  'evaldo','evan','evandro','everton','ezequiel','ezequias','fabiano','fabio','fabricio',
  'fagner','fagner','falco','fausto','felix','fidelis','filipe','filho','flavio',
  'floriano','francielson','francinaldo','francismar','franks','fredi','frederico',
  'gabriel','geandro','geison','gelson','gerson','gilberto','gildemar','gildeval',
  'gildezio','gildo','gilmar','gilson','gilvan','gilvanio','gilvandro','giordano',
  'giovani','giovanni','giraldo','gleidson','gleison','glenio','gleyson','glicio',
  'gomes','graciano','gregorio','guilherme','gustavo','hamilton','heitor','helcio',
  'helder','henrique','hercules','herique','herton','herve','hilario','hilton','hiram',
  'homero','horacio','hudson','humberto','igor','ilton','irineu','isaias','ismael',
  'israel','italo','ivan','ivanildo','ivanilson','ivanio','ivar','ivo','ivonaldo',
  'jacob','jadilson','jaime','jailson','jairo','jaldimar','jales','jamerson','james',
  'jamilson','janio','jardel','jardel','jarlison','jarvis','jeferson','jefferson',
  'jerlan','jeronimo','jetro','jilvan','jilvanio','jilsomar','jilson','joel','jonatas',
  'jonas','jonathan','jorgemar','jorginho','joseildo','joseilson','joselito','josias',
  'josiel','josiel','josier','josivan','josivaldo','jovito','juarez','juan','julinho',
  'junio','junior','juvenal','kelvin','kesley','kessler','kevin','kleber','kleison',
  'klenio','kleyson','lailson','lailton','laion','laisson','lander','landro','lauro',
  'lavinio','lazaro','leandro','leidimar','leilton','lenilson','lenildo','lenio',
  'lenison','leocadio','leonaldo','leonel','leonidas','leonildo','leonilson','leovaldo',
  'leron','levin','lewis','lino','lionel','liston','lourival','luanderson','luciano',
  'lucielson','lucimar','lucio','luis','luiz','luizinho','lutero','macario','mailson',
  'mairton','manes','manoel','marcelino','marcilio','marcio','marcos','marinho',
  'mario','marius','marlon','marlon','maro','marrony','mateus','mathias','matias',
  'mauricio','mauro','maylon','maycon','maykel','maykon','maylon','mayron','messias',
  'michael','michell','michel','miguel','mikael','miqueias','moises','mozart',
  'murilo','napoleon','natan','natanael','nathanael','neil','nelson','nemias',
  'nerivaldo','nestor','newton','nilmar','nilton','noel','noilton','norival','obed',
  'obede','ocimar','odair','odenilson','odinaldo','odinei','odivaldo','odilon',
  'oldair','olimar','olimpio','olimpio','oliveiro','olivo','olmir','omar','onivaldo',
  'oraldo','orlando','ormindo','oromar','orson','oscar','osmaildo','osmanar','osmar',
  'osorio','osvaldo','otavio','pablo','palmiro','pamphilo','paris','pascoal','patricio',
  'paulo','persio','phillipe','pierre','plinio','poliano','pontes','pricles','rafael',
  'railson','raimundo','raldimar','ramiro','ramonilson','ranison','raniery','ranildo',
  'ranito','raquilson','raul','raylson','rayan','raynaldo','raymundo','reginaldo',
  'reinaldo','reinaldo','renan','renato','rene','renildo','renilson','renivaldo',
  'rerivelton','ribamar','ricardo','rildomar','rilton','rinaldo','ritson','rivaldo',
  'roan','robson','rodrigo','rogelio','rogerio','rogildo','roginson','romagnole',
  'roman','romario','romar','romildo','romilson','rommel','ronaldo','ronieldo',
  'roniery','roniery','ronildo','ronivaldo','rono','roquelino','roquilson','rosenaldo',
  'rosialdo','rosivaldo','rotsen','rubem','rubens','rufino','ruimar','ruy','salatiel',
  'saldino','salomao','salustiano','samoel','samuel','sandoval','sandro','sanilson',
  'sansao','santino','saulo','sebastiao','selmo','sergio','servilio','sidcley',
  'sidclio','sidclei','sidelmar','sideral','sideralvo','sideraldo','sidilmar',
  'sidmar','sidinaldo','sidnei','sidney','sigmar','silvano','silverio','silvino',
  'silvio','simao','sinivaldo','siomar','sirlan','sirley','sirlei','sirlei',
  'solon','stenio','tarcisio','thadeu','thiago','tiago','timoteo','tobias','toninho',
  'uanderlei','uanderson','ubaldino','ubirajara','ubiraci','ubiratan','ulisses',
  'valdemar','valdenir','valdenilson','valdenildo','valderildo','valdivino','valdir',
  'valdo','valerio','vanderlei','vanderlino','vanderson','vanildo','vanilson',
  'vanilmar','vanilmar','vany','varley','vasco','vespasiano','victor','vidal',
  'vilmar','vilson','vinicius','virgilio','vitorio','vitor','wagner','walderlei',
  'waldemar','waldenor','waldir','waldomiro','walison','wallison','walmir','walney',
  'waltercio','waltemar','waltenildo','walter','wanderlei','wanderlino','wanderson',
  'waneison','warlei','warley','washington','weder','weldimar','welison','weliton',
  'wellington','wemerson','wendel','wendell','wenefrido','werley','wermerson',
  'weslei','wesler','wesley','weverton','wilanio','wilanildo','wilanir','wilian',
  'wilimar','wilker','willian','william','willieldo','wilsimar','wilson','wiltercio',
  'winaldo','wladimir','wolmar','xisto','yago','yuri','zacarias','zaqueu','zelino',
  'zelito','zenobio','zeomar','zileido','zilmar','zoroastro'
]);

function sugerirSexo(nome) {
  const hint = $('d-sx-hint');
  const btnF = $('d-btn-fem');
  const btnM = $('d-btn-mas');
  if(!hint || !btnF || !btnM) return;
  // Se capelão já escolheu manualmente, não sobrescrever
  if(S.dec._sexoManual) return;
  const primeiro = (nome||'').trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(!primeiro || primeiro.length < 2) return;
  let sugestao = null;
  if(NOMES_F.has(primeiro)) sugestao = 'F';
  else if(NOMES_M.has(primeiro)) sugestao = 'M';
  if(!sugestao) return; // nome não reconhecido — capelão escolhe
  // Aplicar sugestão
  [btnF, btnM].forEach(b => b.classList.remove('on'));
  if(sugestao === 'F'){ btnF.classList.add('on'); S.dec.sexo = 'Feminino'; }
  else               { btnM.classList.add('on'); S.dec.sexo = 'Masculino'; }
  hint.style.display = 'inline';
}

function tog(campo, val, btn) {
  S.dec[campo] = val;
  btn.closest('.tg').querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  // Ao clicar manualmente no sexo, travar sugestão automática
  if(campo === 'sexo') {
    S.dec._sexoManual = true;
    const h=$('d-sx-hint'); if(h) h.style.display='none';
  }
}
function setInteg(sim) {
  S.dec.integ = sim;
  $('d-sim').classList.toggle('on', sim);
  $('d-nao').classList.toggle('on', !sim);
  $('blk-sim').style.display = sim ? 'block' : 'none';
  $('blk-nao').style.display = sim ? 'none' : 'block';
  // Regra: NÃO integrar → limpar e travar telefone
  const telInput = $('d-tel');
  if(!sim){
    telInput.value = '';
    telInput.disabled = true;
    telInput.style.background = 'var(--g1)';
    telInput.style.borderColor = 'var(--g2)';
  } else {
    telInput.disabled = false;
    telInput.style.background = '';
    telInput.style.borderColor = '';
    telInput.focus();
  }
}

// Validação visual em tempo real do telefone
function validarTelInput(input) {
  const num = input.value.replace(/\D/g,'');
  const valido = num.length === 11 && num !== '92000000000';
  const vazio  = num.length === 0;
  if(vazio){
    input.style.borderColor = '';
    input.style.background  = '';
  } else if(valido){
    input.style.borderColor = '#16a34a';
    input.style.background  = '#f0fdf4';
  } else {
    input.style.borderColor = '#dc2626';
    input.style.background  = '#fef2f2';
  }
}
async function salvarDec() {
  const nm=$('d-nm').value.trim(), tel=$('d-tel').value.trim();
  const integ=S.dec.integ, det=$('d-obs').value.trim(), mot=$('d-mot').value;
  // Validar campos obrigatórios que antes tinham pré-seleção
  if(S.dec.assistido===null){ msg('Selecione o tipo de assistido (Paciente ou Visitante).','er'); return; }
  if(S.dec.sexo===null){ msg('Selecione o sexo do assistido.','er'); return; }
  if(S.dec.integ===null){ msg('Informe se deseja realizar a integração (SIM ou NÃO).','er'); return; }
  if(!nm){ msg('Informe o nome do assistido.','er'); return; }
  if(integ&&!tel){ msg('Informe o telefone para integração.','er'); $('d-tel').focus(); return; }
  // Validar telefone — exigir exatamente 11 dígitos (DDD 2 + número 9)
  if(integ && tel){
    var telNum = tel.replace(/\D/g,'');
    if(telNum.length !== 11){
      msg('Telefone inválido — use DDD + 9 dígitos (ex: 92981234567).','er');
      $('d-tel').focus(); $('d-tel').style.borderColor='#dc2626'; $('d-tel').style.background='#fef2f2';
      return;
    }
  }
  // Garantir que NÃO integrar nunca salve telefone
  const telFinal = integ ? tel : '';
  if(integ&&!det){ msg('Informe as observações.','er'); return; }
  if(!integ&&!mot){ msg('Selecione o motivo.','er'); return; }
  const h=new Date(), hS=fD(h);
  if(!naSemanAtual(hS)){ msg('Fora da semana atual.','er'); return; }
  // Validar duplicata local (UX) — a defesa de verdade é a constraint única no banco
  if(integ && tel) {
    const telNum = tel.replace(/\D/g,'');
    const dupSessao = S.decSession.find(d => d.tel && d.tel.replace(/\D/g,'') === telNum);
    if(dupSessao) {
      msg('⚠️ Já existe decisão registrada para este telefone nesta semana.', 'er');
      return;
    }
    if(S._decMap) {
      const dupSemana = Object.values(S._decMap).find(d =>
        d.tel && d.tel.toString().replace(/\D/g,'') === telNum
      );
      if(dupSemana) {
        msg('⚠️ Já existe decisão registrada para este telefone nesta semana.', 'er');
        return;
      }
    }
  }
  if(S._salvandoDec){ msg('Aguarde, salvando...','er'); return; }
  S._salvandoDec = true;
  load('Salvando...');
  try {
    await supaGravarDecisao({
      capelaoId: S.user.codigo,
      equipeId: S.equipeId,
      dataVisita: toISODate(S.dv||h),
      assistido: S.dec.assistido,
      nome: nm,
      sexo: S.dec.sexo==='Masculino'?'M':'F',
      tel, integ, motivo:mot, obs:det
    });
    unload();
    // Adicionar à sessão local e renderizar — NÃO fechar o sheet
    S.decSession.push({nm, assistido:S.dec.assistido, integ, tel});
    renderSessao();
    // Resetar só os campos editáveis, manter sheet aberto
    resetFormDec();
    msg('✅ Decisão salva!','ok');
    // Recarregar lista da semana em background
    loadDecSemana();
  } catch(e){
    unload();
    msg(e.duplicata ? '⚠️ '+e.message : 'Erro: '+e.message, 'er');
  }
  finally { S._salvandoDec = false; }
}

// ═══════════════════════════════════════
// CADASTRO
// ═══════════════════════════════════════
async function loadCad() {
  load('Carregando membros...');
  try {
    const [todos, eqs] = await Promise.all([
      lerCadastro(),
      S.eqList.length ? Promise.resolve(S.eqList) : lerEquipes()
    ]);
    S.cadAll = todos;
    S.eqList = eqs;
    // Filtrar só ativos
    S.cad = todos.filter(m=>(m.sit||'').toLowerCase()==='ativo');
    unload();
    buildChips();
    renderCad();
  } catch(e){ unload(); msg('Erro ao carregar: '+e.message,'er'); }
}

function buildChips() {
  const fc = $('c-chips'); fc.innerHTML='';
  const eqSet = new Set();
  S.cad.forEach(m=>(m.equipes||'').split(',').map(e=>e.trim()).filter(Boolean).forEach(e=>eqSet.add(e)));

  const sel = document.createElement('select');
  sel.style.cssText='width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--g2);background:var(--bg);color:var(--tx);font-size:14px;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23999\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;cursor:pointer;';

  const optAll = document.createElement('option');
  optAll.value='todas'; optAll.textContent='👥 Todos os membros';
  sel.appendChild(optAll);

  [...eqSet].sort().forEach(e=>{
    const o=document.createElement('option');
    o.value=e; o.textContent='📍 '+e;
    sel.appendChild(o);
  });

  sel.value = S.cadFiltEq||'todas';
  sel.onchange=()=>{ S.cadFiltEq=sel.value; renderCad(); };
  fc.appendChild(sel);
}

function renderCad() {
  const ls = $('c-list');
  const busca = ($('c-search')?.value||'').toLowerCase();
  let mbs = S.cad;
  if(busca) mbs = mbs.filter(m=>(m.nomeSoc+m.nomeComp+m.usuario).toLowerCase().indexOf(busca)>=0);

  let html='';

  if(!S.cadFiltEq || S.cadFiltEq==='todas'){
    // Modo padrão: lista alfabética simples, sem agrupamento por equipe
    const sorted = [...mbs].sort((a,b)=>(a.nomeSoc||a.nomeComp).localeCompare(b.nomeSoc||b.nomeComp,'pt-BR'));
    if(!sorted.length){ ls.innerHTML='<div class="empty"><div class="ei">🔍</div><p>Nenhum membro encontrado.</p></div>'; return; }
    sorted.forEach(m=>{
      const temFoto = m.foto&&m.foto.indexOf('http')===0;
      const fotoUrl = temFoto ? converterUrlFoto(m.foto) : '';
      html+=`<div class="mrow" onclick="openMembro('${m.linha}')">`;
      if(temFoto) html+=`<div class="av"><img src="${fotoUrl}" onerror="this.parentElement.textContent='${ini(m.nomeSoc||m.nomeComp)}'"></div>`;
      else html+=`<div class="av">${ini(m.nomeSoc||m.nomeComp)}</div>`;
      html+=`<div style="flex:1;min-width:0"><div class="mname">${m.nomeSoc||m.nomeComp}</div></div>
        <span style="color:var(--g3);font-size:20px">›</span></div>`;
    });
  } else {
    // Modo equipe: mostra só membros daquela equipe, agrupados
    const filtrados = mbs.filter(m=>{
      const eqs=(m.equipes||'').split(',').map(e=>e.trim()).filter(Boolean);
      return eqs.indexOf(S.cadFiltEq)>=0;
    }).sort((a,b)=>(a.nomeSoc||a.nomeComp).localeCompare(b.nomeSoc||b.nomeComp,'pt-BR'));
    if(!filtrados.length){ ls.innerHTML='<div class="empty"><div class="ei">🔍</div><p>Nenhum membro nesta equipe.</p></div>'; return; }
    html+=`<div class="eq-hdr"><span>📍 ${S.cadFiltEq}</span><span class="eq-cnt">${filtrados.length}</span></div>`;
    filtrados.forEach(m=>{
      const temFoto = m.foto&&m.foto.indexOf('http')===0;
      const fotoUrl = temFoto ? converterUrlFoto(m.foto) : '';
      html+=`<div class="mrow" onclick="openMembro('${m.linha}')">`;
      if(temFoto) html+=`<div class="av"><img src="${fotoUrl}" onerror="this.parentElement.textContent='${ini(m.nomeSoc||m.nomeComp)}'"></div>`;
      else html+=`<div class="av">${ini(m.nomeSoc||m.nomeComp)}</div>`;
      html+=`<div style="flex:1;min-width:0"><div class="mname">${m.nomeSoc||m.nomeComp}</div></div>
        <span style="color:var(--g3);font-size:20px">›</span></div>`;
    });
  }

  ls.innerHTML = html;
}

// ═══════════════════════════════════════
// MEMBRO DETALHE
// ═══════════════════════════════════════
function openMembro(linha){
  const m = S.cadAll.find(x=>x.linha===linha);
  if(!m) return;
  S.cur = m;
  fillView(m);
  // Reset tabs
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelector('.tab').classList.add('on');
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  $('p0').classList.add('on');
  showEdit(0,false); showEdit(1,false);
  ir('membro');
}

function setText(id, val) {
  const el = $(id); if(el) el.textContent = val||'-';
}

function fillView(m){
  const ns = m.nomeSoc||m.nomeComp;
  setText('m-name', ns);
  setText('m-id', m.id);

  // Avatar com foto
  const av = $('m-av');
  if(av){
    if(m.foto && m.foto.indexOf('http')===0){
      const fotoUrl = converterUrlFoto(m.foto);
      av.innerHTML=`<img src="${fotoUrl}" style="width:100%;height:100%;object-fit:cover"
        onerror="this.style.display='none';this.parentElement.textContent='${ini(ns)}'">`;
    } else {
      av.textContent = ini(ns);
    }
  }
  // Botão câmera — só para Líder
  const camBtn = $('btn-cam-m');
  if(camBtn) camBtn.style.display = S.user?.perfil==='Líder' ? 'flex' : 'none';

  // Badge situação
  const bd = $('m-badge');
  if(bd){ bd.textContent=m.sit||'Ativo'; bd.className='badge '+(m.sit==='Ativo'?'bg-g':'bg-r'); }

  // Btn situação
  const bs = $('btn-sit');
  if(bs){ bs.textContent=m.sit==='Ativo'?'⛔ Desativar':'✅ Ativar membro'; bs.className='btn '+(m.sit==='Ativo'?'btn-r':'btn-g'); }

  // Dados pessoais
  setText('v-pin', m.pin);   setText('v-nc', m.nomeComp);
  setText('v-us', m.usuario); setText('v-sx', m.sexo);
  setText('v-tel', m.tel);    setText('v-rg', m.rg);
  setText('v-em', m.email);   setText('v-an', m.aniversario);

  // Ministerial
  setText('vm-dc', m.declaMinist); setText('vm-lg', m.liderGA);
  setText('vm-ucd', m.umComDeus);  setText('vm-bat', m.batizado);
  setText('vm-grp', m.grupo);      setText('vm-clt', m.culto);
  setText('vm-snb', m.senib);      setText('vm-fi', m.fazInteg);
  setText('vm-sit', m.sit);        setText('vm-pf', m.perfil);
  setText('vm-obs', m.obs);

  // Equipes
  renderEqList(m.equipes||'');
}

function setTab(idx, btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on'); $('p'+idx).classList.add('on');
}

function showEdit(pane, on){
  const vEl = $('v'+pane), eEl = $('e'+pane);
  if(vEl) vEl.style.display = on ? 'none' : 'block';
  if(eEl) eEl.style.display = on ? 'block' : 'none';
  if(!on || !S.cur) return;
  const m = S.cur;
  if(pane===0){
    if($('ep'))   $('ep').value   = m.pin||'';
    if($('enc'))  $('enc').value  = m.nomeComp||'';
    if($('ens'))  $('ens').value  = m.nomeSoc||'';
    if($('etel')) $('etel').value = m.tel||'';
    if($('erg'))  $('erg').value  = m.rg||'';
    if($('eem'))  $('eem').value  = m.email||'';
    if($('ean')) {
      // Planilha guarda DD/MM ou DD/MM/YYYY — exibir só DD/MM
      const anivVal = (m.aniversario||'').trim();
      const partes = anivVal.split('/');
      // Se vier DD/MM/YYYY ou DD/MM, pegar só os dois primeiros blocos
      const anivDisplay = (partes.length >= 2) ? partes[0]+'/'+partes[1] : anivVal;
      $('ean').value = anivDisplay;
    }
    // Sexo — setar valor direto
    const esx = $('esx');
    if(esx) {
      const sx = (m.sexo||'').toString().trim();
      // Tentar setar direto primeiro
      esx.value = sx;
      // Se não encontrou, tentar variações
      if(!esx.value || esx.value !== sx) {
        for(const opt of esx.options) {
          if(opt.value===sx || opt.text===sx ||
             opt.value.toUpperCase()===sx.toUpperCase()) {
            esx.value = opt.value; break;
          }
        }
      }
    }
  }
  if(pane===1){
    if($('elg'))  $('elg').value  = m.liderGA||'';
    if($('eobs')) $('eobs').value = m.obs||'';
    setOpt('edc',  m.declaMinist);
    setOpt('eucd', m.umComDeus);
    setOpt('ebat', m.batizado);
    setOpt('egrp', m.grupo);
    setOpt('eclt', m.culto);
    setOpt('esnb', m.senib);
    setOpt('efi',  m.fazInteg);
    setOpt('esit', m.sit||'Ativo');
    setOpt('epf',  m.perfil||'Membro');
  }
}

function buildVals(m, overrides){
  const o = {...m, ...overrides};
  return [o.id,o.foto||'',o.pin,o.nomeComp,o.nomeSoc,o.usuario,o.sexo||'',o.tel||'',o.rg||'',o.email||'',
    o.declaMinist||'',o.liderGA||'',o.umComDeus||'',o.batizado||'',o.grupo||'',o.culto||'',o.senib||'',
    o.aniversario||'',o.equipes||'',o.fazInteg||'',o.sit||'Ativo',o.obs||'',o.perfil||'Membro'];
}

async function salvarDados(){
  const m=S.cur;
  const pin=$('ep').value.trim(),nc=$('enc').value.trim(),ns=$('ens').value.trim();
  if(!pin||!nc||!ns){ msg('Preencha os campos obrigatórios.','er'); return; }
  const ovr={pin,nomeComp:nc,nomeSoc:ns,usuario:m.usuario||pin,sexo:$('esx').value,tel:$('etel').value.trim(),rg:$('erg').value.trim(),email:$('eem').value.trim(),aniversario:$('ean').value.trim()};
  load('Salvando...');
  try{
    await atualizar('Cadastro', m.linha, buildVals(m,ovr));
    Object.assign(m,ovr);
    S.cad=S.cadAll.filter(x=>x.sit==='Ativo');
    unload(); fillView(m); showEdit(0,false);
    msg('✅ Dados salvos!','ok');
  }catch(e){unload();msg('Erro: '+e.message,'er');}
}

async function salvarMin(){
  const m=S.cur;
  const ovr={declaMinist:$('edc').value,liderGA:$('elg').value.trim(),umComDeus:$('eucd').value,
    batizado:$('ebat').value,grupo:$('egrp').value,culto:$('eclt').value,senib:$('esnb').value,
    fazInteg:$('efi').value,sit:$('esit').value,perfil:$('epf').value,obs:$('eobs').value.trim()};
  load('Salvando...');
  try{
    await atualizar('Cadastro', m.linha, buildVals(m,ovr));
    Object.assign(m,ovr);
    S.cad=S.cadAll.filter(x=>x.sit==='Ativo');
    unload(); fillView(m); showEdit(1,false);
    msg('✅ Dados ministeriais salvos!','ok');
  }catch(e){unload();msg('Erro: '+e.message,'er');}
}

function renderEqList(selecionadas){
  const sel=(selecionadas||'').split(',').map(e=>e.trim()).filter(Boolean);
  const el=$('eq-list');
  if(!S.eqList.length){ el.innerHTML='<div style="color:var(--g4);padding:12px">Nenhuma equipe disponível.</div>'; return; }
  el.innerHTML='';
  S.eqList.forEach(eq=>{
    const nome = eq.nome||eq; // compatível com string ou objeto
    const item=document.createElement('div');
    item.className='eq-item'+(sel.indexOf(nome)>=0?' on':'');
    item.dataset.eq=nome;
    item.innerHTML=`<div class="eq-box">${sel.indexOf(nome)>=0?'✓':''}</div><div class="eq-lbl">${nome}</div>`;
    item.onclick=()=>{
      item.classList.toggle('on');
      const box=item.querySelector('.eq-box');
      box.textContent=item.classList.contains('on')?'✓':'';
    };
    el.appendChild(item);
  });
}

async function salvarEq(){
  const checks=$('eq-list').querySelectorAll('.eq-item.on');
  const equipes=[...checks].map(c=>c.dataset.eq).join(',');
  const m=S.cur;
  load('Salvando equipes...');
  try{
    await atualizar('Cadastro', m.linha, buildVals(m,{equipes}));
    m.equipes=equipes;
    unload(); msg('✅ Equipes salvas!','ok');
  }catch(e){unload();msg('Erro: '+e.message,'er');}
}

async function alterarSit(){
  const m=S.cur;
  const novo=m.sit==='Ativo'?'Inativo':'Ativo';
  if(!confirm((novo==='Inativo'?'Desativar':'Ativar')+' '+(m.nomeSoc||m.nomeComp)+'?')) return;
  load('Atualizando...');
  try{
    await atualizar('Cadastro', m.linha, buildVals(m,{sit:novo}));
    m.sit=novo;
    S.cad=S.cadAll.filter(x=>x.sit==='Ativo');
    unload(); fillView(m);
    msg(novo==='Ativo'?'✅ Membro ativado!':'⛔ Membro desativado!','ok');
  }catch(e){unload();msg('Erro: '+e.message,'er');}
}

// ═══════════════════════════════════════
// NOVO MEMBRO
// ═══════════════════════════════════════
function openNovo(){
  ['nn-pin','nn-nc','nn-ns','nn-tel','nn-em'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
  const sx=$('nn-sx'); if(sx) sx.value='';
  const pf=$('nn-pf'); if(pf) pf.value='Membro';
  $('sh-novo').classList.add('on');
}
function closeNovo(){ $('sh-novo').classList.remove('on'); }

async function salvarNovo(){
  const pin=$('nn-pin').value.trim(),nc=$('nn-nc').value.trim();
  const ns=$('nn-ns').value.trim();
  if(!pin||!nc||!ns){ msg('Preencha os campos obrigatórios.','er'); return; }
  // Validar matrícula duplicada
  load('Verificando matrícula...');
  try {
    const chk = await supaValidarMatricula(pin);
    if(chk.existe){ unload(); msg('Matrícula '+pin+' já cadastrada!','er'); return; }
  } catch(e){
    unload();
    msg('Erro ao verificar matrícula. Tente novamente.','er');
    return;
  }
  const id='CP'+pin;
  // Col F = senha padrão = matrícula
  const vals=[id,'',pin,nc,ns,pin,$('nn-sx').value,$('nn-tel').value.trim(),'',
    $('nn-em').value.trim(),'','','','','','','','','','','Ativo','',$('nn-pf').value];
  load('Cadastrando...');
  try{
    await gravar('Cadastro',vals);
    const novo={linha:S.cadAll.length+2,id,foto:'',pin,nomeComp:nc,nomeSoc:ns,usuario:pin,
      sexo:$('nn-sx').value,tel:$('nn-tel').value.trim(),rg:'',email:$('nn-em').value.trim(),
      declaMinist:'',liderGA:'',umComDeus:'',batizado:'',grupo:'',culto:'',senib:'',
      aniversario:'',equipes:'',fazInteg:'',sit:'Ativo',obs:'',perfil:$('nn-pf').value};
    S.cadAll.push(novo); S.cad.push(novo);
    unload(); closeNovo(); renderCad();
    msg('✅ Membro cadastrado! Senha padrão: '+pin,'ok');
  }catch(e){ unload(); msg('Erro: '+e.message,'er'); }
}

// ═══════════════════════════════════════
// ACCORDION DECISÕES
// ═══════════════════════════════════════
async function loadDecSemana() {
  const sw = getSemana();
  $('d-sw').textContent = fD(sw.ini).slice(0,5)+' – '+fD(sw.fim).slice(0,5);
  const ls = $('d-lista-semana');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    const lista = await supaLerDecisoesSemana(numSemana(new Date()));
    $('d-total').textContent = lista.length;
    // Guardar mapa uid→decisão para editar/excluir
    S._decMap = {};
    lista.forEach(d=>{ S._decMap[d.id]=d; });
    if(!lista.length){
      ls.innerHTML='<div class="empty"><div class="ei">✝</div><p>Nenhuma decisão esta semana.<br>Toque + para registrar.</p></div>';
      return;
    }
    // Agrupar por equipe
    const grupos = {}, ordem = [];
    lista.forEach(d=>{
      const eq = d.equipe||'Sem equipe';
      if(!grupos[eq]){ grupos[eq]=[]; ordem.push(eq); }
      grupos[eq].push(d);
    });
    ls.innerHTML = ordem.map((eq,i) => `
      <div class="acc-hdr" id="acc-hdr-${i}" onclick="toggleAcc(${i})">
        <div class="acc-hdr-left">
          <span style="font-size:14px">📍</span>
          <span class="acc-hdr-eq">${eq}</span>
          <span class="acc-cnt">${grupos[eq].length}</span>
        </div>
        <span class="acc-arr">▾</span>
      </div>
      <div class="acc-body" id="acc-body-${i}">
        ${grupos[eq].map((d,di)=>{
            const podeEditar = S.user.perfil==='Líder' || d.capelaoId===S.user.codigo;
            const uid = d.id;
            return `<div class="dec-item">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                <div style="flex:1;min-width:0">
                  <div class="dec-name">${d.nome}</div>
                  <div class="dec-sub">
                    ${d.assistido} · ${d.sexo||'-'}
                    ${d.tel?'· 📞 '+d.tel:''}
                    · <span class="badge ${d.integ==='S'?'bg-g':'bg-y'}">${d.integ==='S'?'✅ Integrar':'⏭ Não'}</span>
                  </div>
                </div>
                ${podeEditar?`<div style="display:flex;gap:6px;flex-shrink:0">
                  <button onclick="abrirEditDec('${uid}')" style="border:none;background:var(--g2);color:var(--navy);border-radius:8px;padding:5px 9px;font-size:13px;cursor:pointer" title="Editar">✏️</button>
                  <button onclick="confirmarExcluirDec('${uid}')" style="border:none;background:#fee2e2;color:#991b1b;border-radius:8px;padding:5px 9px;font-size:13px;cursor:pointer" title="Excluir">🗑️</button>
                </div>`:''}
              </div>
            </div>`;
          }).join('')}
      </div>`).join('');
  } catch(e) {
    ls.innerHTML='<div class="empty"><div class="ei">⚠️</div><p>Erro ao carregar decisões.</p></div>';
  }
}

function toggleAcc(idx) {
  const hdr = $('acc-hdr-'+idx);
  const body = $('acc-body-'+idx);
  const isOpen = hdr.classList.contains('on');
  // Fechar todos
  document.querySelectorAll('.acc-hdr').forEach(h=>h.classList.remove('on'));
  document.querySelectorAll('.acc-body').forEach(b=>b.classList.remove('on'));
  // Abrir o clicado (se estava fechado)
  if(!isOpen){ hdr.classList.add('on'); body.classList.add('on'); }
}

// ═══════════════════════════════════════
// EDITAR / EXCLUIR DECISÃO
// ═══════════════════════════════════════
function abrirEditDec(uid) {
  const d = (S._decMap||{})[uid];
  if(!d){ msg('Decisão não encontrada.','er'); return; }
  S._editDecUid = uid;
  // Preencher campos
  $('ed-nm').value  = d.nome||'';
  $('ed-tel').value = d.tel||'';
  $('ed-obs').value = d.obs||'';
  // Toggles assistido
  ['ed-pac','ed-vis'].forEach(id=>$(id).classList.remove('on'));
  if(d.assistido==='Paciente')  $('ed-pac').classList.add('on');
  if(d.assistido==='Visitante') $('ed-vis').classList.add('on');
  // Toggles sexo
  ['ed-fem','ed-mas'].forEach(id=>$(id).classList.remove('on'));
  if((d.sexo||'').toUpperCase()==='F'||(d.sexo||'')==='Feminino')  $('ed-fem').classList.add('on');
  if((d.sexo||'').toUpperCase()==='M'||(d.sexo||'')==='Masculino') $('ed-mas').classList.add('on');
  // Toggle integração
  $('ed-sim').classList.toggle('on', d.integ==='S');
  $('ed-nao').classList.toggle('on', d.integ==='N');
  S._editDec = Object.assign({}, d, {
    assistido: d.assistido||'Paciente',
    sexo: (d.sexo||'').toUpperCase()==='F'?'Feminino':'Masculino',
    integ: d.integ==='S'
  });
  $('sh-edit-dec').classList.add('on');
}

function togEdit(campo, val, btn) {
  S._editDec[campo] = val;
  btn.closest('.tg').querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
}

function setIntegEdit(sim) {
  S._editDec.integ = sim;
  $('ed-sim').classList.toggle('on', sim);
  $('ed-nao').classList.toggle('on', !sim);
}

async function salvarEditDec() {
  const d = S._editDec;
  if(!d){ msg('Nenhuma decisão selecionada.','er'); return; }
  const nm  = $('ed-nm').value.trim();
  const tel = $('ed-tel').value.trim();
  const obs = $('ed-obs').value.trim();
  if(!nm){ msg('Informe o nome do assistido.','er'); return; }
  if(d.integ && !tel){ msg('Informe o telefone.','er'); return; }
  const camposEdit = {
    nome:       nm,
    tel:        tel,
    obs:        obs,
    assistido:  d.assistido,
    sexo:       d.sexo==='Feminino'?'F':'M',
    integrar:   d.integ?'S':'N',
    motivo:     d.integ?'':($('ed-mot')?$('ed-mot').value:'')
  };
  load('Salvando...');
  try {
    await supaEditarDecisao(S._editDecUid, camposEdit);
    unload();
    $('sh-edit-dec').classList.remove('on');
    msg('✅ Decisão atualizada!','ok');
    loadDecSemana();
  } catch(e){
    unload();
    msg(e.duplicata ? '⚠️ '+e.message : 'Erro: '+e.message, 'er');
  }
}

async function confirmarExcluirDec(uid) {
  const d = (S._decMap||{})[uid];
  if(!d){ msg('Decisão não encontrada.','er'); return; }
  if(!confirm('Excluir a decisão de "'+d.nome+'"? Esta ação não pode ser desfeita.')){ return; }
  load('Excluindo...');
  try {
    await supaExcluirDecisao(d.id);
    unload();
    msg('✅ Decisão excluída.','ok');
    loadDecSemana();
  } catch(e){ unload(); msg('Erro: '+e.message,'er'); }
}

// ═══════════════════════════════════════
// FORMULÁRIO DECISÃO — salva e continua
// ═══════════════════════════════════════
function openFormDec() {
  fillDecInfo();
  resetFormDec();
  renderSessao();
  $('sh-dec').classList.add('on');
}

function fecharFormDec() {
  $('sh-dec').classList.remove('on');
  // Limpar sessão local (as decisões já foram salvas no Sheets)
  S.decSession = [];
  // Recarregar lista da semana com os novos registros
  loadDecSemana();
}

function resetFormDec() {
  ['d-nm','d-obs'].forEach(id=>$(id).value='');
  $('d-mot').value='';
  // Resetar telefone — sempre começa desabilitado (só habilita ao escolher SIM)
  const telInput = $('d-tel');
  telInput.value = '';
  telInput.disabled = true;
  telInput.style.background  = 'var(--g1)';
  telInput.style.borderColor = 'var(--g2)';
  S.dec = {assistido:null, sexo:null, integ:null, _sexoManual:false};
  document.querySelectorAll('#sh-dec .tg').forEach(tg=>{
    tg.querySelectorAll('.tb').forEach(b=>b.classList.remove('on'));
  });
  $('d-nao').classList.remove('on'); $('d-sim').classList.remove('on');
  $('blk-sim').style.display='none'; $('blk-nao').style.display='block';
  // Limpar hint de sugestão de sexo
  const hint = $('d-sx-hint');
  if(hint) hint.style.display = 'none';
}

function renderSessao() {
  const bl = $('d-sessao'), ls = $('d-lista-sessao');
  if(!S.decSession.length){ bl.style.display='none'; return; }
  bl.style.display='block';
  $('d-qtd').textContent = S.decSession.length;
  ls.innerHTML = S.decSession.map(d=>`
    <div class="dec-item" style="margin-bottom:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div class="dec-name">${d.nm}</div>
        <span class="badge ${d.integ?'bg-g':'bg-y'}">${d.integ?'✅':'⏭'}</span>
      </div>
      <div class="dec-sub">${d.assistido}${d.tel?' · '+d.tel:''}</div>
    </div>`).join('');
}

// ═══════════════════════════════════════
// FOTO — Cloudinary (upload direto, sem CORS)
// ═══════════════════════════════════════
const CLOUD_NAME   = 'divxtp2wh';

// Comprime imagem antes de enviar — maxWidth em pixels, quality 0-1
function comprimirImagem(file, maxWidth, quality) {
  return new Promise((ok, er) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if(w > maxWidth){ h = Math.round(h * maxWidth / w); w = maxWidth; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => ok(blob), 'image/jpeg', quality);
    };
    img.onerror = er;
    img.src = url;
  });
}
const CLOUD_PRESET = 'capelania';
const CLOUD_URL    = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

function abrirCameraM() {
  if(S.user?.perfil !== 'Líder') return;
  $('foto-input-m').click();
}

async function onFotoChangeM(event) {
  const file = event.target.files[0];
  if(!file || !S.cur) return;

  const prog = $('foto-prog');
  prog.classList.add('on');

  // Preview imediato no avatar
  const localUrl = URL.createObjectURL(file);
  const av = $('m-av');
  av.innerHTML = `<img src="${localUrl}" style="width:100%;height:100%;object-fit:cover">`;

  try {
    // Upload direto para Cloudinary — sem Apps Script, sem CORS
    const pin = (S.cur.pin || S.cur.id || 'sem-pin').toString().trim();
    // Comprimir antes de enviar
    const fileComp = await comprimirImagem(file, 800, 0.75);
    const formData = new FormData();
    formData.append('file', fileComp);
    formData.append('upload_preset', CLOUD_PRESET);
    formData.append('public_id', pin);
    formData.append('folder', 'capelania/Membros');

    const resp = await fetch(CLOUD_URL, {method:'POST', body: formData});
    const data = await resp.json();
    console.log('Cloudinary response:', JSON.stringify(data));
    if(!resp.ok) throw new Error('HTTP ' + resp.status + ' - ' + (data.error?.message||JSON.stringify(data)));
    const fotoUrl = data.secure_url;
    if(!fotoUrl) throw new Error('URL não retornada: ' + JSON.stringify(data));

    // Salvar URL no Supabase
    await supaAtualizarFotoMembro(S.cur.linha, fotoUrl);
    S.cur.foto = fotoUrl;

    // Atualizar cache local
    const idx = S.cadAll.findIndex(x=>x.linha===S.cur.linha);
    if(idx>=0) S.cadAll[idx].foto = fotoUrl;
    S.cad = S.cadAll.filter(x=>x.sit==='Ativo');

    prog.classList.remove('on');
    msg('✅ Foto salva!', 'ok');

  } catch(e) {
    prog.classList.remove('on');
    console.error('Upload Cloudinary:', e);
    msg('Erro ao salvar foto: ' + e.message, 'er');
  }
}

// Converte URL do Drive para formato que funciona no <img>
function converterUrlFoto(url) {
  if(!url) return '';
  // Já é URL direta do lh3 (AppSheets usa este formato)
  if(url.indexOf('lh3.google')>=0) return url;
  // URL do Drive: https://drive.google.com/file/d/ID/view
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(m) return 'https://lh3.googleusercontent.com/d/' + m[1];
  // URL open do Drive: https://drive.google.com/open?id=ID
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2) return 'https://lh3.googleusercontent.com/d/' + m2[1];
  return url;
}

// ═══════════════════════════════════════
// INTEGRAÇÃO
// ═══════════════════════════════════════
async function distribuirIntegracoesPendentes() {
  if(!confirm('Distribuir todas as decisões pendentes de integração entre os integradores ativos?')) return;
  load('Distribuindo...');
  try {
    const total = await supaDistribuirIntegracoes();
    unload();
    msg(total>0 ? `✅ ${total} decisão(ões) distribuída(s)!` : 'Nenhuma decisão pendente para distribuir.', 'ok');
    loadIntegracao();
  } catch(e) { unload(); msg('Erro: '+e.message,'er'); }
}

async function loadIntegracao() {
  const btnDist = $('btn-distribuir-integ');
  if(btnDist) btnDist.style.display = S.user?.perfil==='Líder' ? 'flex' : 'none';
  const sw = getSemana();
  // Semana anterior
  const swAnt = new Date(sw.ini);
  swAnt.setDate(swAnt.getDate() - 7);
  const swAntFim = new Date(sw.ini);
  swAntFim.setDate(swAntFim.getDate() - 1);
  $('i-sw').textContent = fD(swAnt).slice(0,5) + ' – ' + fD(swAntFim).slice(0,5);

  const ls = $('i-lista');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';

  try {
    const lista = await supaLerIntegracao();

    // Guardar lista completa para filtros
    S._integLista = lista;
    S._integFiltro = S._integFiltro || 'todos';
    S._integEqFiltro = S._integEqFiltro || 'todas';
    // Garantir cadAll e eqList carregados para o filtro de equipe
    if(!S.cadAll.length) {
      try { S.cadAll = await lerCadastro(); } catch(e) { /* silencioso */ }
    }
    if(!S.eqList.length) {
      try { S.eqList = await lerEquipes(); } catch(e) { /* silencioso */ }
    }
    buildIntegChips();

    // Contadores
    const totalSim = lista.filter(d => isIntegrado(d)).length;
    const totalNao = lista.length - totalSim;
    $('i-total').textContent = lista.length;
    if($('i-sim')) $('i-sim').textContent = totalSim;
    if($('i-nao')) $('i-nao').textContent = totalNao;

    if(!lista.length){
      ls.innerHTML = '<div class="empty"><div class="ei">🔗</div><p>Nenhuma integração<br>desta semana.</p></div>';
      return;
    }

    renderIntegLista();
  } catch(e) {
    ls.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`;
    console.error('Integração erro:', e);
  }
}

function isIntegrado(d) {
  const v = (d.integrado||'').toLowerCase();
  return v.indexOf('sim') >= 0 || v === 's';
}

function filtroInteg(tipo) {
  S._integFiltro = tipo;
  ['todos','nao','sim'].forEach(t => {
    const el = $('if-'+t);
    if(el) el.classList.toggle('on', t===tipo);
  });
  renderIntegLista();
}

function renderIntegLista() {
  const ls = $('i-lista');
  if(!S._integLista) return;
  let lista = S._integLista;
  if(S._integFiltro === 'sim') lista = lista.filter(d => isIntegrado(d));
  if(S._integFiltro === 'nao') lista = lista.filter(d => !isIntegrado(d));

  // Filtro por equipe do capelão (col equipes do cadastro)
  const eqFiltro = S._integEqFiltro || 'todas';
  if(eqFiltro !== 'todas') {
    // Montar set de capelões que pertencem à equipe selecionada
    const capeloesNaEquipe = new Set();
    (S.cadAll||[]).forEach(m => {
      const eqs = (m.equipes||'').split(',').map(e=>e.trim()).filter(Boolean);
      if(eqs.indexOf(eqFiltro) >= 0) {
        capeloesNaEquipe.add((m.nomeSoc||m.nomeComp||'').toLowerCase());
      }
    });
    lista = lista.filter(d => {
      const nomeInteg = (d.integrador||d.capelao||'').toLowerCase();
      return capeloesNaEquipe.has(nomeInteg);
    });
  }

  // Filtro de busca por nome do capelão integrador
  const busca = ($('i-search') ? $('i-search').value : '').toLowerCase().trim();
  if(busca) {
    lista = lista.filter(d => {
      const nomeGrupo = (d.integrador || d.capelao || '').toLowerCase();
      return nomeGrupo.indexOf(busca) >= 0;
    });
  }

  if(!lista.length){
    const msgTxt = eqFiltro !== 'todas' ? 'Nenhum registro nesta equipe.' :
      S._integFiltro==='sim' ? 'Nenhum integrado ainda.' :
      S._integFiltro==='nao' ? 'Todos já foram integrados! 🎉' : 'Nenhum registro.';
    ls.innerHTML = `<div class="empty"><div class="ei">${S._integFiltro==='nao'?'🎉':'🔗'}</div><p>${msgTxt}</p></div>`;
    return;
  }

  // ── ACCORDION por capelão — mesmo layout para todos os filtros ──
  const grupos = {}, ordem = [];
  lista.forEach(d => {
    const cp = d.integrador || d.capelao || 'Sem integrador';
    if(!grupos[cp]){ grupos[cp]=[]; ordem.push(cp); }
    grupos[cp].push(d);
  });
  // Ordenar: Feminino primeiro, depois Masculino, cada um por nome ASC
  function sexoInteg(nome) {
    const m = (S.cadAll||[]).find(x => (x.nomeSoc||x.nomeComp||'').toLowerCase()===nome.toLowerCase());
    return m ? (m.sexo||'').toUpperCase() : '';
  }
  ordem.sort((a,b) => {
    const sa = sexoInteg(a), sb = sexoInteg(b);
    const aF = sa==='FEMININO'||sa==='F', bF = sb==='FEMININO'||sb==='F';
    if(aF && !bF) return -1;
    if(!aF && bF) return 1;
    return a.localeCompare(b, 'pt-BR');
  });
  // Dentro de cada grupo: pendentes primeiro, por nome ASC
  ordem.forEach(cp => {
    grupos[cp].sort((a,b) => {
      const okA = isIntegrado(a), okB = isIntegrado(b);
      if(okA !== okB) return okA - okB;
      return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
    });
  });
  // Guardar lista ordenada para navegação com setas
  S._integListaFiltrada = [];
  ordem.forEach(cp => { S._integListaFiltrada = S._integListaFiltrada.concat(grupos[cp]); });

  ls.innerHTML = ordem.map((cp, i) => {
    const simCnt = grupos[cp].filter(d=>isIntegrado(d)).length;
    const naoCnt = grupos[cp].length - simCnt;
    return `<div class="acc-hdr" id="iacc-hdr-${i}" onclick="toggleIAcc(${i})">
        <div class="acc-hdr-left">
          <span style="font-size:16px">👤</span>
          <span class="acc-hdr-eq" style="font-size:17px;font-weight:700">${cp}</span>
          <span class="acc-cnt">${grupos[cp].length}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          ${naoCnt>0?`<span style="background:#fee2e2;color:#991b1b;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700">❤️ ${naoCnt}</span>`:''}
          ${simCnt>0?`<span style="background:#dcfce7;color:#15803d;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700">💚 ${simCnt}</span>`:''}
          <span class="acc-arr">▾</span>
        </div>
      </div>
      <div class="acc-body" id="iacc-body-${i}">
        ${grupos[cp].map(d => {
          const ok = isIntegrado(d);
          return `<div onclick="abrirDetInteg('${d.id}')" style="cursor:pointer;padding:14px 16px;border-bottom:1px solid var(--g1);display:flex;align-items:center;gap:12px">
            <div style="flex:1;min-width:0">
              <div style="font-size:17px;font-weight:700;color:var(--navy)">${d.nome}</div>
              <div style="font-size:13px;color:var(--g5);margin-top:3px">${d.assistido} · ${d.hospital}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0">
              <span style="font-size:22px">${ok?'💚':'❤️'}</span>
              <span style="font-size:11px;font-weight:700;color:${ok?'#15803d':'#991b1b'}">${ok?'SIM':'NÃO'}</span>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }).join('');
}


function navInteg(dir) {
  const lista = S._integListaAtual || [];
  const idx = (S._integIdx || 0) + dir;
  if(idx < 0 || idx >= lista.length) return;
  abrirDetInteg(lista[idx].id);
}

function proximoInteg(atual) {
  const lista = S._integLista || [];
  const integrador = atual.integrador || atual.capelao || '';

  // Buscar próximo pendente do mesmo integrador
  const doInteg = lista.filter(d =>
    (d.integrador||d.capelao||'') === integrador && !isIntegrado(d)
  ).sort((a,b) => (a.nome||'').localeCompare(b.nome||'', 'pt-BR'));

  if(doInteg.length > 0) {
    // Tem próximo — abrir automaticamente
    msg('➡️ Próximo: ' + doInteg[0].nome, '');
    setTimeout(() => abrirDetInteg(doInteg[0].id), 800);
  } else {
    // Acabou a lista do integrador
    msg('🎉 Sem pendências para ' + integrador.split(' ')[0] + '!', 'ok');
    setTimeout(() => ir('integracao'), 1500);
  }
}

function toggleIAcc(idx) {
  const hdr  = $('iacc-hdr-'+idx);
  const body = $('iacc-body-'+idx);
  const isOpen = hdr.classList.contains('on');
  document.querySelectorAll('.acc-hdr').forEach(h=>h.classList.remove('on'));
  document.querySelectorAll('.acc-body').forEach(b=>b.classList.remove('on'));
  if(!isOpen){ hdr.classList.add('on'); body.classList.add('on'); }
}

function abrirDetInteg(id) {
  const lista = S._integLista || [];
  const d = lista.find(x => x.id === id);
  if(!d) return;
  S._curInteg = d;

  $('id-nm').textContent  = d.nome     || '-';
  $('id-dv').textContent  = d.data     || '-';

  // Atualizar header com setas
  const navNome = $('nav-nome'), navPos = $('nav-pos');
  if(navNome) navNome.textContent = d.nome || '-';
  // Calcular posição na lista do integrador
  const listaInteg = (S._integListaFiltrada||S._integLista||[]).filter(x =>
    (x.integrador||x.capelao||'') === (d.integrador||d.capelao||'')
  );
  const posAtual = listaInteg.findIndex(x => x.id === d.id);
  if(navPos) navPos.textContent = (posAtual+1) + ' de ' + listaInteg.length;
  // Guardar índice atual para navegação
  S._integIdx = posAtual;
  S._integListaAtual = listaInteg;
  // Desabilitar setas nos extremos
  const btnP = $('btn-prev'), btnN = $('btn-next');
  if(btnP) btnP.style.opacity = posAtual <= 0 ? '0.3' : '1';
  if(btnN) btnN.style.opacity = posAtual >= listaInteg.length-1 ? '0.3' : '1';
  $('id-eq').textContent  = d.hospital || d.equipe || '-';
  $('id-cp').textContent  = d.capelao  || '-';
  $('id-as').textContent  = d.assistido? '🛏️ '+d.assistido : '-';
  const telNum = (d.tel||'').replace(/\D/g,'');
  const telValido = telNum.length >= 10 && telNum !== '92' && telNum !== '55';
  $('id-tel').textContent = d.tel || '⚠️ Sem telefone válido';
  $('id-tel').style.color = telValido ? 'var(--blue)' : 'var(--red)';
  $('id-obs').textContent = d.obs      || '-';

  // Desabilitar WhatsApp se não tem telefone válido
  const btn1 = document.querySelector('[onclick="abrirWpp1()"]');
  const btn2 = document.querySelector('[onclick="abrirWpp2()"]');
  if(btn1){ btn1.style.opacity = telValido?'1':'0.4'; btn1.style.pointerEvents = telValido?'auto':'none'; }
  if(btn2){ btn2.style.opacity = telValido?'1':'0.4'; btn2.style.pointerEvents = telValido?'auto':'none'; }

  const ok = (d.integrado||'').toLowerCase().indexOf('sim') >= 0 || d.integrado === 'S';
  const integEl = $('id-integ');
  integEl.innerHTML = ok
    ? '<span class="badge bg-g" style="font-size:15px;padding:6px 14px">💚 SIM — Integrado</span>'
    : '<span class="badge bg-r" style="font-size:15px;padding:6px 14px">❤️ NÃO — Pendente</span>';

  // Botão registrar — desabilitar se já integrado
  const btnReg = $('btn-integ-reg');
  const btnDiv = btnReg.querySelector('div:last-child div:first-child');
  if(ok){
    btnReg.disabled = true;
    btnReg.style.opacity = '0.5';
    btnReg.style.background = '#27ae60';
    if(btnDiv) btnDiv.textContent = 'Já integrado ✓';
  } else {
    btnReg.disabled = false;
    btnReg.style.opacity = '1';
    btnReg.style.background = 'var(--navy)';
    if(btnDiv) btnDiv.textContent = 'Registrar Integração';
  }

  ir('integ-det');
}

function abrirWpp1() {
  const d = S._curInteg; if(!d) return;
  const tel = '55' + (d.tel||'').replace(/\D/g,'');
  // Artigo baseado no sexo do assistido (col I): M → "o", F → "a"
  const artigo = (d.sexo||'').toUpperCase() === 'F' ? 'a' : 'o';
  const integrador = d.integrador || d.capelao || S.user?.nome || '';
  const hospital   = d.hospital   || d.equipe  || '';
  const msg = encodeURIComponent(
    `Oi! Aqui é ${artigo} ${integrador}, da equipe de capelania hospitalar.\n\n` +
    `Nossa equipe tem orado por você desde então e hoje gostaríamos muito de saber como está sua recuperação!\n\n` +
    `Aproveito para te convidar para o curso gratuito chamado "*Um com Deus*", da Nova Igreja Batista.\n\n` +
    `Este é totalmente gratuito e sem compromisso! 🎁\n\n` +
    `Uma ótima oportunidade para fortalecer a fé, podendo ser feito online ou presencial. Para assistir online, é só clicar aqui:\n` +
    `https://youtube.com/playlist?list=PLsToeSg6pZF90VbxctNhCkd8i8FC7DPpZ\n\n` +
    `Que Deus continue cuidando de você! 🙏 Estou à disposição!`
  );
  window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${msg}`, '_blank');
}

function abrirWpp2() {
  const d = S._curInteg; if(!d) return;
  const tel = '55' + (d.tel||'').replace(/\D/g,'');
  // [Integrador] = col K
  const integrador = d.integrador || d.capelao || S.user?.nome || '';
  const msg = 'Parabéns pela sua decisão de seguir a Cristo! 🎉' +
    '%20%0A%0AQuero te convidar para assistir às palestras UM COM DEUS, onde você vai fortalecer ainda mais sua fé. São gratuitas e acontecem num ambiente acolhedor: 👇🏼' +
    '%20%0A%20%0A📍 *_Auditório da NOVA IGREJA BATISTA_*' +
    '%20%0AAv. Torquato Tapajós, 4444 - Col. Santo Antônio' +
    '%20%0ADomingos: 8h, 10h30, 16h e 18h30.' +
    '%20%0ALocalizador: https://maps.app.goo.gl/DCnLW5b2qLubYCdv6' +
    '%20%0AOutros endereços próximos a você: https://bit.ly/3YOWU5c' +
    '%20%0A%20%0ASe não puder ir, acompanhe pelo YouTube:' +
    '%20%0Ahttps://youtube.com/playlist?list=PLsToeSg6pZF90VbxctNhCkd8i8FC7DPpZ' +
    '%20%0A%0AEstou à disposição para conversar! Que Deus te abençoe nessa caminhada. 😊';
  window.open(`https://api.whatsapp.com/send?phone=${tel}&text=${msg}`, '_blank');
}

async function registrarIntegracao() {
  const d = S._curInteg; if(!d) return;
  // Validar telefone antes de registrar
  const telNum = (d.tel||'').replace(/\D/g,'');
  const telValido = telNum.length >= 10 && telNum !== '92' && telNum !== '55';
  if(!telValido){
    msg('Não é possível registrar integração sem telefone válido.','er');
    return;
  }
  const btn = $('btn-integ-reg');
  // Alterar apenas o texto interno, sem destruir o innerHTML do botão
  const btnDiv = btn.querySelector('div:last-child div:first-child');
  btn.disabled = true;
  btn.style.opacity = '0.7';
  if(btnDiv) btnDiv.textContent = 'Registrando...';
  load('Registrando integração...');
  try {
    await supaRegistrarIntegracao(d.id, d.idDecisao, S.user.codigo);
    unload();
    // Atualizar localmente
    d.integrado = 'Sim';
    // Atualizar badge na lista imediatamente (sem esperar loadIntegracao)
    renderIntegLista();
    // Restaurar botão com estado "já integrado"
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.background = '#27ae60';
    if(btnDiv) btnDiv.textContent = 'Já integrado ✓';
    msg('✅ Integração registrada!', 'ok');
    // Recarregar lista em background
    loadIntegracao();
    // Ir automaticamente para o próximo pendente do mesmo integrador
    setTimeout(() => proximoInteg(d), 1200);
  } catch(e) {
    unload();
    // Restaurar botão para estado original em caso de erro
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.background = 'var(--navy)';
    if(btnDiv) btnDiv.textContent = 'Registrar Integração';
    msg('Erro ao registrar: ' + e.message, 'er');
  }
}

// ═══════════════════════════════════════
// MÓDULO RESUMO
// ═══════════════════════════════════════
var S_RES = { foto: '', fotoNome: '', dados: null };

async function loadResumo() {
  const ls = $('res-lista');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    const lista = await supaLerResumos();
    if(!lista.length){
      ls.innerHTML = '<div class="empty"><div class="ei">📊</div><p>Nenhum resumo ainda.<br>Toque + para criar.</p></div>';
      return;
    }

    // Filtrar apenas semana atual (dom a sáb)
    const hoje = new Date();
    const dom  = new Date(hoje); dom.setDate(hoje.getDate()-hoje.getDay()); dom.setHours(0,0,0,0);
    const sab  = new Date(dom);  sab.setDate(dom.getDate()+6);             sab.setHours(23,59,59,999);

    function parseDataBR(s) {
      if(!s) return null;
      const p = s.split('/');
      if(p.length===3) return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
      return new Date(s);
    }

    const listaSemana = lista.filter(r => {
      const d = parseDataBR(r.data);
      return d && d >= dom && d <= sab;
    });

    if(!listaSemana.length){
      ls.innerHTML = '<div class="empty"><div class="ei">📊</div><p>Nenhum resumo esta semana.<br>Toque + para criar.</p></div>';
      S._resumos = lista;
      return;
    }

    // Ordenar por dia da semana Dom(0) → Sáb(6), depois por equipe
    const DIAS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    listaSemana.sort((a,b) => {
      const da = parseDataBR(a.data), db = parseDataBR(b.data);
      const difDia = da.getDay() - db.getDay();
      if(difDia !== 0) return difDia;
      return a.equipe.localeCompare(b.equipe);
    });

    // Agrupar por data — mantendo ordem Dom→Sáb
    const grupos = {}, ordem = [];
    listaSemana.forEach(r => {
      const d   = parseDataBR(r.data);
      const key = r.data;
      const dia = DIAS[d.getDay()];
      if(!grupos[key]){ grupos[key]={dia, itens:[]}; ordem.push(key); }
      grupos[key].itens.push(r);
    });

    ls.innerHTML = ordem.map(data => `
      <div class="eq-hdr">
        <span>📅 ${grupos[data].dia} · ${data}</span>
        <span class="eq-cnt">${grupos[data].itens.reduce((s,r)=>s+r.total,0)}</span>
      </div>
      ${grupos[data].itens.map(r => {
        const temFoto = r.foto && r.foto.indexOf('http')===0;
        return `<div class="mrow" onclick="abrirDetResumo('${r.id}')" style="gap:12px;padding:14px">
          <div style="width:56px;height:56px;border-radius:10px;background:var(--g2);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center">
            ${temFoto ? `<img src="${converterUrlFoto(r.foto)}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:24px">📷</span>'}
          </div>
          <div style="flex:1;min-width:0">
            <div class="mname" style="font-size:15px">${r.equipe}</div>
            <div class="member-sub" style="margin-top:4px;font-size:12px">
              ✝ ${r.total} decisões · 📋 ${r.lancadas} lançadas · Saldo: ${r.saldo}
            </div>
          </div>
          <span style="color:var(--g3);font-size:20px">›</span>
        </div>`;
      }).join('')}`).join('');

    S._resumos = lista;
  } catch(e) {
    ls.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`;
  }
}

function abrirDetResumo(id) {
  const r = (S._resumos||[]).find(x=>x.id===id);
  if(!r) return;
  S._curResumo = r;
  // Preencher card
  $('rc-equipe').textContent = r.equipe;
  $('rc-data').textContent   = r.data;
  $('rc-lider').textContent  = r.lider;
  $('rc-total').textContent  = r.total;
  $('rc-saldo').textContent  = r.saldo;
  // Foto
  const fotoDiv = $('res-card-foto');
  if(r.foto && r.foto.indexOf('http')===0){
    fotoDiv.innerHTML = `<img src="${converterUrlFoto(r.foto)}" style="width:100%;height:100%;object-fit:cover">`;
  } else {
    fotoDiv.innerHTML = '<span style="font-size:48px">📷</span>';
  }
  ir('resumo-det');
}

function compartilharResumo() {
  const r = S._curResumo; if(!r) return;
  const texto = encodeURIComponent(
    `✝ *RELATÓRIO DE VISITA*\n\n` +
    `🏥 *${r.equipe}*\n` +
    `📅 Data: ${r.data}\n` +
    `👤 Líder: ${r.lider}\n\n` +
    `✝ *Decisões:* ${r.total}\n` +
    `📋 *Lançadas:* ${r.lancadas}\n` +
    `📊 *Saldo:* ${r.saldo}\n\n` +
    `_Ministério de Capelania — Nova Igreja Batista_`
  );
  window.open(`https://api.whatsapp.com/send?text=${texto}`, '_blank');
}

function abrirNovoResumo() {
  S_RES = {foto:'', fotoNome:'', dados:null};
  $('res-foto-preview').style.display = 'none';
  $('res-total').value = '';
  // Data da visita do login
  $('res-data').value = fD(S.dv||new Date());
  // Equipe fixa do login — sem seleção
  const equipe = S.equipe || '';
  const inp = $('res-eq');
  const disp = $('res-eq-display');
  if(inp) inp.value = equipe;
  if(disp) disp.textContent = equipe || 'Nenhuma equipe selecionada';
  $('sh-resumo').classList.add('on');
}

function onResFotoChange(event) {
  const file = event.target.files[0]; if(!file) return;
  S_RES.dados = file;
  // Preview
  const url = URL.createObjectURL(file);
  $('res-foto-img').src = url;
  $('res-foto-preview').style.display = 'block';
  $('res-foto-status').textContent = '📷 ' + file.name;
  // Gerar nome do arquivo
  const data  = ($('res-data').value||fD(new Date())).split('/').reverse().join('-');
  const eqVal = ($('res-eq') ? $('res-eq').value : '') || S.equipe || 'equipe';
  const eq    = eqVal.replace(/[^a-zA-Z0-9]/g,'_').substring(0,30);
  const ext   = file.name.split('.').pop() || 'jpg';
  S_RES.fotoNome = `${data}_${eq}.${ext}`;
}

async function salvarResumo() {
  const eq    = ($('res-eq') ? $('res-eq').value : '') || S.equipe || '';
  const data  = $('res-data').value.trim();
  const total = $('res-total').value.trim();
  if(!eq){ msg('Equipe não identificada. Faça login novamente.','er'); return; }
  if(!data){ msg('Informe a data da visita.','er'); return; }
  if(!total){ msg('Informe o total de decisões.','er'); return; }

  let fotoUrl = '';

  // Upload foto direto para Cloudinary — comprimida para reduzir tamanho
  if(S_RES.dados){
    load('Enviando foto... aguarde');
    try {
      // Redimensionar e comprimir antes de enviar
      const blob = await comprimirImagem(S_RES.dados, 1024, 0.7);
      const formData = new FormData();
      formData.append('file', blob);
      formData.append('upload_preset', CLOUD_PRESET);
      formData.append('folder', 'capelania/Visitas');

      console.log('Upload visita para Cloudinary...');
      const resp = await fetch(CLOUD_URL, {method:'POST', body: formData});
      const data = await resp.json();
      console.log('Cloudinary result:', JSON.stringify(data).substr(0,200));

      if(data.secure_url){
        fotoUrl = data.secure_url;
        msg('📷 Foto enviada!', 'ok');
      } else {
        unload();
        const errMsg = data.error ? data.error.message : 'Erro desconhecido';
        if(!confirm('Erro ao salvar foto: '+errMsg+'. Continuar sem a foto?')) return;
      }
    } catch(e) {
      unload();
      console.error('Upload erro:', e);
      if(!confirm('Erro ao enviar foto. Continuar sem a foto?')) return;
    }
  }

  load('Salvando resumo...');
  try {
    const res = await supaGravarResumo({
      equipeId:      S.equipeId,
      dataVisitaISO: isoFromBR(data),
      liderId:       S.user.codigo,
      total:         parseInt(total),
      fotoUrl
    });
    unload();
    $('sh-resumo').classList.remove('on');
    msg(`✅ Resumo salvo! Lançadas: ${res.lancadas} · Saldo: ${res.saldo}`,'ok');
    loadResumo();
  } catch(e){ unload(); msg('Erro ao salvar: '+e.message,'er'); }
}

// ═══════════════════════════════════════
// ANIVERSARIANTES
// ═══════════════════════════════════════
function wppAniv(nome, tel) {
  const primeiro = (nome||'').split(' ')[0];
  const msg = encodeURIComponent(
    `Feliz aniversário, ${primeiro}! ` +
    `Que o *Senhor* renove em você, a cada novo ano, a paixão pela missão de levar o evangelho e consolar os que sofrem. ` +
    `Que *Deus* te abençoe com muita saúde, sabedoria e prosperidade, para que sua vida continue sendo instrumento de paz e salvação.

` +
    `Conte com minhas orações hoje e sempre!`
  );
  const telNum = (tel||'').replace(/\D/g,'');
  if(telNum.length >= 10){
    window.open('https://api.whatsapp.com/send?phone=55'+telNum+'&text='+msg, '_blank');
  } else {
    // Sem telefone — abrir WhatsApp sem destinatário para copiar a mensagem
    window.open('https://api.whatsapp.com/send?text='+msg, '_blank');
  }
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

async function loadAniv() {
  const ls = $('aniv-lista');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    S._anivLista = await supaLerAniversarios();
    renderAniv();
  } catch(e) {
    ls.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`;
  }
}

function renderAniv() {
  const ls = $('aniv-lista');
  const busca = ($('aniv-search')?$('aniv-search').value:'').toLowerCase().trim();

  let lista = (S._anivLista||[]).filter(m => {
    if(!m.nome || !m.mes) return false;
    if(busca && (m.nome||'').toLowerCase().indexOf(busca) < 0) return false;
    return true;
  });

  if(!lista.length){
    ls.innerHTML = '<div class="empty"><div class="ei">🎂</div><p>Nenhum aniversariante encontrado.</p></div>';
    return;
  }

  // Agrupar por mês
  const grupos = {};
  lista.forEach(m => {
    if(!grupos[m.mes]) grupos[m.mes] = [];
    grupos[m.mes].push(m);
  });

  // Ordenar dentro de cada mês por dia
  Object.keys(grupos).forEach(mes => {
    grupos[mes].sort((a,b) => a.dia - b.dia);
  });

  // Ciclo a partir do mês atual
  const mesAtual = new Date().getMonth() + 1;
  const ordemMeses = [];
  for(let i = 0; i < 12; i++){
    const m = ((mesAtual - 1 + i) % 12) + 1;
    if(grupos[m]) ordemMeses.push(m);
  }

  if(!ordemMeses.length){
    ls.innerHTML = '<div class="empty"><div class="ei">🎂</div><p>Nenhum aniversariante cadastrado.</p></div>';
    return;
  }

  const hoje = new Date();
  const diaHoje = hoje.getDate(), mesHoje = hoje.getMonth()+1;

  ls.innerHTML = ordemMeses.map(mes => {
    const isAtual = mes === mesAtual;
    const membros = grupos[mes];
    return `
      <div class="eq-hdr" style="${isAtual?'background:var(--navy);color:#fff;border-radius:10px;margin-bottom:4px':''}">
        <span>${isAtual?'🎂 ':''}${MESES[mes-1]}${isAtual?' (este mês)':''}</span>
        <span class="eq-cnt" style="${isAtual?'background:rgba(255,255,255,.2);':''}">${membros.length}</span>
      </div>
      ${membros.map(m => {
        const temFoto = m.foto && m.foto.indexOf('http')===0;
        const isHoje = m.dia === diaHoje && m.mes === mesHoje;
        const nome = m.nome || '-';
        const diaStr = String(m.dia).padStart(2,'0')+'/'+String(m.mes).padStart(2,'0');
        return `
          <div style="background:${isHoje?'#fffbeb':'#fff'};border:${isHoje?'2px solid var(--gold)':'1.5px solid var(--g2)'};border-radius:12px;padding:12px 14px;margin-bottom:6px;display:flex;align-items:center;gap:12px">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--g2);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--navy)">
              ${temFoto ? `<img src="${converterUrlFoto(m.foto)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='${ini(nome)}'">` : ini(nome)}
            </div>
            <div style="flex:1;min-width:0;cursor:pointer" onclick="wppAniv('${nome}','${(m.tel||'')}')">
              <div style="font-size:15px;font-weight:700;color:var(--navy)">
                ${isHoje?'🎉 ':''}${nome}
              </div>
              <div style="font-size:13px;color:var(--g5);margin-top:2px">
                🎂 ${diaStr}${isHoje?'<span style="color:var(--gold);font-weight:700"> · Hoje!</span>':''}
              </div>
            </div>
          </div>`;
      }).join('')}`;
  }).join('');
}

// ═══════════════════════════════════════
// MÁSCARA ANIVERSÁRIO DD/MM
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('input', function(e) {
    if(e.target && e.target.id === 'ean') {
      let v = e.target.value.replace(/\D/g,'');
      if(v.length > 4) v = v.slice(0,4);
      if(v.length > 2) v = v.slice(0,2) + '/' + v.slice(2);
      e.target.value = v;
    }
  });
});

// ═══════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════
let S_REL = { aba: 'semana' };

async function loadRelatorios() {
  renderRelatoriosAba();
}

function renderRelatoriosAba() {
  const ls = $('rel-conteudo');
  if(!ls) return;
  if(S_REL.aba === 'semana') loadRelSemana();
  else if(S_REL.aba === 'historico') loadRelHistorico();
  else if(S_REL.aba === 'presenca') loadRelPresenca();
  else if(S_REL.aba === 'anual') loadRelAnual();
}

async function loadRelSemana() {
  const ls = $('rel-conteudo');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    const d = await supaRelatorioSemana(numSemana(new Date()));

    const total    = d.total    || 0;
    const totalS   = d.totalS   || 0;
    const totalN   = d.totalN   || 0;
    const integ    = d.integradas|| 0;
    const pend     = d.pendentes || 0;
    const pctInteg = d.pctInteg  || 0;
    const sexos    = d.sexos     || {M:0,F:0,pctM:0,pctF:0};
    const motivos  = d.motivos   || [];
    const sem      = d.semana    || '';

    const corInteg = pctInteg>=80?'#27ae60':pctInteg>=50?'#e67e22':'#c0392b';

    let html = `
      <div style="font-size:11px;color:var(--g5);text-align:right;margin-bottom:8px">Semana ${sem}</div>

      <!-- KPIs principais -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="background:var(--g2);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:var(--navy)">${total}</div>
          <div style="font-size:11px;color:var(--g5)">Total decisões</div>
        </div>
        <div style="background:var(--g2);border-radius:10px;padding:10px">
          <div style="display:flex;justify-content:space-around">
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:700;color:#5b8dee">♂ ${sexos.pctM}%</div>
              <div style="font-size:10px;color:var(--g5)">${sexos.M} homens</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:700;color:#e57eb3">♀ ${sexos.pctF}%</div>
              <div style="font-size:10px;color:var(--g5)">${sexos.F} mulheres</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Integráveis (S) -->
      <div style="background:var(--bg);border:1.5px solid var(--g2);border-radius:12px;margin-bottom:10px;padding:12px 14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-weight:700;font-size:14px;color:var(--navy)">✅ Integráveis</div>
          <div style="font-size:12px;color:var(--g5)">${totalS} decisões</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
          <div style="background:var(--g2);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#27ae60">${integ}</div>
            <div style="font-size:10px;color:var(--g5)">Integradas</div>
          </div>
          <div style="background:${pend>0?'#fff3f3':'var(--g2)'};border-radius:8px;padding:8px;text-align:center;border:${pend>0?'1px solid #ffb3b3':'none'}">
            <div style="font-size:18px;font-weight:700;color:${pend>0?'#c0392b':'var(--navy)'}">${pend}</div>
            <div style="font-size:10px;color:var(--g5)">Pendentes</div>
          </div>
          <div style="background:var(--g2);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:${corInteg}">${pctInteg}%</div>
            <div style="font-size:10px;color:var(--g5)">Integrado</div>
          </div>
        </div>
        <div style="height:6px;background:var(--g2);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${Math.max(2,pctInteg)}%;background:${corInteg};border-radius:99px;transition:width .4s"></div>
        </div>
      </div>

      <!-- Não integráveis (N) -->
      <div style="background:var(--bg);border:1.5px solid var(--g2);border-radius:12px;padding:12px 14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${motivos.length?'10px':'0'}">
          <div style="font-weight:700;font-size:14px;color:var(--navy)">🚫 Não integráveis</div>
          <div style="font-size:12px;color:var(--g5)">${totalN} decisões</div>
        </div>
        ${motivos.length ? motivos.map(m => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--g2)">
            <div style="flex:1;font-size:13px;color:var(--navy)">${m.motivo}</div>
            <div style="font-size:12px;color:var(--g5)">${m.qtd}x</div>
            <div style="background:#f0f4ff;color:#1a2744;border-radius:20px;font-size:11px;font-weight:700;padding:2px 8px">${m.pct}%</div>
          </div>`).join('') : '<div style="font-size:12px;color:var(--g5)">Nenhum registro não integrável esta semana.</div>'}
      </div>`;

    ls.innerHTML = html;
  } catch(e){ ls.innerHTML=`<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`; }
}


async function loadRelHistorico() {
  const ls = $('rel-conteudo');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    const dados = await supaRelatorioHistorico(numSemana(new Date()));
    const lista = dados.lista || [];
    const semanas = dados.semanas || [];

    if(!lista.length){
      ls.innerHTML='<div class="empty"><div class="ei">📊</div><p>Nenhum dado histórico disponível ainda.</p></div>';
      return;
    }

    let html = `<div style="font-size:12px;color:var(--g5);margin-bottom:12px">Últimas ${semanas.length} semana${semanas.length!==1?'s':''} · 🔴 Precisa atenção · 🟡 Parcial · 🟢 Ok</div>`;

    lista.forEach(c => {
      const ico = c.alerta ? '🔴' : c.pctGeral>=80 ? '🟢' : '🟡';
      const corBorda = c.alerta ? '#ffcccc' : 'var(--g2)';
      const corPct = c.pctGeral>=80?'#27ae60':c.pctGeral>=50?'#e67e22':'#c0392b';

      // Mini gráfico de barras por semana — verde=integradas / vermelho=pendentes
      const maxTotal = Math.max(...lista.map(x=>Math.max(...x.historico.map(h=>h.total))),1);
      const barras = semanas.map(s=>{
        const h = c.historico.find(x=>x.semana===s)||{total:0,integradas:0,saldo:0};
        const altTotal = h.total>0?Math.max(6,Math.round((h.total/maxTotal)*32)):0;
        const altInteg = h.total>0?Math.round((h.integradas/h.total)*altTotal):0;
        const altSaldo = altTotal - altInteg;
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;flex:1">
          <div style="width:100%;height:${altTotal}px;border-radius:3px 3px 0 0;overflow:hidden;display:flex;flex-direction:column-reverse">
            ${h.total===0
              ? `<div style="width:100%;height:4px;background:var(--g2);border-radius:2px"></div>`
              : `${altInteg>0?`<div style="width:100%;height:${altInteg}px;background:#27ae60"></div>`:''}
                 ${altSaldo>0?`<div style="width:100%;height:${altSaldo}px;background:#e74c3c"></div>`:''}`
            }
          </div>
          <div style="font-size:9px;color:var(--g4);margin-top:2px">${s}</div>
          ${h.total>0?`<div style="font-size:8px;color:var(--g5)">${h.integradas}/${h.total}</div>`:''}
        </div>`;
      }).join('');

      html += `
        <div style="background:var(--bg);border:1.5px solid ${corBorda};border-radius:12px;margin-bottom:10px;padding:12px 14px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div style="font-size:18px">${ico}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:15px;color:var(--navy)">${c.capelao}</div>
              <div style="font-size:12px;color:var(--g5);margin-top:1px">${c.totalGeral} decisões · ${c.semNegativas} sem${c.semNegativas!==1?'':''} com pendência</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:18px;font-weight:700;color:${corPct}">${c.pctGeral}%</div>
              <div style="font-size:10px;color:var(--g5)">integrado</div>
            </div>
          </div>
          <div style="display:flex;align-items:flex-end;gap:3px;height:36px;margin-top:4px">
            ${barras}
          </div>
        </div>`;
    });

    ls.innerHTML = html;
  } catch(e){ ls.innerHTML=`<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`; }
}

async function loadRelAnual() {
  const ls = $('rel-conteudo');
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    const anos = await supaRelatorioAnual();
    if(!anos.length){ ls.innerHTML='<div class="empty"><div class="ei">📊</div><p>Sem dados anuais.</p></div>'; return; }

    const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const CORES  = ['#4e79a7','#f28e2b'];
    const maxVal = Math.max(...anos.flatMap(a=>a.meses.map(m=>m.valor)), 1);

    let html = '';

    // KPIs por ano
    html += `<div style="display:flex;gap:8px;margin-bottom:14px">`;
    anos.forEach((a,i) => {
      const cor = CORES[i % CORES.length];
      html += `<div style="flex:1;background:var(--g2);border-radius:10px;padding:10px;text-align:center;border-top:3px solid ${cor}">
        <div style="font-size:22px;font-weight:700;color:var(--navy)">${a.total.toLocaleString('pt-BR')}</div>
        <div style="font-size:11px;color:var(--g5)">${a.ano}</div>
      </div>`;
    });
    html += `</div>`;

    // Gráfico de barras agrupadas por mês
    html += `<div style="background:var(--bg);border:1.5px solid var(--g2);border-radius:12px;padding:12px 8px;margin-bottom:12px">`;
    html += `<div style="font-size:12px;font-weight:600;color:var(--navy);margin-bottom:8px;padding:0 4px">Decisões por mês</div>`;
    // Legenda
    html += `<div style="display:flex;gap:12px;margin-bottom:8px;padding:0 4px">`;
    anos.forEach((a,i) => {
      html += `<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--g5)">
        <div style="width:10px;height:10px;border-radius:2px;background:${CORES[i%CORES.length]}"></div>${a.ano}</div>`;
    });
    html += `</div>`;
    // Barras
    html += `<div style="display:flex;align-items:flex-end;gap:3px;height:130px">`;
    MESES.forEach((mes, mi) => {
      html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0">`;
      html += `<div style="display:flex;align-items:flex-end;gap:1px;height:110px;width:100%">`;
      anos.forEach((a, ai) => {
        const val = a.meses[mi] ? a.meses[mi].valor : 0;
        const h   = val > 0 ? Math.max(3, Math.round((val/maxVal)*106)) : 2;
        const cor = val > 0 ? CORES[ai % CORES.length] : 'var(--g2)';
        html += `<div title="${a.ano} ${mes}: ${val.toLocaleString('pt-BR')}" style="flex:1;height:${h}px;background:${cor};border-radius:2px 2px 0 0"></div>`;
      });
      html += `</div>`;
      html += `<div style="font-size:9px;color:var(--g5);margin-top:2px">${mes}</div>`;
      html += `</div>`;
    });
    html += `</div></div>`;

    // Tabela Jan→Dez
    html += `<div style="background:var(--bg);border:1.5px solid var(--g2);border-radius:12px;overflow:hidden">`;
    html += `<div style="font-size:12px;font-weight:600;color:var(--navy);padding:10px 14px;border-bottom:0.5px solid var(--g2)">Detalhamento mensal</div>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:12px">`;
    html += `<thead><tr style="background:var(--g2)">`;
    html += `<th style="padding:6px 10px;text-align:left;font-size:11px;color:var(--g5);font-weight:600">Mês</th>`;
    anos.forEach((a,i) => {
      html += `<th style="padding:6px 10px;text-align:center;font-size:11px;font-weight:700;color:${CORES[i%CORES.length]}">${a.ano}</th>`;
    });
    html += `</tr></thead><tbody>`;
    MESES.forEach((mes, mi) => {
      html += `<tr style="border-bottom:0.5px solid var(--g2)">`;
      html += `<td style="padding:6px 10px;color:var(--navy);font-weight:500">${mes}</td>`;
      anos.forEach(a => {
        const val = a.meses[mi] ? a.meses[mi].valor : 0;
        html += `<td style="padding:6px 10px;text-align:center;color:${val>0?'var(--navy)':'var(--g4)'}">${val>0?val.toLocaleString('pt-BR'):'-'}</td>`;
      });
      html += `</tr>`;
    });
    // Total
    html += `<tr style="background:var(--g2);font-weight:700">`;
    html += `<td style="padding:6px 10px;color:var(--navy)">Total</td>`;
    anos.forEach(a => {
      html += `<td style="padding:6px 10px;text-align:center;color:var(--navy)">${a.total.toLocaleString('pt-BR')}</td>`;
    });
    html += `</tr></tbody></table></div>`;

    ls.innerHTML = html;
  } catch(e){ ls.innerHTML=`<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`; }
}

function relAba(aba, btn) {
  S_REL.aba = aba;
  document.querySelectorAll('.rel-tab-btn').forEach(b=>b.classList.remove('rel-tab-on'));
  if(btn) btn.classList.add('rel-tab-on');
  renderRelatoriosAba();
}

// A grade de presença agora é sempre calculada ao vivo em cima de
// `presenca`/`membro_equipe` (ver supaRelatorioPresenca) -- não existe mais
// uma tabela física pra "reconstruir" como no sistema antigo
// (setupRelPresenca_/atualizarRelPresenca regravava colunas A/B na aba
// Rel_Presença). O botão vira só um "atualizar agora".
async function atualizarRelPresenca() {
  loadRelPresenca();
}

async function loadRelPresenca() {
  const ls = $('rel-conteudo');
  const isLider = (S.user.perfil||'').toLowerCase() === 'líder' || (S.user.perfil||'').toLowerCase() === 'lider';
  // Mostrar/esconder botão de atualizar
  const btnWrap = $('btn-atualizar-presenca-wrap');
  if(btnWrap) btnWrap.style.display = isLider ? 'block' : 'none';
  // Só líder vê presença
  if(!isLider){
    ls.innerHTML='<div class="empty"><div class="ei">🔒</div><p>Disponível apenas para líderes.</p></div>';
    return;
  }
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando...</p></div>';
  try {
    const d = await supaRelatorioPresenca(numSemana(new Date()));
    const lista   = d.lista   || [];
    const semanas = d.semanas || [];

    // Ordenar equipes por dia da semana Dom(0)→Sáb(6) baseado no nome da equipe
    // Padrão do nome: "HPS 28 de Agosto - Seg 15h às 16h" — extrair dia abreviado
    const ORDEM_DIAS = {dom:0, seg:1, ter:2, qua:3, qui:4, sex:5, sab:6, sáb:6};
    function diaOrdem(nomeEquipe) {
      const m = (nomeEquipe||'').toLowerCase().match(/[-–]\s*(dom|seg|ter|qua|qui|sex|sab|sáb)/);
      return m ? (ORDEM_DIAS[m[1]]??9) : 9;
    }
    lista.sort((a,b) => {
      const dA = diaOrdem(a.equipe), dB = diaOrdem(b.equipe);
      if(dA !== dB) return dA - dB;
      return a.equipe.localeCompare(b.equipe);
    });

    if(!lista.length){
      ls.innerHTML='<div class="empty"><div class="ei">📋</div><p>Nenhum dado de presença disponível.</p></div>';
      return;
    }

    // KPI geral
    let html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:var(--g2);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:var(--navy)">${d.presGeral||0}/${d.totalGeral||0}</div>
          <div style="font-size:11px;color:var(--g5)">Presentes / Total</div>
        </div>
        <div style="background:var(--g2);border-radius:10px;padding:10px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:${(d.pctGeral||0)>=80?'#27ae60':'#e67e22'}">${d.pctGeral||0}%</div>
          <div style="font-size:11px;color:var(--g5)">% geral</div>
        </div>
      </div>`;

    // Grade por equipe
    lista.forEach(eq => {
      const semCols = semanas.length;
      const thSems  = semanas.map(s=>`<th style="min-width:36px;text-align:center;font-size:10px;color:var(--g5);font-weight:600;padding:4px 2px">${s}</th>`).join('');
      const cor     = eq.pct>=80?'#27ae60':eq.pct>=60?'#e67e22':'#c0392b';
      const ico     = eq.pct>=80?'🟢':eq.pct>=60?'🟡':'🔴';

      const rows = (eq.membros||[]).map(m => {
        const cels = (m.semanas||[]).map(s =>
          `<td style="text-align:center;font-size:14px;padding:4px 2px">${s.presente?'✅':'❌'}</td>`
        ).join('');
        return `<tr style="border-bottom:0.5px solid var(--g2)">
          <td style="font-size:12px;color:var(--navy);padding:5px 6px;white-space:nowrap">${m.nome}</td>
          ${cels}
        </tr>`;
      }).join('');

      html += `
        <div style="background:var(--bg);border:1.5px solid ${eq.alerta?'#ffcccc':'var(--g2)'};border-radius:12px;margin-bottom:12px;overflow:hidden">
          <div style="padding:10px 14px;display:flex;align-items:center;gap:8px;cursor:pointer"
               onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
            <div style="font-size:16px">${ico}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${eq.equipe}</div>
              <div style="font-size:11px;color:var(--g5);margin-top:1px">${eq.totalPresentes}/${eq.totalMembros} presentes</div>
            </div>
            <div style="font-size:16px;font-weight:700;color:${cor}">${eq.pct}%</div>
          </div>
          <div style="display:none;overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="background:var(--g2)">
                  <th style="text-align:left;padding:4px 6px;font-size:11px;color:var(--g5);font-weight:600">Nome</th>
                  ${thSems}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    });

    ls.innerHTML = html;
  } catch(e){ ls.innerHTML=`<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`; }
}


// ═══════════════════════════════════════
// INTEGRAÇÃO — CHIPS DE EQUIPE (igual ao cadastro)
// ═══════════════════════════════════════
function buildIntegChips() {
  const fc = $('i-chips');
  if(!fc) return;

  // Montar set de equipes DOS CAPELÕES que aparecem na integração
  // Usando S.cadAll para mapear integrador → equipe(s)
  const eqSet = new Set();
  (S._integLista||[]).forEach(d => {
    const nomeInteg = (d.integrador || d.capelao || '').toLowerCase();
    // Buscar o membro correspondente no cadAll para pegar a equipe
    const membro = (S.cadAll||[]).find(m =>
      (m.nomeSoc||m.nomeComp||'').toLowerCase() === nomeInteg
    );
    if(membro && membro.equipes) {
      membro.equipes.split(',').map(e=>e.trim()).filter(Boolean).forEach(e => eqSet.add(e));
    }
  });

  // Reusar select existente para não perder a seleção ao recarregar
  let sel = fc.querySelector('select');
  if(!sel) {
    sel = document.createElement('select');
    sel.style.cssText = 'width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--g2);background:#fff;color:#0f172a;font-size:14px;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%23999\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;cursor:pointer;margin-bottom:8px;';
    sel.onchange = () => { S._integEqFiltro = sel.value; renderIntegLista(); };
    fc.appendChild(sel);
  }

  // Reconstruir opções preservando seleção atual
  const valorAtual = S._integEqFiltro || 'todas';
  sel.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = 'todas'; optAll.textContent = '\u{1F465} Todos os capelães';
  sel.appendChild(optAll);

  [...eqSet].sort((a,b) => a.localeCompare(b,'pt-BR')).forEach(e => {
    const o = document.createElement('option');
    o.value = e; o.textContent = '\u{1F4CD} ' + e;
    sel.appendChild(o);
  });

  sel.value = valorAtual;
}

// ═══════════════════════════════════════
// MÓDULO EQUIPES — CRUD
// ═══════════════════════════════════════
async function loadEquipes() {
  const ls = $('eq-mgr-lista');
  if(!ls) return;
  ls.innerHTML = '<div class="empty"><div class="ei">⏳</div><p>Carregando equipes...</p></div>';
  try {
    // Sempre recarregar do servidor para garantir dados atualizados
    S.eqList = await supaLerEquipes();
    renderEquipesMgr();
  } catch(e) {
    ls.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>Erro: ${e.message}</p></div>`;
  }
}

function renderEquipesMgr() {
  const ls = $('eq-mgr-lista');
  if(!ls) return;
  const lista = [...(S.eqList || [])].sort((a,b) => {
    const na = (a.equipe||a.nome||'').toLowerCase();
    const nb = (b.equipe||b.nome||'').toLowerCase();
    return na.localeCompare(nb, 'pt-BR');
  });
  if(!lista.length) {
    ls.innerHTML = '<div class="empty"><div class="ei">⚙️</div><p>Nenhuma equipe cadastrada.<br>Toque + para adicionar.</p></div>';
    return;
  }
  ls.innerHTML = lista.map((eq, i) => {
    const nome  = eq.nome  || eq.equipe || '';
    const hosp  = eq.hospital   || '';
    const dia   = eq.diaSemana  || '';
    const lider = eq.liderMatricula || '';
    const eqId  = eq.id || '';
    return `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:8px;border:1.5px solid var(--g2);display:flex;align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-size:16px;font-weight:700;color:var(--navy)">${nome}</div>
        <div style="font-size:12px;color:var(--g5);margin-top:3px">
          ${hosp ? '🏥 '+hosp : ''} ${dia ? '· 📅 '+dia : ''} ${lider ? '· 👤 '+lider : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="abrirEditEquipe('${eqId}')" style="border:none;background:var(--g2);color:var(--navy);border-radius:8px;padding:7px 10px;font-size:14px;cursor:pointer">✏️</button>
        <button onclick="confirmarExcluirEquipe('${eqId}')" style="border:none;background:#fee2e2;color:#991b1b;border-radius:8px;padding:7px 10px;font-size:14px;cursor:pointer">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

function abrirNovaEquipe() {
  S._editEqIdx = null;
  $('eq-form-titulo').textContent = 'Nova Equipe';
  $('eq-f-nome').value  = '';
  $('eq-f-hosp').value  = '';
  $('eq-f-dia').value   = '';
  $('eq-f-lider').value = '';
  $('sh-eq-form').classList.add('on');
}

function abrirEditEquipe(id) {
  const eq = S.eqList.find(e => e.id === id);
  if(!eq) return;
  S._editEqIdx = id;
  $('eq-form-titulo').textContent = 'Editar Equipe';
  $('eq-f-nome').value  = eq.nome  || eq.equipe || '';
  $('eq-f-hosp').value  = eq.hospital   || '';
  $('eq-f-dia').value   = eq.diaSemana  || '';
  $('eq-f-lider').value = eq.liderMatricula || '';
  $('sh-eq-form').classList.add('on');
}

async function salvarEquipeForm() {
  const nome  = $('eq-f-nome').value.trim();
  const hosp  = $('eq-f-hosp').value.trim();
  const dia   = $('eq-f-dia').value.trim();
  const lider = $('eq-f-lider').value.trim();
  if(!nome) { msg('Informe o nome da equipe.', 'er'); return; }

  load('Salvando...');
  try {
    let res;
    if(S._editEqIdx === null) {
      res = await supaCriarEquipe({ nome, hospital: hosp, diaSemana: dia, liderMatricula: lider });
      msg('✅ Equipe cadastrada!', 'ok');
    } else {
      res = await supaAtualizarEquipe(S._editEqIdx, { nome, hospital: hosp, diaSemana: dia, liderMatricula: lider });
      msg('✅ Equipe atualizada!', 'ok');
    }
    unload();
    $('sh-eq-form').classList.remove('on');
    await loadEquipes();
    if(res.avisoLider) msg(res.avisoLider, 'er');
  } catch(e) {
    unload();
    msg(e.duplicata ? e.message : 'Erro: ' + e.message, 'er');
  }
}

async function confirmarExcluirEquipe(id) {
  const eq = S.eqList.find(e => e.id === id);
  if(!eq) return;
  if(!confirm('Excluir a equipe "' + (eq.equipe||eq.nome||'') + '"?\n\nOs membros vinculados a ela não serão apagados.')) return;
  load('Excluindo...');
  try {
    await supaExcluirEquipe(eq.id);
    unload();
    msg('✅ Equipe excluída.', 'ok');
    await loadEquipes();
  } catch(e) {
    unload();
    msg('Erro: ' + e.message, 'er');
  }
}
