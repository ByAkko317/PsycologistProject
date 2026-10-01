#!/usr/bin/env node
/**
 * Lleva los telefonos ya cargados en Airtable al formato que usa WhatsApp.
 *
 *   pnpm reparar:telefonos              muestra que haria
 *   pnpm reparar:telefonos --aplicar    lo escribe
 *
 * Los formularios ahora guardan "+" y solo digitos (+5492611234567). Los
 * registros anteriores pueden tener espacios, guiones o venir sin codigo de
 * pais, y n8n los manda tal cual a WhatsApp.
 *
 * Usa la MISMA regla que la app (lib/utils/telefono.mjs), asi que lo que este
 * script deja bien, la app lo acepta. Solo corrige lo que se puede corregir
 * sin adivinar: "+54 9 261 123-4567" pasa a "+5492611234567". Un numero sin
 * "+" no se toca, porque no se sabe si trae codigo de pais; se lista para
 * corregirlo a mano en Airtable.
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validarTelefono } from "../lib/utils/telefono.mjs";

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

/** Tablas y campos con telefono, con el campo que sirve para nombrar el registro. */
const OBJETIVOS = [
  { tabla: (process.env.AIRTABLE_TABLE_CLIENTS || "Clients").trim(), campo: "phone", nombre: "name" },
  { tabla: (process.env.AIRTABLE_TABLE_PROFESSIONALS || "Professionals").trim(), campo: "phone", nombre: "name" },
  { tabla: (process.env.AIRTABLE_TABLE_TENANTS || "Tenants").trim(), campo: "contactPhone", nombre: "name" },
];

const c = { ok: "\x1b[32m", err: "\x1b[31m", warn: "\x1b[33m", dim: "\x1b[90m", off: "\x1b[0m" };

if (!API_KEY || !BASE_ID) {
  console.error("\n  Falta AIRTABLE_API_KEY o AIRTABLE_BASE_ID. Corre: pnpm check:airtable\n");
  process.exit(1);
}

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

async function todos(tabla) {
  const out = [];
  let offset;
  do {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (offset) qs.set("offset", offset);
    const r = await at(`${encodeURIComponent(tabla)}?${qs}`);
    out.push(...r.records);
    offset = r.offset;
  } while (offset);
  return out;
}

async function main() {
  console.log(`\n  Telefonos al formato +codigo${APLICAR ? " — aplicando" : ""}\n`);

  let totalCorregir = 0;
  let totalManual = 0;

  for (const { tabla, campo, nombre } of OBJETIVOS) {
    const registros = await todos(tabla);
    const corregir = [];
    const manual = [];
    let bien = 0;

    for (const r of registros) {
      const crudo = r.fields?.[campo];
      if (crudo === undefined || String(crudo).trim() === "") continue;

      const res = validarTelefono(String(crudo));
      const etiqueta = r.fields?.[nombre] ?? r.id;
      if (!res.ok) manual.push({ etiqueta, crudo, motivo: res.error });
      else if (res.telefono !== crudo) corregir.push({ id: r.id, etiqueta, crudo, nuevo: res.telefono });
      else bien++;
    }

    console.log(`  ${tabla}.${campo}  ${c.dim}${bien} ya en formato${c.off}`);
    for (const x of corregir) {
      console.log(`    ${c.ok}→${c.off} ${x.etiqueta}: "${x.crudo}" → ${x.nuevo}`);
    }
    for (const x of manual) {
      console.log(`    ${c.warn}!${c.off} ${x.etiqueta}: "${x.crudo}"  ${c.dim}${x.motivo}${c.off}`);
    }

    // Airtable acepta hasta 10 registros por PATCH.
    if (APLICAR) {
      for (let i = 0; i < corregir.length; i += 10) {
        const lote = corregir.slice(i, i + 10);
        await at(encodeURIComponent(tabla), {
          method: "PATCH",
          body: JSON.stringify({
            records: lote.map((x) => ({ id: x.id, fields: { [campo]: x.nuevo } })),
          }),
        });
      }
    }

    totalCorregir += corregir.length;
    totalManual += manual.length;
    console.log("");
  }

  if (totalCorregir === 0 && totalManual === 0) {
    console.log(`  ${c.ok}✓${c.off} Todos los telefonos ya estan en formato.\n`);
    return;
  }

  if (totalCorregir > 0) {
    console.log(
      APLICAR
        ? `  ${c.ok}✓${c.off} ${totalCorregir} telefono(s) corregido(s).`
        : `  ${totalCorregir} telefono(s) para corregir. Para escribirlos:  pnpm reparar:telefonos --aplicar`
    );
  }
  if (totalManual > 0) {
    console.log(
      `  ${c.warn}!${c.off} ${totalManual} para corregir a mano en Airtable: no se puede saber el codigo de pais sin adivinar.\n` +
        `    Escribilos como +54 9 261 1234567 (con o sin espacios) y volve a correr este comando.`
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n  ${c.err}✗${c.off} ${e.message}\n`);
  process.exit(1);
});
