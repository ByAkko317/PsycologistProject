"use client";

// Campo de teléfono con el "+" fijo y solo dígitos.
//
// El + no se escribe: está dibujado al lado del input, así nadie lo olvida ni
// lo pone en el medio. Lo que se tipea o se pega pasa por un filtro que deja
// solo números, y el valor que viaja (input oculto o onCambio) ya es el
// definitivo: "+" + dígitos, igual a como se guarda en Airtable.
//
// Si el número no es válido, el input se marca con setCustomValidity: el
// navegador no deja enviar el formulario y muestra el motivo, sin JS extra en
// cada formulario que lo use.

import { useEffect, useId, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import { PREFIJO_POR_DEFECTO, validarTelefono } from "@/lib/utils/telefono.mjs";

const MAX_DIGITOS = 15;

/** "" si el campo quedó vacío o solo con el prefijo que pusimos nosotros. */
function valorFinal(digitos: string): string {
  return digitos && digitos !== PREFIJO_POR_DEFECTO ? `+${digitos}` : "";
}

export function PhoneInput({
  label = "Teléfono / WhatsApp",
  name,
  defaultValue,
  onCambio,
  hint = "Código de país, área y número, sin 0 ni 15. Ej: 54 9 261 1234567",
}: {
  label?: string;
  /** Con name, el valor viaja en un input oculto (formularios de servidor). */
  name?: string;
  /** Un teléfono ya guardado, con o sin +. */
  defaultValue?: string;
  /** Para formularios controlados: recibe el valor final o "". */
  onCambio?: (telefono: string) => void;
  hint?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [digitos, setDigitos] = useState(
    () => (defaultValue ?? "").replace(/\D/g, "") || PREFIJO_POR_DEFECTO
  );
  const [tocado, setTocado] = useState(false);

  const valor = valorFinal(digitos);
  const resultado = validarTelefono(valor);
  const error = resultado.ok ? null : resultado.error;

  useEffect(() => {
    ref.current?.setCustomValidity(error ?? "");
    onCambio?.(valor);
    // onCambio suele ser un setState, estable; no hace falta re-correr por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, error]);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-fg-muted"
          aria-hidden
        >
          +
        </span>
        <input
          ref={ref}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={digitos}
          maxLength={MAX_DIGITOS}
          // Una tecla que no es dígito ni llega al input. Filtrarla después en
          // onChange también funciona, pero con tipeo rápido el valor
          // rechazado y el siguiente se pisan y se pierden dígitos.
          onBeforeInput={(e) => {
            const dato = (e.nativeEvent as InputEvent).data;
            if (dato && /\D/.test(dato) && dato.length === 1) e.preventDefault();
          }}
          // Lo que se pegue o autocomplete ("+54 9 261-123…") queda en dígitos.
          onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITOS))}
          onBlur={() => setTocado(true)}
          aria-invalid={tocado && error ? true : undefined}
          aria-describedby={`${id}-ayuda`}
          className={`${inputClass} pl-7 tabular ${tocado && error ? "!border-danger" : ""}`}
        />
      </div>
      {name && <input type="hidden" name={name} value={valor} />}
      <p
        id={`${id}-ayuda`}
        className={`mt-1 text-xs ${tocado && error ? "text-danger" : "text-fg-subtle"}`}
      >
        {tocado && error ? error : hint}
      </p>
    </div>
  );
}
