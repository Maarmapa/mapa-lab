# Mapa Lab — la web ES el chat

Venta del arte de map (Mario Arturo Maldonado Parra) con stack agéntico.
Principio rector: **cada chat es un usuario, un carro.**

## Deploy (Vercel)
Proyecto nuevo en Vercel apuntando a este repo con **Root Directory = `mapa-lab`**,
env `OPENROUTER_API_KEY` (y opcional `CHAT_MODEL`). Nada más.

## Correr
```
npm install
OPENROUTER_API_KEY=sk-or-... npm run dev
```
Modelo por env `CHAT_MODEL` (default: deepseek/deepseek-chat vía OpenRouter).

## Piezas
- `/` — el chat (burbujas + cards de obra; el checkout será una card más)
- `/api/chat` — cerebro: streaming + tools ancladas a `data/obras.json`
- `/api/mcp` — superficie para agentes externos (search_obras, get_obra)
- `/.well-known/agent-card.json` — identidad del agente (borrador ERC-8004)
- `data/obras.json` — LA fuente de verdad del catálogo (curada a mano)

Leer `AGENTS.md` antes de tocar código.
