// Pantalla final del flujo de reserva. Muestra el detalle y el link de gestion.
// Es tambien la vuelta de Mercado Pago: dice si el pago salio o no, y por que.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { StatusBadge, buttonClass } from "@/components/ui";
import { confirmPayment } from "@/lib/services/bookings";
import { db, getBookingDetail } from "@/lib/services/db";
import { formatMoney } from "@/lib/tenant";
import type { Tenant } from "@/lib/types";
import { formatBookingDate } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

/** Lo que pasó con el pago, ya decidido a partir de datos confiables. */
type Resultado =
  | "aprobado"
  | "rechazado"
  | "en_proceso"
  | "sin_pagar" // volvió de Mercado Pago sin pagar
  | "pendiente" // todavía no pasó por Mercado Pago
  | "sin_sena"; // el servicio no pide pago online

const REINTENTO: Record<string, string> = {
  vencido: "El horario de este turno ya pasó, así que no se puede pagar.",
  no_disponible: "Este turno ya no admite el pago online.",
  error: "No pudimos abrir Mercado Pago. Probá de nuevo en unos minutos.",
};

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: {
    token?: string;
    pago?: string;
    reintento?: string;
    // Los agrega Mercado Pago al volver (back_urls / auto_return).
    payment_id?: string;
    collection_id?: string;
    status?: string;
    preference_id?: string;
  };
}) {
  const token = searchParams.token;
  if (!token) notFound();

  // --- Confirmar el pago al volver ------------------------------------------
  //
  // El estado dependia solo del webhook, y el webhook se pierde facil: la URL
  // del tunel cambia en cada reinicio y la preferencia ya viajo con la
  // anterior, asi que Mercado Pago notifica a una direccion muerta. El turno
  // quedaba en "falta el pago" para siempre aunque la plata estuviera
  // acreditada.
  //
  // Volver aca es la otra oportunidad de enterarse. No se confia en lo que
  // dice la query string --cualquiera puede escribir status=approved--: se usa
  // solo el id para volver a preguntarle a la API de Mercado Pago, que es
  // exactamente lo que hace el webhook. confirmPayment es idempotente.
  const pagoId = [searchParams.payment_id, searchParams.collection_id].find(
    (v) => v && v !== "null"
  );

  if (pagoId) {
    try {
      const r = await confirmPayment(pagoId);
      console.info("[gracias] confirmacion al volver de Mercado Pago", r);
    } catch (error) {
      // Que falle no debe romper la pantalla: el webhook puede llegar despues.
      console.error("[gracias] no se pudo confirmar el pago al volver", error);
    }
  }

  const booking = await db.getBookingByToken(token);
  if (!booking) notFound();

  const tenant = await db.getTenant(booking.tenantId);
  if (!tenant) notFound();

  const detail = await getBookingDetail(tenant.id, booking);

  // El resultado sale del turno, que confirmPayment acaba de actualizar con lo
  // que dijo la API. De la URL solo se usa si la persona pasó por Mercado Pago.
  const vinoDeMercadoPago = searchParams.preference_id !== undefined || !!pagoId;
  const resultado: Resultado =
    detail.paymentStatus === "not_required"
      ? "sin_sena"
      : detail.paymentStatus === "paid"
        ? "aprobado"
        : detail.paymentStatus === "failed"
          ? "rechazado"
          : pagoId
            ? "en_proceso"
            : vinoDeMercadoPago
              ? "sin_pagar"
              : "pendiente";

  const puedeReintentar =
    detail.status === "pending_payment" &&
    (resultado === "rechazado" || resultado === "sin_pagar" || resultado === "pendiente") &&
    searchParams.pago !== "fallo" &&
    Date.parse(detail.startsAt) > Date.now();

  // Aprobado o rechazado, confirmPayment ya guardo el id del pago en el turno
  // (vale aunque la confirmacion haya llegado por webhook y la URL no lo traiga).
  // Antes de eso, paymentId guarda la preferencia, que no le sirve al paciente.
  const operacion =
    resultado === "aprobado" || resultado === "rechazado" ? detail.paymentId : pagoId;

  const v = VISTA[resultado](tenant);
  // Si ya esta pagado, "no se puede pagar" sobra: el titulo ya lo dice todo.
  const avisoReintento =
    searchParams.reintento && resultado !== "aprobado"
      ? REINTENTO[searchParams.reintento]
      : undefined;

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} />

      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-12">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-xl font-semibold ${TONO[v.tono].icono}`}
          aria-hidden
        >
          {v.icono}
        </span>

        <h1 className="mt-4 text-2xl font-bold">{v.titulo}</h1>
        <p className="mt-2 text-fg-muted">{v.texto}</p>

        {/* Datos del cobro: con esto el paciente puede reclamar o comparar con
            el resumen de su tarjeta. */}
        {(resultado === "aprobado" || resultado === "rechazado" || resultado === "en_proceso") && (
          <div className={`mt-5 rounded-lg border px-4 py-3 text-sm ${TONO[v.tono].caja}`}>
            <p className="font-medium">
              {resultado === "aprobado"
                ? `Mercado Pago aprobó el pago de ${formatMoney(detail.amountPaid, tenant)}.`
                : resultado === "rechazado"
                  ? "Mercado Pago rechazó el pago. No se te cobró nada."
                  : "Mercado Pago todavía está procesando el pago."}
            </p>
            {operacion && <p className="mt-0.5 opacity-80">Operación Nº {operacion}</p>}
          </div>
        )}

        {/* El cobro no llego a arrancar. Se avisa sin culpar a la persona ni
            exponer el motivo tecnico, que es del negocio y no le sirve. */}
        {searchParams.pago === "fallo" && (
          <p className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
            No pudimos abrir el pago online. Tu turno quedó reservado igual:{" "}
            {tenant.name} se va a comunicar con vos para coordinar la seña.
          </p>
        )}

        {avisoReintento && (
          <p className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
            {avisoReintento}
          </p>
        )}

        {puedeReintentar && (
          <a
            href={`/book/pagar?token=${encodeURIComponent(booking.publicToken)}`}
            className={buttonClass("primary", "md", "mt-5 w-full sm:w-auto")}
          >
            {resultado === "rechazado" ? "Intentar con otro medio de pago" : "Pagar la seña"}
          </a>
        )}

        <dl className="mt-8 rounded-xl border bg-surface p-5 text-sm">
          <Fila termino="Servicio" valor={detail.service?.name ?? "—"} />
          <Fila termino="Profesional" valor={detail.professional?.name ?? "—"} />
          <Fila
            termino="Cuándo"
            valor={formatBookingDate(detail.startsAt, tenant.timezone)}
          />
          <Fila
            termino="Total"
            valor={formatMoney(detail.amountTotal, tenant)}
          />
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-fg-muted">Estado</dt>
            <dd>
              <StatusBadge status={detail.status} />
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl border border-dashed bg-surface p-5">
          <p className="text-sm font-medium">Guardá este link</p>
          <p className="mt-1 text-sm text-fg-muted">
            Te sirve para cancelar o reprogramar hasta{" "}
            {tenant.cancellationHours} horas antes.
          </p>
          <Link
            href={`/portal?token=${booking.publicToken}`}
            className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
          >
            Ir a mi turno
          </Link>
        </div>

        <Link
          href={`/book?tenant=${tenant.slug}`}
          className="mt-8 inline-block text-sm text-brand hover:underline"
        >
          ← Reservar otro turno
        </Link>
      </main>
    </>
  );
}

