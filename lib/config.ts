// =============================================================================
// Lectura centralizada de variables de entorno.
// Nada de process.env suelto por el resto del codigo.
// =============================================================================

export type DataProvider = "airtable" | "firebase" | "mock";

/** API productiva de Mercado Pago. Es el default de MERCADOPAGO_API_BASE. */
export const API_MERCADOPAGO = "https://api.mercadopago.com";

/**
 * Lee una variable de entorno, tratando el string vacio como "no configurada".
 *
 * La distincion importa: en un .env, `FOO=` deja `process.env.FOO === ""`, que
 * NO es undefined. Con `??` el fallback no se aplica y el valor vacio se
 * propaga. Eso rompio el checkout: .env.example trae `MERCADOPAGO_API_BASE=`
 * con la instruccion de dejarla vacia, apiBase quedaba en "" y la URL
 * terminaba siendo la relativa "/checkout/preferences", que fetch rechaza con
 * ERR_INVALID_URL.
 *
 * Ninguna variable de este archivo tiene el vacio como valor significativo:
 * vacio siempre quiere decir "usa el default".
 */
function env(key: string, fallback = ""): string {
  const valor = (process.env[key] ?? "").trim();
  return valor === "" ? fallback : valor;
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
    apiBase: env("MERCADOPAGO_API_BASE", API_MERCADOPAGO).replace(/\/$/, ""),
    get enabled() {
      return Boolean(env("MERCADOPAGO_ACCESS_TOKEN"));
    },
    /**
     * True si no se mueve plata real: credenciales TEST- o simulador local.
     *
     * Se compara contra la API productiva en vez de preguntar si la variable
     * tiene algo. Escribir la URL real a mano es redundante pero valido, y no
     * deberia hacer creer al panel que esta en modo prueba.
     */
    get isSandbox() {
      const token = env("MERCADOPAGO_ACCESS_TOKEN");
      const base = env("MERCADOPAGO_API_BASE", API_MERCADOPAGO).replace(
        /\/$/,
        ""
      );
      return token.startsWith("TEST-") || base !== API_MERCADOPAGO;
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
