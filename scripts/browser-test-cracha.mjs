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

console.log('1. Abrindo "Meu Crachá"...');
await page.click(".mod:has-text('Crachá')");
await page.waitForSelector('#sc-cracha.on', { timeout: 10000 });
await page.waitForTimeout(1500);
console.log('   nome no crachá:', await page.textContent('#cracha-nome'));
console.log('   rg no crachá:', await page.textContent('#cracha-rg'));
await page.screenshot({ path: 'scripts/.screenshots/cracha-01-frente.png' });

console.log('\n2. Virando pro verso...');
await page.click("button:has-text('🔄 Virar')");
await page.waitForTimeout(800);
await page.screenshot({ path: 'scripts/.screenshots/cracha-02-verso.png' });

console.log('\n3. Testando botão "Ver Crachá" na ficha do Cadastro (Líder)...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Cadastro')");
await page.waitForSelector('#c-list .mrow', { timeout: 10000 });
await page.click('#c-list .mrow >> nth=0');
await page.waitForSelector('#sc-membro.on', { timeout: 10000 });
const visivel = await page.isVisible('#btn-cracha-m');
console.log('   botão "Ver Crachá" visível?', visivel);
if (visivel) {
  await page.click('#btn-cracha-m');
  await page.waitForSelector('#sc-cracha.on', { timeout: 10000 });
  await page.waitForTimeout(1200);
  console.log('   nome no crachá do membro:', await page.textContent('#cracha-nome'));
  await page.screenshot({ path: 'scripts/.screenshots/cracha-03-outro-membro.png' });
}

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
