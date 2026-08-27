#!/usr/bin/env node
/**
 * Toma la URL pública del túnel y la deja configurada en .env.local.
 *
 *   ngrok http 3000        (en otra terminal, primero)
 *   pnpm tunel             (lee la URL y actualiza .env.local)
 *   pnpm dev               (recién ahora)
 *
 * Por qué existe: la URL del túnel hay que ponerla en NEXT_PUBLIC_APP_URL, y
 * cada vez que ngrok se reinicia cambia. Copiarla a mano es justo el paso que
 * uno olvida, y el síntoma es confuso: el checkout abre bien, el pago se
 * acredita, y el turno queda pendiente para siempre.
 *
 * Cómo la obtiene: ngrok expone una API local en el 4040 con los túneles
 * activos. No hace falta cuenta ni token para consultarla.
 *
 * También sirve con otros túneles, pasando la URL a mano:
 *   pnpm tunel https://mi-dominio.trycloudflare.com
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV = resolve(process.cwd(), ".env.local");
const API_NGROK = "http://127.0.0.1:4040/api/tunnels";

const c = {
  ok: "\x1b[32m",
  err: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[90m",
  off: "\x1b[0m",
};

/** Consulta la API local de ngrok y devuelve la URL https del túnel al 3000. */
async function urlDesdeNgrok() {
  let datos;
  try {
    const res = await fetch(API_NGROK, { signal: AbortSignal.timeout(4000) });
    datos = await res.json();
  } catch {
    return null;
  }

  const tuneles = datos?.tunnels ?? [];
  if (tuneles.length === 0) return null;

  // Preferir https; y entre varios, el que apunta al puerto de la app.
  const https = tuneles.filter((t) => t.public_url?.startsWith("https://"));
  const alApp = https.find((t) => /:3000$/.test(t.config?.addr ?? ""));
  return (alApp ?? https[0] ?? tuneles[0])?.public_url ?? null;
}

/** Reescribe una clave en .env.local conservando comentarios y orden. */
function guardarEnEnv(clave, valor) {
  let contenido = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";

  const rx = new RegExp(`^${clave}=.*$`, "m");
  if (rx.test(contenido)) {
    const anterior = contenido.match(rx)[0].slice(clave.length + 1).trim();
    contenido = contenido.replace(rx, `${clave}=${valor}`);
    writeFileSync(ENV, contenido);
    return anterior || "(vacía)";
  }

  contenido += `${contenido.endsWith("\n") || contenido === "" ? "" : "\n"}${clave}=${valor}\n`;
  writeFileSync(ENV, contenido);
  return null;
}

async function main() {
  const manual = process.argv[2];
  const url = manual || (await urlDesdeNgrok());

  if (!url) {
    console.error(`
  ${c.err}No encontré ningún túnel activo.${c.off}

  Abrí otra terminal y dejá esto corriendo:

      ngrok http 3000

  Después volvé a ejecutar ${c.dim}pnpm tunel${c.off}.

  Si usás otro túnel (Cloudflare, localtunnel), pasale la URL directo:

      pnpm tunel https://tu-dominio.trycloudflare.com
`);
    process.exit(1);
  }

  if (!url.startsWith("https://")) {
    console.error(
      `\n  ${c.err}La URL no es https:${c.off} ${url}\n  Mercado Pago exige https para notificar.\n`
    );
    process.exit(1);
  }

  const limpia = url.replace(/\/$/, "");
  const anterior = guardarEnEnv("NEXT_PUBLIC_APP_URL", limpia);
  const dominio = new URL(limpia).host;

  console.log(`
  ${c.ok}✓${c.off} Túnel detectado: ${limpia}
  ${c.ok}✓${c.off} NEXT_PUBLIC_APP_URL actualizada en .env.local${
    anterior && anterior !== limpia
      ? `\n      ${c.dim}antes: ${anterior}${c.off}`
      : ""
  }

  ${c.warn}Falta hacer dos cosas a mano:${c.off}

  1. Reiniciar el servidor si ya estaba corriendo.
     Las variables NEXT_PUBLIC_* se incrustan al arrancar; editarlas con el
     servidor levantado no alcanza.

  2. Cargar la URL del webhook en Mercado Pago:
     ${c.dim}panel → Tus integraciones → tu app → Webhooks → Configurar${c.off}

        ${limpia}/api/mercadopago/webhook

     Evento: Pagos. Copiá la clave secreta que genera a
     MERCADOPAGO_WEBHOOK_SECRET.

  ${c.dim}Dominio autorizado para Server Actions: ${dominio}
  (sale solo de NEXT_PUBLIC_APP_URL, no hay que tocar next.config)${c.off}

  Después:  ${c.dim}pnpm check:mercadopago${c.off}
`);
}

main().catch((e) => {
  console.error("\n  Falló:", e.message, "\n");
  process.exit(1);
});
