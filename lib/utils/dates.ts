// =============================================================================
// Utilidades de fecha/hora con soporte de timezone, sin dependencias externas.
// Toda hora "de pared" (ej "14:30") se interpreta en la timezone del tenant.
// =============================================================================

/** Offset UTC de una timezone en un instante dado, ej "-03:00". */
export function getUtcOffset(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant);

  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = raw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "+00:00";

  const [, sign, hours, minutes = "00"] = match;
  return `${sign}${hours.padStart(2, "0")}:${minutes}`;
}

function offsetToMinutes(offset: string): number {
  const match = offset.match(/([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const [, sign, h, m] = match;
  const total = Number(h) * 60 + Number(m);
  return sign === "-" ? -total : total;
}

/**
 * Convierte una fecha "YYYY-MM-DD" + hora "HH:mm" interpretadas en `timeZone`
 * a un ISO 8601 con offset explicito, ej "2026-08-10T14:30:00-03:00".
 * Hace dos pasadas para resolver correctamente los bordes de horario de verano.
 */
export function wallTimeToISO(
  date: string,
  time: string,
  timeZone: string
): string {
  const naive = Date.parse(`${date}T${time}:00Z`);
  let offset = getUtcOffset(new Date(naive), timeZone);
  const instant = new Date(naive - offsetToMinutes(offset) * 60_000);
  offset = getUtcOffset(instant, timeZone);
  return `${date}T${time}:00${offset}`;
}

/** Suma minutos a un ISO conservando su offset original. */
export function addMinutesISO(iso: string, minutes: number): string {
  const offset = iso.slice(-6);
  const shifted = new Date(new Date(iso).getTime() + minutes * 60_000);
  const local = new Date(
    shifted.getTime() + offsetToMinutes(offset) * 60_000
  );
  return `${local.toISOString().slice(0, 19)}${offset}`;
}

/** "YYYY-MM-DD" de un instante, visto desde `timeZone`. */
export function toDateKey(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "HH:mm" de un instante, visto desde `timeZone`. */
export function toTimeLabel(instant: Date | string, timeZone: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Dia de la semana (0 = domingo) de una fecha "YYYY-MM-DD". */
export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

/** Etiqueta legible, ej "lun 10 ago, 14:30". */
export function formatBookingDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Devuelve las proximas `count` fechas "YYYY-MM-DD" desde hoy en `timeZone`. */
export function upcomingDateKeys(
  count: number,
  timeZone: string,
  from: Date = new Date()
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.push(toDateKey(new Date(from.getTime() + i * 86_400_000), timeZone));
  }
  return keys;
}

/** Minutos entre dos horas "HH:mm". */
export function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/** Suma minutos a una hora "HH:mm" (no cruza de dia). */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
