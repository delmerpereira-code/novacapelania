import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
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

console.log('1. Criando decisão com integração e distribuindo...');
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
const nomeTeste = 'Teste Historico ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-mas');
await page.fill('#d-nm', nomeTeste);
await page.click('#d-sim');
await page.fill('#d-tel', '92976543210');
await page.fill('#d-obs', 'obs teste historico');
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1000);
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(500);

await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Integração')");
await page.waitForSelector('#sc-integracao.on', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('#btn-distribuir-integ');
await page.waitForTimeout(1200);

console.log('2. Registrando a integração...');
await page.evaluate((nome) => {
  const item = [...document.querySelectorAll('[onclick^="abrirDetInteg"]')].find((el) => el.textContent.includes(nome));
  if (item) item.click();
}, nomeTeste);
await page.waitForSelector('#sc-integ-det.on', { timeout: 10000 });
await page.click('#btn-integ-reg');
await page.waitForTimeout(1500);

console.log('3. Abrindo Relatórios > Histórico...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Relatórios')");
await page.waitForSelector('#sc-relatorios.on', { timeout: 10000 });
await page.click("#rel-tab-historico");
await page.waitForTimeout(1000);
const html = await page.innerHTML('#rel-conteudo');
console.log('   texto "Últimas 8 semanas" aparece?', html.includes('Últimas 8 semanas'));
console.log('   "100%" aparece (1/1 integrado)?', html.includes('100%'));
console.log('   "1 decisões · 0 sem com pendência" (ou similar) aparece?', html.includes('1 decisões'));
await page.screenshot({ path: 'scripts/.screenshots/rel-historico-01.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
