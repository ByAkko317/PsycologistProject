// Gestión de usuarios del equipo: alta, vínculo con la ficha profesional,
// y activación / desactivación.
import { PageHeader } from "@/components/app-shell";
import { Alert, Card, EmptyState, SectionTitle } from "@/components/ui";
import { NuevoUsuarioForm } from "@/components/team-form";
import { getSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/auth/permissions";
import { db } from "@/lib/services/db";
import { requireTenant } from "@/lib/tenant";
import { alternarActivo, vincularProfesional } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminEquipo() {
  const tenant = await requireTenant();
  const sesion = getSession();

  const [usuarios, profesionales] = await Promise.all([
    db.listUsers(tenant.id),
    db.listProfessionals(tenant.id),
  ]);

  const equipo = usuarios
    .filter((u) => u.role !== "client")
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const pacientes = usuarios.filter((u) => u.role === "client").length;
  const fichaDe = new Map(profesionales.map((p) => [p.id, p]));

  // Fichas de profesional que todavía no tienen usuario: sin usuario, esa
  // persona no puede entrar a ver su agenda.
  const sinUsuario = profesionales.filter(
    (p) => !equipo.some((u) => u.professionalId === p.id)
  );

  return (
    <>
      <PageHeader
        title="Equipo"
        description={`${equipo.length} usuario${equipo.length === 1 ? "" : "s"} con acceso al sistema · ${pacientes} cuenta${pacientes === 1 ? "" : "s"} de paciente.`}
      />

      {sinUsuario.length > 0 && (
        <Alert tone="warn" className="mb-6">
          {sinUsuario.map((p) => p.name).join(", ")}{" "}
          {sinUsuario.length === 1 ? "tiene ficha" : "tienen ficha"} de
          profesional pero{" "}
          {sinUsuario.length === 1 ? "no tiene usuario" : "no tienen usuario"}:
          no {sinUsuario.length === 1 ? "puede" : "pueden"} entrar a ver su
          agenda.
        </Alert>
      )}

      {/* --- Usuarios existentes --- */}
      <section>
        <SectionTitle hint="Los pacientes se registran solos; acá solo aparece el equipo.">
          Usuarios con acceso
        </SectionTitle>

        {equipo.length === 0 ? (
          <EmptyState>Todavía no hay usuarios del equipo.</EmptyState>
        ) : (
          <Card padding={false} className="divide-y divide-line">
            {equipo.map((u) => {
              const esYo = u.id === sesion?.uid;
              const ficha = u.professionalId
                ? fichaDe.get(u.professionalId)
                : undefined;

              return (
                <div key={u.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{u.name}</p>
                        <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                          {roleLabel(u.role)}
                        </span>
                        {esYo && (
                          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
                            Sos vos
                          </span>
                        )}
                        {!u.active && (
                          <span className="rounded-md bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                            Desactivado
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-fg-muted">{u.email}</p>
                      {u.lastLoginAt && (
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          Último acceso:{" "}
                          {new Intl.DateTimeFormat("es-AR", {
                            timeZone: tenant.timezone,
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(u.lastLoginAt))}
                        </p>
                      )}
                    </div>

                    {!esYo && (
                      <form action={alternarActivo}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="hidden"
                          name="activar"
                          value={u.active ? "0" : "1"}
                        />
                        <button
                          type="submit"
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                            u.active
                              ? "border-line hover:border-danger hover:text-danger"
                              : "border-line hover:border-ok hover:text-ok"
                          }`}
                        >
                          {u.active ? "Desactivar" : "Reactivar"}
                        </button>
                      </form>
                    )}
                  </div>

                  {u.role === "employee" && (
                    <form
                      action={vincularProfesional}
                      className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4"
                    >
                      <input type="hidden" name="userId" value={u.id} />
                      <div className="min-w-[14rem] flex-1">
                        <label
                          htmlFor={`prof-${u.id}`}
                          className="mb-1.5 block text-xs font-medium text-fg-muted"
                        >
                          Ficha de profesional vinculada
                        </label>
                        <select
                          id={`prof-${u.id}`}
                          name="professionalId"
                          defaultValue={u.professionalId ?? ""}
                          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                        >
                          <option value="">Sin vincular</option>
                          {profesionales.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:bg-surface-2"
                      >
                        Guardar
                      </button>
                      {!ficha && (
                        <p className="w-full text-xs text-warn">
                          Sin vincular no ve ninguna agenda al entrar.
                        </p>
                      )}
                    </form>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* --- Alta --- */}
      <section className="mt-10">
        <SectionTitle hint="La persona entra con este email y la contraseña que le pongas. Pedile que la cambie en su primer ingreso.">
          Agregar al equipo
        </SectionTitle>
        <Card>
          <NuevoUsuarioForm
            profesionales={profesionales.map((p) => ({
              id: p.id,
              name: p.name,
            }))}
          />
        </Card>
      </section>
    </>
  );
}
