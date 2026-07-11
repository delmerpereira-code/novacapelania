import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('401')) errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));

async function login(matricula, senha) {
  await page.goto('http://localhost:8123/index.html');
  await page.waitForSelector('#lu');
  await page.fill('#lu', matricula);
  await page.fill('#lp', senha);
  await page.click('#lbtn');
  await page.waitForSelector('#leqc', { state: 'visible', timeout: 10000 });
  await page.selectOption('#leq', { index: 1 });
  await page.click('#lbtn');
}

async function loginEsperandoFalha(matricula, senha) {
  await page.goto('http://localhost:8123/index.html');
  await page.waitForSelector('#lu');
  await page.fill('#lu', matricula);
  await page.fill('#lp', senha);
  await page.click('#lbtn');
  await page.waitForSelector('#lerr', { state: 'visible', timeout: 10000 });
  return page.textContent('#lerr');
}

console.log('1. Login com senha original (3847)...');
await login('3847', '3847');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });
console.log('   ok, home carregada.');

console.log('\n2. Abrindo "mudar senha" e testando senha atual ERRADA...');
await page.click('#h-av');
await page.waitForSelector('#sh-senha.on', { timeout: 5000 });
await page.fill('#s-atual', 'senha-errada');
await page.fill('#s-nova', '9999');
await page.fill('#s-conf', '9999');
await page.click('button[onclick="confirmarMudarSenha()"]');
await page.waitForTimeout(1800);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));
console.log('   modal ainda aberto (esperado)?', await page.isVisible('#sh-senha.on'));

console.log('\n3. Trocando com a senha atual CERTA (3847 -> 9999)...');
await page.fill('#s-atual', '3847');
await page.fill('#s-nova', '9999');
await page.fill('#s-conf', '9999');
await page.click('button[onclick="confirmarMudarSenha()"]');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

console.log('\n4. Deslogando e tentando entrar com a senha ANTIGA (deve falhar)...');
await page.evaluate(() => doSair());
await page.waitForTimeout(300);
const erroEsperado = await loginEsperandoFalha('3847', '3847');
console.log('   erro esperado:', erroEsperado);

console.log('\n5. Entrando com a senha NOVA (deve funcionar)...');
await login('3847', '9999');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });
console.log('   ok, login com a nova senha funcionou.');

console.log('\n6. Revertendo pra senha original (9999 -> 3847), pra não quebrar os outros testes...');
await page.click('#h-av');
await page.waitForSelector('#sh-senha.on', { timeout: 5000 });
await page.fill('#s-atual', '9999');
await page.fill('#s-nova', '3847');
await page.fill('#s-conf', '3847');
await page.click('button[onclick="confirmarMudarSenha()"]');
await page.waitForTimeout(1200);
console.log('   toast:', await page.textContent('#toast').catch(() => '(nenhum)'));

console.log('\n7. Confirmando que a senha original volta a funcionar...');
await page.evaluate(() => doSair());
await page.waitForTimeout(300);
await login('3847', '3847');
await page.waitForSelector('#sc-home.on', { timeout: 10000 });
console.log('   ok, revertido com sucesso.');

console.log('\nErros de console:', errors.length ? errors : '(nenhum)');
await browser.close();
