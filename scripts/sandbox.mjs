#!/usr/bin/env node
/**
 * Entorno de prueba completo, con un solo comando.
 *
 *   pnpm dev:sandbox
 *
 * Levanta tres procesos y los conecta entre sí:
 *
 *   :3000  la app (next dev)
 *   :4010  Mercado Pago simulado    → pantalla de checkout + webhook firmado
 *   :4020  n8n simulado             → valida la firma y muestra los mensajes
 *
 * Las variables de entorno se le inyectan a `next dev` en memoria: **no toca
 * tu `.env.local`**. Cuando cortás con Ctrl+C, todo vuelve a como estaba.
 *
 * Por defecto usa el proveedor de datos `mock`, así que no escribe en tu base
 * de Airtable. Para probar contra Airtable de verdad:
 *
 *   pnpm dev:sandbox --airtable
 *
 * (usa las credenciales de tu .env.local — cuidado, escribe registros reales)
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const usarAirtable = args.includes("--airtable");
const PUERTO_APP = Number(
  args.find((a) => a.startsWith("--port="))?.split("=")[1] || 3000
);

// --- .env.local del usuario, como base ---------------------------------------
const base = {};
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const linea of readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) base[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const APP_URL = `http://localhost:${PUERTO_APP}`;
const MP_URL = "http://localhost:4010";
const N8N_URL = "http://localhost:4020";

// Secretos fijos y evidentes: son de juguete, no tienen que parecer reales.
const SECRETO_N8N = base.N8N_WEBHOOK_SECRET || "sandbox-n8n-secret";
const SECRETO_MP = base.MERCADOPAGO_WEBHOOK_SECRET || "sandbox-mp-secret";

const entorno = {
  ...process.env,
  ...base,

  NEXT_PUBLIC_APP_URL: APP_URL,
  NEXT_PUBLIC_DEFAULT_TENANT: base.NEXT_PUBLIC_DEFAULT_TENANT || "demo",
  NEXT_PUBLIC_DATA_PROVIDER: usarAirtable ? "airtable" : "mock",

  // Mercado Pago simulado
  MERCADOPAGO_ACCESS_TOKEN: "TEST-sandbox-simulador",
  NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY: "TEST-sandbox-public-key",
  MERCADOPAGO_API_BASE: MP_URL,
  MERCADOPAGO_WEBHOOK_SECRET: SECRETO_MP,

  // n8n simulado
  N8N_ENABLED: "true",
  N8N_WEBHOOK_SECRET: SECRETO_N8N,
  N8N_WEBHOOK_BOOKING_CREATED: `${N8N_URL}/booking-created`,
  N8N_WEBHOOK_BOOKING_CANCELLED: `${N8N_URL}/booking-cancelled`,
  N8N_WEBHOOK_BOOKING_RESCHEDULED: `${N8N_URL}/booking-rescheduled`,
  N8N_WEBHOOK_REMINDER_24H: `${N8N_URL}/booking-reminder`,
  N8N_WEBHOOK_PAYMENT_CONFIRMED: `${N8N_URL}/payment-confirmed`,
};

// --- arranque ----------------------------------------------------------------
const procesos = [];

function lanzar(nombre, comando, argumentos, extra = {}) {
  const p = spawn(comando, argumentos, {
    env: { ...entorno, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  const prefijo = `\x1b[90m[${nombre}]\x1b[0m `;
  const escribir = (flujo) => (buf) => {
    const texto = buf.toString().trimEnd();
    if (texto) {
      flujo.write(
        texto.split("\n").map((l) => prefijo + l).join("\n") + "\n"
      );
    }
  };
  p.stdout.on("data", escribir(process.stdout));
  p.stderr.on("data", escribir(process.stderr));

  p.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`\n  ✗ ${nombre} terminó con código ${code}`);
      cerrar(1);
    }
  });

  procesos.push(p);
  return p;
}

function cerrar(code = 0) {
  for (const p of procesos) {
    if (!p.killed) p.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 300);
}

process.on("SIGINT", () => {
  console.log("\n\n  Cerrando el sandbox…\n");
  cerrar(0);
});
process.on("SIGTERM", () => cerrar(0));

console.log(`
  ┌──────────────────────────────────────────────────────────────┐
  │  ENTORNO DE PRUEBA                                           │
  ├──────────────────────────────────────────────────────────────┤
  │  App                  ${APP_URL.padEnd(39)}│
  │  Mercado Pago (sim)   ${MP_URL.padEnd(39)}│
  │  n8n (sim)            ${N8N_URL.padEnd(39)}│
  ├──────────────────────────────────────────────────────────────┤
  │  Datos: ${(usarAirtable ? "Airtable REAL — escribe registros" : "mock en memoria").padEnd(53)}│
  └──────────────────────────────────────────────────────────────┘

  Para probar el cobro de punta a punta:
    1. ${APP_URL}/book
    2. elegí "Primera consulta" (tiene 30% de seña)
    3. completá y confirmá → te lleva al checkout simulado
    4. elegí "Pago aprobado"
    5. mirá abajo: el webhook confirma el turno y n8n recibe payment.confirmed

  Ctrl+C corta todo.
`);

if (usarAirtable) {
  console.log(
    "  ⚠ Modo --airtable: los turnos de prueba se escriben en tu base real.\n"
  );
}

lanzar("mercadopago", process.execPath, ["scripts/mock-mercadopago.mjs"]);
lanzar("n8n", process.execPath, ["scripts/mock-n8n.mjs"]);

// next dev se lanza con un pequeño delay para que los mocks ya estén escuchando
setTimeout(() => {
  lanzar("app", "node", [
    "node_modules/next/dist/bin/next",
    "dev",
    "-p",
    String(PUERTO_APP),
  ]);
}, 600);
