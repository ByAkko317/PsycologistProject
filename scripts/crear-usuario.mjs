#!/usr/bin/env node
/**
 * Crea un usuario del equipo (duenio o profesional) en Airtable.
 *
 *   pnpm crear:usuario --email admin@consultorio.test --rol owner
 *   pnpm crear:usuario --email ana@consultorio.test --rol employee --profesional recXXX
 *
 * La contrasenia se pide por consola y NO queda en el historial de la terminal.
 * Se guarda solo el hash scrypt; la contrasenia en si no se persiste en ningun
 * lado.
 *
 * No hay registro publico para estos roles a proposito: si /registro pudiera
 * crear duenios, cualquiera se daria de alta como administrador.
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
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const T_USERS = process.env.AIRTABLE_TABLE_USERS || "Users";
const T_TENANTS = process.env.AIRTABLE_TABLE_TENANTS || "Tenants";

if (!API_KEY || !BASE_ID) {
  console.error("Faltan AIRTABLE_API_KEY y/o AIRTABLE_BASE_ID en .env.local");
  process.exit(1);
}

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

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error("Falta --email o no es valido");
  process.exit(1);
}
if (!["owner", "employee"].includes(rol)) {
  console.error('--rol tiene que ser "owner" o "employee"');
  process.exit(1);
}
if (rol === "employee" && !profesionalId) {
  console.error(
    "Un profesional necesita --profesional <recordId de la tabla Professionals>"
  );
  process.exit(1);
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
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
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
  const qs = new URLSearchParams({
    filterByFormula: `{slug} = "${tenantSlug}"`,
    maxRecords: "1",
  });
  const { records } = await at(`${encodeURIComponent(T_TENANTS)}?${qs}`);
  if (!records[0]) {
    console.error(`No existe el tenant "${tenantSlug}". Corré antes: pnpm seed:airtable`);
    process.exit(1);
  }
  const tenantId = records[0].id;

  const yaExiste = await at(
    `${encodeURIComponent(T_USERS)}?${new URLSearchParams({
      filterByFormula: `AND({tenantId} = "${tenantId}", LOWER({email}) = "${email}")`,
      maxRecords: "1",
    })}`
  );
  if (yaExiste.records[0]) {
    console.error(`Ya existe un usuario con el email ${email}`);
    process.exit(1);
  }

  console.log(`\n  Usuario nuevo para el tenant "${tenantSlug}"`);
  console.log(`  email: ${email}   rol: ${rol}\n`);

  const pass1 = await preguntarOculto("  Contrasenia (min 8): ");
  if (pass1.length < 8) {
    console.error("\n  Demasiado corta.");
    process.exit(1);
  }
  const pass2 = await preguntarOculto("  Repetila: ");
  if (pass1 !== pass2) {
    console.error("\n  No coinciden.");
    process.exit(1);
  }

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
  console.error("\n  Fallo:", e.message);
  process.exit(1);
});
