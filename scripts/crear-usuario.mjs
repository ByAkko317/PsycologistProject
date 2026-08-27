#!/usr/bin/env node
/**
 * Crea un usuario del equipo (dueño o profesional) en Airtable.
 *
 *   pnpm crear:usuario --listar
 *   pnpm crear:usuario --email admin@consultorio.test --rol owner --nombre "Nombre"
 *   pnpm crear:usuario --email ana@consultorio.test --rol employee --profesional "Ana Torres"
 *
 * --profesional acepta el nombre o el record ID. Con --listar se ven las fichas
 * disponibles y cuáles ya tienen usuario.
 *
 * La contraseña se pide por consola y NO queda en el historial de la terminal.
 * Se guarda solo el hash scrypt; la contraseña en si no se persiste en ningun
 * lado.
 *
 * No hay registro publico para estos roles a proposito: si /registro pudiera
 * crear dueños, cualquiera se daria de alta como administrador.
 */

import { createInterface } from "node:readline";
import { randomBytes, scrypt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = (process.env.AIRTABLE_BASE_ID || "")
  .trim()
  .replace(/^\/+|\/+$/g, "");
const T_USERS = process.env.AIRTABLE_TABLE_USERS || "Users";
const T_TENANTS = process.env.AIRTABLE_TABLE_TENANTS || "Tenants";
const T_PROFESSIONALS =
  process.env.AIRTABLE_TABLE_PROFESSIONALS || "Professionals";

// --- argumentos --------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const email = (opt("email") || "").trim().toLowerCase();
const rol = opt("rol") || "owner";
const nombre = opt("nombre") || "";
const profesionalId = opt("profesional");
const tenantSlug = opt("tenant") || process.env.NEXT_PUBLIC_DEFAULT_TENANT || "demo";

/**
 * Valida entorno y argumentos. Lanza con un mensaje util; el catch de main()
 * lo imprime y marca exitCode. No usa process.exit() a proposito: forzar la
 * salida con handles de red abiertos aborta Node en Windows.
 */
const SOLO_LISTAR = args.includes("--listar");

function validarEntrada() {
  if (!API_KEY || !BASE_ID) {
    throw new Error(
      "Faltan AIRTABLE_API_KEY y/o AIRTABLE_BASE_ID en .env.local.\n" +
        "  Para diagnosticar la configuración:  pnpm check:airtable"
    );
  }
  // --listar solo consulta: no necesita email ni rol.
  if (SOLO_LISTAR) return;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error(
      "Falta --email o no es válido.\n\n" +
        '  pnpm crear:usuario --email tu@email.com --rol owner --nombre "Tu Nombre"\n' +
        "  pnpm crear:usuario --listar   (ver las fichas de profesional)"
    );
  }
  if (!["owner", "employee"].includes(rol)) {
    throw new Error('--rol tiene que ser "owner" o "employee".');
  }
}

// --- airtable ----------------------------------------------------------------
async function at(path, init = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const cuerpo = await res.text();

    // El 404 de Airtable es ambiguo a proposito: no distingue base inexistente
    // de tabla inexistente de token sin acceso. Sin esta traduccion, el
    // mensaje que llega es "404 NOT_FOUND" y no dice nada.
    if (res.status === 404) {
      throw new Error(
        `Airtable no encontró la tabla o el Base.\n\n` +
          `  Ruta consultada: ${path.split("?")[0]}\n` +
          `  Base ID: ${BASE_ID}\n\n` +
          `  Puede ser que la tabla no exista, que el Base ID esté mal, o que\n` +
          `  el token no tenga acceso a ese Base. Para saber cuál:\n\n` +
          `      pnpm check:airtable`
      );
    }
    if (res.status === 401) {
      throw new Error(
        "Airtable rechazó el token (401). Está vencido o mal copiado."
      );
    }
    if (res.status === 403) {
      throw new Error(
        `Al token le falta un permiso (403).\n  ${cuerpo}\n\n` +
          "  Necesita: data.records:read y data.records:write."
      );
    }
    throw new Error(`Airtable ${res.status}: ${cuerpo}`);
  }
  return res.json();
}

