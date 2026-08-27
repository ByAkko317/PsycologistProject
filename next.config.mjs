/**
 * Configuración de Next.
 *
 * Lo único no obvio acá es `allowedOrigins`, y vale la pena entender por qué:
 *
 * Next 14 protege las Server Actions comparando la cabecera `Origin` contra
 * `Host` / `X-Forwarded-Host`. Es una defensa contra CSRF y está bien que
 * exista. Pero detrás de un túnel (ngrok, Cloudflare Tunnel, Codespaces) esas
 * dos cabeceras nunca coinciden: el navegador manda el dominio público y el
 * servidor ve `localhost:3000`.
 *
 * Resultado: TODOS los formularios que usan Server Actions —login, registro,
 * servicios, marca, equipo— fallan con "Invalid Server Actions request", y el
 * error no dice nada útil sobre la causa real.
 *
 * La solución es declarar el host del túnel como origen confiable. Se deriva
 * de NEXT_PUBLIC_APP_URL, que ya hay que configurar igual para el webhook de
 * Mercado Pago: así hay un solo lugar donde cambiar la URL cuando el túnel se
 * renueva, en vez de dos que se desincronizan.
 */

/** Extrae el host de una URL, tolerando valores vacíos o mal formados. */
function host(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const origenes = [
  "localhost:3000",
  "127.0.0.1:3000",
  host(process.env.NEXT_PUBLIC_APP_URL),
  // Escotilla por si se usa un túnel distinto al de NEXT_PUBLIC_APP_URL.
  process.env.TUNNEL_HOST || null,
].filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: [...new Set(origenes)],
    },
  },
};

export default nextConfig;
