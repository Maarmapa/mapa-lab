// Cerebro del chat — streaming + tools ancladas al catálogo (cero alucinación).
// Modelo vía OpenRouter (env OPENROUTER_API_KEY, CHAT_MODEL). Ruta flaca:
// las tools ejecutan contra lib/obras; el modelo solo redacta.
import { buscarObras, getObra, card, obras } from '@/lib/obras';

export const runtime = 'nodejs';

const MODEL = process.env.CHAT_MODEL ?? 'deepseek/deepseek-chat';
const SYSTEM = `Eres el asistente de Mapa Lab, el estudio de map (Mario Arturo
Maldonado Parra), artista chileno. Hablas español cercano y breve. Vendes SU
obra: usa las tools para todo dato de obras (precio, estado, medidas) — JAMÁS
inventes cifras ni obras. Si una obra dice "consultar", ofrece confirmar precio
con map. Cada obra es única: si hay interés real, ofrece reservarla y avisa que
map confirma personalmente. Saluda cálido, despide cálido.
IMPORTANTE: cuando muestres obras, tu texto es UNA sola frase corta — las
cards con foto son las protagonistas, no repitas sus datos en el texto.
Respondes SIEMPRE en español, sin excepción.`;

const TOOLS = [
  { type: 'function', function: { name: 'buscar_obras', description: 'Busca obras del catálogo por texto libre (técnica, año, título). Sin query lista todo.', parameters: { type: 'object', properties: { q: { type: 'string' } } } } },
  { type: 'function', function: { name: 'ver_obra', description: 'Detalle de una obra por slug.', parameters: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] } } },
];

function runTool(name: string, args: Record<string, unknown>) {
  if (name === 'buscar_obras') return buscarObras(args.q as string | undefined).map(card);
  if (name === 'ver_obra') { const o = getObra(String(args.slug)); return o ? { ...card(o), historia: o.historia } : { error: 'no existe' }; }
  return { error: 'tool desconocida' };
}

async function llm(messages: unknown[], stream: boolean, tools = true) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('falta OPENROUTER_API_KEY en las env del proyecto');
  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, stream, ...(tools ? { tools: TOOLS } : {}) }),
  });
}

export async function POST(req: Request) {
  try {
  const { messages } = await req.json() as { messages: { role: string; content: string }[] };
  const convo: unknown[] = [{ role: 'system', content: SYSTEM }, ...messages.slice(-20)];

  // Pasada 1 (sin stream): ¿necesita tools?
  const first = await (await llm(convo, false)).json();
  if (first.error) throw new Error(first.error.message ?? `openrouter ${first.error.code ?? ''}`);
  const msg = first.choices?.[0]?.message;
  const cards: unknown[] = [];
  if (msg?.tool_calls?.length) {
    convo.push(msg);
    for (const tc of msg.tool_calls) {
      const result = runTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'));
      if (Array.isArray(result)) cards.push(...result.slice(0, 6));
      else if (result && !(result as { error?: string }).error) cards.push(result);
      convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  // Pasada 2 (stream): redacción final. Las cards viajan como evento aparte.
  const upstream = await llm(convo, true);
  if (!upstream.ok) {
    let detalle = `openrouter ${upstream.status}`;
    try { const j = await upstream.json(); detalle = j.error?.message ?? detalle; } catch { /* no json */ }
    throw new Error(detalle);
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      if (cards.length) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'cards', cards })}\n\n`));
      const reader = upstream.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let textoFinal = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
          try {
            const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
            if (delta) { textoFinal += delta; ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'text', delta })}\n\n`)); }
          } catch { /* frag */ }
        }
      }
      if (!textoFinal.trim()) {
        const respaldo = 'Aquí tienes ✦';
        textoFinal = respaldo;
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'text', delta: respaldo })}\n\n`));
      }
      // Toda obra MENCIONADA en el texto viaja con su card (foto siempre acompaña).
      const ya = new Set(cards.map(c => (c as { slug?: string }).slug));
      const limpio = (s: string) => s.toLowerCase().replace(/[©®]/g, '').trim();
      const texto = limpio(textoFinal);
      const mencionadas = obras
        .filter(o => !ya.has(o.slug) && texto.includes(limpio(o.titulo)))
        .slice(0, 6)
        .map(card);
      if (mencionadas.length) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'cards', cards: mencionadas })}\n\n`));
      ctrl.enqueue(enc.encode('data: {"type":"done"}\n\n'));
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error interno';
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { 'content-type': 'application/json' } });
  }
}
