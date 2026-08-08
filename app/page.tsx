'use client';
// Mapa Lab — la web ES el chat. Cada chat es un usuario, un carro.
// v3 plug-and-play: burbujas flotando de fondo, popup card por obra (foto
// grande + historia + CTA de reserva, video-ready), cards que acompañan
// SIEMPRE al texto, chips, typing dots, persistencia total.
import { useEffect, useRef, useState } from 'react';

type Card = { slug: string; titulo: string; tecnica: string; medidas: string; anio: number; estado: string; img: string; precio: string; precio_usd?: string; historia?: string; video?: string };
type Msg = { role: 'user' | 'assistant'; content: string; cards?: Card[] };

const ipfs = (u: string) => u.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;

// El modelo escribe **negritas** — se renderizan, no se muestran los asteriscos.
const negrita = (t: string) => t.split('**').map((s, i) => i % 2 ? <b key={i}>{s}</b> : s);

const SUGERENCIAS = [
  'Muéstrame todas las obras',
  '¿Cuál es la pieza más grande?',
  'Cuéntame de Pachamama Fruits',
  '¿Precios en dólares?',
];

const BURBUJAS = [
  { s: 190, x: '8%', y: '12%', d: 26, c: 'rgba(233,30,99,.10)' },
  { s: 130, x: '78%', y: '18%', d: 34, c: 'rgba(124,58,237,.10)' },
  { s: 240, x: '68%', y: '66%', d: 42, c: 'rgba(233,30,99,.07)' },
  { s: 90, x: '18%', y: '72%', d: 22, c: 'rgba(124,58,237,.12)' },
  { s: 60, x: '48%', y: '38%', d: 18, c: 'rgba(233,30,99,.12)' },
];

