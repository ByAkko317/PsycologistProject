#!/usr/bin/env node
/**
 * Expone la app en una URL pública y la deja configurada en .env.local.
 *
 *   pnpm tunel                  detecta un túnel ya corriendo (ngrok)
 *   pnpm tunel --cloudflare     levanta un túnel de Cloudflare y lo mantiene
 *   pnpm tunel https://...      usa una URL que ya tenés
 *
 * Por qué hace falta: Mercado Pago tiene que poder llamar a tu máquina para
 * confirmar el pago. Con `localhost` el checkout abre y el pago se acredita,
 * pero la notificación nunca llega y el turno queda pendiente para siempre.
 *
 * De NEXT_PUBLIC_APP_URL sale también el origen autorizado para las Server
 * Actions (ver next.config.mjs), así que actualizarla acá arregla las dos
 * cosas de una.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV = resolve(process.cwd(), ".env.local");
const API_NGROK = "http://127.0.0.1:4040/api/tunnels";
const PUERTO = 3000;

const c = {
  ok: "\x1b[32m",
  err: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[90m",
  off: "\x1b[0m",
};

const args = process.argv.slice(2);
const urlManual = args.find((a) => a.startsWith("http"));
const usarCloudflare = args.includes("--cloudflare") || args.includes("--cf");

// --- detección ---------------------------------------------------------------

/** Consulta la API local de ngrok. No necesita cuenta ni token. */
async function urlDesdeNgrok() {
  try {
    const res = await fetch(API_NGROK, { signal: AbortSignal.timeout(3000) });
    const datos = await res.json();
    const tuneles = datos?.tunnels ?? [];
    const https = tuneles.filter((t) => t.public_url?.startsWith("https://"));
    const alApp = https.find((t) =>
      new RegExp(`:${PUERTO}$`).test(t.config?.addr ?? "")
    );
    return (alApp ?? https[0] ?? tuneles[0])?.public_url ?? null;
  } catch {
    return null;
  }
}

/** ¿Está el binario disponible en el PATH? */
function existeComando(nombre) {
  return new Promise((ok) => {
    const p = spawn(nombre, ["--version"], { shell: false, stdio: "ignore" });
    p.on("error", () => ok(false));
    p.on("exit", (code) => ok(code === 0 || code === 1));
  });
}

// --- escritura ---------------------------------------------------------------

/** Reescribe una clave en .env.local conservando comentarios y orden. */
function guardarEnEnv(clave, valor) {
  let contenido = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  const rx = new RegExp(`^${clave}=.*$`, "m");

  if (rx.test(contenido)) {
    const anterior = contenido.match(rx)[0].slice(clave.length + 1).trim();
    writeFileSync(ENV, contenido.replace(rx, `${clave}=${valor}`));
    return anterior || null;
  }

  const salto = contenido === "" || contenido.endsWith("\n") ? "" : "\n";
  writeFileSync(ENV, `${contenido}${salto}${clave}=${valor}\n`);
  return null;
}

function informar(url, { mantieneAbierto = false } = {}) {
  const limpia = url.replace(/\/$/, "");
  const anterior = guardarEnEnv("NEXT_PUBLIC_APP_URL", limpia);

  console.log(`
  ${c.ok}✓${c.off} URL pública: ${limpia}
  ${c.ok}✓${c.off} NEXT_PUBLIC_APP_URL actualizada en .env.local${
    anterior && anterior !== limpia ? `\n      ${c.dim}antes: ${anterior}${c.off}` : ""
  }

  ${c.warn}Falta hacer dos cosas a mano:${c.off}

  1. ${mantieneAbierto ? "En OTRA terminal, arrancar" : "Reiniciar"} el servidor:  ${c.dim}pnpm dev${c.off}
     Las variables NEXT_PUBLIC_* se incrustan al arrancar; editarlas con el
     servidor levantado no alcanza.

  2. Cargar el webhook en Mercado Pago:
     ${c.dim}panel → Tus integraciones → tu app → Webhooks → Configurar${c.off}

        ${limpia}/api/mercadopago/webhook

     Evento: Pagos. Copiá la clave secreta a MERCADOPAGO_WEBHOOK_SECRET.

  Después:  ${c.dim}pnpm check:mercadopago${c.off}
`);
}

// --- Cloudflare --------------------------------------------------------------

/**
 * Levanta un Quick Tunnel de Cloudflare y se queda escuchando.
 *
 * A diferencia de ngrok, cloudflared no expone una API local: la URL solo
 * aparece en su salida, así que hay que leerla de ahí. Y como el túnel muere
 * con el proceso, este comando queda en primer plano a propósito.
 */
