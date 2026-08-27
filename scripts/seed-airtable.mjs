#!/usr/bin/env node
/**
 * Carga inicial del Base de Airtable con datos de ejemplo.
 *
 *   pnpm seed:airtable
 *
 * Requiere AIRTABLE_API_KEY y AIRTABLE_BASE_ID en .env.local, y que las 5
 * tablas ya existan con las columnas de docs/airtable-schema.md.
 * Es idempotente: busca por slug/email antes de crear.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// --- carga simple de .env.local ---------------------------------------------
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = (process.env.AIRTABLE_BASE_ID || "")
  .trim()
  .replace(/^\/+|\/+$/g, "");

if (!API_KEY || !BASE_ID) {
  console.error(
    "Faltan AIRTABLE_API_KEY y/o AIRTABLE_BASE_ID. Completalos en .env.local."
  );
  process.exit(1);
}

const T = {
  tenants: process.env.AIRTABLE_TABLE_TENANTS || "Tenants",
  services: process.env.AIRTABLE_TABLE_SERVICES || "Services",
  professionals: process.env.AIRTABLE_TABLE_PROFESSIONALS || "Professionals",
  clients: process.env.AIRTABLE_TABLE_CLIENTS || "Clients",
  bookings: process.env.AIRTABLE_TABLE_BOOKINGS || "Bookings",
};

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
    throw new Error(`Airtable ${res.status} en ${path}\n${await res.text()}`);
  }
  return res.json();
}

const find = async (table, formula) => {
  const qs = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  const { records } = await at(`${encodeURIComponent(table)}?${qs}`);
  return records[0] || null;
};

const create = async (table, fields) => {
  const rec = await at(encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return rec;
};

const update = (table, id, fields) =>
  at(`${encodeURIComponent(table)}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });

const HORARIO = {
  1: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  2: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  3: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  4: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "19:00" }],
  5: [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "17:00" }],
};

async function main() {
  console.log("→ Tenant demo…");
  let tenant = await find(T.tenants, '{slug} = "demo"');
  const tenantFields = {
    slug: "demo",
    name: "Consultorio Bienestar",
    brandColor: "#6d28d9",
    timezone: "America/Argentina/Buenos_Aires",
    currency: "ARS",
    cancellationHours: 24,
    slotIntervalMinutes: 30,
    businessHours: JSON.stringify(HORARIO),
    contactEmail: "hola@consultoriobienestar.test",
  };
  tenant = tenant
    ? await update(T.tenants, tenant.id, tenantFields)
    : await create(T.tenants, tenantFields);
  const tenantId = tenant.id;
  console.log(`  tenantId = ${tenantId}`);

  console.log("→ Profesionales…");
  const profesionales = [
    { name: "Lic. Ana Torres", email: "ana@consultoriobienestar.test" },
    {
      name: "Lic. Martin Ruiz",
      email: "martin@consultoriobienestar.test",
      workingHours: JSON.stringify({
        1: [{ start: "13:00", end: "20:00" }],
        3: [{ start: "13:00", end: "20:00" }],
        5: [{ start: "10:00", end: "16:00" }],
      }),
    },
    { name: "Lic. Carla Gimenez", email: "carla@consultoriobienestar.test" },
  ];

  const profIds = [];
  for (const p of profesionales) {
    const existing = await find(
      T.professionals,
      `AND({tenantId} = "${tenantId}", {email} = "${p.email}")`
    );
    const fields = { tenantId, active: true, serviceIds: "", ...p };
    const rec = existing
      ? await update(T.professionals, existing.id, fields)
      : await create(T.professionals, fields);
    profIds.push(rec.id);
    console.log(`  ${p.name} → ${rec.id}`);
  }
  const [ana, martin, carla] = profIds;

  console.log("→ Servicios…");
  const servicios = [
    {
      name: "Primera consulta",
      description: "Entrevista inicial de admision y encuadre.",
      durationMinutes: 50,
      price: 18000,
      depositPercent: 30,
      professionalIds: [ana, martin],
    },
    {
      name: "Sesion individual",
      description: "Sesion de seguimiento, presencial u online.",
      durationMinutes: 50,
      price: 15000,
      depositPercent: 0,
      professionalIds: [ana, martin],
    },
    {
      name: "Terapia de pareja",
      description: "Sesion conjunta de 80 minutos.",
      durationMinutes: 80,
      price: 24000,
      depositPercent: 50,
      professionalIds: [martin, carla],
    },
    {
      name: "Evaluacion psicodiagnostica",
      description: "Administracion de tecnicas y devolucion escrita.",
      durationMinutes: 90,
      price: 32000,
      depositPercent: 50,
      professionalIds: [ana, carla],
    },
  ];

  const serviciosPorProf = new Map(profIds.map((id) => [id, []]));
  for (const s of servicios) {
    const existing = await find(
      T.services,
      `AND({tenantId} = "${tenantId}", {name} = "${s.name}")`
    );
    const fields = {
      tenantId,
      active: true,
      ...s,
      professionalIds: s.professionalIds.join(","),
    };
    const rec = existing
      ? await update(T.services, existing.id, fields)
      : await create(T.services, fields);
    for (const pid of s.professionalIds) serviciosPorProf.get(pid).push(rec.id);
    console.log(`  ${s.name} → ${rec.id}`);
  }

  console.log("→ Vinculando servicios a cada profesional…");
  for (const [pid, serviceIds] of serviciosPorProf) {
    await update(T.professionals, pid, { serviceIds: serviceIds.join(",") });
  }

  console.log("→ Clientes de ejemplo…");
  for (const c of [
    { name: "Sofia Ramirez", email: "sofia@ejemplo.test", phone: "+5491133333333" },
    { name: "Diego Fernandez", email: "diego@ejemplo.test", phone: "+5491144444444" },
  ]) {
    const existing = await find(
      T.clients,
      `AND({tenantId} = "${tenantId}", {email} = "${c.email}")`
    );
    if (!existing) {
      await create(T.clients, {
        tenantId,
        ...c,
        createdAt: new Date().toISOString(),
      });
    }
    console.log(`  ${c.name}`);
  }

  console.log("\nListo. Poné en .env.local:  NEXT_PUBLIC_DEFAULT_TENANT=demo");
  console.log(
    "\nFalta el primer usuario para poder entrar al panel:\n" +
      "  pnpm crear:usuario --email admin@tu-consultorio.test --rol owner\n"
  );
}

main().catch((err) => {
  console.error("\nFallo el seed:", err.message);
  process.exit(1);
});
