// =============================================================================
// Modelo PUSH del recordatorio de 24hs (paso 9, tal como lo describe el PDF).
// La app barre los turnos y emite booking.reminder_24h hacia n8n.
//
// Se puede disparar con:
//   - Vercel Cron (ver vercel.json)
//   - Un nodo Schedule de n8n que llame a este endpoint
//   - Manualmente: curl -H "Authorization: Bearer <secreto>" .../api/cron/reminders
//
// Auth: Authorization: Bearer <CRON_SECRET o N8N_WEBHOOK_SECRET>
// =============================================================================

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { dispatchReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(request: Request): boolean {
  const secreto = (process.env.CRON_SECRET ?? "").trim() || config.n8n.secret;
  if (!secreto) return false;

  const recibido = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!recibido) return false;

  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await dispatchReminders();
    console.info("[cron:reminders]", resultado);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[cron:reminders] fallo", error);
    return NextResponse.json(
      { error: "No se pudieron despachar los recordatorios" },
      { status: 500 }
    );
  }
}
