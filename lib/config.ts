// =============================================================================
// Lectura centralizada de variables de entorno.
// Nada de process.env suelto por el resto del codigo.
// =============================================================================

export type DataProvider = "airtable" | "firebase" | "mock";

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

/**
 * Proveedor de datos activo. Si se pidio airtable/firebase pero faltan las
 * credenciales, se degrada a "mock" para que la app siga navegable.
 */
export function resolveDataProvider(): DataProvider {
  const requested = env(
    "NEXT_PUBLIC_DATA_PROVIDER",
    "mock"
  ).toLowerCase() as DataProvider;

  if (requested === "airtable") {
    return env("AIRTABLE_API_KEY") && env("AIRTABLE_BASE_ID")
      ? "airtable"
      : "mock";
  }
  if (requested === "firebase") {
    return env("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ? "firebase" : "mock";
  }
  return "mock";
}

export const config = {
  appUrl: env("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  defaultTenant: env("NEXT_PUBLIC_DEFAULT_TENANT", "demo"),

  airtable: {
    apiKey: env("AIRTABLE_API_KEY"),
    baseId: env("AIRTABLE_BASE_ID"),
    tables: {
      tenants: env("AIRTABLE_TABLE_TENANTS", "Tenants"),
      services: env("AIRTABLE_TABLE_SERVICES", "Services"),
      professionals: env("AIRTABLE_TABLE_PROFESSIONALS", "Professionals"),
      clients: env("AIRTABLE_TABLE_CLIENTS", "Clients"),
      bookings: env("AIRTABLE_TABLE_BOOKINGS", "Bookings"),
    },
  },

  mercadopago: {
    accessToken: env("MERCADOPAGO_ACCESS_TOKEN"),
    publicKey: env("NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"),
    webhookSecret: env("MERCADOPAGO_WEBHOOK_SECRET"),
    get enabled() {
      return Boolean(env("MERCADOPAGO_ACCESS_TOKEN"));
    },
  },

  n8n: {
    enabled: env("N8N_ENABLED", "true") !== "false",
    secret: env("N8N_WEBHOOK_SECRET"),
    webhooks: {
      "booking.created": env("N8N_WEBHOOK_BOOKING_CREATED"),
      "booking.cancelled": env("N8N_WEBHOOK_BOOKING_CANCELLED"),
      "booking.rescheduled": env("N8N_WEBHOOK_BOOKING_RESCHEDULED"),
      "booking.reminder_24h": env("N8N_WEBHOOK_REMINDER_24H"),
      "payment.confirmed": env("N8N_WEBHOOK_PAYMENT_CONFIRMED"),
    } as Record<string, string>,
  },
};
