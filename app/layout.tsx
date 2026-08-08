import type { ReactNode } from 'react';

export const metadata = {
  title: 'Mapa Lab — el estudio de map',
  description: 'Arte de map (Mario Arturo Maldonado Parra). Conversa con el estudio: la web es el chat.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#0b0b0e', color: '#f2f0ea', fontFamily: "-apple-system, 'Helvetica Neue', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
