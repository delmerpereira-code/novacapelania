// Assinatura/verificação HS256 mínima, compatível com o JWT que a Edge
// Function `login` emite (assinado com o Legacy JWT Secret do projeto).
// Sem dependência externa -- só Web Crypto, que já vem no runtime.

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function assinarJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encoder = new TextEncoder();
  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)));
  return `${signingInput}.${base64url(signature)}`;
}

// Retorna o payload decodificado se a assinatura e a expiração forem
// válidas, ou null caso contrário -- nunca lança, quem chama decide o que
// fazer com null (normalmente 401).
export async function verificarJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = partes;

  const key = await hmacKey(secret);
  const signingInput = `${headerB64}.${payloadB64}`;
  const assinaturaValida = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(signatureB64),
    new TextEncoder().encode(signingInput),
  );
  if (!assinaturaValida) return null;

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
  const agora = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < agora) return null;

  return payload;
}

export function extrairBearer(req: Request): string | null {
  const auth = req.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
