// Piezas de UI compartidas. Sin librerías: solo Tailwind sobre los tokens
// semánticos de globals.css, así el modo oscuro sale sin tocar nada acá.

import type { BookingStatus, PaymentStatus } from "@/lib/types";

// --- Contenedores ------------------------------------------------------------

export function Card({
  children,
  className = "",
  padding = true,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface shadow-card ${padding ? "p-5" : ""} ${className}`}
    >
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
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {icon && <div className="mb-3 flex justify-center text-fg-subtle">{icon}</div>}
      <div className="text-sm text-fg-muted">{children}</div>
    </div>
  );
}

// --- Botones -----------------------------------------------------------------

type Variante = "primary" | "secondary" | "ghost" | "danger";
type Tamanio = "sm" | "md";

const VARIANTES: Record<Variante, string> = {
  primary:
    "bg-brand text-brand-fg shadow-card hover:brightness-110 active:brightness-95",
  secondary:
    "border border-line bg-surface text-fg hover:bg-surface-2 hover:border-line-strong",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:brightness-110",
};

const TAMANIOS: Record<Tamanio, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
};

export function buttonClass(
  variante: Variante = "primary",
  tamanio: Tamanio = "md",
  extra = ""
): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTES[variante]} ${TAMANIOS[tamanio]} ${extra}`;
}

export function Button({
  variante = "primary",
  tamanio = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamanio?: Tamanio;
}) {
  return <button className={buttonClass(variante, tamanio, className)} {...props} />;
}

// --- Formularios -------------------------------------------------------------

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand";

export function Field({
  label,
  hint,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

// --- Avisos ------------------------------------------------------------------

export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "ok" | "warn" | "danger";
  children: React.ReactNode;
  className?: string;
}) {
  const estilos = {
    info: "bg-info-soft text-info border-info/25",
    ok: "bg-ok-soft text-ok border-ok/25",
    warn: "bg-warn-soft text-warn border-warn/25",
    danger: "bg-danger-soft text-danger border-danger/25",
  }[tone];

  return (
    <p
      role={tone === "danger" ? "alert" : undefined}
      className={`rounded-lg border px-4 py-3 text-sm ${estilos} ${className}`}
    >
      {children}
    </p>
  );
}

// --- Estados de turno --------------------------------------------------------

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Asistió",
  no_show: "Ausente",
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending_payment: "bg-warn-soft text-warn",
  confirmed: "bg-ok-soft text-ok",
  cancelled: "bg-danger-soft text-danger",
  completed: "bg-surface-2 text-fg-muted",
  no_show: "bg-warn-soft text-warn",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  not_required: "Sin seña",
  pending: "Pago pendiente",
  paid: "Pagado",
  refunded: "Reintegrado",
  failed: "Pago fallido",
};

/**
 * Estado del pago.
 *
 * Solo se muestra a quien tiene permiso de ver plata: un profesional no
 * necesita saber si el paciente pagó, y saberlo puede condicionar el trato.
 */
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === "not_required") return null;
  const estilo = {
    paid: "bg-ok-soft text-ok",
    failed: "bg-danger-soft text-danger",
    pending: "bg-surface-2 text-fg-muted",
    refunded: "bg-surface-2 text-fg-muted",
    not_required: "",
  }[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs ${estilo}`}
    >
      {PAYMENT_LABEL[status]}
    </span>
  );
}

// --- Métricas ----------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Variación respecto al período anterior, en porcentaje. */
  trend?: number | null;
}) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
        {typeof trend === "number" && Number.isFinite(trend) && (
          <span
            className={`text-xs font-medium ${trend >= 0 ? "text-ok" : "text-danger"}`}
          >
            {trend >= 0 ? "↑" : "↓"} {Math.abs(Math.round(trend))}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </Card>
  );
}

/** Barra horizontal simple, para rankings. Sin librería de gráficos. */
export function BarRow({
  label,
  value,
  max,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  detail?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="tabular shrink-0 text-fg-muted">{detail ?? value}</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${label}: ${detail ?? value}`}
      >
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

/** Fila de definición, para resúmenes de turno. */
export function Row({
  term,
  children,
  emphasis,
}: {
  term: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-fg-muted">{term}</dt>
      <dd
        className={`text-right ${emphasis ? "font-semibold text-brand" : "font-medium"}`}
      >
        {children}
      </dd>
    </div>
  );
}
