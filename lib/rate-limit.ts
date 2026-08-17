// Límite de tasa por IP para rutas sin auth que gastan crédito (hoy: /api/chat
// contra OpenRouter). Mismo espíritu que rateLimit() del server.js de
// Maarmapa/map: Map en memoria + barrido, adaptado a Route Handlers de Next
// (Request/Response web, sin next()).
//
// HONESTIDAD SOBRE EL ALCANCE: en Vercel serverless el Map vive en memoria
// de la instancia. Varias instancias en paralelo cuentan por separado y un
// arranque en frío parte de cero. Mitiga abuso casual (un loop desde una IP)
// pero NO frena un ataque distribuido ni garantiza el número exacto. Si eso
// importa: contador compartido (Upstash/Redis, Vercel KV) o regla de rate
// limit en el Firewall de Vercel.

interface Bucket { count: number; windowStart: number }

const buckets = new Map<string, Bucket>(); // `${name}:${ip}` -> bucket
let lastSweep = 0;
const SWEEP_EVERY_MS = 10 * 60 * 1000;
const SWEEP_OLDER_THAN_MS = 60 * 60 * 1000;

// Primer valor de x-forwarded-for (en Vercel lo fija el proxy con la IP del
// cliente), luego x-real-ip. 'unknown' agrupa lo no identificable en un solo
// balde: preferible a dejarlo sin límite.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const first = xff.split(',')[0]?.trim();
  if (first) return first;
  const real = req.headers.get('x-real-ip')?.trim();
  return real || 'unknown';
}

// Barrido perezoso: sin setInterval (el proceso se congela entre invocaciones).
function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  const cutoff = now - SWEEP_OLDER_THAN_MS;
  for (const [key, b] of buckets) if (b.windowStart < cutoff) buckets.delete(key);
}

export interface RateLimitOptions { name: string; windowMs: number; max: number }
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

// rateLimit({ name, windowMs, max }) -> (req) => { ok } | { ok: false, retryAfterSec }
export function rateLimit({ name, windowMs, max }: RateLimitOptions) {
  if (!name || windowMs <= 0 || max <= 0) throw new Error('rateLimit: name, windowMs y max son obligatorios');
  return function check(req: Request): RateLimitResult {
    const now = Date.now();
    sweep(now);
    const key = `${name}:${clientIp(req)}`;
    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart > windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      return { ok: true };
    }
    if (bucket.count >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - bucket.windowStart)) / 1000));
      return { ok: false, retryAfterSec };
    }
    bucket.count++;
    return { ok: true };
  };
}

// Respuesta 429 estándar: JSON + header Retry-After (segundos).
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', retry_after_seconds: retryAfterSec }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': String(retryAfterSec) },
  });
}
