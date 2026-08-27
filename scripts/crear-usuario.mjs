#!/usr/bin/env node
/**
 * Crea un usuario del equipo (dueño o profesional) en Airtable.
 *
 *   pnpm crear:usuario --email admin@consultorio.test --rol owner
 *   pnpm crear:usuario --email ana@consultorio.test --rol employee --profesional recXXX
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
function validarEntrada() {
  if (!API_KEY || !BASE_ID) {
    throw new Error(
      "Faltan AIRTABLE_API_KEY y/o AIRTABLE_BASE_ID en .env.local.\n" +
        "  Para diagnosticar la configuración:  pnpm check:airtable"
    );
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error(
      "Falta --email o no es válido.\n\n" +
        '  pnpm crear:usuario --email tu@email.com --rol owner --nombre "Tu Nombre"'
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

/** Lee sin eco en pantalla. */
function preguntarOculto(pregunta) {
  return new Promise((ok) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const alEscribir = (char) => {
      if (["\n", "\r", ""].includes(char.toString())) return;
      process.stdout.write("[2K[200D" + pregunta + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", alEscribir);
    rl.question(pregunta, (valor) => {
      process.stdin.removeListener("data", alEscribir);
      rl.close();
      process.stdout.write("\n");
      ok(valor);
    });
  });
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

  if (rol === "employee" && !profesionalId) {
    console.log(
      "\n  Aviso: no pasaste --profesional, así que este usuario va a entrar\n" +
        "  pero no va a ver ninguna agenda hasta que se lo vincule desde\n" +
        "  el panel → Equipo.\n"
    );
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

  console.log(`\n  Usuario nuevo para el tenant "${tenantSlug}"`);
  console.log(`  email: ${email}   rol: ${rol}\n`);

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
        professionalId: profesionalId || "",
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
