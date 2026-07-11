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

console.log('1. Abrindo módulo Decisões...');
await page.click(".mod:has-text('Decisões')");
await page.waitForSelector('#sc-decisoes.on', { timeout: 10000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'scripts/.screenshots/dec-01-lista.png' });

console.log('2. Abrindo formulário de nova decisão...');
await page.click('.fab');
await page.waitForSelector('#sh-dec.on', { timeout: 5000 });

const nomeTeste = 'Teste Playwright ' + Date.now().toString(36);
await page.click("#sh-dec button:has-text('Paciente')");
await page.click("#d-btn-fem");
await page.fill('#d-nm', nomeTeste);
await page.click('#d-nao'); // não integrar -> não exige telefone
await page.selectOption('#d-mot', { index: 1 });
await page.click("button:has-text('💾 Salvar Decisão')");
await page.waitForTimeout(1500);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
await page.screenshot({ path: 'scripts/.screenshots/dec-02-salva.png' });

console.log('3. Fechando o formulário e conferindo a lista...');
await page.click('button[onclick="fecharFormDec()"]');
await page.waitForTimeout(1000);
const listaHtml = await page.innerHTML('#d-lista-semana');
const apareceu = listaHtml.includes(nomeTeste);
console.log('   decisão apareceu na lista?', apareceu);

if (apareceu) {
  // abrir o grupo/accordion que contém o item pra poder clicar nos botões
  await page.click(`.acc-hdr:has(+ .acc-body:has-text("${nomeTeste}"))`);
  await page.waitForTimeout(300);
}
await page.screenshot({ path: 'scripts/.screenshots/dec-03-lista-atualizada.png' });

if (apareceu) {
  console.log('4. Editando a decisão...');
  await page.click(`.dec-item:has-text("${nomeTeste}") button[title="Editar"]`);
  await page.waitForSelector('#sh-edit-dec.on', { timeout: 5000 });
  const nomeEditado = nomeTeste + ' (editado)';
  await page.fill('#ed-nm', nomeEditado);
  await page.click('button[onclick="salvarEditDec()"]');
  await page.waitForTimeout(1500);
  const listaEditada = await page.innerHTML('#d-lista-semana');
  console.log('   nome editado apareceu?', listaEditada.includes(nomeEditado));
  await page.screenshot({ path: 'scripts/.screenshots/dec-04-editada.png' });

  console.log('5. Excluindo a decisão...');
  await page.click(`.acc-hdr:has(+ .acc-body:has-text("${nomeEditado}"))`);
  await page.waitForTimeout(300);
  page.once('dialog', (d) => d.accept());
  await page.click(`.dec-item:has-text("${nomeEditado}") button[title="Excluir"]`);
  await page.waitForTimeout(1500);
  const listaFinal = await page.innerHTML('#d-lista-semana');
  console.log('   ainda aparece após excluir?', listaFinal.includes(nomeEditado));
  await page.screenshot({ path: 'scripts/.screenshots/dec-05-excluida.png' });
}

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
