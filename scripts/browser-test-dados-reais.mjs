import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:8123/index.html');
await page.waitForSelector('#lu');
await page.fill('#lu', '3847');
await page.fill('#lp', '3847');
await page.click('#lbtn');
await page.waitForSelector('#leqc', { state: 'visible', timeout: 10000 });
await page.selectOption('#leq', { index: 1 });
await page.click('#lbtn');
await page.waitForSelector('#sc-home.on', { timeout: 15000 });

console.log('1. Decisões da semana (dado real, deve ser rápido mesmo com volume)...');
const t0 = Date.now();
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 15000 });
await page.waitForTimeout(1500);
console.log('   tempo de carregamento (ms):', Date.now() - t0);
console.log('   total no badge:', await page.textContent('#d-total').catch(() => '?'));
await page.screenshot({ path: 'scripts/.screenshots/real-01-decisoes.png' });

console.log('\n2. Integração (fila real)...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Integração')");
await page.waitForSelector('#sc-integracao.on', { timeout: 15000 });
await page.waitForTimeout(4000);
console.log('   total no badge:', await page.textContent('#i-total').catch(() => '?'));
await page.screenshot({ path: 'scripts/.screenshots/real-02-integracao.png' });

console.log('\n3. Relatórios > Semana...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Relatórios')");
await page.waitForSelector('#sc-relatorios.on', { timeout: 15000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'scripts/.screenshots/real-03-rel-semana.png' });

console.log('\n4. Relatórios > Histórico...');
await page.click('#rel-tab-historico');
await page.waitForTimeout(3000);
await page.screenshot({ path: 'scripts/.screenshots/real-04-rel-historico.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
