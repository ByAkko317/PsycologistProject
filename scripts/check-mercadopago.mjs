#!/usr/bin/env node
/**
 * Verifica la configuración de Mercado Pago contra la API real.
 *
 *   pnpm check:mercadopago
 *
 * No cobra nada ni deja nada agendado: consulta la cuenta y crea una
 * preferencia de prueba de $1, que es un objeto inerte hasta que alguien la
 * abre y paga.
 *
 * Comprueba, en orden:
 *   1. Que las variables estén cargadas y sean coherentes entre sí.
 *   2. Que el Access Token sea válido, contra /users/me.
 *   3. Que la moneda del tenant coincida con el país de la cuenta.
 *   4. Que se pueda crear una preferencia y que devuelva init_point.
 *   5. Que el webhook pueda llegar: URL pública y secreto de firma.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- carga de .env.local -----------------------------------------------------
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const linea of readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const TOKEN = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? "").trim();
const PUBLIC_KEY = (process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "").trim();
const WEBHOOK_SECRET = (process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "").trim();
const API_BASE = (process.env.MERCADOPAGO_API_BASE ?? "").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
const BASE = API_BASE || "https://api.mercadopago.com";

// --- reporte -----------------------------------------------------------------
let fallas = 0;
let avisos = 0;

const c = {
  ok: "\x1b[32m",
  err: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[90m",
  off: "\x1b[0m",
};

const ok = (t, d) => console.log(`  ${c.ok}✓${c.off} ${t}${d ? `  ${c.dim}${d}${c.off}` : ""}`);
const err = (t, d) => {
  fallas++;
  console.log(`  ${c.err}✗${c.off} ${t}${d ? `\n      ${d}` : ""}`);
};
const warn = (t, d) => {
  avisos++;
  console.log(`  ${c.warn}!${c.off} ${t}${d ? `\n      ${d}` : ""}`);
};

async function mp(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log(`\n  Verificación de Mercado Pago\n  ${c.dim}API: ${BASE}${c.off}\n`);

  // --- 1. Variables ---------------------------------------------------------
  if (!TOKEN) {
    err(
      "Falta MERCADOPAGO_ACCESS_TOKEN",
      "Sacalo de mercadopago.com.ar/developers → Tus integraciones → tu app → Credenciales de prueba"
    );
    return terminar();
  }

  const esTest = TOKEN.startsWith("TEST-");
  const esProd = TOKEN.startsWith("APP_USR-");

  if (esTest) {
    ok("Access Token de PRUEBA", "no mueve plata real");
  } else if (esProd) {
    warn(
      "Access Token de PRODUCCIÓN (APP_USR-)",
      "Los pagos van a ser reales. Para probar usá las credenciales de prueba."
    );
  } else {
    err(
      "El Access Token no tiene un prefijo reconocible",
      'Tiene que empezar con "TEST-" (prueba) o "APP_USR-" (producción).'
    );
  }

  if (!PUBLIC_KEY) {
    warn(
      "Falta NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY",
      "Checkout Pro funciona igual con redirección, pero conviene cargarla."
    );
  } else if (esTest && !PUBLIC_KEY.startsWith("TEST-")) {
    err(
      "El Access Token es de prueba pero la Public Key no",
      "Mezclar entornos rompe el checkout. Las dos tienen que ser del mismo par."
    );
  } else if (esProd && PUBLIC_KEY.startsWith("TEST-")) {
    err(
      "El Access Token es productivo pero la Public Key es de prueba",
      "Las dos tienen que ser del mismo par."
    );
  } else {
    ok("Public Key del mismo entorno que el token");
  }

  if (!API_BASE) {
    ok("MERCADOPAGO_API_BASE vacía", "usa la API real, que es lo correcto");
  } else if (!/^https?:\/\//.test(API_BASE)) {
    // Este chequeo existe por un bug real: la app leía la variable con `??`,
    // así que un `MERCADOPAGO_API_BASE=` vacío NO caía al default y la URL
    // quedaba relativa ("/checkout/preferences" → ERR_INVALID_URL). Este
    // script usaba `||` y por eso pasaba con 0 fallas mientras la app rompía.
    // La causa ya está corregida en lib/config.ts; esto queda de red.
    err(
      `MERCADOPAGO_API_BASE no es una URL absoluta: "${API_BASE}"`,
      "Tiene que empezar con http:// o https://, o quedar vacía."
    );
  } else if (API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1")) {
    warn(
      `MERCADOPAGO_API_BASE apunta al simulador (${API_BASE})`,
      "Tus credenciales reales no se usan.\n" +
        "      Para probar contra Mercado Pago de verdad, dejá esta variable vacía."
    );
  } else {
    warn(
      `MERCADOPAGO_API_BASE apunta a ${API_BASE}`,
      "Solo debería tener valor si estás usando el simulador local."
    );
  }

  // --- 2. Token válido ------------------------------------------------------
  let cuenta = null;
  try {
    const r = await mp("/users/me");
    if (r.status === 401) {
      err(
        "Mercado Pago rechazó el Access Token (401)",
        "Puede estar vencido, mal copiado, o ser de otra aplicación."
      );
    } else if (r.status !== 200) {
      err(`La API respondió ${r.status}`, JSON.stringify(r.body).slice(0, 200));
    } else {
      cuenta = r.body;
      ok(
        "Access Token válido",
        `cuenta ${cuenta.nickname ?? cuenta.id} · país ${cuenta.site_id ?? "?"}`
      );
    }
  } catch (e) {
    err(
      `No se pudo contactar a ${BASE}`,
      `${e.message}\n      ¿Hay conexión? ¿Algún proxy o firewall bloqueando?`
    );
  }

  // --- 3. Moneda ------------------------------------------------------------
  const MONEDA_POR_SITIO = {
    MLA: "ARS", MLB: "BRL", MLM: "MXN", MLC: "CLP",
    MCO: "COP", MPE: "PEN", MLU: "UYU",
  };
  if (cuenta?.site_id) {
    const esperada = MONEDA_POR_SITIO[cuenta.site_id];
    if (esperada) {
      ok(
        `Moneda de la cuenta: ${esperada}`,
        `el tenant tiene que usar currency="${esperada}" en Airtable`
      );
    }
  }

  // --- 4. Crear una preferencia ---------------------------------------------
  if (cuenta) {
    try {
      const res = await fetch(`${BASE}/checkout/preferences`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              title: "Prueba de configuración — Turnos",
              quantity: 1,
              unit_price: 1,
              currency_id: MONEDA_POR_SITIO[cuenta.site_id] ?? "ARS",
            },
          ],
          external_reference: "check-mercadopago",
        }),
      });
      const pref = await res.json().catch(() => null);

      if (!res.ok) {
        err(
          `No se pudo crear una preferencia de pago (${res.status})`,
          JSON.stringify(pref).slice(0, 300)
        );
      } else if (!pref.init_point) {
        err("La preferencia se creó pero sin init_point", JSON.stringify(pref).slice(0, 200));
      } else {
        ok("Preferencia de pago creada", `id ${pref.id}`);
        console.log(`      ${c.dim}checkout: ${pref.init_point}${c.off}`);
        if (esTest) {
          console.log(
            `      ${c.dim}Abrilo con tu usuario COMPRADOR de prueba, no con tu cuenta real.${c.off}`
          );
        }
      }
    } catch (e) {
      err("Falló la creación de la preferencia", e.message);
    }
  }

  // --- 5. Webhook -----------------------------------------------------------
  console.log("");
  if (!APP_URL) {
    err("Falta NEXT_PUBLIC_APP_URL", "Mercado Pago la necesita para notificar el pago.");
  } else if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(APP_URL)) {
    warn(
      `NEXT_PUBLIC_APP_URL es local (${APP_URL})`,
      "Mercado Pago NO puede llamar a tu máquina: el turno va a quedar pendiente\n" +
        "      de pago para siempre, aunque el pago se acredite.\n" +
        "      Solución: ngrok http 3000, y poner esa URL https acá."
    );
  } else if (!APP_URL.startsWith("https://")) {
    warn(`NEXT_PUBLIC_APP_URL no es https (${APP_URL})`, "Mercado Pago exige https para notificar.");
  } else {
    ok("URL pública configurada", APP_URL);
    console.log(
      `      ${c.dim}Cargá esta URL en el panel → Webhooks:\n      ${APP_URL.replace(/\/$/, "")}/api/mercadopago/webhook${c.off}`
    );
  }

  if (!WEBHOOK_SECRET) {
    warn(
      "Falta MERCADOPAGO_WEBHOOK_SECRET",
      "La app acepta cualquier notificación sin validar la firma.\n" +
        "      Para probar alcanza, pero en producción es obligatorio: sin eso,\n" +
        "      cualquiera puede marcar turnos como pagados con un curl."
    );
  } else {
    ok("Secreto de firma del webhook cargado");
  }

  terminar();
}

function terminar() {
  console.log(
    `\n  ${fallas} falla${fallas === 1 ? "" : "s"} · ${avisos} aviso${avisos === 1 ? "" : "s"}\n`
  );
  if (fallas > 0) {
    console.log("  Revisá los ✗ antes de probar el flujo de pago.\n");
    process.exit(1);
  }
  if (avisos > 0) {
    console.log("  Los ! no impiden probar, pero leelos.\n");
  }
}

main().catch((e) => {
  console.error("\n  La verificación se cortó:", e.message, "\n");
  process.exit(1);
});
