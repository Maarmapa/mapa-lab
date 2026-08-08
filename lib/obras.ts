// Catálogo de Mapa Lab — la ÚNICA fuente de verdad de obras/precios.
import catalogo from '@/data/obras.json';

export interface Obra {
  slug: string; titulo: string; tecnica: string; medidas: string;
  anio: number; precio_clp: number | null; precio_usd?: number | null;
  estado: 'disponible' | 'reservada' | 'vendida';
  img: string; historia: string; video?: string;
}

export const obras = (catalogo.obras as Obra[]);

export function buscarObras(q?: string): Obra[] {
  if (!q) return obras;
  const t = q.toLowerCase();
  return obras.filter(o =>
    [o.titulo, o.tecnica, o.historia, String(o.anio)].join(' ').toLowerCase().includes(t));
}

export const getObra = (slug: string) => obras.find(o => o.slug === slug) ?? null;

// Card segura para UI/agentes: precio null viaja como "consultar", nunca inventado.
export const card = (o: Obra) => ({
  slug: o.slug, titulo: o.titulo, tecnica: o.tecnica, medidas: o.medidas,
  anio: o.anio, estado: o.estado, img: o.img,
  precio: o.precio_clp ? `$${o.precio_clp.toLocaleString('es-CL')} CLP` : 'consultar',
  precio_usd: o.precio_usd ? `US$${o.precio_usd.toLocaleString('en-US')}` : undefined,
  historia: o.historia,
  ...(o.video ? { video: o.video } : {}),
});
