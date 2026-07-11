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
await page.waitForSelector('#sc-home.on', { timeout: 10000 });

console.log('1. Criando uma decisão de teste...');
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
const nomeTeste = 'Teste Anual ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-mas');
await page.fill('#d-nm', nomeTeste);
await page.click('#d-nao');
await page.selectOption('#d-mot', { index: 1 });
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1000);
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(300);

console.log('2. Abrindo Relatórios > Anual...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Relatórios')");
await page.waitForSelector('#sc-relatorios.on', { timeout: 10000 });
await page.click('#rel-tab-anual');
await page.waitForTimeout(2000);
const anoAtual = new Date().getFullYear();
const html = await page.innerHTML('#rel-conteudo');
console.log(`   ano atual (${anoAtual}) aparece?`, html.includes(String(anoAtual)));
console.log('   "Decisões por mês" aparece?', html.includes('Decisões por mês'));
await page.screenshot({ path: 'scripts/.screenshots/rel-anual-01.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
