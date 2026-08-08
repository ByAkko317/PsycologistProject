#!/usr/bin/env node
/**
 * Simulador de Mercado Pago para el entorno de prueba.
 *
 *   pnpm mock:mercadopago
 *   # y en .env.local:
 *   MERCADOPAGO_ACCESS_TOKEN=TEST-simulador
 *   MERCADOPAGO_API_BASE=http://localhost:4010
 *   MERCADOPAGO_WEBHOOK_SECRET=secreto-mp-de-prueba
 *
 * Para qué sirve: probar el flujo de cobro completo — checkout, aprobación,
 * webhook firmado y confirmación del turno — sin cuenta de Mercado Pago y sin
 * necesidad de exponer la app a internet con ngrok.
 *
 * Qué emula, con la MISMA forma que la API real:
 *   POST /checkout/preferences   → { id, init_point, sandbox_init_point }
 *   GET  /v1/payments/:id        → { id, status, transaction_amount, … }
 *   GET  /checkout/pay/:prefId   → pantalla donde elegís cómo sale el pago
 *   POST /checkout/pay/:prefId   → crea el pago y notifica a la app
 *
 * La notificación sale firmada con el mismo esquema que usa Mercado Pago:
 *   manifest = id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *   x-signature: ts=<ts>,v1=<hmac-sha256(manifest, secret)>
 * Así, el validador de la app se ejercita de verdad; no queda un camino
 * distinto entre prueba y producción.
 *
 * Esto NO reemplaza probar contra el sandbox real antes de salir a producción:
 * emula el contrato, no el comportamiento completo de la pasarela.
 */

import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- configuración -----------------------------------------------------------
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const linea of readFileSync(envPath, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PORT = Number(process.env.MOCK_MP_PORT || 4010);
const SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || "";
const BASE = `http://localhost:${PORT}`;

// --- estado en memoria -------------------------------------------------------
/** prefId → preferencia */
const preferencias = new Map();
/** paymentId → pago */
const pagos = new Map();

let contador = 1000;
const nuevoId = () => String(++contador * 7919);

// --- helpers -----------------------------------------------------------------
const json = (res, status, body) => {
  const cuerpo = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(cuerpo),
  });
  res.end(cuerpo);
};

const htmlRes = (res, status, body) => {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
};

const leerBody = (req) =>
  new Promise((ok) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => ok(data));
  });

const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

/**
 * Notifica a la app igual que lo haría Mercado Pago: POST a notification_url
 * con la firma en x-signature.
 */
