#!/usr/bin/env node
/**
 * Revisa que los workflows de n8n se puedan publicar en un repo abierto.
 *
 *   pnpm check:workflows            revisa y falla si algo esta mal
 *   pnpm check:workflows --arreglar reescribe los archivos ya saneados
 *
 * Por que existe
 * --------------
 * n8n/README.md ya avisaba "revisa que el JSON no incluya credenciales", y aun
 * asi se publicaron cinco workflows con el phoneNumberId de WhatsApp fijo y
 * `active: true`. El aviso no fallo por estar mal escrito: fallo porque apuntaba
 * al problema equivocado. n8n nunca exporta tokens, asi que buscar "credenciales"
 * no encuentra nada; lo que si exporta son identificadores de la cuenta del autor,
 * que no parecen secretos y por eso pasan la revision a ojo.
 *
 * Una instruccion en un README depende de que alguien se acuerde. Esto no.
 *
 * Deteccion y arreglo viven en la MISMA lista de reglas a proposito. Cuando el
 * que revisa y el que corrige son dos implementaciones distintas, terminan
 * discrepando y el que revisa aprueba lo que el otro dejo mal.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = resolve(process.cwd(), "n8n/workflows");
const ARREGLAR = process.argv.includes("--arreglar");

const c = {
  ok: "\x1b[32m",
  err: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[90m",
  off: "\x1b[0m",
};

/**
 * Parametros que identifican una cuenta del autor y tienen que salir de una
 * variable de entorno de n8n. La lista incluye proveedores que todavia no se
 * usan: el dia que alguien agregue un nodo de Twilio o Telegram, la regla ya
 * esta puesta y no hay que acordarse de agregarla.
 */
const PARAMS_DE_CUENTA = {
  phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  businessAccountId: "WHATSAPP_BUSINESS_ACCOUNT_ID",
  fromPhoneNumber: "TWILIO_FROM_NUMBER",
  accountSid: "TWILIO_ACCOUNT_SID",
  chatId: "TELEGRAM_CHAT_ID",
};

/**
 * Cosas que SI son secretos. No aparecieron nunca en este repo, pero el costo
 * de buscarlos es cero y el costo de no buscarlos es una credencial publicada.
 */
