"use client";

// Alta de un usuario del equipo. El campo de ficha profesional solo tiene
// sentido para el rol "profesional", así que aparece y desaparece según el rol
// elegido, en vez de estar siempre ahí generando dudas.

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Alert, Field, inputClass } from "@/components/ui";
import { crearUsuario, type EquipoState } from "@/app/admin/equipo/actions";

const inicial: EquipoState = {};

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg transition hover:brightness-110 disabled:opacity-50"
    >
      {pending ? "Creando…" : "Crear usuario"}
    </button>
  );
}

export function NuevoUsuarioForm({
  profesionales,
}: {
  profesionales: { id: string; name: string }[];
}) {
  const [estado, accion] = useFormState(crearUsuario, inicial);
  const [rol, setRol] = useState<"employee" | "owner">("employee");

  return (
    <form action={accion} className="space-y-4">
      {estado.error && <Alert tone="danger">{estado.error}</Alert>}
      {estado.ok && <Alert tone="ok">{estado.ok}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre y apellido" required htmlFor="nu-name">
          <input id="nu-name" name="name" required className={inputClass} />
        </Field>

        <Field label="Email" required htmlFor="nu-email">
          <input
            id="nu-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className={inputClass}
          />
        </Field>

        <Field label="Rol" required htmlFor="nu-role">
          <select
            id="nu-role"
            name="role"
            value={rol}
            onChange={(e) => setRol(e.target.value as "employee" | "owner")}
            className={inputClass}
          >
            <option value="employee">Profesional</option>
            <option value="owner">Administración</option>
          </select>
        </Field>

        <Field
          label="Contraseña inicial"
          required
          htmlFor="nu-pass"
          hint="Mínimo 8 caracteres"
        >
          <input
            id="nu-pass"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>

      {rol === "employee" && (
        <Field
          label="Ficha de profesional"
          htmlFor="nu-prof"
          hint="Define qué agenda ve. Si la dejás sin vincular, entra pero no ve turnos."
        >
          <select
            id="nu-prof"
            name="professionalId"
            className={inputClass}
            defaultValue=""
          >
            <option value="">Sin vincular</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {rol === "owner" && (
        <Alert tone="warn">
          Un usuario de administración ve y edita todo el negocio, incluidos los
          datos de todos los pacientes y la configuración de cobros.
        </Alert>
      )}

      <Boton />
    </form>
  );
}