async function notificar(pago, notificationUrl) {
  if (!notificationUrl) {
    console.log("    (la preferencia no traía notification_url: no se notifica)");
    return;
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const requestId = randomUUID();
  const manifest = `id:${pago.id};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", SECRET).update(manifest).digest("hex");

  const body = JSON.stringify({
    id: Number(pago.id),
    type: "payment",
    action: "payment.updated",
    data: { id: pago.id },
  });

  try {
    const res = await fetch(notificationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": requestId,
        "user-agent": "MercadoPago WebHook v1.0 (mock)",
      },
      body,
    });
    const texto = await res.text();
    console.log(
      `    → webhook a la app: HTTP ${res.status} ${texto.slice(0, 120)}`
    );
    if (!SECRET) {
      console.log(
        "    ⚠ MERCADOPAGO_WEBHOOK_SECRET vacío: la app no puede validar la firma"
      );
    }
  } catch (e) {
    console.error(`    ✗ no se pudo notificar a la app: ${e.message}`);
    console.error(
      `      ¿NEXT_PUBLIC_APP_URL apunta a donde corre la app? (${notificationUrl})`
    );
  }
}

// --- pantalla de checkout ----------------------------------------------------
function pantallaCheckout(pref) {
  const item = pref.items?.[0] ?? {};
  const opciones = [
    ["approved", "Pago aprobado", "El turno pasa a confirmado", "#00a650"],
    ["pending", "Pago pendiente", "Queda esperando acreditación", "#f5a623"],
    ["rejected", "Pago rechazado", "Fondos insuficientes", "#e63d2f"],
  ];

  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout simulado — Mercado Pago</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
       background:#ebebeb;color:#333;padding:24px}
  .card{background:#fff;border-radius:12px;max-width:460px;width:100%;
        box-shadow:0 2px 12px rgba(0,0,0,.1);overflow:hidden}
  .top{background:#009ee3;color:#fff;padding:16px 24px;display:flex;
       align-items:center;justify-content:space-between}
  .top strong{font-size:15px;letter-spacing:.02em}
  .badge{background:rgba(0,0,0,.2);border-radius:99px;padding:2px 10px;font-size:11px}
  .body{padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  .muted{color:#737373;font-size:14px;margin:0}
  .total{font-size:30px;font-weight:700;margin:18px 0 4px}
  .ref{font-family:ui-monospace,monospace;font-size:11px;color:#999;
       word-break:break-all;margin:0 0 20px}
  button{width:100%;padding:13px;border:0;border-radius:6px;color:#fff;
         font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px}
  button small{display:block;font-weight:400;opacity:.85;font-size:12px}
  button:hover{filter:brightness(1.08)}
  .nota{background:#fff8e1;border-top:1px solid #ffe082;padding:14px 24px;
        font-size:12px;color:#7a5c00}
</style></head><body>
<div class="card">
  <div class="top"><strong>Mercado Pago</strong><span class="badge">SIMULADOR</span></div>
  <div class="body">
    <h1>${item.title ?? "Pago"}</h1>
    <p class="muted">${item.description ?? ""}</p>
    <p class="total">${money(item.unit_price ?? 0)}</p>
    <p class="ref">turno ${pref.external_reference ?? "—"}</p>
    ${opciones
      .map(
        ([estado, titulo, detalle, color]) => `
    <form method="POST" action="/checkout/pay/${pref.id}">
      <input type="hidden" name="status" value="${estado}">
      <button style="background:${color}">${titulo}<small>${detalle}</small></button>
    </form>`
      )
      .join("")}
  </div>
  <div class="nota">
    Elegí cómo querés que salga el pago. El simulador le avisa a la app con una
    notificación firmada, igual que Mercado Pago real.
  </div>
</div></body></html>`;
}

function pantallaResultado(pago, volverA) {
  const info = {
    approved: ["✓", "#00a650", "Pago aprobado", "El turno quedó confirmado."],
    pending: ["⏳", "#f5a623", "Pago pendiente", "Queda esperando acreditación."],
    rejected: ["✗", "#e63d2f", "Pago rechazado", "El turno sigue pendiente de pago."],
  }[pago.status];

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${info[2]}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       font:16px/1.5 system-ui,sans-serif;background:#ebebeb;padding:24px;text-align:center}
  .card{background:#fff;border-radius:12px;padding:36px 28px;max-width:400px;
        box-shadow:0 2px 12px rgba(0,0,0,.1)}
  .icon{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;
        margin:0 auto 16px;font-size:26px;color:#fff;background:${info[1]}}
  h1{font-size:19px;margin:0 0 6px}
  p{color:#737373;font-size:14px;margin:0 0 18px}
  code{font-size:11px;color:#999}
  a{display:inline-block;margin-top:14px;background:#009ee3;color:#fff;
    text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px}
</style>
<meta http-equiv="refresh" content="3;url=${volverA}"></head><body>
<div class="card">
  <div class="icon">${info[0]}</div>
  <h1>${info[2]}</h1>
  <p>${info[3]}</p>
  <code>payment ${pago.id}</code>
  <div><a href="${volverA}">Volver a la app</a></div>
</div></body></html>`;
}

// --- servidor ----------------------------------------------------------------
const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const ruta = url.pathname;

  // Crear preferencia (paso 5)
  if (req.method === "POST" && ruta === "/checkout/preferences") {
    const body = JSON.parse((await leerBody(req)) || "{}");
    const id = `PREF-${nuevoId()}`;
    preferencias.set(id, { ...body, id });

    console.log(
      `  preferencia ${id} · ${money(body.items?.[0]?.unit_price ?? 0)} · turno ${body.external_reference}`
    );
    console.log(`    checkout: ${BASE}/checkout/pay/${id}`);

    return json(res, 201, {
      id,
      init_point: `${BASE}/checkout/pay/${id}`,
      sandbox_init_point: `${BASE}/checkout/pay/${id}`,
      external_reference: body.external_reference,
      date_created: new Date().toISOString(),
    });
  }

  // Consultar pago (lo hace la app al recibir el webhook, paso 7)
  const mPago = ruta.match(/^\/v1\/payments\/(.+)$/);
  if (req.method === "GET" && mPago) {
    const pago = pagos.get(mPago[1]);
    if (!pago) {
      return json(res, 404, {
        message: "Payment not found",
        error: "not_found",
        status: 404,
      });
    }
    return json(res, 200, pago);
  }

  // Pantalla de checkout
  const mVer = ruta.match(/^\/checkout\/pay\/(.+)$/);
  if (req.method === "GET" && mVer) {
    const pref = preferencias.get(mVer[1]);
    if (!pref) return htmlRes(res, 404, "<h1>Preferencia inexistente</h1>");
    return htmlRes(res, 200, pantallaCheckout(pref));
  }

  // El "cliente" paga
  if (req.method === "POST" && mVer) {
    const pref = preferencias.get(mVer[1]);
    if (!pref) return htmlRes(res, 404, "<h1>Preferencia inexistente</h1>");

    const form = new URLSearchParams(await leerBody(req));
    const status = form.get("status") || "approved";

    const pago = {
      id: nuevoId(),
      status,
      status_detail:
        status === "approved"
          ? "accredited"
          : status === "rejected"
            ? "cc_rejected_insufficient_amount"
            : "pending_contingency",
      transaction_amount: pref.items?.[0]?.unit_price ?? 0,
      currency_id: pref.items?.[0]?.currency_id ?? "ARS",
      external_reference: pref.external_reference,
      preference_id: pref.id,
      date_created: new Date().toISOString(),
      date_approved: status === "approved" ? new Date().toISOString() : null,
      payment_method_id: "visa",
      payment_type_id: "credit_card",
      payer: pref.payer ?? {},
      metadata: pref.metadata ?? {},
      live_mode: false,
    };
    pagos.set(pago.id, pago);

    console.log(`  pago ${pago.id} · ${status} · turno ${pago.external_reference}`);
    await notificar(pago, pref.notification_url);

    const volver =
      pref.back_urls?.[status === "approved" ? "success" : status === "rejected" ? "failure" : "pending"] ??
      pref.back_urls?.success ??
      "/";

    return htmlRes(res, 200, pantallaResultado(pago, volver));
  }

  // Utilidades para los tests automatizados
  if (req.method === "GET" && ruta === "/_mock/preferences") {
    return json(res, 200, { preferences: [...preferencias.values()] });
  }
  if (req.method === "POST" && ruta === "/_mock/pay") {
    // Aprueba (o rechaza) una preferencia sin pasar por el navegador.
    const body = JSON.parse((await leerBody(req)) || "{}");
    const pref =
      preferencias.get(body.preferenceId) ??
      [...preferencias.values()].find(
        (p) => p.external_reference === body.bookingId
      );
    if (!pref) return json(res, 404, { error: "preferencia inexistente" });

    const status = body.status || "approved";
    const pago = {
      id: nuevoId(),
      status,
      status_detail: status === "approved" ? "accredited" : "pending_contingency",
      transaction_amount: pref.items?.[0]?.unit_price ?? 0,
      external_reference: pref.external_reference,
      preference_id: pref.id,
      live_mode: false,
    };
    pagos.set(pago.id, pago);
    console.log(`  [auto] pago ${pago.id} · ${status} · turno ${pago.external_reference}`);
    await notificar(pago, pref.notification_url);
    return json(res, 200, { payment: pago });
  }
  if (req.method === "GET" && ruta === "/_mock/health") {
    return json(res, 200, {
      ok: true,
      preferences: preferencias.size,
      payments: pagos.size,
      signing: SECRET ? "on" : "off",
    });
  }

  json(res, 404, { message: "Not found", path: ruta });
});

servidor.listen(PORT, () => {
  console.log(`
  Mercado Pago simulado en ${BASE}

  Poné esto en .env.local:
    MERCADOPAGO_ACCESS_TOKEN=TEST-simulador
    MERCADOPAGO_API_BASE=${BASE}
    MERCADOPAGO_WEBHOOK_SECRET=${SECRET || "(vacío — la app no va a validar la firma)"}
`);
  if (!SECRET) {
    console.log(
      "  ⚠ Sin MERCADOPAGO_WEBHOOK_SECRET la firma no se ejercita.\n" +
        "    Poné cualquier string en .env.local y reiniciá los dos procesos.\n"
    );
  }
});
