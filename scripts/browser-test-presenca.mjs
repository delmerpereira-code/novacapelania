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
await page.waitForTimeout(500);

console.log('1. Estado inicial do botão de presença:');
console.log('   label:', await page.textContent('#presenca-label'));
await page.screenshot({ path: 'scripts/.screenshots/pres-01-inicial.png' });

console.log('\n2. Forçando o botão habilitado (fora do dia da visita, testando só a gravação) e registrando...');
await page.evaluate(() => { $('btn-presenca').disabled = false; });
await page.click('#btn-presenca');
await page.waitForTimeout(1500);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
console.log('   label:', await page.textContent('#presenca-label'));
await page.screenshot({ path: 'scripts/.screenshots/pres-02-registrada.png' });

console.log('\n3. Recarregando a página e conferindo se o estado persiste (via verificarPresencaHoje)...');
await page.reload();
await page.waitForSelector('#lu');
await page.fill('#lu', '3847');
await page.fill('#lp', '3847');
await page.click('#lbtn');
await page.waitForSelector('#leqc', { state: 'visible', timeout: 10000 });
await page.selectOption('#leq', { index: 1 });
await page.click('#lbtn');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });
await page.waitForTimeout(800);
console.log('   label após relogar:', await page.textContent('#presenca-label'));
await page.screenshot({ path: 'scripts/.screenshots/pres-03-persistiu.png' });

console.log('\n4. Testando duplicata: forçando novo clique (deve reconhecer já registrado)...');
await page.evaluate(() => { $('btn-presenca').disabled = false; });
await page.click('#btn-presenca');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
