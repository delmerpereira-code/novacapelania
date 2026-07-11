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

console.log('1. Abrindo Cadastro e um membro qualquer...');
await page.click(".mod:has-text('Cadastro')");
await page.waitForSelector('#c-list .mrow', { timeout: 10000 });
await page.click('#c-list .mrow >> nth=0');
await page.waitForSelector('#sc-membro.on', { timeout: 10000 });
const nomeMembro = await page.textContent('#m-name');
console.log('   membro aberto:', nomeMembro);

console.log('\n2. Verificando se o botão de câmera aparece (perfil Líder)...');
const camVisivel = await page.isVisible('#btn-cam-m');
console.log('   botão câmera visível?', camVisivel);

console.log('\n3. Fazendo upload de uma imagem de teste...');
await page.setInputFiles('#foto-input-m', 'scripts/.screenshots/teste-1px.png');
await page.waitForTimeout(4000);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
await page.screenshot({ path: 'scripts/.screenshots/foto-01-apos-upload.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
