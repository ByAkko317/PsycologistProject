# Conectar el proyecto con GitHub

Qué hace falta, de dónde sale cada dato y por qué las credenciales de git no
viven junto a las de la aplicación.

---

## Los 3 datos que necesito

| Dato | De dónde sale | Ejemplo |
|---|---|---|
| **URL del repositorio** | GitHub → el repo → botón verde `Code` → pestaña **HTTPS** | `https://github.com/pablo/turnos-saas.git` |
| **Usuario de GitHub** | tu nombre de usuario, no el email | `pablo` |
| **Personal Access Token** | ver abajo | `github_pat_11A…` |

Con eso alcanza para hacer `push`. No necesito acceso a tu cuenta, ni la
contraseña, ni 2FA.

---

## Crear el token (fine-grained, 2 minutos)

<https://github.com/settings/personal-access-tokens/new>

| Campo | Qué poner | Por qué |
|---|---|---|
| **Token name** | `turnos-saas — push` | para saber cuál revocar después |
| **Expiration** | 90 días | un token sin vencimiento es un problema esperando |
| **Repository access** | `Only select repositories` → **solo este repo** | si se filtra, no toca el resto de tu cuenta |
| **Permissions → Contents** | **Read and write** | es el único permiso necesario para clonar y pushear |

Todo lo demás va en `No access`. Específicamente **no** hace falta: `admin`,
`workflow`, `packages`, `delete_repo`, ni acceso a la organización.

> GitHub muestra el token **una sola vez**. Copialo antes de cerrar la pestaña.

### ¿Y el token clásico?

Los *classic tokens* dan acceso a **todos** tus repos y no se pueden acotar. Si
ya tenés uno andando sirve igual, pero para esto conviene el fine-grained.

---

## Configurar y probar

```bash
cp .env.git.example .env.git
# completar GITHUB_REPO_URL, GITHUB_USERNAME y GITHUB_TOKEN

node scripts/setup-git-remote.mjs
```

El script:

1. Verifica que `.env.git` **no** esté trackeado por git — si lo estuviera, tu
   token terminaría en el repo, así que aborta.
2. Configura `origin` con la URL **limpia**, sin el token adentro.
3. Guarda el token en el credential helper del sistema (en Windows, el
   Administrador de credenciales).
4. Prueba el acceso con `git ls-remote`, que **no escribe nada**.

Si todo da bien:

```bash
git push -u origin main
# o directamente:
node scripts/setup-git-remote.mjs --push
```

---

## Por qué el token no va en `.env.local`

La app **nunca habla con GitHub**. Meter el token en `.env.local` significaría:

- cargarlo en el proceso de Next.js, donde no tiene nada que hacer;
- que aparezca en cualquier volcado de `process.env` de un log de error;
- que si algún día se copian las variables a Vercel, quede en el entorno del
  deploy — y un token robado de ahí da **escritura sobre el repo**.

Por eso viven en `.env.git`, que solo lee un script que corrés a mano.

Tampoco conviene la forma "rápida" que circula por ahí:

```bash
# ✗ no hagas esto
git remote add origin https://usuario:TOKEN@github.com/usuario/repo.git
```

Esa URL queda en texto plano en `.git/config`, la imprime `git remote -v` y se
filtra en cualquier captura de pantalla o log de CI.

---

## Si el token se filtró

1. Revocalo ya: <https://github.com/settings/personal-access-tokens> → `Revoke`.
2. Creá uno nuevo.
3. `node scripts/setup-git-remote.mjs` de nuevo.

Revocar es instantáneo y no rompe nada del repo: los commits ya subidos quedan.

---

## Trabajo con el colaborador

El repo lo tocan dos personas. Cada una necesita **su propio token** — no se
comparten. El dueño del repo agrega al otro en
`Settings → Collaborators`; con eso su token fine-grained ya puede
seleccionar el repo.

Convención de ramas del proyecto:

```bash
git checkout -b feature/lo-que-estas-haciendo
git push -u origin feature/lo-que-estas-haciendo
```

`app/`, `lib/` y `components/` es la zona de la app; `n8n/` es la de las
automatizaciones. Están separadas a propósito para que casi nunca haya
conflicto.