// --- hash (mismo formato que lib/auth/passwords.ts) --------------------------
const N = 16384, r = 8, p = 1, KEYLEN = 64;

function hashPassword(plain) {
  return new Promise((ok, fail) => {
    const salt = randomBytes(16);
    scrypt(
      plain.normalize("NFKC"),
      salt,
      KEYLEN,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (err, dk) =>
        err
          ? fail(err)
          : ok(
              ["scrypt", N, r, p, salt.toString("base64"), dk.toString("base64")].join("$")
            )
    );
  });
}

/**
 * Lee una contraseña sin mostrarla en pantalla.
 *
 * Interviene _writeToOutput del readline en vez de escuchar process.stdin.
 * La versión con listener sobre stdin rompía en Windows: readline y el
 * listener se pisaban al cerrar, y libuv abortaba el proceso con
 * "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
 */
function preguntarOculto(pregunta) {
  return new Promise((ok) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    let faltaMostrarPregunta = true;
    rl._writeToOutput = (texto) => {
      if (faltaMostrarPregunta && texto.includes(pregunta)) {
        rl.output.write(pregunta);
        faltaMostrarPregunta = false;
      }
      // El resto se descarta: es lo que va tipeando el usuario.
    };

    rl.question(pregunta, (valor) => {
      rl.close();
      process.stdout.write("\n");
      ok(valor);
    });
  });
}

/**
 * Resuelve el profesional a vincular.
 *
 * Acepta el record ID (recXXX) o el nombre, completo o parcial. Sin esto hay
 * que ir a Airtable a copiar el ID a mano, que es fricción pura: el dato ya
 * está a un GET de distancia.
 */
async function resolverProfesional(tenantId, buscado) {
  const qs = new URLSearchParams({ filterByFormula: `{tenantId} = "${tenantId}"` });
  const { records } = await at(`${encodeURIComponent(T_PROFESSIONALS)}?${qs}`);

  const conUsuario = await usuariosConProfesional(tenantId);
  const lista = records.map((r) => ({
    id: r.id,
    nombre: r.fields?.name ?? "(sin nombre)",
    email: r.fields?.email ?? "",
    yaTiene: conUsuario.has(r.id),
  }));

  if (!buscado) return { lista, elegido: null };

  if (/^rec[A-Za-z0-9]{14}$/.test(buscado)) {
    const exacto = lista.find((p) => p.id === buscado);
    if (!exacto) {
      throw new Error(
        `No hay ningún profesional con id "${buscado}" en este negocio.\n\n` +
          formatearLista(lista)
      );
    }
    return { lista, elegido: exacto };
  }

  const norm = (t) =>
    t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const coincidencias = lista.filter((p) => norm(p.nombre).includes(norm(buscado)));

  if (coincidencias.length === 0) {
    throw new Error(
      `Ningún profesional coincide con "${buscado}".\n\n` + formatearLista(lista)
    );
  }
  if (coincidencias.length > 1) {
    throw new Error(
      `"${buscado}" coincide con ${coincidencias.length} profesionales.\n` +
        "  Sé más específico o usá el record ID:\n\n" +
        formatearLista(coincidencias)
    );
  }
  return { lista, elegido: coincidencias[0] };
}

/** Profesionales que ya tienen un usuario vinculado. */
async function usuariosConProfesional(tenantId) {
  try {
    const qs = new URLSearchParams({
      filterByFormula: `{tenantId} = "${tenantId}"`,
    });
    const { records } = await at(`${encodeURIComponent(T_USERS)}?${qs}`);
    return new Set(
      records.map((r) => r.fields?.professionalId).filter(Boolean)
    );
  } catch {
    // Si la tabla Users todavía no existe, no es motivo para frenar.
    return new Set();
  }
}

