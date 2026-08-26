// Identidad del negocio (white-label) + horario laboral + politica de cancelacion.
import { Card, SectionTitle } from "@/components/ui";
import { requireTenant } from "@/lib/tenant";
import { guardarMarca } from "../actions";

export const dynamic = "force-dynamic";

const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export default async function AdminMarca() {
  const tenant = await requireTenant();

  const rangosDe = (dia: number) =>
    (tenant.businessHours[dia] ?? [])
      .map((r) => `${r.start}-${r.end}`)
      .join(", ");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Marca y configuración</h1>
        <p className="mt-1 text-sm text-fg-muted">
          El color se aplica al instante en el portal de reservas, la agenda y
          este panel.
        </p>
      </div>

      <form action={guardarMarca} className="space-y-6">
        <Card className="space-y-4">
          <SectionTitle>Identidad</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre del negocio" name="name" defaultValue={tenant.name} />
            <div>
              <label className="mb-1 block text-sm font-medium">
                Color de marca
              </label>
              <div className="flex gap-2">
                <input
                  type="color"
                  name="brandColor"
                  defaultValue={tenant.brandColor}
                  className="h-10 w-14 cursor-pointer rounded-lg border"
                />
                <span className="flex items-center rounded-lg bg-surface-2 px-3 font-mono text-sm text-fg-muted">
                  {tenant.brandColor}
                </span>
              </div>
            </div>
            <Campo
              label="URL del logo"
              name="logoUrl"
              defaultValue={tenant.logoUrl ?? ""}
              hint="Cuadrado, mínimo 128×128px"
            />
            <Campo
              label="Zona horaria"
              name="timezone"
              defaultValue={tenant.timezone}
              hint="Formato IANA, ej. America/Argentina/Buenos_Aires"
            />
            <Campo
              label="Email de contacto"
              name="contactEmail"
              defaultValue={tenant.contactEmail ?? ""}
            />
            <Campo
              label="Teléfono de contacto"
              name="contactPhone"
              defaultValue={tenant.contactPhone ?? ""}
            />
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle hint="Formato: 09:00-13:00, 14:00-19:00 · vacío = cerrado">
            Horario de atención
          </SectionTitle>
          <div className="space-y-2">
            {DIAS.map((nombre, dia) => (
              <div key={dia} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-fg-muted">
                  {nombre}
                </span>
                <input
                  name={`hours_${dia}`}
                  defaultValue={rangosDe(dia)}
                  placeholder="cerrado"
                  className="flex-1 rounded-lg border px-3 py-1.5 font-mono text-sm outline-none focus:border-brand"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-fg-muted">
            Un profesional puede tener su propio horario; en ese caso pisa al del
            negocio para sus turnos.
          </p>
        </Card>

        <Card className="space-y-4">
          <SectionTitle>Reglas de agenda</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              label="Cancelación mínima (horas)"
              name="cancellationHours"
              type="number"
              defaultValue={String(tenant.cancellationHours)}
              hint="Después de este límite el cliente ya no puede cancelar solo"
            />
            <Campo
              label="Intervalo de la grilla (min)"
              name="slotIntervalMinutes"
              type="number"
              defaultValue={String(tenant.slotIntervalMinutes)}
              hint="Cada cuánto arranca un turno posible"
            />
          </div>
        </Card>

        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2.5 font-medium text-brand-fg"
        >
          Guardar cambios
        </button>
      </form>
    </div>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  type = "text",
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
      />
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}
