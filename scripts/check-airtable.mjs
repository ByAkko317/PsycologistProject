#!/usr/bin/env node
/**
 * Diagnostica la configuración de Airtable.
 *
 *   pnpm check:airtable
 *
 * Existe porque el error que devuelve Airtable cuando algo falta es
 * `404 {"error":"NOT_FOUND"}`, que no distingue entre:
 *   - el Base ID está mal
 *   - la tabla no existe
 *   - el token no tiene acceso a ese Base
 *
 * Airtable responde 404 en los tres casos a propósito, para no confirmarle a
 * un token ajeno que un Base existe. Es correcto de su parte, pero deja al
 * desarrollador sin pistas. Este script separa los tres casos.
 *
 * Solo lee. No crea ni modifica nada: para eso está `pnpm setup:airtable`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ESQUEMA, nombreDeTabla } from "./airtable-schema.mjs";

// --- .env.local --------------------------------------------------------------
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
const PROVIDER = (process.env.NEXT_PUBLIC_DATA_PROVIDER ?? "").trim();

const c = {
  ok: "\x1b[32m",
  err: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[90m",
  off: "\x1b[0m",
};

let fallas = 0;
let avisos = 0;
const ok = (t, d) => console.log(`  ${c.ok}✓${c.off} ${t}${d ? `  ${c.dim}${d}${c.off}` : ""}`);
const err = (t, d) => {
  fallas++;
  console.log(`  ${c.err}✗${c.off} ${t}${d ? `\n${d}` : ""}`);
};
const warn = (t, d) => {
  avisos++;
  console.log(`  ${c.warn}!${c.off} ${t}${d ? `\n${d}` : ""}`);
};

async function at(path) {
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  console.log("\n  Diagnóstico de Airtable\n");

  // --- 1. Variables ---------------------------------------------------------
  if (!API_KEY) {
    err(
      "Falta AIRTABLE_API_KEY",
      "      Generá un token en https://airtable.com/create/tokens\n" +
        "      Scopes: data.records:read, data.records:write, schema.bases:read"
    );
    return terminar();
  }
  if (!API_KEY.startsWith("pat")) {
    warn(
      "El token no empieza con \"pat\"",
      "      Los tokens actuales de Airtable empiezan con 'pat'. Las API keys\n" +
        "      viejas (key...) están discontinuadas."
    );
  } else {
    ok("Token presente");
  }

  if (!BASE_ID) {
    err(
      "Falta AIRTABLE_BASE_ID",
      "      Está en la URL del Base, empieza con 'app':\n" +
        "      https://airtable.com/appXXXXXXXXXXXXXX/tblYYYY...\n" +
        "                           ^^^^^^^^^^^^^^^^^^"
    );
    return terminar();
  }
  if (!BASE_ID.startsWith("app")) {
    err(
      `AIRTABLE_BASE_ID no parece un Base ID: "${BASE_ID}"`,
      "      Tiene que empezar con 'app'. Si copiaste algo que empieza con\n" +
        "      'tbl' ese es el ID de una TABLA, no del Base."
    );
    return terminar();
  }
  ok("Base ID con formato válido", BASE_ID);

  if (PROVIDER && PROVIDER !== "airtable") {
    warn(
      `NEXT_PUBLIC_DATA_PROVIDER=${PROVIDER}`,
      "      Aunque Airtable esté bien configurado, la app va a usar ese otro\n" +
        "      proveedor. Poné 'airtable' para que use esta base."
    );
  }

  // --- 2. Acceso al Base ----------------------------------------------------
  const meta = await at(`meta/bases/${BASE_ID}/tables`);

  if (meta.status === 401) {
    err(
      "Airtable rechazó el token (401)",
      "      Está vencido o mal copiado. Generá uno nuevo."
    );
    return terminar();
  }

  if (meta.status === 403) {
    err(
      "El token no tiene el scope schema.bases:read (403)",
      "      Sin ese scope no puedo listar las tablas para diagnosticar.\n" +
        "      Editá el token en https://airtable.com/create/tokens y agregalo."
    );
    return terminar();
  }

  if (meta.status === 404) {
    err(
      "Airtable devolvió 404 para este Base",
      "      Este es EL error que estás viendo. Significa una de tres cosas,\n" +
        "      y Airtable no distingue entre ellas a propósito:\n\n" +
        `      a) El Base ID no existe: revisá "${BASE_ID}"\n` +
        "      b) El token no tiene acceso a ESE Base.\n" +
        "         En https://airtable.com/create/tokens, en 'Access', el Base\n" +
        "         tiene que estar seleccionado explícitamente.\n" +
        "      c) Falta el scope schema.bases:read en el token."
    );
    return terminar();
  }

  if (meta.status !== 200) {
    err(`Airtable respondió ${meta.status}`, `      ${JSON.stringify(meta.body)}`);
    return terminar();
  }

  const tablas = meta.body?.tables ?? [];
  ok(
    "Token con acceso al Base",
    `${tablas.length} tabla${tablas.length === 1 ? "" : "s"} encontrada${tablas.length === 1 ? "" : "s"}`
  );

  // --- 3. Tablas y campos ---------------------------------------------------
  console.log("");
  const porNombre = new Map(tablas.map((t) => [t.name, t]));
  const faltantes = [];
  const camposFaltantes = [];

  for (const def of ESQUEMA) {
    const nombre = nombreDeTabla(def);
    const tabla = porNombre.get(nombre);

    if (!tabla) {
      faltantes.push(nombre);
      err(`Falta la tabla "${nombre}"`);
      continue;
    }

    const presentes = new Set(tabla.fields.map((f) => f.name));
    const ausentes = def.campos.filter((f) => !presentes.has(f.name));

    if (ausentes.length === 0) {
      ok(`Tabla "${nombre}"`, `${def.campos.length} campos, todos presentes`);
    } else {
      camposFaltantes.push({ tabla: nombre, campos: ausentes.map((f) => f.name) });
      err(
        `Tabla "${nombre}": faltan ${ausentes.length} campo(s)`,
        `      ${ausentes.map((f) => f.name).join(", ")}`
      );
    }
  }

  // Tablas que sobran: no molestan, pero conviene saber que están.
  const esperadas = new Set(ESQUEMA.map((d) => nombreDeTabla(d)));
  const extra = tablas.filter((t) => !esperadas.has(t.name)).map((t) => t.name);
  if (extra.length > 0) {
    console.log(
      `  ${c.dim}·${c.off} ${c.dim}Otras tablas en el Base (no se usan): ${extra.join(", ")}${c.off}`
    );
  }

  // --- 4. Datos mínimos -----------------------------------------------------
  if (faltantes.length === 0 && camposFaltantes.length === 0) {
    console.log("");
    const tenants = await at(
      `${BASE_ID}/${encodeURIComponent(nombreDeTabla(ESQUEMA[0]))}?maxRecords=3`
    );

    if (tenants.status === 403) {
      err(
        "El token no puede leer registros (403)",
        "      Falta el scope data.records:read."
      );
    } else if (tenants.status !== 200) {
      err(`No se pudieron leer los Tenants (${tenants.status})`);
    } else {
      const registros = tenants.body?.records ?? [];
      if (registros.length === 0) {
        warn(
          "La tabla Tenants está vacía",
          "      Sin un tenant no hay negocio que mostrar. Cargá los datos de\n" +
            "      ejemplo con:  pnpm seed:airtable"
        );
      } else {
        const slugs = registros.map((r) => r.fields?.slug ?? "(sin slug)");
        ok(`${registros.length} tenant(s) cargado(s)`, slugs.join(", "));

        const buscado = (process.env.NEXT_PUBLIC_DEFAULT_TENANT || "demo").trim();
        if (!slugs.includes(buscado)) {
          warn(
            `Ningún tenant tiene slug "${buscado}"`,
            `      NEXT_PUBLIC_DEFAULT_TENANT=${buscado} pero los slugs son: ${slugs.join(", ")}`
          );
        }
      }

      // Usuarios: lo que estaba intentando crear
      const users = await at(
        `${BASE_ID}/${encodeURIComponent(nombreDeTabla(ESQUEMA[5]))}?maxRecords=3`
      );
      if (users.status === 200) {
        const n = users.body?.records?.length ?? 0;
        if (n === 0) {
          warn(
            "No hay ningún usuario cargado",
            "      Sin usuario no se puede entrar al panel. Creá el primero con:\n" +
              "      pnpm crear:usuario --email tu@email.com --rol owner --nombre \"Tu Nombre\""
          );
        } else {
          ok(`${n} usuario(s) cargado(s)`);
        }
      }
    }
  }

  // --- 5. Qué hacer ---------------------------------------------------------
  if (faltantes.length > 0 || camposFaltantes.length > 0) {
    console.log(`
  ${c.warn}Falta estructura en el Base.${c.off} Se puede crear sola:

      pnpm setup:airtable

  Necesita que el token tenga el scope ${c.dim}schema.bases:write${c.off}.
  Si preferís crearla a mano, el detalle está en docs/airtable-schema.md`);
  }

  terminar();
}

function terminar() {
  console.log(
    `\n  ${fallas} falla${fallas === 1 ? "" : "s"} · ${avisos} aviso${avisos === 1 ? "" : "s"}\n`
  );
  // exitCode en vez de process.exit(): salir a la fuerza con handles de red
  // abiertos hace que Node aborte en Windows con una assertion de libuv.
  if (fallas > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("\n  El diagnóstico se cortó:", e.message, "\n");
  process.exitCode = 1;
});