export default function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [obraSel, setObraSel] = useState<Card | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const hidratado = useRef(false);

  useEffect(() => {
    try {
      const g = localStorage.getItem('mapalab.chat');
      if (g) { const j = JSON.parse(g); if (Array.isArray(j) && j.length) setMsgs(j); }
      if (!localStorage.getItem('mapalab.chatId')) localStorage.setItem('mapalab.chatId', crypto.randomUUID());
    } catch { /* incógnito */ }
    hidratado.current = true;
  }, []);
  useEffect(() => {
    if (!hidratado.current) return;
    try { localStorage.setItem('mapalab.chat', JSON.stringify(msgs.slice(-60))); } catch { /* lleno */ }
    scroller.current?.scrollTo({ top: 9e9, behavior: 'smooth' });
  }, [msgs]);

  async function enviar(directo?: string) {
    const texto = (directo ?? input).trim();
    if (!texto || busy) return;
    setInput(''); setBusy(true); setObraSel(null);
    const historia: Msg[] = [...msgs, { role: 'user', content: texto }];
    setMsgs([...historia, { role: 'assistant', content: '' }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: historia.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok) {
        let detalle = '';
        try { detalle = (await res.json()).error ?? ''; } catch { /* no json */ }
        throw new Error(detalle || `error ${res.status}`);
      }
      if (!res.body) throw new Error('sin stream');
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const ev = JSON.parse(line.slice(6));
          setMsgs(cur => {
            const out = [...cur]; const last = { ...out[out.length - 1] };
            if (ev.type === 'text') last.content += ev.delta;
            if (ev.type === 'cards') last.cards = [...(last.cards ?? []), ...ev.cards];
            out[out.length - 1] = last; return out;
          });
        }
      }
    } catch (e) {
      setInput(texto);
      const detalle = e instanceof Error ? ` (${e.message})` : '';
      setMsgs(cur => [...cur.slice(0, -2), { role: 'assistant', content: `Se cortó la conexión${detalle} — tu mensaje quedó abajo, dale enviar de nuevo.` }]);
    }
    setBusy(false);
  }

  const vacio = msgs.length === 0;

  return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0d', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes levitarLente { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-9px) } }
        @keyframes pulso { 0%,80%,100% { opacity:.25 } 40% { opacity:1 } }
        .dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#8a8794; margin-right:4px; animation:pulso 1.2s infinite }
        .dot:nth-child(2){ animation-delay:.2s } .dot:nth-child(3){ animation-delay:.4s }
        @keyframes flotar { 0% { transform:translate(0,0) scale(1) } 33% { transform:translate(24px,-30px) scale(1.06) } 66% { transform:translate(-18px,18px) scale(.96) } 100% { transform:translate(0,0) scale(1) } }
        .burbuja { position:absolute; border-radius:50%; filter:blur(28px); pointer-events:none; animation:flotar linear infinite }
        .chip:hover { border-color:#e91e63 !important; color:#f2f0ea !important }
        .cardobra { cursor:pointer; transition:all .15s }
        .cardobra:hover { transform:translateY(-3px); border-color:#e91e63 !important; box-shadow:0 8px 24px rgba(233,30,99,.15) }
        @keyframes aparecer { from { opacity:0; transform:scale(.96) translateY(8px) } to { opacity:1; transform:none } }
        .popup { animation:aparecer .18s ease-out }
        @keyframes brotar { 0% { opacity:0; transform:translateY(46px) rotate(var(--rot)) scale(.7) } 60% { opacity:1; transform:translateY(-10px) rotate(var(--rot)) scale(1.04) } 100% { opacity:1; transform:translateY(0) rotate(var(--rot)) scale(1) } }
        @keyframes levitar { 0%,100% { transform:translateY(0) rotate(var(--rot)) } 50% { transform:translateY(-7px) rotate(var(--rot)) } }
        .naipe { animation: brotar .7s cubic-bezier(.2,1.4,.4,1) backwards, levitar 4.5s ease-in-out infinite; animation-delay: var(--del), calc(var(--del) + .7s) }
        .mazo { display:flex; padding:18px 8px 10px 26px }
        .mazo .naipe { margin-left:-58px; box-shadow:-8px 10px 24px rgba(0,0,0,.45) }
        .mazo .naipe:first-child { margin-left:0 }
        .mazo .naipe:hover { transform:translateY(-14px) rotate(0deg) scale(1.05) !important; z-index:9 !important; animation:none }
        .viejas .naipe { filter:blur(1.6px) saturate(.6); opacity:.5; animation:none; transition:all .3s }
        .viejas .naipe:hover { filter:none; opacity:1 }
        @keyframes burbujear { 0% { opacity:0; transform:translateY(14px) scale(.8) } 100% { opacity:1; transform:none } }
        .accion { animation:burbujear .4s cubic-bezier(.2,1.4,.4,1) backwards }
        .accion:hover { transform:translateY(-3px); border-color:#e91e63 !important; color:#fff !important }
        input:focus { outline:none }
        * { box-sizing:border-box }
      `}</style>

      {BURBUJAS.map((b, i) => (
        <div key={i} className="burbuja" style={{ width: b.s, height: b.s, left: b.x, top: b.y, background: b.c, animationDuration: `${b.d}s` }} />
      ))}

      {/* EL LENTE: el chat entero es UNA gran card que levita sobre las burbujas */}
      <div style={{ position: 'relative', zIndex: 1, width: 'min(760px, 100vw - 12px)', height: 'min(94dvh, 100dvh - 10px)', display: 'flex', flexDirection: 'column', background: '#0d0d10', border: '1px solid #26262e', borderRadius: 26, boxShadow: '0 24px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(233,30,99,.06), 0 8px 44px rgba(124,58,237,.08)', animation: 'levitarLente 7s ease-in-out infinite', overflow: 'hidden' }}>

      <header style={{ padding: '14px 20px', borderBottom: '1px solid #1c1c22', display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#e91e63,#7c3aed)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, color: '#fff' }}>m</div>
        <div>
          <b style={{ fontSize: 15 }}>mapa lab</b>
          <div style={{ color: '#8a8794', fontSize: 11.5 }}>estudio de map · maarmapa.eth</div>
        </div>
      </header>

      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 18px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {vacio && (
            <div style={{ textAlign: 'center', marginTop: '13vh' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', background: 'linear-gradient(135deg,#e91e63,#7c3aed)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26, color: '#fff' }}>m</div>
              <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px' }}>¿En qué te puedo ayudar?</h1>
              <p style={{ color: '#8a8794', fontSize: 14, margin: '0 0 26px' }}>Este es el estudio de map. Pregunta por las obras — la conversación es tu carrito.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {SUGERENCIAS.map(s => (
                  <button key={s} className="chip" onClick={() => enviar(s)}
                    style={{ background: 'rgba(22,22,27,.7)', border: '1px solid #2a2a32', color: '#b9b6c0', borderRadius: 999, padding: '9px 15px', fontSize: 13.5, cursor: 'pointer', transition: 'all .15s', backdropFilter: 'blur(6px)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%', background: '#26262e', borderRadius: '18px 18px 4px 18px', padding: '11px 15px', fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {m.content}
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#e91e63,#7c3aed)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, color: '#fff', marginTop: 2 }}>m</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap', color: '#e8e6ef' }}>
                  {m.content ? negrita(m.content) : (busy && i === msgs.length - 1 ? <span><span className="dot" /><span className="dot" /><span className="dot" /></span> : '')}
                </div>
                {m.cards && m.cards.length > 0 && (() => {
                  const esUltima = i === msgs.length - 1 || (i === msgs.length - 2 && msgs[msgs.length - 1].role === 'user');
                  const n = m.cards.length; const centro = (n - 1) / 2;
                  return (
                    <>
                      <div className={`mazo ${esUltima ? '' : 'viejas'}`} style={{ overflowX: 'auto', marginTop: 8 }}>
                        {m.cards.map((c, k) => (
                          <div key={c.slug} className="cardobra naipe" onClick={() => setObraSel(c)}
                            style={{ ['--rot' as string]: `${(k - centro) * 3.5}deg`, ['--del' as string]: `${k * 0.09}s`,
                              zIndex: k, minWidth: 190, maxWidth: 190, background: '#16161b', border: '1px solid #26262e', borderRadius: 16, overflow: 'hidden' }}>
                            <img src={ipfs(c.img)} alt={c.titulo} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', background: '#101014', display: 'block' }} />
                            <div style={{ padding: '9px 12px 11px', fontSize: 12.5 }}>
                              <b style={{ fontSize: 13 }}>{c.titulo}</b>
                              <div style={{ color: '#8a8794', marginTop: 2 }}>{c.tecnica} · {c.anio}</div>
                              <div style={{ marginTop: 5, color: '#e91e63', fontWeight: 700 }}>{c.precio}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {esUltima && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                          {([
                            ['💳 Comprar una obra', () => enviar('Quiero comprar una de estas obras — ¿cómo lo hacemos?')],
                            ['✉️ Escribir a map', () => { window.location.href = 'mailto:mario@boykot.cl?subject=Sobre%20tu%20obra%20—%20Mapa%20Lab'; }],
                            ['🔔 Avisarme de nuevas obras', () => { window.location.href = 'mailto:mario@boykot.cl?subject=Av%C3%ADsame%20de%20nuevas%20obras%20—%20Mapa%20Lab&body=Hola%20map%2C%20quiero%20enterarme%20cuando%20publiques%20obra%20nueva.'; }],
                          ] as Array<[string, () => void]>).map(([t, fn], k) => (
                            <button key={t} className="accion" onClick={fn}
                              style={{ ['--del' as string]: `${0.5 + k * 0.12}s`, animationDelay: `${0.5 + k * 0.12}s`,
                                background: 'rgba(22,22,27,.85)', border: '1px solid #2a2a32', color: '#b9b6c0',
                                borderRadius: 999, padding: '8px 14px', fontSize: 12.5, cursor: 'pointer', transition: 'all .15s', backdropFilter: 'blur(6px)' }}>
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {obraSel && (
        <div onClick={() => setObraSel(null)}
          style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'center', padding: 16, backdropFilter: 'blur(4px)' }}>
          <div className="popup" onClick={e => e.stopPropagation()}
            style={{ maxWidth: 460, width: '100%', maxHeight: '100%', overflowY: 'auto', background: '#16161b', border: '1px solid #2a2a32', borderRadius: 20, overflow: 'hidden' }}>
            {obraSel.video
              ? <video src={obraSel.video} controls autoPlay muted playsInline style={{ width: '100%', display: 'block', background: '#000' }} />
              : <img src={ipfs(obraSel.img)} alt={obraSel.titulo} style={{ width: '100%', display: 'block', background: '#101014' }} />}
            <div style={{ padding: '18px 20px 20px' }}>
              <b style={{ fontSize: 18 }}>{obraSel.titulo}</b>
              <div style={{ color: '#8a8794', fontSize: 13, marginTop: 3 }}>{obraSel.tecnica} · {obraSel.medidas} · {obraSel.anio}</div>
              {obraSel.historia && <p style={{ color: '#c9c6d2', fontSize: 14, lineHeight: 1.6, margin: '12px 0 0' }}>{obraSel.historia}</p>}
              <div style={{ marginTop: 14, fontSize: 17, fontWeight: 800, color: '#e91e63' }}>
                {obraSel.precio}{obraSel.precio_usd ? <span style={{ color: '#8a8794', fontWeight: 400, fontSize: 13 }}> · {obraSel.precio_usd}</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={() => { const t = obraSel.titulo; setObraSel(null); enviar(`Me interesa "${t}" — ¿la reservamos?`); }}
                  style={{ flex: 1, background: 'linear-gradient(135deg,#e91e63,#7c3aed)', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>
                  Me interesa ✦
                </button>
                <button onClick={() => setObraSel(null)}
                  style={{ background: 'transparent', border: '1px solid #2a2a32', color: '#b9b6c0', borderRadius: 12, padding: '0 18px', fontSize: 14, cursor: 'pointer' }}>
                  cerrar
                </button>
              </div>
              <p style={{ margin: '10px 0 0', color: '#5c5964', fontSize: 11, textAlign: 'center' }}>Obra única · map confirma cada venta personalmente</p>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 18px calc(16px + env(safe-area-inset-bottom))', position: 'relative', zIndex: 1 }}>
        <form onSubmit={e => { e.preventDefault(); enviar(); }}
          style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(22,22,27,.85)', border: '1px solid #2a2a32', borderRadius: 24, padding: '6px 6px 6px 18px', backdropFilter: 'blur(8px)' }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Mensaje a mapa lab…" disabled={busy}
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#f2f0ea', fontSize: 15, padding: '10px 0' }} />
          <button disabled={busy || !input.trim()} aria-label="enviar"
            style={{ width: 38, height: 38, borderRadius: 19, border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#fff', background: input.trim() && !busy ? '#e91e63' : '#2a2a32', transition: 'background .15s' }}>
            ↑
          </button>
        </form>
        <p style={{ maxWidth: 720, margin: '8px auto 0', textAlign: 'center', color: '#5c5964', fontSize: 11 }}>
          Los precios y datos de obra salen del catálogo real del estudio. Cada venta la confirma map personalmente.
        </p>
      </div>
      </div>
    </div>
  );
}
