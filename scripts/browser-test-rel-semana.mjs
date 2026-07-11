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

console.log('1. Criando 2 decisões de teste nesta semana (1 integrável+integrada, 1 não integrável)...');
async function criarDecisao({ nome, sexoBtn, integ, tel, mot }) {
  await page.click(".mod:has-text('Decisões')");
  await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
  await page.click('.fab');
  await page.waitForSelector('#sh-dec.on', { timeout: 5000 });
  await page.click("#sh-dec button:has-text('Paciente')");
  await page.click(sexoBtn);
  await page.fill('#d-nm', nome);
  if (integ) {
    await page.click('#d-sim');
    await page.fill('#d-tel', tel);
    await page.fill('#d-obs', 'obs teste relatório');
  } else {
    await page.click('#d-nao');
    await page.selectOption('#d-mot', { label: mot }).catch(async () => {
      await page.selectOption('#d-mot', { index: 1 });
    });
  }
  await page.click("button:has-text('💾 Salvar Decisão')");
  await page.waitForTimeout(1000);
  await page.click('button[onclick="fecharFormDec()"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => ir('home'));
}

const sufixo = Date.now().toString(36);
await criarDecisao({ nome: `Teste Rel M ${sufixo}`, sexoBtn: '#d-btn-mas', integ: true, tel: '92987654321' });
await criarDecisao({ nome: `Teste Rel F ${sufixo}`, sexoBtn: '#d-btn-fem', integ: false });

console.log('2. Abrindo Relatórios (aba Semana)...');
await page.click(".mod:has-text('Relatórios')");
await page.waitForSelector('#sc-relatorios.on', { timeout: 10000 });
await page.waitForTimeout(1000);
const html = await page.innerHTML('#rel-conteudo');
console.log('   contém "Total decisões"?', html.includes('Total decisões'));
await page.screenshot({ path: 'scripts/.screenshots/rel-semana-01.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