// --- Textos por resultado ----------------------------------------------------

type Tono = "ok" | "warn" | "danger";

const TONO: Record<Tono, { icono: string; caja: string }> = {
  ok: { icono: "bg-ok-soft text-ok", caja: "border-ok/25 bg-ok-soft text-ok" },
  warn: { icono: "bg-warn-soft text-warn", caja: "border-warn/25 bg-warn-soft text-warn" },
  danger: {
    icono: "bg-danger-soft text-danger",
    caja: "border-danger/25 bg-danger-soft text-danger",
  },
};

const VISTA: Record<
  Resultado,
  (t: Tenant) => { tono: Tono; icono: string; titulo: string; texto: string }
> = {
  aprobado: (t) => ({
    tono: "ok",
    icono: "✓",
    titulo: "¡Pago aprobado, turno confirmado!",
    texto: `Te esperamos en ${t.name}. Vas a recibir la confirmación por WhatsApp o email.`,
  }),
  sin_sena: (t) => ({
    tono: "ok",
    icono: "✓",
    titulo: "¡Turno confirmado!",
    texto: `Te esperamos en ${t.name}. Vas a recibir la confirmación por WhatsApp o email.`,
  }),
  rechazado: () => ({
    tono: "danger",
    icono: "✕",
    titulo: "El pago no se pudo completar",
    texto:
      "Tu turno sigue reservado por unos minutos. Podés intentar de nuevo con otra tarjeta o medio de pago.",
  }),
  en_proceso: () => ({
    tono: "warn",
    icono: "…",
    titulo: "Estamos esperando la confirmación del pago",
    texto:
      "Algunos medios de pago tardan en acreditarse. Apenas Mercado Pago lo confirme, tu turno queda confirmado y te avisamos.",
  }),
  sin_pagar: () => ({
    tono: "warn",
    icono: "!",
    titulo: "No completaste el pago",
    texto:
      "Volviste de Mercado Pago sin pagar. Tu turno sigue reservado por unos minutos: podés pagar la seña ahora.",
  }),
  pendiente: () => ({
    tono: "warn",
    icono: "…",
    titulo: "Turno reservado, falta el pago",
    texto: "Tu horario queda reservado unos minutos hasta que se acredite la seña.",
  }),
};

function Fila({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2">
      <dt className="text-fg-muted">{termino}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}
