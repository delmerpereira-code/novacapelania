import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', async (res) => {
  const url = res.url();
  if (url.includes('supabase.co') && ['PATCH','POST','DELETE'].includes(res.request().method())) {
    console.log('   [net]', res.request().method(), url.replace(/^https:\/\/[^/]+/,''), '->', res.status());
  }
});

const MATRICULA_TESTE = 'T' + Date.now().toString().slice(-6);

await page.goto('http://localhost:8123/index.html');
await page.waitForSelector('#lu');
await page.fill('#lu', '3847');
await page.fill('#lp', '3847');
await page.click('#lbtn');
await page.waitForSelector('#leqc', { state: 'visible', timeout: 10000 });
await page.selectOption('#leq', { index: 1 });
await page.click('#lbtn');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });

console.log('1. Abrindo Cadastro e criando novo membro', MATRICULA_TESTE);
await page.click(".mod:has-text('Cadastro')");
await page.waitForSelector('#sc-cadastro.on', { timeout: 10000 });
await page.click('#sc-cadastro .fab');
await page.waitForSelector('#sh-novo.on', { timeout: 5000 });
await page.fill('#nn-pin', MATRICULA_TESTE);
await page.fill('#nn-nc', 'Fulano Teste da Silva');
await page.fill('#nn-ns', 'Fulano Teste');
await page.selectOption('#nn-sx', 'M');
await page.fill('#nn-tel', '92999998888');
await page.fill('#nn-em', 'teste@example.com');
await page.selectOption('#nn-pf', 'Membro');
await page.click("button:has-text('💾 Cadastrar')");
await page.waitForTimeout(1500);
const toastNovo = await page.textContent('#toast');
console.log('   toast:', toastNovo);

console.log('\n2. Abrindo o membro recém-criado e editando dados pessoais...');
await page.fill('#c-search', 'Fulano Teste');
await page.waitForTimeout(600);
await page.click(".mrow:has-text('Fulano Teste')");
await page.waitForSelector('#sc-membro.on', { timeout: 10000 });
await page.click("button:has-text('✏️ Editar dados')");
await page.waitForTimeout(300);
await page.fill('#erg', '12345678');
await page.fill('#ean', '15/03');
await page.click('#e0 .btn-p');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast'));
console.log('   RG na view:', await page.textContent('#v-rg'));
console.log('   Aniversário na view:', await page.textContent('#v-an'));

console.log('\n3. Editando dados ministeriais (perfil -> Líder, situação continua Ativo)...');
await page.click(".tab:has-text('Ministerial')");
await page.click("#p1 button:has-text('✏️ Editar')");
await page.waitForTimeout(300);
await page.selectOption('#edc', 'S');
await page.selectOption('#epf', 'LIDER');
await page.fill('#eobs', 'Observação de teste automatizado');
await page.click('#e1 .btn-p');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast'));
console.log('   perfil na view:', await page.textContent('#vm-pf'));
console.log('   obs na view:', await page.textContent('#vm-obs'));

console.log('\n4. Marcando uma equipe...');
await page.click(".tab:has-text('Equipes')");
await page.waitForTimeout(300);
const primeiraEquipe = await page.locator('#eq-list .eq-item').first();
await primeiraEquipe.click();
const nomeEquipe = await primeiraEquipe.getAttribute('data-eq');
await page.click("button:has-text('💾 Salvar Equipes')");
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast'), '| equipe marcada:', nomeEquipe);

console.log('\n5. Desativando o membro...');
await page.click(".tab:has-text('Dados')");
await page.waitForTimeout(300);
page.once('dialog', (d) => d.accept());
await page.click('#btn-sit');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast'));
console.log('   badge:', await page.textContent('#m-badge'));

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await page.screenshot({ path: 'scripts/.screenshots/cadastro-teste.png' });
await browser.close();

console.log('\nMATRICULA_TESTE=' + MATRICULA_TESTE);
