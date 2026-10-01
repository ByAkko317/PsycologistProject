#!/usr/bin/env node
/**
 * Borra la actividad de prueba de Airtable antes de pasar a uso real.
 *
 *   pnpm limpiar:actividad              muestra que borraria, sin tocar nada
 *   pnpm limpiar:actividad --aplicar    respalda, pide confirmacion y borra
 *
 * Borra:     Bookings, Clients, Notes (turnos, pacientes y notas clinicas)
 * Conserva:  Tenants, Services, Professionals y los usuarios del equipo
 *
 * Antes de borrar guarda TODO lo que va a borrar en backups/ (ignorado por
 * git: tiene datos de pacientes). Airtable no tiene deshacer por API; ese
 * archivo es la unica forma de recuperar algo borrado por error.
 *
 * Las cuentas de paciente (Users con rol client) apuntan a un registro de
 * Clients. Si existen, quedarian huerfanas: el script las lista y no sigue,
 * salvo que se agregue --con-cuentas-de-pacientes para borrarlas tambien.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { nombreDeTabla, tablaPorNombre } from "./airtable-schema.mjs";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const linea of readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const API_KEY = (process.env.AIRTABLE_API_KEY ?? "").trim();
const BASE_ID = (process.env.AIRTABLE_BASE_ID ?? "").trim().replace(/^\/+|\/+$/g, "");
const APLICAR = process.argv.includes("--aplicar");
const CON_CUENTAS = process.argv.includes("--con-cuentas-de-pacientes");

const c = { ok: "\x1b[32m", err: "\x1b[31m", warn: "\x1b[33m", dim: "\x1b[90m", off: "\x1b[0m" };

if (!API_KEY || !BASE_ID) {
  console.error("\n  Falta AIRTABLE_API_KEY o AIRTABLE_BASE_ID. Corre: pnpm check:airtable\n");
  process.exit(1);
}

const tabla = (nombre) => nombreDeTabla(tablaPorNombre(nombre));
// Orden de borrado: primero lo que referencia a otros (notas y turnos
// apuntan a pacientes). Si se corta a mitad, no quedan notas sin paciente.
const A_BORRAR = ["Notes", "Bookings", "Clients"];

async function at(path, init) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status} en ${path}: ${await res.text()}`);
  return res.json();
}

async function todos(nombreTabla) {
  const out = [];
  let offset;
  do {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (offset) qs.set("offset", offset);
    const r = await at(`${encodeURIComponent(nombreTabla)}?${qs}`);
    out.push(...r.records);
    offset = r.offset;
  } while (offset);
  return out;
}

/** Airtable borra hasta 10 registros por pedido. */
async function borrar(nombreTabla, ids) {
  for (let i = 0; i < ids.length; i += 10) {
    const qs = ids.slice(i, i + 10).map((id) => `records[]=${id}`).join("&");
    await at(`${encodeURIComponent(nombreTabla)}?${qs}`, { method: "DELETE" });
    process.stdout.write(`\r    ${nombreTabla}: ${Math.min(i + 10, ids.length)}/${ids.length}`);
  }
  if (ids.length) process.stdout.write("\n");
}

async function main() {
  console.log(`\n  Limpieza de actividad de prueba — Base ${BASE_ID}${APLICAR ? "" : "  (solo muestra)"}\n`);

  const registros = {};
  for (const nombre of A_BORRAR) registros[nombre] = await todos(tabla(nombre));

  const usuarios = await todos(tabla("Users"));
  const cuentasPaciente = usuarios.filter((u) => u.fields?.role === "client");
  const equipo = usuarios.filter((u) => u.fields?.role !== "client");

  for (const nombre of A_BORRAR) {
    console.log(`  ${c.err}−${c.off} ${tabla(nombre).padEnd(14)} ${registros[nombre].length} registro(s)`);
  }
  if (CON_CUENTAS) {
    console.log(`  ${c.err}−${c.off} ${"Users (pac.)".padEnd(14)} ${cuentasPaciente.length} cuenta(s) de paciente`);
  }
  console.log(`  ${c.ok}✓${c.off} ${"Se conservan".padEnd(14)} tenant, servicios, profesionales y ${equipo.length} usuario(s) del equipo\n`);

  if (cuentasPaciente.length > 0 && !CON_CUENTAS) {
    console.log(`  ${c.warn}!${c.off} Hay ${cuentasPaciente.length} cuenta(s) de paciente que quedarian apuntando a pacientes borrados:`);
    for (const u of cuentasPaciente) console.log(`      ${c.dim}${u.fields?.email ?? u.id}${c.off}`);
    console.log(
      `\n    No sigo para no dejarlas rotas. Si tambien son de prueba:\n` +
        `      ${c.dim}pnpm limpiar:actividad --con-cuentas-de-pacientes${APLICAR ? " --aplicar" : ""}${c.off}\n`
    );
    process.exitCode = 1;
    return;
  }

  const total =
    A_BORRAR.reduce((n, t) => n + registros[t].length, 0) + (CON_CUENTAS ? cuentasPaciente.length : 0);
  if (total === 0) {
    console.log(`  ${c.ok}✓${c.off} No hay nada que borrar.\n`);
    return;
  }

  if (!APLICAR) {
    console.log(`  Para borrarlos:  ${c.dim}pnpm limpiar:actividad --aplicar${CON_CUENTAS ? " --con-cuentas-de-pacientes" : ""}${c.off}\n`);
    return;
  }

  // Respaldo antes de tocar nada.
  const dir = resolve(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const archivo = resolve(dir, `limpieza-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    archivo,
    JSON.stringify(
      {
        base: BASE_ID,
        fecha: new Date().toISOString(),
        tablas: Object.fromEntries([
          ...A_BORRAR.map((t) => [tabla(t), registros[t]]),
          ...(CON_CUENTAS ? [[tabla("Users"), cuentasPaciente]] : []),
        ]),
      },
      null,
      2
    )
  );
  console.log(`  ${c.ok}✓${c.off} Respaldo: ${archivo}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(
    `  Se van a borrar ${total} registro(s) de forma definitiva. Escribí BORRAR para seguir: `
  );
  rl.close();
  if (respuesta.trim() !== "BORRAR") {
    console.log(`\n  Cancelado. No se borró nada.\n`);
    return;
  }

  console.log("");
  for (const t of A_BORRAR) await borrar(tabla(t), registros[t].map((r) => r.id));
  if (CON_CUENTAS) await borrar(tabla("Users"), cuentasPaciente.map((u) => u.id));

  console.log(`\n  ${c.ok}✓${c.off} Listo. ${total} registro(s) borrado(s).\n    Verificá con:  ${c.dim}pnpm check:airtable${c.off}\n`);
}

main().catch((e) => {
  console.error(`\n  ${c.err}✗${c.off} ${e.message}\n`);
  process.exit(1);
});
