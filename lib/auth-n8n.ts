// Autenticacion de las llamadas ENTRANTES de n8n hacia la app.
// n8n manda: Authorization: Bearer <N8N_WEBHOOK_SECRET>
import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";

export function isAuthorizedN8nRequest(request: Request): {
  ok: boolean;
  reason?: string;
} {
  const secreto = config.n8n.secret;
  if (!secreto) {
    return {
      ok: false,
      reason:
        "N8N_WEBHOOK_SECRET no esta configurado en la app: no se aceptan llamadas entrantes",
    };
  }

  const header = request.headers.get("authorization") ?? "";
  const recibido = header.replace(/^Bearer\s+/i, "").trim();
  if (!recibido) return { ok: false, reason: "falta el header Authorization" };

  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  if (a.length !== b.length) return { ok: false, reason: "secreto invalido" };

  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "secreto invalido" };
}
