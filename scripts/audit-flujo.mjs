#!/usr/bin/env node
/**
 * Auditoría del flujo completo descripto en Turnos-Flujo-Integraciones-Git.pdf.
 *
 *   npm run audit:flujo                    # contra http://localhost:3000
 *   npm run audit:flujo -- --url https://… # contra el deploy
 *   npm run audit:flujo -- --no-n8n        # saltea las pruebas contra n8n
 *   npm run audit:flujo -- --keep          # no cancela el turno de prueba
 *
 * Recorre los 11 pasos, uno por uno, y reporta cuáles quedaron cubiertos de
 * punta a punta. Los pasos que dependen de una cuenta externa se marcan como
 * OMITIDO (no como error) si esa cuenta no está configurada.
 *
 * NO escribe en producción sin avisar: crea un turno de prueba y lo cancela al
 * final, salvo que se pase --keep.
 */

import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- carga de .env.local -----------------------------------------------------
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = (
  opt("--url", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
).replace(/\/$/, "");
const TENANT = opt("--tenant", process.env.NEXT_PUBLIC_DEFAULT_TENANT || "demo");
const PROBAR_N8N = !flag("--no-n8n");
const CONSERVAR = flag("--keep");
const SECRET = process.env.N8N_WEBHOOK_SECRET || "";

// --- reporte -----------------------------------------------------------------
const resultados = [];
const OK = "OK", FALLA = "FALLA", OMITIDO = "OMITIDO", AVISO = "AVISO";

function anotar(paso, titulo, estado, detalle) {
  resultados.push({ paso, titulo, estado, detalle });
  const icono = { OK: "✓", FALLA: "✗", OMITIDO: "–", AVISO: "!" }[estado];
  const color = { OK: "\x1b[32m", FALLA: "\x1b[31m", OMITIDO: "\x1b[90m", AVISO: "\x1b[33m" }[estado];
  console.log(
    `${color}${icono}\x1b[0m ${String(paso).padStart(2)}. ${titulo.padEnd(44)} ${detalle ?? ""}`
  );
}

async function json(path, init) {
  const res = await fetch(`${BASE}${path}`, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  return { status: res.status, ok: res.ok, body };
}

async function html(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, ok: res.ok, text: await res.text() };
}

// --- pasos -------------------------------------------------------------------
async function auditar() {
  console.log(`\n  Auditoría del flujo de Turnos`);
  console.log(`  app: ${BASE}   ·   tenant: ${TENANT}\n`);

  // Sanity check: que la app conteste
  try {
    const raiz = await html("/");
    if (!raiz.ok) throw new Error(`HTTP ${raiz.status}`);
  } catch (e) {
    console.error(
      `\n  No se pudo conectar con ${BASE}\n  ¿Está levantado el servidor? (npm run dev)\n  ${e.message}\n`
    );
    process.exit(1);
  }

  // --- Paso 1: catálogo de servicios ---
  const book = await html(`/book?tenant=${TENANT}`);
  const catalogo = await json(`/api/catalog?tenant=${TENANT}`);
  const servicios = catalogo.body?.services ?? [];

  anotar(1, "Portal /book lista servicios",
    book.ok && servicios.length > 0 ? OK : FALLA,
    book.ok
      ? `${servicios.length} servicio(s) activo(s)`
      : `HTTP ${book.status}`);

  // --- Paso 2 y 3: profesionales y disponibilidad ---
  const servicio = servicios[0] ?? null;
  const serviceId = servicio?.id ?? null;

  let professionalId = null;
  let slot = null;

  if (!serviceId) {
    anotar(2, "Profesionales habilitados por servicio", FALLA, "no hay servicios activos");
    anotar(3, "Cálculo de disponibilidad real", OMITIDO, "depende del paso 2");
  } else {
    // Cruce real: solo los profesionales que declaran prestar ese servicio.
    const habilitados = (catalogo.body.professionals ?? []).filter((p) =>
      p.serviceIds.includes(serviceId)
    );
    professionalId = habilitados[0]?.id ?? null;

    anotar(2, "Profesionales habilitados por servicio",
      professionalId ? OK : FALLA,
      professionalId
        ? `${habilitados.length} para "${servicio.name}"`
        : `ninguno para "${servicio.name}"`);

    if (professionalId) {
      // Busca el primer día con horarios libres dentro de 21 días.
      let encontrado = null;
      for (let i = 1; i <= 21 && !encontrado; i++) {
        const fecha = new Date(Date.now() + i * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const r = await json(
          `/api/availability?tenant=${TENANT}&serviceId=${serviceId}&professionalId=${professionalId}&date=${fecha}`
        );
        const libre = r.body?.slots?.find((s) => s.available);
        if (libre) encontrado = { fecha, slot: libre, total: r.body.slots.length };
      }
      slot = encontrado?.slot ?? null;
      anotar(3, "Cálculo de disponibilidad real", slot ? OK : FALLA,
        slot ? `${encontrado.total} slots el ${encontrado.fecha}` : "sin horarios en 21 días");
    }
  }

  // --- Paso 4: resumen previo (sin conexión externa) ---
  anotar(4, "Resumen antes de confirmar", book.ok ? OK : FALLA,
    "render del wizard");

  // --- Paso 5: Mercado Pago ---
  const mpConfigurado = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);

  // --- Paso 6: creación del turno ---
  let token = null;
  let bookingId = null;
  let checkoutUrl = null;

  if (slot) {
    const r = await json("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant: TENANT,
        serviceId,
        professionalId,
        startsAt: slot.startsAt,
        notes: "Turno generado por la auditoría automática",
        client: {
          name: "Auditoría Automática",
          email: "auditoria@turnos.test",
          phone: "+5491100000000",
        },
      }),
    });
    token = r.body?.token ?? null;
    bookingId = r.body?.bookingId ?? null;
    checkoutUrl = r.body?.checkoutUrl ?? null;

    anotar(6, "Creación del turno en la base", r.status === 201 ? OK : FALLA,
      r.status === 201 ? `${bookingId} · ${r.body.status}` : `HTTP ${r.status} ${r.body?.error ?? ""}`);

    // doble reserva del mismo slot
    const dup = await json("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant: TENANT, serviceId, professionalId, startsAt: slot.startsAt,
        client: { name: "Duplicado", email: "dup@turnos.test" },
      }),
    });
    anotar(6.1, "Protección contra doble reserva", dup.status === 409 ? OK : FALLA,
      `HTTP ${dup.status}`);
  } else {
    anotar(6, "Creación del turno en la base", OMITIDO, "sin horario disponible");
  }

  // Paso 5 se evalúa recién ahora, con el resultado de la reserva.
  if (!mpConfigurado) {
    anotar(5, "Checkout de Mercado Pago", OMITIDO, "MERCADOPAGO_ACCESS_TOKEN vacío");
  } else if (checkoutUrl) {
    anotar(5, "Checkout de Mercado Pago", OK, "preferencia creada");
  } else {
    anotar(5, "Checkout de Mercado Pago", AVISO,
      "sin checkout: ¿el servicio tiene seña > 0?");
  }

  // --- Paso 7: webhook de Mercado Pago ---
  const wh = await json("/api/mercadopago/webhook");
  const whFirma = await json("/api/mercadopago/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-signature": "ts=1,v1=deadbeef" },
    body: JSON.stringify({ type: "payment", data: { id: "1" } }),
  });
  if (!process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    anotar(7, "Webhook de Mercado Pago", AVISO,
      "responde, pero MERCADOPAGO_WEBHOOK_SECRET está vacío: la firma NO se valida");
  } else {
    anotar(7, "Webhook de Mercado Pago",
      wh.ok && whFirma.status === 401 ? OK : FALLA,
      wh.ok && whFirma.status === 401 ? "firma inválida rechazada con 401" : `GET ${wh.status} / firma ${whFirma.status}`);
  }

  // --- Paso 8, 9, 10: eventos hacia n8n ---
  const EVENTOS = {
    "booking.created": "N8N_WEBHOOK_BOOKING_CREATED",
    "booking.cancelled": "N8N_WEBHOOK_BOOKING_CANCELLED",
    "booking.rescheduled": "N8N_WEBHOOK_BOOKING_RESCHEDULED",
    "booking.reminder_24h": "N8N_WEBHOOK_REMINDER_24H",
    "payment.confirmed": "N8N_WEBHOOK_PAYMENT_CONFIRMED",
  };

  const configurados = Object.entries(EVENTOS).filter(([, v]) => process.env[v]);

  if (!PROBAR_N8N) {
    anotar(8, "Eventos hacia n8n", OMITIDO, "--no-n8n");
  } else if (configurados.length === 0) {
    anotar(8, "Eventos hacia n8n", OMITIDO,
      "ninguna N8N_WEBHOOK_* configurada (ver n8n/README.md)");
  } else if (!SECRET) {
    anotar(8, "Eventos hacia n8n", AVISO,
      `${configurados.length}/5 URLs configuradas, pero N8N_WEBHOOK_SECRET está vacío`);
  } else {
    for (const [evento, variable] of configurados) {
      const url = process.env[variable];
      const body = JSON.stringify({
        event: evento,
        emittedAt: new Date().toISOString(),
        version: 1,
        tenantId: "audit",
        tenantSlug: TENANT,
        data: ejemploPayload(),
      });
      const firma = createHmac("sha256", SECRET).update(body).digest("hex");

      // 1) con firma válida
      let estadoOk = null;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Turnos-Event": evento,
            "X-Turnos-Signature": firma,
          },
          body,
          signal: AbortSignal.timeout(15000),
        });
        estadoOk = r.status;
      } catch (e) {
        estadoOk = e.name === "TimeoutError" ? "timeout" : e.message;
      }

      // 2) con firma alterada: el workflow DEBE rechazarla
      let estadoMal = null;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Turnos-Event": evento,
            "X-Turnos-Signature": "0".repeat(64),
          },
          body,
          signal: AbortSignal.timeout(15000),
        });
        estadoMal = r.status;
      } catch {
        estadoMal = "error";
      }

      const aceptaValida = estadoOk === 200;
      const rechazaInvalida = estadoMal !== 200;

      anotar(
        8,
        `n8n · ${evento}`,
        aceptaValida && rechazaInvalida ? OK : aceptaValida ? AVISO : FALLA,
        aceptaValida && rechazaInvalida
          ? "acepta firma válida y rechaza la alterada"
          : aceptaValida
            ? "⚠ acepta una firma INVÁLIDA: revisar el nodo 'Validar firma'"
            : `respuesta ${estadoOk}`
      );
    }

    const faltantes = Object.entries(EVENTOS)
      .filter(([, v]) => !process.env[v])
      .map(([e]) => e);
    if (faltantes.length) {
      anotar(8, "n8n · eventos sin URL", AVISO, faltantes.join(", "));
    }
  }

  // --- Paso 9: recordatorio 24hs ---
  if (!SECRET) {
    anotar(9, "Recordatorio de 24hs", OMITIDO, "N8N_WEBHOOK_SECRET vacío");
  } else {
    const pull = await json(`/api/n8n/bookings?tenant=${TENANT}&window=24h`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const sinAuth = await json(`/api/n8n/bookings?tenant=${TENANT}`);
    anotar(9, "Recordatorio 24hs · modelo PULL",
      pull.ok && sinAuth.status === 401 ? OK : FALLA,
      pull.ok ? `${pull.body.count} turno(s) en ventana; sin token → 401` : `HTTP ${pull.status}`);

    const push = await json("/api/cron/reminders", {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || SECRET}` },
    });
    anotar(9, "Recordatorio 24hs · modelo PUSH", push.ok ? OK : FALLA,
      push.ok ? `${push.body.sent} emitido(s), ${push.body.failed} fallido(s)` : `HTTP ${push.status}`);
  }

  // --- Paso 10: autogestión del cliente ---
  if (token) {
    const portal = await html(`/portal?token=${token}`);
    const reprog = await json("/api/portal/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, startsAt: "1999-01-01T10:00:00-03:00" }),
    });
    anotar(10, "Portal de autogestión", portal.ok ? OK : FALLA, `HTTP ${portal.status}`);
    anotar(10.1, "Reprograma solo a horarios válidos",
      reprog.status === 409 || reprog.status === 400 ? OK : FALLA,
      `HTTP ${reprog.status}`);
  } else {
    anotar(10, "Portal de autogestión", OMITIDO, "no se creó el turno de prueba");
  }

  // --- Paso 11: agenda del empleado ---
  const agenda = await html("/employee/agenda");
  const admin = await html("/admin");
  anotar(11, "Agenda del empleado y panel del dueño",
    agenda.ok && admin.ok ? OK : FALLA,
    `employee ${agenda.status} · admin ${admin.status}`);

  if (bookingId) {
    const asistencia = await json(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", tenant: TENANT }),
    });
    anotar(11.1, "Marcado de asistencia", asistencia.ok ? OK : FALLA,
      `HTTP ${asistencia.status}`);
  }

  // --- limpieza ---
  if (token && !CONSERVAR) {
    const del = await json("/api/portal/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, reason: "limpieza de la auditoría" }),
    });
    console.log(
      `\n  Turno de prueba ${del.ok ? "cancelado" : `NO se pudo cancelar (HTTP ${del.status}) — borralo a mano: ${bookingId}`}`
    );
  } else if (token) {
    console.log(`\n  Turno de prueba conservado: ${bookingId} (token ${token})`);
  }

  // --- resumen ---
  const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
  console.log(
    `\n  ${cuenta(OK)} OK · ${cuenta(AVISO)} avisos · ${cuenta(OMITIDO)} omitidos · ${cuenta(FALLA)} fallas\n`
  );

  if (cuenta(FALLA) > 0) {
    console.log("  Revisá los ✗ de arriba antes de considerar el flujo cerrado.\n");
    process.exit(1);
  }
  if (cuenta(OMITIDO) > 0) {
    console.log(
      "  Los – son pasos que dependen de una cuenta externa todavía no configurada.\n"
    );
  }
}

function ejemploPayload() {
  const manana = new Date(Date.now() + 86_400_000).toISOString();
  return {
    booking: {
      id: "audit-test",
      status: "confirmed",
      paymentStatus: "not_required",
      startsAt: manana,
      endsAt: manana,
      amountTotal: 15000,
      amountPaid: 0,
      notes: "PAYLOAD DE PRUEBA — auditoría automática",
      cancellationReason: "",
    },
    display: {
      timezone: "America/Argentina/Buenos_Aires",
      date: "día de prueba",
      time: "09:00",
    },
    client: {
      id: "audit",
      name: "Auditoría Automática",
      email: "auditoria@turnos.test",
      phone: "",
    },
    service: { id: "audit", name: "Servicio de prueba", durationMinutes: 50, price: 15000 },
    professional: { id: "audit", name: "Profesional de prueba", email: "" },
    business: {
      name: "Auditoría",
      email: "",
      phone: "",
      cancellationHours: 24,
    },
    links: { manage: `${BASE}/portal?token=audit-test` },
    payment: { required: false, depositAmount: 0, checkoutUrl: null },
  };
}

auditar().catch((e) => {
  console.error("\n  La auditoría se cortó:", e);
  process.exit(1);
});
