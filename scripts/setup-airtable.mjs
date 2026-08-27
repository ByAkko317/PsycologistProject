#!/usr/bin/env node
/**
 * Crea en Airtable las tablas y campos que falten.
 *
 *   pnpm setup:airtable            # muestra qué haría, sin tocar nada
 *   pnpm setup:airtable --aplicar  # lo hace
 *
 * Por qué existe: son 6 tablas y ~60 campos, y un nombre mal escrito no da
 * error al crearlo — falla mucho después, al leer, con un 404 genérico.
 * Crearlas desde la misma definición que usa el código elimina esa clase
 * entera de problemas.
 *
 * Es incremental: no toca lo que ya existe, solo agrega lo que falta. Nunca
 * borra ni modifica campos existentes, así que correrlo sobre un Base con
 * datos es seguro.
 *
 * Requiere que el token tenga el scope `schema.bases:write`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESQUEMA, nombreDeTabla } from "./airtable-schema.mjs";

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
const BASE_ID = (process.env.AIRTABLE_BASE_ID ?? "").trim();
const APLICAR = process.argv.includes("--aplicar");

const c = {
  ok: "\x1b[32m",
  err: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[90m",
  off: "\x1b[0m",
};

async function at(path, init = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

function abortar(mensaje) {
  console.error(`\n  ${c.err}${mensaje}${c.off}\n`);
  process.exitCode = 1;
}

async function main() {
  if (!API_KEY || !BASE_ID) {
    return abortar(
      "Faltan AIRTABLE_API_KEY y/o AIRTABLE_BASE_ID en .env.local.\n" +
        "  Corré primero: pnpm check:airtable"
    );
  }

  console.log(
    `\n  ${APLICAR ? "Creando estructura en" : "Simulación sobre"} el Base ${BASE_ID}\n`
  );

  // --- Estado actual --------------------------------------------------------
  const meta = await at(`meta/bases/${BASE_ID}/tables`);
  if (!meta.ok) {
    if (meta.status === 403) {
      return abortar(
        "El token no tiene el scope schema.bases:read.\n" +
          "  Editalo en https://airtable.com/create/tokens"
      );
    }
    if (meta.status === 404) {
      return abortar(
        "Airtable devolvió 404 para este Base.\n" +
          "  Corré `pnpm check:airtable` para saber cuál de las causas es."
      );
    }
    return abortar(`Airtable respondió ${meta.status}: ${JSON.stringify(meta.body)}`);
  }

  const existentes = new Map((meta.body?.tables ?? []).map((t) => [t.name, t]));

  // --- Plan -----------------------------------------------------------------
  const plan = [];
  for (const def of ESQUEMA) {
    const nombre = nombreDeTabla(def);
    const tabla = existentes.get(nombre);

    if (!tabla) {
      plan.push({ tipo: "tabla", def, nombre });
      continue;
    }
    const presentes = new Set(tabla.fields.map((f) => f.name));
    const ausentes = def.campos.filter((f) => !presentes.has(f.name));
    if (ausentes.length > 0) {
      plan.push({ tipo: "campos", def, nombre, tablaId: tabla.id, ausentes });
    }
  }

  if (plan.length === 0) {
    console.log(`  ${c.ok}✓${c.off} No falta nada: el Base ya tiene toda la estructura.\n`);
    return;
  }

  for (const p of plan) {
    if (p.tipo === "tabla") {
      console.log(
        `  ${c.warn}+${c.off} crear tabla ${c.dim}"${p.nombre}"${c.off} con ${p.def.campos.length} campos`
      );
    } else {
      console.log(
        `  ${c.warn}+${c.off} en "${p.nombre}": agregar ${p.ausentes.length} campo(s) ${c.dim}${p.ausentes.map((f) => f.name).join(", ")}${c.off}`
      );
    }
  }

  if (!APLICAR) {
    console.log(`
  ${c.dim}Esto fue una simulación: no se tocó nada.${c.off}

  Para aplicarlo:

      pnpm setup:airtable --aplicar

  El token necesita el scope ${c.dim}schema.bases:write${c.off}.
  Solo agrega lo que falta; nunca borra ni modifica lo existente.
`);
    return;
  }

  // --- Aplicar --------------------------------------------------------------
  console.log("");
  let creadas = 0;
  let agregados = 0;

  for (const p of plan) {
    if (p.tipo === "tabla") {
      const res = await at(`meta/bases/${BASE_ID}/tables`, {
        method: "POST",
        body: JSON.stringify({
          name: p.nombre,
          description: p.def.descripcion,
          fields: p.def.campos,
        }),
      });

      if (!res.ok) {
        console.log(
          `  ${c.err}✗${c.off} No se pudo crear "${p.nombre}" (${res.status})\n      ${JSON.stringify(res.body)}`
        );
        if (res.status === 403) {
          return abortar(
            "Falta el scope schema.bases:write en el token.\n" +
              "  Editalo en https://airtable.com/create/tokens y volvé a correr esto."
          );
        }
        process.exitCode = 1;
        continue;
      }
      creadas++;
      console.log(`  ${c.ok}✓${c.off} Tabla "${p.nombre}" creada`);
    } else {
      for (const campo of p.ausentes) {
        const res = await at(
          `meta/bases/${BASE_ID}/tables/${p.tablaId}/fields`,
          { method: "POST", body: JSON.stringify(campo) }
        );
        if (!res.ok) {
          console.log(
            `  ${c.err}✗${c.off} "${p.nombre}" → campo ${campo.name} (${res.status})\n      ${JSON.stringify(res.body)}`
          );
          process.exitCode = 1;
          continue;
        }
        agregados++;
      }
      console.log(
        `  ${c.ok}✓${c.off} "${p.nombre}": ${p.ausentes.length} campo(s) agregado(s)`
      );
    }
  }

  console.log(`
  ${creadas} tabla(s) creada(s) · ${agregados} campo(s) agregado(s)

  Siguiente paso:

      pnpm seed:airtable      ${c.dim}# datos de ejemplo (tenant, servicios, profesionales)${c.off}
      pnpm crear:usuario --email tu@email.com --rol owner --nombre "Tu Nombre"
`);

  // Airtable crea toda base nueva con una tabla vacía llamada "Table 1".
  // No molesta, pero conviene saber que se puede borrar a mano.
  if (existentes.has("Table 1")) {
    console.log(
      `  ${c.dim}Nota: quedó la tabla "Table 1" que Airtable crea por defecto. Se puede borrar.${c.off}\n`
    );
  }
}

main().catch((e) => {
  console.error("\n  Falló:", e.message, "\n");
  process.exitCode = 1;
});
