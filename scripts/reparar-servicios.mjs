#!/usr/bin/env node
/**
 * Unifica la relacion servicio-profesional en un solo campo.
 *
 *   pnpm reparar:servicios              muestra que haria
 *   pnpm reparar:servicios --aplicar    lo escribe
 *
 * La relacion estaba guardada dos veces: en Services.professionalIds y en
 * Professionals.serviceIds. Nadie las mantenia en sincronia, asi que el panel
 * escribia una y la web leia la otra, y asignar un profesional no tenia
 * ningun efecto visible.
 *
 * Ahora manda Services.professionalIds. Este script existe para que el cambio
 * no pierda las asignaciones que quedaron del otro lado: si un profesional
 * dice atender un servicio pero el servicio no lo nombra, se agrega al
 * servicio. La union es en una sola direccion a proposito -- al reves
 * volveria a crear dos fuentes de verdad.
 *
 * Correlo una vez despues de actualizar. Es idempotente.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const T_SERVICES = (process.env.AIRTABLE_TABLE_SERVICES || "Services").trim();
const T_PROFS = (process.env.AIRTABLE_TABLE_PROFESSIONALS || "Professionals").trim();
const APLICAR = process.argv.includes("--aplicar");

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

const lista = (v) =>
  typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean)
  : Array.isArray(v) ? v.map(String).filter(Boolean)
  : [];

async function main() {
  console.log(`\n  Relacion servicio-profesional${APLICAR ? " — aplicando" : ""}\n`);

  const [services, profs] = await Promise.all([todos(T_SERVICES), todos(T_PROFS)]);
  const nombreServicio = new Map(services.map((s) => [s.id, s.fields?.name ?? s.id]));
  const nombreProf = new Map(profs.map((p) => [p.id, p.fields?.name ?? p.id]));

  // Lo que dice cada lado.
  const enServicio = new Map(services.map((s) => [s.id, new Set(lista(s.fields?.professionalIds))]));

  // Lo que dice el lado viejo y el servicio todavia no refleja.
  const aAgregar = new Map();
  for (const p of profs) {
    for (const sid of lista(p.fields?.serviceIds)) {
      if (!enServicio.has(sid)) continue; // apunta a un servicio borrado
      if (enServicio.get(sid).has(p.id)) continue; // ya coincide
      aAgregar.set(sid, [...(aAgregar.get(sid) ?? []), p.id]);
    }
  }

  const huerfanos = profs.flatMap((p) =>
    lista(p.fields?.serviceIds)
      .filter((sid) => !enServicio.has(sid))
      .map((sid) => `${nombreProf.get(p.id)} → ${sid}`)
  );

  console.log(`  ${services.length} servicio(s), ${profs.length} profesional(es)\n`);

  if (aAgregar.size === 0) {
    console.log(`  ${c.ok}✓${c.off} Los dos lados ya coinciden: no hay nada que reparar.\n`);
  } else {
    for (const [sid, pids] of aAgregar) {
      console.log(
        `  ${c.warn}!${c.off} "${nombreServicio.get(sid)}" no nombra a: ` +
          pids.map((p) => nombreProf.get(p) ?? p).join(", ")
      );
    }
    console.log("");

    if (!APLICAR) {
      console.log(`  Para escribirlo:  pnpm reparar:servicios --aplicar\n`);
    } else {
      for (const [sid, pids] of aAgregar) {
        const union = [...new Set([...enServicio.get(sid), ...pids])];
        await at(`${encodeURIComponent(T_SERVICES)}/${sid}`, {
          method: "PATCH",
          body: JSON.stringify({ fields: { professionalIds: union.join(",") } }),
        });
        console.log(`  ${c.ok}✓${c.off} "${nombreServicio.get(sid)}" → ${union.length} profesional(es)`);
      }
      console.log(`\n  ${c.ok}Listo.${c.off} A partir de ahora la asignacion se hace desde el panel.\n`);
    }
  }

  if (huerfanos.length > 0) {
    console.log(
      `  ${c.dim}Referencias a servicios que ya no existen (se ignoran):\n` +
        huerfanos.map((h) => `      ${h}`).join("\n") +
        c.off +
        "\n"
    );
  }

  console.log(
    `  ${c.dim}Professionals.serviceIds queda como historico. La app ya no lo lee:\n` +
      `  la asignacion se edita en el panel, en cada servicio.${c.off}\n`
  );
}

main().catch((e) => {
  console.error(`\n  ${c.err}Se corto:${c.off} ${e.message}\n`);
  process.exitCode = 1;
});