const SECRETOS = [
  [/EAA[A-Za-z0-9]{40,}/, "token de Meta / WhatsApp (EAA...)"],
  [/\bpat[A-Za-z0-9]{14}\.[A-Za-z0-9]{40,}/, "token de Airtable (pat...)"],
  [/\b(ghp|gho|ghs)_[A-Za-z0-9]{36}/, "token de GitHub"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, "token de GitHub (fine-grained)"],
  [/\b(TEST|APP_USR)-\d{6,}-[A-Za-z0-9-]{10,}/, "token de Mercado Pago"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "token de Slack"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clave privada"],
  [/\bya29\.[A-Za-z0-9_-]{20,}/, "token OAuth de Google"],
];

let fallas = 0;
let arreglados = 0;
const pendientes = [];

const err = (archivo, texto, comoSeArregla) => {
  fallas++;
  pendientes.push({ archivo, texto, comoSeArregla });
};

/** Recorre todo el JSON y devuelve [ruta, valor] de cada string. */
function* strings(nodo, ruta = "") {
  if (typeof nodo === "string") yield [ruta, nodo];
  else if (Array.isArray(nodo))
    for (const [i, v] of nodo.entries()) yield* strings(v, `${ruta}[${i}]`);
  else if (nodo && typeof nodo === "object")
    for (const [k, v] of Object.entries(nodo))
      yield* strings(v, ruta ? `${ruta}.${k}` : k);
}

/** Una expresion de n8n empieza con "=" y referencia $env o $json. */
const esExpresion = (v) => typeof v === "string" && v.startsWith("=");

function revisar(archivo, wf) {
  const problemas = [];

  // --- 1. Activo de fabrica -------------------------------------------------
  // Un workflow que se importa activo empieza a mandar mensajes reales antes de
  // que nadie revise a donde van.
  if (wf.active === true) {
    problemas.push({
      texto: '"active": true — al importarlo empieza a mandar mensajes solo',
      arreglo: () => {
        wf.active = false;
      },
    });
  }

  // --- 2. Identificadores de cuenta fijos -----------------------------------
  for (const nodo of wf.nodes ?? []) {
    for (const [param, variable] of Object.entries(PARAMS_DE_CUENTA)) {
      const valor = nodo.parameters?.[param];
      if (valor === undefined || valor === "" || esExpresion(valor)) continue;
      problemas.push({
        texto: `nodo "${nodo.name}": ${param} fijo (${valor}) — es la cuenta del autor`,
        arreglo: () => {
          nodo.parameters[param] = `={{ $env.${variable} }}`;
        },
      });
    }
  }

  // --- 3. IDs de credencial de la instancia del autor -----------------------
  // No son secretos: son el numero de fila de la credencial en SU n8n. Pero en
  // otra instancia no existen, y el nodo falla con "credential not found".
  // Con id: null, n8n empareja por nombre y si no encuentra, lo deja a elegir.
  for (const nodo of wf.nodes ?? []) {
    for (const [tipo, cred] of Object.entries(nodo.credentials ?? {})) {
      if (cred?.id) {
        problemas.push({
          texto: `nodo "${nodo.name}": credencial ${tipo} con id de otra instancia (${cred.id})`,
          arreglo: () => {
            nodo.credentials[tipo] = { id: null, name: cred.name };
          },
        });
      }
    }
  }

  // --- 4. Huellas de la instancia -------------------------------------------
  if (wf.meta?.instanceId) {
    problemas.push({
      texto: "meta.instanceId — identifica la instancia de n8n del autor",
      arreglo: () => {
        delete wf.meta.instanceId;
        if (Object.keys(wf.meta).length === 0) delete wf.meta;
      },
    });
  }
  for (const clave of ["id", "versionId"]) {
    if (wf[clave]) {
      problemas.push({
        texto: `"${clave}" de la instancia del autor — n8n asigna uno nuevo al importar`,
        arreglo: () => {
          delete wf[clave];
        },
      });
    }
  }

  // --- 5. pinData: datos de una corrida real --------------------------------
  // Esto es lo mas grave que puede aparecer aca. n8n guarda en pinData la
  // ultima ejecucion fijada, y una ejecucion real de este proyecto lleva
  // nombre, telefono y email de un paciente. Datos de salud en un repo abierto.
  const pin = wf.pinData ?? {};
  if (Object.keys(pin).length > 0) {
    problemas.push({
      texto:
        `pinData con ${Object.keys(pin).length} nodo(s) — puede tener datos ` +
        `reales de pacientes de una ejecucion de prueba`,
      arreglo: () => {
        wf.pinData = {};
      },
    });
  }

  // --- 6. Secretos de verdad ------------------------------------------------
  // Sin arreglo automatico: si aparece uno, el problema no es el archivo, es
  // que hay que revocar el token.
  for (const [ruta, valor] of strings(wf)) {
    for (const [patron, que] of SECRETOS) {
      if (patron.test(valor)) {
        problemas.push({
          texto: `${que} en ${ruta} — REVOCALO, no alcanza con borrarlo`,
          arreglo: null,
        });
      }
    }
  }

  return problemas;
}

// --- main --------------------------------------------------------------------

console.log(`\n  Workflows de n8n${ARREGLAR ? " — modo arreglo" : ""}\n`);

let archivos;
try {
  archivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
} catch {
  console.log(`  ${c.dim}No hay n8n/workflows/: nada que revisar.${c.off}\n`);
  process.exit(0);
}

if (archivos.length === 0) {
  console.log(`  ${c.dim}Todavia no hay workflows exportados.${c.off}\n`);
  process.exit(0);
}

for (const archivo of archivos) {
  const ruta = join(DIR, archivo);
  const crudo = readFileSync(ruta, "utf8");

  let wf;
  try {
    wf = JSON.parse(crudo);
  } catch (e) {
    err(archivo, `no es JSON valido: ${e.message}`, null);
    console.log(`  ${c.err}✗${c.off} ${archivo}  ${c.dim}JSON invalido${c.off}`);
    continue;
  }

  const problemas = revisar(archivo, wf);

  if (problemas.length === 0) {
    console.log(`  ${c.ok}✓${c.off} ${archivo}`);
    continue;
  }

  const automaticos = problemas.filter((p) => p.arreglo);
  const manuales = problemas.filter((p) => !p.arreglo);

  if (ARREGLAR && manuales.length === 0) {
    for (const p of automaticos) p.arreglo();
    // Termina en salto de linea: asi el archivo no ensucia el diff del proximo
    // que lo edite con un editor que agrega el salto solo.
    writeFileSync(ruta, `${JSON.stringify(wf, null, 2)}\n`, "utf8");
    arreglados++;
    console.log(`  ${c.ok}✓${c.off} ${archivo}  ${c.dim}${automaticos.length} corregido(s)${c.off}`);
    for (const p of automaticos) console.log(`      ${c.dim}· ${p.texto}${c.off}`);
    continue;
  }

  console.log(`  ${c.err}✗${c.off} ${archivo}`);
  for (const p of problemas) {
    console.log(`      ${p.arreglo ? " " : c.err + "!" + c.off} ${p.texto}`);
    err(archivo, p.texto, p.arreglo ? "automatico" : "manual");
  }
}

// --- cierre ------------------------------------------------------------------

if (ARREGLAR && arreglados > 0) {
  console.log(`
  ${c.ok}${arreglados} archivo(s) reescrito(s).${c.off}

  Revisa el diff antes de commitear:  git diff n8n/workflows
`);
}

const manuales = pendientes.filter((p) => p.comoSeArregla === "manual");

if (fallas === 0) {
  console.log(`\n  ${c.ok}Los ${archivos.length} workflows se pueden publicar.${c.off}\n`);
  process.exitCode = 0;
} else if (manuales.length > 0) {
  console.log(`
  ${c.err}Hay ${manuales.length} problema(s) que no se arreglan borrando el archivo.${c.off}

  Un token publicado esta comprometido desde que se subio. Sacarlo del JSON no
  lo desactiva: hay que revocarlo en el proveedor y generar uno nuevo.
`);
  process.exitCode = 1;
} else {
  console.log(`
  ${c.warn}${fallas} problema(s).${c.off} Se corrigen solos:

      pnpm check:workflows --arreglar

  Despues volve a exportar desde n8n solo si cambiaste algo alli, porque la
  exportacion vuelve a meter los identificadores de tu instancia.
`);
  process.exitCode = 1;
}
