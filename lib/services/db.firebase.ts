// =============================================================================
// Proveedor Firebase — PENDIENTE DE IMPLEMENTAR.
//
// El MVP arranca con Airtable (NEXT_PUBLIC_DATA_PROVIDER=airtable). Este archivo
// existe para que migrar a Firestore no implique tocar ni un componente de UI:
// alcanza con completar los metodos de abajo y cambiar la variable de entorno.
//
// Pasos para completarlo:
//   1. pnpm add firebase firebase-admin
//   2. Inicializar el Admin SDK con FIREBASE_ADMIN_* (ver .env.example).
//   3. Colecciones sugeridas, todas con el campo tenantId indexado:
//        tenants / services / professionals / clients / bookings
//   4. Reusar computeAvailability() de lib/utils/availability.ts —
//      la logica de disponibilidad es agnostica del proveedor.
//   5. Indice compuesto recomendado en bookings:
//        tenantId ASC, professionalId ASC, startsAt ASC
// =============================================================================

import type { DataClient } from "./db";

const MENSAJE =
  "El proveedor Firebase todavia no esta implementado. " +
  "Usa NEXT_PUBLIC_DATA_PROVIDER=airtable o =mock, " +
  "o completá lib/services/db.firebase.ts.";

function pendiente(metodo: string): never {
  throw new Error(`${MENSAJE} (metodo llamado: ${metodo})`);
}

export const firebaseClient: DataClient = {
  getTenant: async () => pendiente("getTenant"),
  listTenants: async () => pendiente("listTenants"),
  updateTenant: async () => pendiente("updateTenant"),
  listServices: async () => pendiente("listServices"),
  getService: async () => pendiente("getService"),
  saveService: async () => pendiente("saveService"),
  listProfessionals: async () => pendiente("listProfessionals"),
  getProfessional: async () => pendiente("getProfessional"),
  listClients: async () => pendiente("listClients"),
  getClient: async () => pendiente("getClient"),
  upsertClient: async () => pendiente("upsertClient"),
  listBookings: async () => pendiente("listBookings"),
  getBooking: async () => pendiente("getBooking"),
  getBookingByToken: async () => pendiente("getBookingByToken"),
  createBooking: async () => pendiente("createBooking"),
  updateBooking: async () => pendiente("updateBooking"),
  getAvailability: async () => pendiente("getAvailability"),
};
