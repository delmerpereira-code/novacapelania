import { chromium } from 'playwright';

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

console.log('1. Criando decisão NÃO integrável (deve arquivar na hora, nunca aparecer como pendência)...');
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-fem');
await page.fill('#d-nm', 'Teste Arquivamento NaoInteg');
await page.click('#d-nao');
await page.selectOption('#d-mot', { index: 1 });
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(800);
const listaHtml = await page.innerHTML('#d-lista-semana');
console.log('   aparece na lista de pendências (não deveria)?', listaHtml.includes('Teste Arquivamento NaoInteg'));

console.log('\n2. Criando decisão QUE QUER integração, distribuindo e confirmando (deve arquivar e sumir)...');
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
const nomeInteg = 'Teste Arquivamento Integ ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-mas');
await page.fill('#d-nm', nomeInteg);
await page.click('#d-sim');
await page.fill('#d-tel', '92999887766');
await page.fill('#d-obs', 'obs teste arquivamento');
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1200);
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(500);
const listaComPendente = await page.innerHTML('#d-lista-semana');
console.log('   aparece como pendente antes de integrar?', listaComPendente.includes(nomeInteg));

await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Integração')");
await page.waitForSelector('#sc-integracao.on', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('#btn-distribuir-integ');
await page.waitForTimeout(1200);
const filaAntes = await page.innerHTML('#i-lista');
console.log('   aparece na fila de integração?', filaAntes.includes(nomeInteg));

await page.evaluate((nome) => {
  const item = [...document.querySelectorAll('[onclick^="abrirDetInteg"]')].find((el) => el.textContent.includes(nome));
  if (item) item.click();
}, nomeInteg);
await page.waitForSelector('#sc-integ-det.on', { timeout: 10000 });
await page.click('#btn-integ-reg');
await page.waitForTimeout(1500);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.waitForTimeout(800);
const listaDepois = await page.innerHTML('#d-lista-semana');
console.log('   ainda aparece como pendente depois de integrar (não deveria)?', listaDepois.includes(nomeInteg));

console.log('\n3. Conferindo Relatórios > Semana (deve contar as 2 decisões mesmo já arquivadas)...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Relatórios')");
await page.waitForSelector('#sc-relatorios.on', { timeout: 10000 });
await page.waitForTimeout(1000);
const relHtml = await page.innerHTML('#rel-conteudo');
console.log('   html do relatório semana (recorte):', relHtml.slice(0, 400).replace(/\s+/g, ' '));

console.log('\n4. Conferindo Relatórios > Histórico (integrador deve aparecer)...');
await page.waitForSelector('#sc-relatorios.on', { timeout: 10000 });
await page.click('#rel-tab-historico');
await page.waitForTimeout(1000);
const histHtml = await page.innerHTML('#rel-conteudo');
console.log('   tem algum card de integrador?', histHtml.includes('decisões ·'));

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
