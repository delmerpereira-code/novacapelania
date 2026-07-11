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

console.log('1. Criando decisão COM integração (telefone válido)...');
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
const nomeTeste = 'Teste Integracao ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click('#d-btn-fem');
await page.fill('#d-nm', nomeTeste);
await page.click('#d-sim');
await page.fill('#d-tel', '92981234567');
await page.fill('#d-obs', 'observação de teste automatizado');
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(500);

console.log('2. Abrindo Integração e distribuindo pendências...');
await page.evaluate(() => ir('home'));
await page.click(".mod:has-text('Integração')");
await page.waitForSelector('#sc-integracao.on', { timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: 'scripts/.screenshots/integ-01-antes.png' });

const btnVisible = await page.isVisible('#btn-distribuir-integ');
console.log('   botão distribuir visível (é Líder)?', btnVisible);
await page.click('#btn-distribuir-integ');
await page.waitForTimeout(1500);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
await page.waitForTimeout(1000);
await page.screenshot({ path: 'scripts/.screenshots/integ-02-distribuido.png' });

const listaHtml = await page.innerHTML('#i-lista');
const apareceu = listaHtml.includes(nomeTeste);
console.log('   decisão apareceu na fila de integração?', apareceu);

if (apareceu) {
  console.log('3. Abrindo o card e registrando a integração...');
  // Aciona o handler diretamente (o card pode estar dentro de um
  // accordion fechado -- não precisamos simular o clique no header antes).
  await page.evaluate((nome) => {
    const item = [...document.querySelectorAll('[onclick^="abrirDetInteg"]')]
      .find((el) => el.textContent.includes(nome));
    if (item) item.click();
  }, nomeTeste);
  await page.waitForSelector('#sc-integ-det.on', { timeout: 10000 });
  await page.screenshot({ path: 'scripts/.screenshots/integ-03-detalhe.png' });
  await page.click('#btn-integ-reg');
  await page.waitForTimeout(1500);
  console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
  await page.screenshot({ path: 'scripts/.screenshots/integ-04-registrada.png' });
}

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