function formatearLista(lista) {
  if (lista.length === 0) {
    return (
      "  No hay profesionales cargados en este negocio.\n" +
      "  Cargá los de ejemplo con:  pnpm seed:airtable"
    );
  }
  return (
    "  Profesionales disponibles:\n\n" +
    lista
      .map(
        (p) =>
          `    ${p.nombre.padEnd(24)} ${p.id}` +
          (p.yaTiene ? "   (ya tiene usuario)" : "")
      )
      .join("\n") +
    "\n\n  Podés pasar el nombre en vez del id:\n" +
    `    --profesional "${lista[0].nombre}"`
  );
}

async function main() {
  validarEntrada();

  const qs = new URLSearchParams({
    filterByFormula: `{slug} = "${tenantSlug}"`,
    maxRecords: "1",
  });
  const { records } = await at(`${encodeURIComponent(T_TENANTS)}?${qs}`);
  if (!records[0]) {
    throw new Error(
      `No existe ningún tenant con slug "${tenantSlug}".\n\n` +
        "  La tabla Tenants existe pero está vacía (o el slug no coincide).\n" +
        "  Cargá los datos de ejemplo con:  pnpm seed:airtable"
    );
  }
  const tenantId = records[0].id;

  // --listar: solo muestra los profesionales y termina.
  if (SOLO_LISTAR) {
    const { lista } = await resolverProfesional(tenantId, null);
    console.log("\n" + formatearLista(lista) + "\n");
    return;
  }

  let vinculo = null;
  if (rol === "employee" && !args.includes("--sin-vincular")) {
    const { lista, elegido } = await resolverProfesional(tenantId, profesionalId);

    if (!elegido) {
      throw new Error(
        "Un profesional necesita estar vinculado a su ficha.\n\n" +
          formatearLista(lista) +
          "\n\n  O crealo sin vincular y asocialo después desde el panel → Equipo:\n" +
          "    agregá --sin-vincular"
      );
    }
    vinculo = elegido;

    if (elegido.yaTiene) {
      throw new Error(
        `${elegido.nombre} ya tiene un usuario vinculado.\n` +
          "  Si necesitás otro, desvinculá el anterior desde el panel → Equipo."
      );
    }
  }

  const yaExiste = await at(
    `${encodeURIComponent(T_USERS)}?${new URLSearchParams({
      filterByFormula: `AND({tenantId} = "${tenantId}", LOWER({email}) = "${email}")`,
      maxRecords: "1",
    })}`
  );
  if (yaExiste.records[0]) {
    throw new Error(`Ya existe un usuario con el email ${email}.`);
  }

  console.log(`\n  Usuario nuevo en "${tenantSlug}"`);
  console.log(`  email: ${email}`);
  console.log(`  rol:   ${rol === "owner" ? "administración" : "profesional"}`);
  if (vinculo) console.log(`  ficha: ${vinculo.nombre} (${vinculo.id})`);
  if (rol === "employee" && !vinculo) {
    console.log("  ficha: sin vincular — no va a ver ninguna agenda hasta asociarlo");
  }
  console.log("");

  const pass1 = await preguntarOculto("  Contraseña (mínimo 8): ");
  if (pass1.length < 8) throw new Error("La contraseña es demasiado corta.");

  const pass2 = await preguntarOculto("  Repetila: ");
  if (pass1 !== pass2) throw new Error("Las contraseñas no coinciden.");

  const record = await at(encodeURIComponent(T_USERS), {
    method: "POST",
    body: JSON.stringify({
      fields: {
        tenantId,
        email,
        name: nombre || email.split("@")[0],
        role: rol,
        passwordHash: await hashPassword(pass1),
        active: true,
        professionalId: vinculo?.id ?? "",
        clientId: "",
        createdAt: new Date().toISOString(),
      },
      typecast: true,
    }),
  });

  console.log(`\n  ✓ Usuario creado: ${record.id}`);
  console.log(`    Entrá en /login con ${email}\n`);
}

main().catch((e) => {
  console.error(`\n  ${e.message}\n`);
  // exitCode en vez de process.exit(): con fetch en vuelo, forzar la salida
  // hace que libuv aborte el proceso en Windows.
  process.exitCode = 1;
});
