import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import 'dotenv/config';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function assinar(payload, secret) {
  const h = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac('sha256', secret).update(h + '.' + p).digest());
  return `${h}.${p}.${sig}`;
}
async function dispararComoAdmin(rpc) {
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: membro } = await admin.from('membros').select('id, matricula, perfil').eq('matricula', '17027').single();
  const agora = Math.floor(Date.now() / 1000);
  const token = assinar({ sub: membro.id, role: 'authenticated', aud: 'authenticated', membro_id: membro.id, matricula: membro.matricula, perfil: membro.perfil, iat: agora, exp: agora + 300 }, process.env.JWT_SECRET);
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
  const { data, error } = await supa.rpc(rpc);
  if (error) throw error;
  return data;
}

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('409')) errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));
page.on('dialog', (d) => d.accept());

await page.goto('http://localhost:8123/index.html');
await page.waitForSelector('#lu');
await page.fill('#lu', '3847');
await page.fill('#lp', '3847');
await page.click('#lbtn');
await page.waitForSelector('#leqc', { state: 'visible', timeout: 10000 });
await page.selectOption('#leq', { index: 1 });
await page.click('#lbtn');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });

console.log('1. Criando decisão NÃO integrável (deve ficar VISÍVEL e editável, não mais arquivar na hora)...');
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
const nomeNaoInteg = 'Teste Fechamento NaoInteg ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-fem');
await page.fill('#d-nm', nomeNaoInteg);
await page.click('#d-nao');
await page.selectOption('#d-mot', { index: 1 });
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1000);
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(800);
const listaComNaoInteg = await page.innerHTML('#d-lista-semana');
console.log('   aparece na lista da semana (deve ser true agora)?', listaComNaoInteg.includes(nomeNaoInteg));

console.log('\n2. Editando a não-integrável (prova que está viva e editável)...');
const acc = page.locator('.acc-hdr', { hasText: '' }).first();
await page.evaluate((nome) => {
  const hdrs = [...document.querySelectorAll('.acc-hdr')];
  const hdr = hdrs.find(h => h.nextElementSibling && h.nextElementSibling.textContent.includes(nome));
  if (hdr) hdr.click();
}, nomeNaoInteg);
await page.waitForTimeout(300);
await page.evaluate((nome) => {
  const btns = [...document.querySelectorAll('[title="Editar"]')];
  const item = btns.find(b => b.closest('.dec-item').textContent.includes(nome));
  if (item) item.click();
}, nomeNaoInteg);
await page.waitForSelector('#sh-edit-dec.on', { timeout: 5000 }).catch(() => console.log('   (não achou botão editar -- pode já ter fechado o acordeão)'));
const editModalOpen = await page.isVisible('#sh-edit-dec.on').catch(() => false);
console.log('   modal de edição abriu?', editModalOpen);
if (editModalOpen) {
  await page.click('button[onclick="$(\'sh-edit-dec\').classList.remove(\'on\')"]').catch(async () => {
    await page.evaluate(() => document.getElementById('sh-edit-dec').classList.remove('on'));
  });
}

console.log('\n3. Criando decisão INTEGRÁVEL, distribuindo e confirmando (deve ficar VERDE e continuar na lista)...');
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
const nomeInteg = 'Teste Fechamento Integ ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-mas');
await page.fill('#d-nm', nomeInteg);
await page.click('#d-sim');
await page.fill('#d-tel', '92988776655');
await page.fill('#d-obs', 'obs teste fechamento');
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1000);
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(500);

await page.evaluate(() => ir('home'));
console.log('   disparando distribuição via token simulado da 17027 (única autorizada)...');
const total = await dispararComoAdmin('distribuir_integracoes');
console.log('   distribuídas:', total);

await page.click(".mod:has-text('Integração')");
await page.waitForSelector('#sc-integracao.on', { timeout: 10000 });
await page.waitForTimeout(3000);

await page.evaluate((nome) => {
  const item = [...document.querySelectorAll('[onclick^="abrirDetInteg"]')].find((el) => el.textContent.includes(nome));
  if (item) item.click();
}, nomeInteg);
const abriuDetalhe = await page.isVisible('#sc-integ-det.on').catch(() => false);
console.log('   abriu o detalhe da integração?', abriuDetalhe);
if (abriuDetalhe) {
  await page.click('#btn-integ-reg');
  await page.waitForTimeout(1500);
  console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
}

await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Integração')");
await page.waitForSelector('#sc-integracao.on', { timeout: 10000 });
await page.waitForTimeout(1000);
const filaDepois = await page.innerHTML('#i-lista');
console.log('   AINDA aparece na fila (deve ser TRUE agora -- não some mais)?', filaDepois.includes(nomeInteg));

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