async function levantarCloudflare() {
  if (!(await existeComando("cloudflared"))) {
    console.error(`
  ${c.err}cloudflared no está instalado.${c.off}

  Windows:   ${c.dim}winget install --id Cloudflare.cloudflared${c.off}
  macOS:     ${c.dim}brew install cloudflared${c.off}
  Manual:    ${c.dim}https://github.com/cloudflare/cloudflared/releases${c.off}

  No necesita cuenta ni token: el Quick Tunnel es anónimo.
`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Levantando túnel de Cloudflare hacia el puerto ${PUERTO}…\n`);

  const proc = spawn(
    "cloudflared",
    ["tunnel", "--url", `http://localhost:${PUERTO}`],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let yaInformado = false;
  const buscarUrl = (buf) => {
    const texto = buf.toString();
    const m = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && !yaInformado) {
      yaInformado = true;
      informar(m[0], { mantieneAbierto: true });
      console.log(
        `  ${c.dim}El túnel vive mientras esta terminal esté abierta. Ctrl+C lo corta.${c.off}\n`
      );
    }
  };

  // cloudflared escribe el banner por stderr, no por stdout.
  proc.stdout.on("data", buscarUrl);
  proc.stderr.on("data", buscarUrl);

  proc.on("error", (e) => {
    console.error(`\n  ${c.err}No se pudo iniciar cloudflared:${c.off} ${e.message}\n`);
    process.exitCode = 1;
  });

  proc.on("exit", (code) => {
    if (!yaInformado) {
      console.error(
        `\n  ${c.err}cloudflared terminó (código ${code}) sin darme una URL.${c.off}\n`
      );
      process.exitCode = 1;
    }
  });

  /**
   * Cierra el túnel antes de salir.
   *
   * No alcanza con proc.kill() + process.exit(): salir de inmediato deja al
   * hijo vivo y el túnel queda huérfano ocupando el puerto. Se le da medio
   * segundo para que termine solo y, si no, SIGKILL.
   */
  let cerrando = false;
  const cerrar = () => {
    if (cerrando) return;
    cerrando = true;

    if (!proc.killed) {
      try {
        proc.kill("SIGTERM");
      } catch {
        /* ya no existe */
      }
    }

    const forzar = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ya no existe */
      }
      process.exit(0);
    }, 500);

    proc.once("exit", () => {
      clearTimeout(forzar);
      process.exit(0);
    });
  };

  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
  // Red de seguridad: si el proceso se cae por cualquier otro motivo.
  process.on("exit", () => {
    if (!proc.killed) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ya no existe */
      }
    }
  });
}

// --- principal ---------------------------------------------------------------

async function main() {
  if (urlManual) {
    if (!urlManual.startsWith("https://")) {
      console.error(
        `\n  ${c.err}La URL tiene que ser https:${c.off} ${urlManual}\n  Mercado Pago no notifica a URLs sin TLS.\n`
      );
      process.exitCode = 1;
      return;
    }
    return informar(urlManual);
  }

  if (usarCloudflare) return levantarCloudflare();

  const deNgrok = await urlDesdeNgrok();
  if (deNgrok) return informar(deNgrok);

  // Nada corriendo: mostrar las opciones con lo que realmente está instalado.
  const [tieneNgrok, tieneCf] = await Promise.all([
    existeComando("ngrok"),
    existeComando("cloudflared"),
  ]);

  console.error(`
  ${c.err}No hay ningún túnel activo.${c.off}

  ${c.warn}Opción 1 — Cloudflare${c.off} ${c.dim}(sin cuenta, un comando)${c.off}
  ${tieneCf ? `${c.ok}instalado${c.off}` : `${c.dim}falta instalar:  winget install --id Cloudflare.cloudflared${c.off}`}

      pnpm tunel --cloudflare

  ${c.warn}Opción 2 — ngrok${c.off} ${c.dim}(requiere cuenta gratuita)${c.off}
  ${tieneNgrok ? `${c.ok}instalado${c.off}` : `${c.dim}falta instalar:  winget install --id ngrok.ngrok${c.off}`}

      ngrok config add-authtoken TU_TOKEN   ${c.dim}# una sola vez, de ngrok.com${c.off}
      ngrok http ${PUERTO}                          ${c.dim}# en otra terminal${c.off}
      pnpm tunel                           ${c.dim}# lee la URL y la configura${c.off}

  ${c.warn}Opción 3 — ya tenés una URL${c.off}

      pnpm tunel https://tu-dominio.com

  ${c.dim}Si winget no encuentra el paquete, descargá el binario:
    Cloudflare  https://github.com/cloudflare/cloudflared/releases
    ngrok       https://ngrok.com/download/windows${c.off}
`);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error("\n  Falló:", e.message, "\n");
  process.exitCode = 1;
});
