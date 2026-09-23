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
import { ESQUEMA, nombreDeTabla, tablaPorNombre } from "./airtable-schema.mjs";

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
const BASE_ID_CRUDO = (process.env.AIRTABLE_BASE_ID ?? "").trim();
// Sacar barras: pegar el ID desde la URL del navegador arrastra una final.
const BASE_ID = BASE_ID_CRUDO.replace(/^\/+|\/+$/g, "");
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
  // Avisar del saneamiento: si el valor de .env.local traía basura, es mejor
  // que lo sepa y lo corrija, en vez de que el script lo tape en silencio.
  if (BASE_ID !== BASE_ID_CRUDO) {
    warn(
      "El Base ID tenía caracteres de más y los ignoré",
      `      en .env.local: "${BASE_ID_CRUDO}"\n` +
        `      usando:        "${BASE_ID}"\n\n` +
        "      Pasa al copiarlo de la barra del navegador, que arrastra la\n" +
        "      barra final. La app lo tolera, pero conviene dejarlo limpio."
    );
  }

  if (!BASE_ID.startsWith("app")) {
    err(
      `AIRTABLE_BASE_ID no parece un Base ID: "${BASE_ID}"`,
      "      Tiene que empezar con 'app'. Si copiaste algo que empieza con\n" +
        "      'tbl' ese es el ID de una TABLA, no del Base."
    );
    return terminar();
  }

  // Un Base ID de Airtable es "app" + 14 caracteres alfanuméricos. Chequearlo
  // acá evita mandar una consulta condenada a devolver un 404 ambiguo.
  if (!/^app[A-Za-z0-9]{14}$/.test(BASE_ID)) {
    err(
      `El Base ID tiene un formato raro: "${BASE_ID}" (${BASE_ID.length} caracteres)`,
      "      Se espera 'app' seguido de 14 caracteres alfanuméricos, 17 en\n" +
        "      total. Copiá solo esa parte de la URL:\n\n" +
        "      https://airtable.com/appXXXXXXXXXXXXXX/tblYYYY.../viwZZZ...\n" +
        "                           ^^^^^^^^^^^^^^^^^\n" +
        "                           esto, sin la barra"
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

    // El tipo importa tanto como la presencia. Un campo de fecha convertido a
    // "Date" en Airtable deja de devolver el ISO exacto que escribio la app:
    // Airtable lo reinterpreta y puede perder la hora o el huso, y a partir de
    // ahi los turnos se corren o dejan de parsear.
    const porNombreCampo = new Map(tabla.fields.map((f) => [f.name, f.type]));
    const tipoDistinto = def.campos.filter(
      (f) => presentes.has(f.name) && porNombreCampo.get(f.name) !== f.type
    );

    if (tipoDistinto.length > 0) {
      warn(
        `Tabla "${nombre}": ${tipoDistinto.length} campo(s) con otro tipo`,
        tipoDistinto
          .map(
            (f) =>
              `      ${f.name}: es "${porNombreCampo.get(f.name)}" y se espera "${f.type}"`
          )
          .join("\n") +
          "\n\n      La app escribe y lee estos campos como texto plano. Si Airtable\n" +
          "      los interpreta, puede reformatearlos al guardarlos."
      );
    }

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
      `${BASE_ID}/${encodeURIComponent(nombreDeTabla(tablaPorNombre("Tenants")))}?maxRecords=3`
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
        `${BASE_ID}/${encodeURIComponent(nombreDeTabla(tablaPorNombre("Users")))}?maxRecords=3`
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

  // --- 4b. Marcas de tiempo -------------------------------------------------
  if (faltantes.length === 0 && camposFaltantes.length === 0) {
    await revisarFechas();
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

/**
 * Comprueba que las fechas guardadas se puedan volver a leer.
 *
 * La app las escribe como texto ISO. Dos cosas las rompen sin avisar: que
 * alguien convierta el campo a tipo Date en Airtable (y Airtable lo
 * reformatee), o que falte el huso horario. Sin huso, "9:00" se interpreta
 * como UTC y el turno aparece tres horas corrido, los recordatorios salen a
 * destiempo y la ventana de cancelacion se calcula mal.
 *
 * Existe porque el formato que se ve en la grilla de Airtable no es
 * necesariamente el que esta guardado: Airtable muestra las fechas con su
 * propio formato local, y eso hace dudar de datos que estan bien.
 */
async function revisarFechas() {
  console.log("");
  const r = await at(
    `${BASE_ID}/${encodeURIComponent(nombreDeTabla(tablaPorNombre("Bookings")))}?maxRecords=25`
  );
  if (r.status !== 200) return;

  const registros = r.body?.records ?? [];
  if (registros.length === 0) {
    console.log(`  ${c.dim}·${c.off} ${c.dim}Sin turnos todavia: no hay fechas que revisar.${c.off}`);
    return;
  }

  const rotas = [];
  const sinHuso = [];

  for (const reg of registros) {
    for (const campo of ["startsAt", "endsAt", "createdAt", "updatedAt"]) {
      const v = reg.fields?.[campo];
      if (typeof v !== "string" || v === "") continue;

      if (Number.isNaN(Date.parse(v))) {
        rotas.push(`${campo}="${v}"`);
      } else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
        sinHuso.push(`${campo}="${v}"`);
      }
    }
  }

  const muestra = (xs) => [...new Set(xs)].slice(0, 3).join("\n      ");

  if (rotas.length > 0) {
    err(
      `${rotas.length} fecha(s) que no se pueden interpretar`,
      `      ${muestra(rotas)}\n\n` +
        "      Se espera ISO 8601: 2026-09-10T20:57:50.553Z\n" +
        "      Suele pasar al editar la celda a mano o al cambiar el tipo del campo."
    );
  } else if (sinHuso.length > 0) {
    warn(
      `${sinHuso.length} fecha(s) sin huso horario`,
      `      ${muestra(sinHuso)}\n\n` +
        "      Sin Z ni +/-03:00, se interpretan como UTC: el turno aparece\n" +
        "      corrido y los recordatorios salen a destiempo."
    );
  } else {
    ok(
      `Fechas correctas en ${registros.length} turno(s)`,
      "ISO 8601 con huso, se parsean bien"
    );
    const ej = registros[0]?.fields?.startsAt;
    if (ej) {
      console.log(
        `      ${c.dim}guardado: ${ej}\n` +
          `      se lee:   ${new Date(ej).toISOString()}${c.off}`
      );
    }
  }
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
