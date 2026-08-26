// Pantalla final del flujo de reserva. Muestra el detalle y el link de gestion.
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppFooter, AppHeader, Page } from "@/components/app-shell";
import { BrandStyle } from "@/components/brand";
import { StatusBadge } from "@/components/ui";
import { db, getBookingDetail } from "@/lib/services/db";
import { formatMoney } from "@/lib/tenant";
import { formatBookingDate } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;
  if (!token) notFound();

  const booking = await db.getBookingByToken(token);
  if (!booking) notFound();

  const tenant = await db.getTenant(booking.tenantId);
  if (!tenant) notFound();

  const detail = await getBookingDetail(tenant.id, booking);
  const pendiente = detail.status === "pending_payment";

  return (
    <>
      <BrandStyle tenant={tenant} />
      <AppHeader tenant={tenant} />

      <main className="mx-auto max-w-xl px-6 py-12">
        <span
          className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
            pendiente ? "bg-warn-soft" : "bg-ok-soft"
          }`}
          aria-hidden
        >
          {pendiente ? "⏳" : "✓"}
        </span>

        <h1 className="mt-4 text-2xl font-bold">
          {pendiente ? "Turno reservado, falta el pago" : "¡Turno confirmado!"}
        </h1>
        <p className="mt-2 text-fg-muted">
          {pendiente
            ? "Tu horario queda reservado unos minutos hasta que se acredite la seña."
            : `Te esperamos en ${tenant.name}. Vas a recibir la confirmación por WhatsApp o email.`}
        </p>

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

function Fila({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2">
      <dt className="text-fg-muted">{termino}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </div>
  );
}
