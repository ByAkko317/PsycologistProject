#!/usr/bin/env node
/**
 * Conecta este repo local con GitHub y deja el push listo.
 *
 *   cp .env.git.example .env.git    # completar
 *   node scripts/setup-git-remote.mjs
 *   node scripts/setup-git-remote.mjs --push   # además hace el primer push
 *
 * Qué hace, en orden:
 *   1. Verifica que .env.git NO esté trackeado por git (si lo está, aborta).
 *   2. Configura el remoto `origin` con la URL limpia, sin el token adentro.
 *   3. Guarda el token en el credential helper del sistema, no en .git/config.
 *   4. Verifica que el token funcione contra el repo, sin escribir nada.
 *
 * Por qué no meter el token en la URL del remoto: `git remote -v` lo imprime,
 * queda en texto plano dentro de .git/config y se filtra en cualquier captura
 * de pantalla o log de CI.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = process.cwd();
const ENV_GIT = resolve(RAIZ, ".env.git");

// --- lectura de .env.git -----------------------------------------------------
if (!existsSync(ENV_GIT)) {
  console.error(`
  Falta .env.git

    cp .env.git.example .env.git

  Después completalo con la URL del repo y tu token.
  Cómo obtenerlos: docs/github.md
`);
  process.exit(1);
}

const env = {};
for (const linea of readFileSync(ENV_GIT, "utf8").split("\n")) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const git = (...args) =>
  execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" }).trim();

const gitSilencioso = (...args) => {
  try {
    return { ok: true, out: git(...args) };
  } catch (e) {
    return { ok: false, out: (e.stderr || e.stdout || e.message).toString() };
  }
};

// --- 1. que .env.git no esté trackeado --------------------------------------
const trackeado = gitSilencioso("ls-files", "--error-unmatch", ".env.git");
if (trackeado.ok) {
  console.error(`
  ✗ .env.git está trackeado por git. Tu token se subiría al repo.

    git rm --cached .env.git
    git commit -m "chore: sacar .env.git del control de versiones"

  Y si ya lo pusheaste, revocá el token en
  https://github.com/settings/personal-access-tokens
`);
  process.exit(1);
}

// --- 2. validación de los datos ---------------------------------------------
const { GITHUB_REPO_URL, GITHUB_USERNAME, GITHUB_TOKEN } = env;

const faltantes = ["GITHUB_REPO_URL", "GITHUB_USERNAME", "GITHUB_TOKEN"].filter(
  (k) => !env[k]
);
if (faltantes.length) {
  console.error(`\n  Faltan completar en .env.git: ${faltantes.join(", ")}\n`);
  process.exit(1);
}

if (!/^https:\/\/github\.com\/[^/]+\/[^/]+?(\.git)?$/.test(GITHUB_REPO_URL)) {
  console.error(`
  ✗ GITHUB_REPO_URL no tiene la forma esperada.

    esperado:  https://github.com/USUARIO/REPO.git
    recibido:  ${GITHUB_REPO_URL}

  Si copiaste la URL SSH (git@github.com:…), usá la pestaña HTTPS.
`);
  process.exit(1);
}

if (GITHUB_REPO_URL.includes("@")) {
  console.error(`
  ✗ GITHUB_REPO_URL tiene credenciales adentro. Poné la URL limpia:
    https://github.com/USUARIO/REPO.git
`);
  process.exit(1);
}

const urlLimpia = GITHUB_REPO_URL.endsWith(".git")
  ? GITHUB_REPO_URL
  : `${GITHUB_REPO_URL}.git`;

// --- 3. remoto ---------------------------------------------------------------
const remotoActual = gitSilencioso("remote", "get-url", "origin");
if (remotoActual.ok) {
  if (remotoActual.out !== urlLimpia) {
    git("remote", "set-url", "origin", urlLimpia);
    console.log(`  origin actualizado → ${urlLimpia}`);
  } else {
    console.log(`  origin ya apuntaba a ${urlLimpia}`);
  }
} else {
  git("remote", "add", "origin", urlLimpia);
  console.log(`  origin agregado → ${urlLimpia}`);
}

// rama principal
const rama = gitSilencioso("rev-parse", "--abbrev-ref", "HEAD");
if (rama.ok && rama.out !== "main") {
  git("branch", "-M", "main");
  console.log(`  rama renombrada: ${rama.out} → main`);
}

// identidad de los commits (solo si se declaró en .env.git)
if (env.GIT_AUTHOR_NAME) git("config", "user.name", env.GIT_AUTHOR_NAME);
if (env.GIT_AUTHOR_EMAIL) git("config", "user.email", env.GIT_AUTHOR_EMAIL);

// --- 4. credencial en el helper del sistema, no en .git/config --------------
const helper = gitSilencioso("config", "--get", "credential.helper");
if (!helper.ok || !helper.out) {
  // En Windows viene "manager"; en macOS "osxkeychain". Si no hay nada, se usa
  // un store en el home del usuario: no es ideal, pero es mejor que la URL.
  git("config", "--global", "credential.helper", "store");
  console.log(
    "  credential.helper no estaba configurado: se activó 'store'\n" +
      "    (en Windows suele venir 'manager', que es más seguro)"
  );
}

const host = "https://github.com";
try {
  execFileSync("git", ["credential", "approve"], {
    cwd: RAIZ,
    input: `protocol=https\nhost=github.com\nusername=${GITHUB_USERNAME}\npassword=${GITHUB_TOKEN}\n\n`,
    encoding: "utf8",
  });
  console.log(`  credencial de ${GITHUB_USERNAME} guardada para ${host}`);
} catch (e) {
  console.error(`  no se pudo guardar la credencial: ${e.message}`);
}

// --- 5. probar el acceso sin escribir nada ----------------------------------
console.log("\n  Probando acceso al repositorio…");
const prueba = gitSilencioso("ls-remote", "--heads", "origin");

if (!prueba.ok) {
  const salida = prueba.out;
  let pista = "";
  if (/could not read|Authentication failed|invalid/i.test(salida)) {
    pista =
      "El token no es válido o no tiene permiso. Revisá que sea\n" +
      "  Contents = Read and write sobre ESTE repositorio.";
  } else if (/not found|does not exist/i.test(salida)) {
    pista =
      "El repo no existe o el token no lo alcanza. Si es privado y usás un\n" +
      "  token fine-grained, tenés que seleccionarlo explícitamente.";
  }
  console.error(`\n  ✗ No se pudo acceder.\n\n${salida}\n\n  ${pista}\n`);
  process.exit(1);
}

const ramas = prueba.out ? prueba.out.split("\n").length : 0;
console.log(
  `  ✓ Acceso OK (${ramas} rama${ramas === 1 ? "" : "s"} en el remoto)\n`
);

// --- 6. push opcional --------------------------------------------------------
if (process.argv.includes("--push")) {
  console.log("  Subiendo main…\n");
  const push = gitSilencioso("push", "-u", "origin", "main");
  console.log(push.out);
  if (!push.ok) process.exit(1);
  console.log("\n  ✓ Listo. El código está en GitHub.\n");
} else {
  console.log("  Para subir el código:\n\n    git push -u origin main\n");
  console.log("  O volvé a correr esto con --push.\n");
}
