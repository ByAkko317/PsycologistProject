// =============================================================================
// Métricas del negocio para el panel del administrador.
//
// Todo se calcula en memoria a partir de los turnos del tenant. Con volúmenes
// de consultorio (miles de turnos, no millones) alcanza y sobra, y evita atar
// el panel a las capacidades de agregación de un proveedor puntual — que es
// justo lo que nos permitiría migrar de Airtable a Firestore sin reescribir.
//
// Si algún día un tenant crece lo suficiente como para que esto pese, el lugar
// para arreglarlo es acá adentro, no en la página.
// =============================================================================

import { db, expandBookings } from "@/lib/services/db";
import type { BookingDetail, Tenant } from "@/lib/types";
import { toDateKey } from "@/lib/utils/dates";

export interface Metrica {
  valor: number;
  /** Variación porcentual contra el período anterior. null si no hay base. */
  tendencia: number | null;
}

export interface Analytics {
  rango: { desde: string; hasta: string; dias: number };
  turnos: Metrica;
  ingresos: Metrica;
  pacientesNuevos: Metrica;
  tasaAsistencia: number | null;
  tasaCancelacion: number | null;
  /** Turnos por día, para el gráfico de barras. */
  porDia: { fecha: string; etiqueta: string; total: number }[];
  porServicio: { nombre: string; total: number; ingresos: number }[];
  porProfesional: { nombre: string; total: number; asistencia: number | null }[];
  proximos: BookingDetail[];
  hoy: BookingDetail[];
  pendientesDePago: number;
}

/** Estados que representan un turno que efectivamente ocupó lugar. */
const REALIZADOS = new Set(["completed", "no_show"]);
const VIVOS = new Set(["confirmed", "pending_payment", "completed"]);

function variacion(actual: number, previo: number): number | null {
  if (previo === 0) return actual === 0 ? 0 : null;
  return ((actual - previo) / previo) * 100;
}

export async function getAnalytics(
  tenant: Tenant,
  dias = 30,
  ahora: Date = new Date()
): Promise<Analytics> {
  const todos = await db.listBookings(tenant.id);
  const detalles = await expandBookings(tenant.id, todos);

  const msVentana = dias * 86_400_000;
  const inicioActual = ahora.getTime() - msVentana;
  const inicioPrevio = inicioActual - msVentana;

  const enRango = (b: BookingDetail, desde: number, hasta: number) => {
    const t = new Date(b.startsAt).getTime();
    return t >= desde && t < hasta;
  };

  const actuales = detalles.filter((b) =>
    enRango(b, inicioActual, ahora.getTime())
  );
  const previos = detalles.filter((b) =>
    enRango(b, inicioPrevio, inicioActual)
  );

  // --- Volumen ---
  const cuenta = (lista: BookingDetail[]) =>
    lista.filter((b) => b.status !== "cancelled").length;

  // --- Ingresos: solo lo efectivamente cobrado ---
  const cobrado = (lista: BookingDetail[]) =>
    lista
      .filter((b) => b.status !== "cancelled")
      .reduce((acc, b) => acc + b.amountPaid, 0);

  // --- Pacientes nuevos: primera reserva dentro del período ---
  const primeraReserva = new Map<string, number>();
  for (const b of detalles) {
    const t = new Date(b.createdAt || b.startsAt).getTime();
    const previo = primeraReserva.get(b.clientId);
    if (previo === undefined || t < previo) primeraReserva.set(b.clientId, t);
  }
  const nuevosEn = (desde: number, hasta: number) =>
    [...primeraReserva.values()].filter((t) => t >= desde && t < hasta).length;

  // --- Asistencia y cancelación ---
  const realizados = actuales.filter((b) => REALIZADOS.has(b.status));
  const asistidos = realizados.filter((b) => b.status === "completed").length;
  const tasaAsistencia =
    realizados.length > 0 ? (asistidos / realizados.length) * 100 : null;

  const cancelados = actuales.filter((b) => b.status === "cancelled").length;
  const tasaCancelacion =
    actuales.length > 0 ? (cancelados / actuales.length) * 100 : null;

  // --- Serie por día ---
  const porDiaMapa = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) {
    const key = toDateKey(
      new Date(ahora.getTime() - i * 86_400_000),
      tenant.timezone
    );
    porDiaMapa.set(key, 0);
  }
  for (const b of actuales) {
    if (b.status === "cancelled") continue;
    const key = toDateKey(b.startsAt, tenant.timezone);
    if (porDiaMapa.has(key)) porDiaMapa.set(key, porDiaMapa.get(key)! + 1);
  }

  const porDia = [...porDiaMapa.entries()].map(([fecha, total]) => ({
    fecha,
    etiqueta: new Intl.DateTimeFormat("es-AR", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    }).format(new Date(`${fecha}T12:00:00Z`)),
    total,
  }));

  // --- Ranking por servicio ---
  const servicios = new Map<string, { total: number; ingresos: number }>();
  for (const b of actuales) {
    if (b.status === "cancelled") continue;
    const nombre = b.service?.name ?? "Sin servicio";
    const acc = servicios.get(nombre) ?? { total: 0, ingresos: 0 };
    acc.total++;
    acc.ingresos += b.amountPaid;
    servicios.set(nombre, acc);
  }

  // --- Ranking por profesional ---
  const profesionales = new Map<
    string,
    { total: number; realizados: number; asistidos: number }
  >();
  for (const b of actuales) {
    if (b.status === "cancelled") continue;
    const nombre = b.professional?.name ?? "Sin asignar";
    const acc =
      profesionales.get(nombre) ?? { total: 0, realizados: 0, asistidos: 0 };
    acc.total++;
    if (REALIZADOS.has(b.status)) acc.realizados++;
    if (b.status === "completed") acc.asistidos++;
    profesionales.set(nombre, acc);
  }

  // --- Listas de trabajo ---
  const hoyKey = toDateKey(ahora, tenant.timezone);
  const hoy = detalles
    .filter(
      (b) =>
        toDateKey(b.startsAt, tenant.timezone) === hoyKey &&
        b.status !== "cancelled"
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const proximos = detalles
    .filter(
      (b) =>
        new Date(b.startsAt).getTime() >= ahora.getTime() &&
        VIVOS.has(b.status)
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 8);

  return {
    rango: {
      desde: toDateKey(new Date(inicioActual), tenant.timezone),
      hasta: hoyKey,
      dias,
    },
    turnos: {
      valor: cuenta(actuales),
      tendencia: variacion(cuenta(actuales), cuenta(previos)),
    },
    ingresos: {
      valor: cobrado(actuales),
      tendencia: variacion(cobrado(actuales), cobrado(previos)),
    },
    pacientesNuevos: {
      valor: nuevosEn(inicioActual, ahora.getTime()),
      tendencia: variacion(
        nuevosEn(inicioActual, ahora.getTime()),
        nuevosEn(inicioPrevio, inicioActual)
      ),
    },
    tasaAsistencia,
    tasaCancelacion,
    porDia,
    porServicio: [...servicios.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.total - a.total),
    porProfesional: [...profesionales.entries()]
      .map(([nombre, v]) => ({
        nombre,
        total: v.total,
        asistencia:
          v.realizados > 0 ? (v.asistidos / v.realizados) * 100 : null,
      }))
      .sort((a, b) => b.total - a.total),
    proximos,
    hoy,
    pendientesDePago: detalles.filter((b) => b.paymentStatus === "pending")
      .length,
  };
}
