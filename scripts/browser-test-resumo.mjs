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

console.log('1. Abrindo módulo Resumo...');
await page.click(".mod:has-text('Resumo')");
await page.waitForSelector('#sc-resumo.on', { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: 'scripts/.screenshots/resumo-01-lista.png' });

console.log('2. Abrindo formulário de novo resumo (sem foto, só texto)...');
await page.click('#sc-resumo .fab');
await page.waitForSelector('#sh-resumo.on', { timeout: 5000 });
// forçar a data pra hoje (semana atual), já que o campo vem preenchido com S.dv
const hojeBR = await page.evaluate(() => fD(new Date()));
await page.fill('#res-data', hojeBR);
await page.fill('#res-total', '7');
await page.click('button[onclick="salvarResumo()"]');
await page.waitForTimeout(1500);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

console.log('3. Conferindo se apareceu na lista...');
await page.waitForTimeout(800);
const listaHtml = await page.innerHTML('#res-lista');
console.log('   apareceu?', listaHtml.includes('7 decisões'));
await page.screenshot({ path: 'scripts/.screenshots/resumo-02-salvo.png' });

console.log('4. Abrindo o detalhe...');
await page.click('#res-lista .mrow >> nth=0');
await page.waitForSelector('#sc-resumo-det.on', { timeout: 10000 });
console.log('   equipe:', await page.textContent('#rc-equipe'));
console.log('   lider:', await page.textContent('#rc-lider'));
console.log('   total:', await page.textContent('#rc-total'));
console.log('   saldo:', await page.textContent('#rc-saldo'));
await page.screenshot({ path: 'scripts/.screenshots/resumo-03-detalhe.png' });

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
