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

console.log('1. Abrindo Aniversários...');
await page.click(".mod:has-text('Aniversários')");
await page.waitForSelector('#sc-aniversarios.on', { timeout: 10000 });
await page.waitForTimeout(1000);
const count = await page.locator('#aniv-lista > div').count();
console.log('   itens renderizados:', count);
await page.screenshot({ path: 'scripts/.screenshots/aniv-01.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
