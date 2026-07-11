import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('409')) errors.push(msg.text()); });
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
await page.waitForTimeout(500);

console.log('1. Registrando presença (forçando o botão habilitado)...');
await page.evaluate(() => { $('btn-presenca').disabled = false; });
await page.click('#btn-presenca');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

console.log('2. Abrindo Relatórios > Presença...');
await page.click(".mod:has-text('Relatórios')");
await page.waitForSelector('#sc-relatorios.on', { timeout: 10000 });
await page.click('#rel-tab-presenca');
await page.waitForTimeout(1000);
const html = await page.innerHTML('#rel-conteudo');
console.log('   equipe do membro aparece (Cecon ou Joventina)?', html.includes('Cecon') || html.includes('Joventina'));
console.log('   "Presentes / Total" aparece?', html.includes('Presentes / Total'));
await page.screenshot({ path: 'scripts/.screenshots/rel-presenca-01.png' });

// Expandir o primeiro grupo pra ver a grade
await page.click('#rel-conteudo > div > div:first-child');
await page.waitForTimeout(300);
await page.screenshot({ path: 'scripts/.screenshots/rel-presenca-02-expandido.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
