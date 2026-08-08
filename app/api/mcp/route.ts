// Superficie MCP para agentes externos — mismo catálogo, mismas reglas.
import { NextResponse } from 'next/server';
import { buscarObras, getObra, card } from '@/lib/obras';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

const TOOLS = [
  { name: 'search_obras', description: 'Busca obras de map (artista chileno) por texto libre.', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
  { name: 'get_obra', description: 'Detalle de una obra por slug (precio/estado reales del catálogo).', inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] } },
];

export async function POST(req: Request) {
  let body: { jsonrpc?: string; id?: number | string | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { headers: CORS }); }
  const id = body.id ?? null;
  const ok = (result: unknown) => NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: CORS });
  switch (body.method) {
    case 'initialize': return ok({ protocolVersion: '2025-06-18', serverInfo: { name: 'mapa-lab', version: '0.1.0' }, capabilities: { tools: {} } });
    case 'notifications/initialized': case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const { name, arguments: args = {} } = body.params ?? {};
      let out: unknown;
      if (name === 'search_obras') out = buscarObras(args.q as string | undefined).map(card);
      else if (name === 'get_obra') { const o = getObra(String(args.slug)); out = o ? { ...card(o), historia: o.historia } : { error: 'no existe' }; }
      else return NextResponse.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `tool ${name}?` } }, { headers: CORS });
      return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    default: return NextResponse.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method?' } }, { headers: CORS });
  }
}
export async function GET() { return NextResponse.json({ name: 'mapa-lab', tools: TOOLS.length, docs: '/.well-known/agent-card.json' }, { headers: CORS }); }
export async function OPTIONS() { return new Response(null, { headers: CORS }); }
