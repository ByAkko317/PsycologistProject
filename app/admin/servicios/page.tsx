// Catalogo editable: precio, duracion, seña y que profesional lo presta.
import { Card, SectionTitle } from "@/components/ui";
import { db } from "@/lib/services/db";
import { formatMoney, requireTenant } from "@/lib/tenant";
import { guardarServicio } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminServicios() {
  const tenant = await requireTenant();
  const [servicios, profesionales] = await Promise.all([
    db.listServices(tenant.id),
    db.listProfessionals(tenant.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Servicios</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Lo que ve el cliente en el paso 1 de la reserva. La seña define si el
          turno pasa por Mercado Pago.
        </p>
      </div>

      <div className="space-y-4">
        {servicios.map((s) => (
          <Card key={s.id}>
            <form action={guardarServicio} className="space-y-4">
              <input type="hidden" name="id" value={s.id} />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{s.name}</h2>
                <span className="text-sm text-fg-muted">
                  {formatMoney(s.price, tenant)} · {s.durationMinutes} min
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Nombre" name="name" defaultValue={s.name} />
                <Campo
                  label="Duración (min)"
                  name="durationMinutes"
                  type="number"
                  defaultValue={String(s.durationMinutes)}
                />
                <Campo
                  label="Precio"
                  name="price"
                  type="number"
                  defaultValue={String(s.price)}
                />
                <Campo
                  label="Seña (%)"
                  name="depositPercent"
                  type="number"
                  defaultValue={String(s.depositPercent)}
                  hint="0 = se paga en el consultorio"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Descripción
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={s.description ?? ""}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <fieldset>
                <legend className="mb-1 text-sm font-medium">
                  Profesionales habilitados
                </legend>
                <div className="flex flex-wrap gap-3">
                  {profesionales.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="professionalIds"
                        value={p.id}
                        defaultChecked={s.professionalIds.includes(p.id)}
                        className="accent-brand"
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex items-center justify-between gap-4 border-t pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={s.active}
                    className="accent-brand"
                  />
                  Visible en el portal de reservas
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
                >
                  Guardar
                </button>
              </div>
            </form>
          </Card>
        ))}
      </div>

      <section>
        <SectionTitle hint="Queda visible en /book apenas lo guardes">
          Agregar un servicio
        </SectionTitle>
        <Card>
          <form action={guardarServicio} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre" name="name" defaultValue="" />
              <Campo
                label="Duración (min)"
                name="durationMinutes"
                type="number"
                defaultValue="50"
              />
              <Campo label="Precio" name="price" type="number" defaultValue="0" />
              <Campo
                label="Seña (%)"
                name="depositPercent"
                type="number"
                defaultValue="0"
              />
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">
                Profesionales habilitados
              </legend>
              <div className="flex flex-wrap gap-3">
                {profesionales.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="professionalIds"
                      value={p.id}
                      className="accent-brand"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <input type="hidden" name="active" value="on" />
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
            >
              Crear servicio
            </button>
          </form>
        </Card>
      </section>
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
