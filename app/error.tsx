"use client";

// Captura cualquier error de renderizado dentro de la app.
// Next monta este componente en lugar del arbol que fallo.

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En produccion esto va a parar a los logs del servidor, donde el `digest`
    // permite encontrar el stack real que el navegador no ve.
    console.error("[app:error]", error);
  }, [error]);

  return (
    <ErrorScreen
      titulo="Algo salió mal de nuestro lado"
      descripcion="No pudimos completar la acción. No se perdió nada de lo que ya estaba guardado."
      detalle={error.message}
      digest={error.digest}
      onReintentar={reset}
    />
  );
}
