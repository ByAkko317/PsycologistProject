import type { Config } from "tailwindcss";

/** Azúcar para no repetir la sintaxis de canales RGB en cada token. */
const token = (nombre: string) => `rgb(var(--${nombre}) / <alpha-value>)`;

const config: Config = {
  // El tema lo decide la clase `dark` en <html>, no la preferencia del sistema:
  // así el usuario puede elegir explícitamente y su elección persiste.
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: token("brand"),
          fg: token("brand-fg"),
          soft: token("brand-soft"),
        },
        canvas: token("canvas"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
        },
        overlay: token("overlay"),
        fg: {
          DEFAULT: token("fg"),
          muted: token("fg-muted"),
          subtle: token("fg-subtle"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        ok: { DEFAULT: token("ok"), soft: token("ok-soft") },
        warn: { DEFAULT: token("warn"), soft: token("warn-soft") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      borderRadius: {
        // Escala propia: bordes apenas más suaves que los de Tailwind, que en
        // una interfaz clínica se leen más calmos.
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        // Sombras muy bajas. En modo oscuro casi no se ven, y está bien: ahí
        // la jerarquía la da el contraste de superficie, no la sombra.
        card: "0 1px 2px 0 rgb(var(--shadow) / 0.04), 0 1px 3px 0 rgb(var(--shadow) / 0.06)",
        raised:
          "0 2px 4px -1px rgb(var(--shadow) / 0.06), 0 4px 12px -2px rgb(var(--shadow) / 0.08)",
        pop: "0 4px 6px -2px rgb(var(--shadow) / 0.08), 0 12px 24px -4px rgb(var(--shadow) / 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
