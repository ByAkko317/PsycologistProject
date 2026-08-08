#!/usr/bin/env node
/**
 * n8n simulado: recibe los 5 eventos, valida la firma y muestra por consola el
 * mensaje que se le mandaría al cliente.
 *
 *   node scripts/mock-n8n.mjs
 *
 * Sirve para dos cosas:
 *   - probar el flujo completo sin levantar n8n;
 *   - tener una referencia de qué tiene que hacer el nodo `Validar firma`.
 *     La validación de acá abajo es exactamente la misma lógica que está en
 *     n8n/workflows/*.json.
 *
 * Endpoints (uno por evento, igual que los webhooks de n8n):
 *   POST /booking-created  /booking-cancelled  /booking-rescheduled
 *   POST /booking-reminder /payment-confirmed
 *   GET  /_eventos   → historial de lo recibido, para los tests
 */

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
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

const PORT = Number(process.env.MOCK_N8N_PORT || 4020);
const SECRET = process.env.N8N_WEBHOOK_SECRET || "";

const recibidos = [];

/** Misma verificación que hace el nodo `Validar firma` dentro de n8n. */
function firmaValida(crudo, header) {
  if (!SECRET) return { ok: false, motivo: "N8N_WEBHOOK_SECRET vacío" };
  if (!header) return { ok: false, motivo: "falta X-Turnos-Signature" };

  const esperada = createHmac("sha256", SECRET).update(crudo).digest("hex");
  if (header.length !== esperada.length) {
    return { ok: false, motivo: "firma inválida" };
  }
  return timingSafeEqual(Buffer.from(header), Buffer.from(esperada))
    ? { ok: true }
    : { ok: false, motivo: "firma inválida" };
}

/** Reproduce lo que arman los nodos `Armar mensaje` de los workflows. */
function mensajeDe(evento, d) {
  if (!d?.client) return "(payload sin datos de cliente)";
  const cuando = `${d.display?.date} a las ${d.display?.time}`;

  switch (evento) {
    case "booking.created":
      return (
        `Hola ${d.client.name}! Tu turno en ${d.business.name} quedó reservado.\n` +
        `📅 ${cuando}\n💬 ${d.service.name} con ${d.professional.name}` +
        (d.payment?.required && d.payment?.checkoutUrl
          ? `\n⚠️ Falta la seña de $${d.payment.depositAmount}: ${d.payment.checkoutUrl}`
          : "") +
        `\n🔗 ${d.links.manage}`
      );
    case "booking.cancelled":
      return (
        `Hola ${d.client.name}, cancelamos tu turno del ${cuando}.` +
        (d.booking.cancellationReason
          ? `\nMotivo: ${d.booking.cancellationReason}`
          : "")
      );
    case "booking.rescheduled":
      return (
        `Hola ${d.client.name}! Movimos tu turno.\n` +
        (d.previousStartsAt ? `❌ Antes: ${d.previousStartsAt}\n` : "") +
        `✅ Ahora: ${cuando}`
      );
    case "booking.reminder_24h":
      return `Hola ${d.client.name}! Te recordamos tu turno: ${cuando}\n🔗 ${d.links.manage}`;
    case "payment.confirmed":
      return `Listo ${d.client.name}, recibimos $${d.payment?.amount}. Turno del ${cuando} confirmado.`;
    default:
      return "(evento desconocido)";
  }
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/_eventos") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ count: recibidos.length, eventos: recibidos }));
  }

  if (req.method !== "POST") {
    res.writeHead(404).end();
    return;
  }

  let crudo = "";
  req.on("data", (c) => (crudo += c));
  req.on("end", () => {
    const evento = req.headers["x-turnos-event"] ?? "?";
    const check = firmaValida(crudo, req.headers["x-turnos-signature"]);

    if (!check.ok) {
      console.log(`\n  ✗ ${evento} RECHAZADO — ${check.motivo}`);
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: check.motivo }));
    }

    let sobre = {};
    try {
      sobre = JSON.parse(crudo);
    } catch {
      /* body no-JSON */
    }

    recibidos.push({ evento, recibidoEn: new Date().toISOString(), sobre });

    const canal = [
      sobre.data?.client?.phone && `WhatsApp ${sobre.data.client.phone}`,
      sobre.data?.client?.email && `email ${sobre.data.client.email}`,
    ]
      .filter(Boolean)
      .join(" + ") || "sin canal de contacto";

    console.log(`\n  ✓ ${evento}  (firma OK)`);
    console.log(`  ${"─".repeat(66)}`);
    console.log(`  para: ${canal}`);
    console.log(
      mensajeDe(evento, sobre.data)
        .split("\n")
        .map((l) => `  │ ${l}`)
        .join("\n")
    );
    console.log(`  ${"─".repeat(66)}`);

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, event: evento }));
  });
}).listen(PORT, () => {
  console.log(`
  n8n simulado en http://localhost:${PORT}
  firma: ${SECRET ? "validando" : "⚠ SIN SECRETO — va a rechazar todo"}
`);
});
