#!/usr/bin/env node
/**
 * Bloquea `npm install` y `yarn install` en este proyecto.
 *
 * Se corre como hook `preinstall`. A diferencia del paquete `only-allow`, esto
 * no descarga nada: son 20 lineas locales. Instalar un paquete de red para
 * proteger la instalacion de paquetes de red seria dar una vuelta de mas.
 *
 * Por que un solo gestor:
 *   - Dos lockfiles conviviendo = dos arboles de dependencias distintos, y el
 *     que auditaste no es necesariamente el que se deploya.
 *   - pnpm usa node_modules aislado: un paquete solo puede importar lo que
 *     declara. Con npm plano, cualquier dependencia transitiva es alcanzable.
 */

const ua = process.env.npm_config_user_agent ?? "";
const gestor = ua.split("/")[0];

if (gestor && gestor !== "pnpm") {
  console.error(`
  ✗ Este proyecto usa pnpm, no ${gestor}.

    corepack enable
    corepack prepare pnpm@9.15.4 --activate
    pnpm install

  (corepack viene con Node 18+, no hay que instalar nada)
`);
  process.exit(1);
}
