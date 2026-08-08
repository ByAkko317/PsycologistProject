// =============================================================================
// Resolucion del tenant activo.
// Prioridad: ?tenant=slug en la URL > NEXT_PUBLIC_DEFAULT_TENANT > primer tenant.
// Cuando el proyecto pase a dominios propios, aca se agrega la lectura del host.
// =============================================================================

import { config } from "@/lib/config";
import { db } from "@/lib/services/db";
import type { Tenant } from "@/lib/types";

export async function resolveTenant(slug?: string): Promise<Tenant | null> {
  const candidato = slug?.trim() || config.defaultTenant;
  const tenant = await db.getTenant(candidato);
  if (tenant) return tenant;

  const todos = await db.listTenants();
  return todos[0] ?? null;
}

/** Igual que resolveTenant pero falla fuerte: para paginas que no pueden seguir. */
export async function requireTenant(slug?: string): Promise<Tenant> {
  const tenant = await resolveTenant(slug);
  if (!tenant) {
    throw new Error(
      `No hay ningun tenant configurado (buscado: "${slug ?? config.defaultTenant}"). ` +
        `Si usas Airtable, corré "npm run seed:airtable" o creá un registro en la tabla Tenants.`
    );
  }
  return tenant;
}

/** Formatea un importe con la moneda del tenant. */
export function formatMoney(amount: number, tenant: Pick<Tenant, "currency">) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: tenant.currency || "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Convierte "#6d28d9" a "109 40 217" para usarlo en las CSS variables. */
export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full || "6d28d9", 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/** Blanco o negro segun el contraste con el color de marca. */
export function contrastForeground(hex: string): string {
  const [r, g, b] = hexToRgbChannels(hex).split(" ").map(Number);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "17 24 39" : "255 255 255";
}
