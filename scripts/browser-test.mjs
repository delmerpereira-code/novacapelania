import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:8123/index.html');
await page.waitForSelector('#lu');

console.log('1. Preenchendo login (matrícula 3847, senha 3847)...');
await page.fill('#lu', '3847');
await page.fill('#lp', '3847');
await page.click('#lbtn');

console.log('   -> membro tem mais de uma equipe, selecionando a primeira...');
await page.waitForSelector('#leqc', { state: 'visible', timeout: 10000 });
await page.selectOption('#leq', { index: 1 });
await page.click('#lbtn');

await page.waitForSelector('#sc-home.on', { timeout: 10000 });
await page.screenshot({ path: 'scripts/.screenshots/01-home.png' });
console.log('   -> home carregada, screenshot salva.');
console.log('   h-name:', await page.textContent('#h-name'));
console.log('   h-eq:', await page.textContent('#h-eq'));

console.log('\n2. Abrindo módulo Cadastro...');
await page.click(".mod:has-text('Cadastro')");
await page.waitForSelector('#c-list .mrow', { timeout: 10000 });
const totalMembros = await page.locator('#c-list .mrow').count();
console.log('   -> membros listados:', totalMembros);
await page.screenshot({ path: 'scripts/.screenshots/02-cadastro.png' });

console.log('\n3. Abrindo um membro...');
await page.click('#c-list .mrow >> nth=0');
await page.waitForSelector('#sc-membro.on', { timeout: 10000 });
console.log('   m-name:', await page.textContent('#m-name'));
await page.screenshot({ path: 'scripts/.screenshots/03-membro.png' });

console.log('\n4. Voltando e abrindo módulo Equipes...');
await page.click("#sc-membro .hdr-back");
await page.waitForSelector('#sc-cadastro.on', { timeout: 10000 });
await page.click('#sc-cadastro .hdr-back');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });
await page.click(".mod:has-text('Equipes')");
await page.waitForSelector('#eq-mgr-lista', { timeout: 10000 });
await page.waitForTimeout(1000);
const totalEquipes = await page.locator('#eq-mgr-lista > *').count();
console.log('   -> itens em #eq-mgr-lista:', totalEquipes);
await page.screenshot({ path: 'scripts/.screenshots/04-equipes.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');

await browser.close();
