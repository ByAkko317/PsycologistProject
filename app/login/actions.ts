"use server";

import { redirect } from "next/navigation";
import { homeForRole, setSessionCookie } from "@/lib/auth/session";
import {
  AuthFlowError,
  login,
  registerClient,
  sessionFromUser,
} from "@/lib/services/auth";

export interface FormState {
  error?: string;
  /** Se conserva para no obligar a reescribir el email tras un error. */
  email?: string;
}

/** Solo permite redirigir dentro de la app: corta el open redirect. */
function destinoSeguro(valor: string | null | undefined, fallback: string) {
  if (!valor) return fallback;
  if (!valor.startsWith("/") || valor.startsWith("//")) return fallback;
  return valor;
}

export async function accionLogin(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  let destino: string;
  try {
    const usuario = await login(email, password);
    setSessionCookie(sessionFromUser(usuario));
    destino = destinoSeguro(next, homeForRole(usuario.role));
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return { error: error.message, email };
    }
    console.error("[login]", error);
    return { error: "No se pudo iniciar sesión. Probá de nuevo.", email };
  }

  // redirect() lanza por diseño: va afuera del try para no capturarlo.
  redirect(destino);
}

export async function accionRegistro(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "");

  try {
    const usuario = await registerClient({
      name: String(formData.get("name") ?? ""),
      email,
      password: String(formData.get("password") ?? ""),
      phone: String(formData.get("phone") ?? "") || undefined,
    });
    setSessionCookie(sessionFromUser(usuario));
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return { error: error.message, email };
    }
    console.error("[registro]", error);
    return { error: "No se pudo crear la cuenta. Probá de nuevo.", email };
  }

  redirect("/portal");
}
