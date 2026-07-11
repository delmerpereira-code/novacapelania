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

console.log('1. Abrindo Equipes (gestão) e criando uma nova...');
await page.click(".mod:has-text('Equipes')");
await page.waitForSelector('#sc-equipes.on', { timeout: 10000 });
await page.waitForTimeout(500);
await page.click('#sc-equipes .fab');
await page.waitForSelector('#sh-eq-form.on', { timeout: 5000 });
const nomeTeste = 'Teste CRUD Equipe ' + Date.now().toString(36);
await page.fill('#eq-f-nome', nomeTeste);
await page.fill('#eq-f-hosp', 'Hospital Teste');
await page.fill('#eq-f-dia', 'Sábado 10h às 11h');
await page.fill('#eq-f-lider', '3847'); // matrícula válida (o próprio usuário logado)
await page.click('button[onclick="salvarEquipeForm()"]');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

console.log('\n2. Conferindo se apareceu na lista com o líder resolvido...');
await page.waitForTimeout(500);
const html1 = await page.innerHTML('#eq-mgr-lista');
console.log('   equipe aparece?', html1.includes(nomeTeste));
console.log('   matrícula do líder (3847) aparece?', html1.includes('3847'));
await page.screenshot({ path: 'scripts/.screenshots/eq-crud-01-criada.png' });

console.log('\n3. Editando a equipe...');
const cardOriginal = page.locator('#eq-mgr-lista > div', { hasText: nomeTeste });
await cardOriginal.getByRole('button', { name: '✏️' }).click();
await page.waitForSelector('#sh-eq-form.on', { timeout: 5000 });
console.log('   campo nome no form de edição já veio preenchido?', await page.inputValue('#eq-f-nome') === nomeTeste);
const nomeEditado = nomeTeste + ' EDITADO';
await page.fill('#eq-f-nome', nomeEditado);
await page.click('button[onclick="salvarEquipeForm()"]');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
const html2 = await page.innerHTML('#eq-mgr-lista');
console.log('   nome editado aparece?', html2.includes(nomeEditado));
console.log('   nome ORIGINAL ainda aparece (não deveria, foi editado no lugar)?', html2.includes(nomeTeste) && !html2.includes(nomeEditado));

console.log('\n4. Testando nome duplicado (deve dar erro amigável)...');
await page.click('#sc-equipes .fab');
await page.waitForSelector('#sh-eq-form.on', { timeout: 5000 });
await page.fill('#eq-f-nome', nomeEditado); // mesmo nome já usado
await page.click('button[onclick="salvarEquipeForm()"]');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
await page.click('button[onclick="$(\'sh-eq-form\').classList.remove(\'on\')"]').catch(() => {});
await page.evaluate(() => { const el = document.getElementById('sh-eq-form'); if (el) el.classList.remove('on'); });

console.log('\n5. Excluindo a equipe de teste...');
const cardEditado = page.locator('#eq-mgr-lista > div', { hasText: nomeEditado });
await cardEditado.getByRole('button', { name: '🗑️' }).click();
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
const html3 = await page.innerHTML('#eq-mgr-lista');
console.log('   ainda aparece após excluir?', html3.includes(nomeEditado));

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
