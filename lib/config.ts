// =============================================================================
// Lectura centralizada de variables de entorno.
// Nada de process.env suelto por el resto del codigo.
// =============================================================================

export type DataProvider = "airtable" | "firebase" | "mock";

function env(key: string, fallback = ""): string {
  return (process.env[key] ?? fallback).trim();
}

/**
 * Limpia un identificador copiado de una URL.
 *
 * El caso real: pegar el Base ID desde la barra del navegador arrastra una
 * barra final ("appXXXX/"), y Airtable devuelve un 404 generico que parece
 * "no existe la tabla". Se saca la barra en vez de fallar, porque el valor es
 * correcto: solo viene con un caracter de mas.
 */
function envId(key: string): string {
  return env(key).replace(/^\/+|\/+$/g, "").trim();
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
    baseId: envId("AIRTABLE_BASE_ID"),
    tables: {
      tenants: env("AIRTABLE_TABLE_TENANTS", "Tenants"),
      services: env("AIRTABLE_TABLE_SERVICES", "Services"),
      professionals: env("AIRTABLE_TABLE_PROFESSIONALS", "Professionals"),
      clients: env("AIRTABLE_TABLE_CLIENTS", "Clients"),
      bookings: env("AIRTABLE_TABLE_BOOKINGS", "Bookings"),
      users: env("AIRTABLE_TABLE_USERS", "Users"),
      notes: env("AIRTABLE_TABLE_NOTES", "Notes"),
    },
  },

  mercadopago: {
    accessToken: env("MERCADOPAGO_ACCESS_TOKEN"),
    publicKey: env("NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY"),
    webhookSecret: env("MERCADOPAGO_WEBHOOK_SECRET"),
    /**
     * Base de la API. Se cambia solo para apuntar al simulador local
     * (scripts/mock-mercadopago.mjs) y poder probar el cobro sin cuenta.
     */
    apiBase: env("MERCADOPAGO_API_BASE", "https://api.mercadopago.com").replace(
      /\/$/,
      ""
    ),
    get enabled() {
      return Boolean(env("MERCADOPAGO_ACCESS_TOKEN"));
    },
    /** True si las credenciales son de prueba (sandbox). */
    get isSandbox() {
      const token = env("MERCADOPAGO_ACCESS_TOKEN");
      return (
        token.startsWith("TEST-") ||
        Boolean(env("MERCADOPAGO_API_BASE"))
      );
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
