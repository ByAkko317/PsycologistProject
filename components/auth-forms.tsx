"use client";

// Formularios de login y registro. Usan useFormState, así que el error vuelve
// del servidor sin JavaScript de por medio: funcionan igual con JS deshabilitado.

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { accionLogin, accionRegistro, type FormState } from "@/app/login/actions";

const estadoInicial: FormState = {};

function Boton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-brand-fg shadow-card transition hover:brightness-110 disabled:opacity-50"
    >
      {pending ? "Un momento…" : children}
    </button>
  );
}

function Error({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      {mensaje}
    </p>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  autoComplete,
  hint,
  autoFocus,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  autoComplete?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle transition focus:border-brand"
      />
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [estado, accion] = useFormState(accionLogin, estadoInicial);

  return (
    <form action={accion} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Error mensaje={estado.error} />

      <Campo
        label="Email"
        name="email"
        type="email"
        required
        autoFocus
        autoComplete="email"
        defaultValue={estado.email}
      />
      <Campo
        label="Contraseña"
        name="password"
        type="password"
        required
        autoComplete="current-password"
      />

      <Boton>Iniciar sesión</Boton>

      <p className="text-center text-sm text-fg-muted">
        ¿Primera vez?{" "}
        <Link href="/registro" className="text-brand hover:underline">
          Creá tu cuenta
        </Link>
      </p>
    </form>
  );
}

export function RegistroForm() {
  const [estado, accion] = useFormState(accionRegistro, estadoInicial);

  return (
    <form action={accion} className="space-y-4">
      <Error mensaje={estado.error} />

      <Campo
        label="Nombre y apellido"
        name="name"
        required
        autoFocus
        autoComplete="name"
      />
      <Campo
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        defaultValue={estado.email}
        hint="Si ya reservaste antes con este email, vas a ver todos tus turnos"
      />
      <Campo
        label="Teléfono / WhatsApp"
        name="phone"
        type="tel"
        autoComplete="tel"
        hint="Opcional. Con código de país, ej. +54 9 11…"
      />
      <Campo
        label="Contraseña"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        hint="Mínimo 8 caracteres"
      />

      <Boton>Crear cuenta</Boton>

      <p className="text-center text-sm text-fg-muted">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </form>
  );
}

/** Botón de cerrar sesión. Va por POST para que no lo dispare un GET ajeno. */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className={className ?? "text-sm text-fg-muted transition hover:text-fg"}
      >
        Cerrar sesión
      </button>
    </form>
  );
}
