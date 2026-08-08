// Piezas de UI compartidas. Sin librerias externas: solo Tailwind.
import type { BookingStatus, PaymentStatus } from "@/lib/types";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Asistio",
  no_show: "Ausente",
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
  completed: "bg-slate-200 text-slate-700",
  no_show: "bg-orange-100 text-orange-800",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  not_required: "Sin senia",
  pending: "Pago pendiente",
  paid: "Pagado",
  refunded: "Reintegrado",
  failed: "Pago fallido",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === "not_required") return null;
  const style =
    status === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${style}`}>
      {PAYMENT_LABEL[status]}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
