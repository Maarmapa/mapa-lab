// Endpoint A2A (Agent2Agent) — mismo catálogo que el MCP, otro protocolo.
//
// POR QUÉ EXISTE
// La agent card de /.well-known/agent-card.json declara que este agente habla
// A2A. Sin este endpoint esa declaración sería falsa: un cliente A2A leería la
// tarjeta, vendría a hablar, y no encontraría a nadie. Una tarjeta que promete
// un protocolo que no existe es peor que no tener tarjeta.
//
// QUÉ IMPLEMENTA
// El método `message/send` de A2A: recibe un mensaje del agente cliente y
// devuelve una Task terminada con el resultado. Es el mínimo conforme —
// suficiente para que un agente descubra el catálogo y pregunte por obras.
// No implementa streaming ni push notifications, y la tarjeta lo declara
// honestamente en `capabilities` (ambos en false).
//
// LA REGLA QUE HEREDA DEL RESTO DE LA CASA
// Los datos salen del catálogo real (lib/obras), nunca del modelo. Cada obra
// es única: si está vendida, se dice. Un agente que pregunte por precio recibe
// el del catálogo, no una estimación.

import { NextResponse } from 'next/server';
import { buscarObras, getObra, card } from '@/lib/obras';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

interface A2APart { kind?: string; text?: string }
interface A2AMessage { role?: string; parts?: A2APart[]; messageId?: string }

/** Junta el texto de las partes del mensaje del agente cliente. */
function textoDe(msg: A2AMessage | undefined): string {
  if (!msg?.parts) return '';
  return msg.parts.filter(p => p?.kind === 'text' || typeof p?.text === 'string')
    .map(p => p.text ?? '').join(' ').trim();
}

/**
 * Responde la consulta contra el catálogo real.
 * Si el texto calza con el slug de una obra, se devuelve su detalle; si no, se
 * busca por texto libre. Sin resultados se dice claro — no se inventa.
 */
function responder(consulta: string) {
  const q = consulta.trim();
  if (!q) {
    return { texto: 'Preguntá por una obra o un tema y te muestro lo que hay en el catálogo.', datos: null };
  }
  const exacta = getObra(q);
  if (exacta) {
    return { texto: `${exacta.titulo}: ${JSON.stringify(card(exacta))}`, datos: { ...card(exacta), historia: exacta.historia } };
  }
  const hits = buscarObras(q).map(card);
  if (!hits.length) {
    return { texto: `No hay obras que calcen con "${q}" en el catálogo.`, datos: { obras: [] } };
  }
  return {
    texto: `${hits.length} obra(s) para "${q}": ${hits.map(h => h.titulo).join(', ')}.`,
    datos: { obras: hits },
  };
}

export async function POST(req: Request) {
  let body: { jsonrpc?: string; id?: number | string | null; method?: string; params?: { message?: A2AMessage } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, { headers: CORS });
  }

  const id = body.id ?? null;

  if (body.method !== 'message/send') {
    return NextResponse.json(
      { jsonrpc: '2.0', id, error: { code: -32601, message: `método no soportado: ${body.method ?? '(ninguno)'}. Este agente implementa message/send.` } },
      { headers: CORS },
    );
  }

  const consulta = textoDe(body.params?.message);
  const { texto, datos } = responder(consulta);

  // Una Task A2A terminada, con el resultado como artifact.
  const taskId = `task-${Math.abs(hash(consulta + String(id))).toString(36)}`;
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    result: {
      id: taskId,
      contextId: taskId,
      kind: 'task',
      status: {
        state: 'completed',
        message: { role: 'agent', parts: [{ kind: 'text', text: texto }], messageId: `${taskId}-msg`, kind: 'message' },
      },
      artifacts: datos
        ? [{ artifactId: `${taskId}-art`, name: 'catalogo', parts: [{ kind: 'data', data: datos }] }]
        : [],
    },
  }, { headers: CORS });
}

/** Hash estable para el id de la task — sin Date.now() para que sea reproducible. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h | 0;
}

export async function GET() {
  return NextResponse.json({
    agente: 'Mapa Lab',
    protocolo: 'A2A',
    metodos: ['message/send'],
    tarjeta: '/.well-known/agent-card.json',
  }, { headers: CORS });
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS });
}
