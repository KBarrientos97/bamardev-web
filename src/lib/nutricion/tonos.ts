import type { TonoGrado } from "./tipos";

/**
 * Los colores de cada tono de grado (el `tono` de un rango del catálogo): el
 * fondo suave, el texto, la barra y el anillo de la fila elegida. Bajo en
 * azul, bien en verde, alerta en ámbar y alto en rojo, como los chips de
 * estado del resto de la app.
 */
export const TONO: Record<TonoGrado, { suave: string; texto: string; barra: string; anillo: string }> = {
  bajo: { suave: "bg-info-bg", texto: "text-info-text", barra: "bg-info-text", anillo: "ring-info-text/40" },
  bien: { suave: "bg-emerald-50", texto: "text-emerald-700", barra: "bg-emerald-500", anillo: "ring-emerald-600/40" },
  alerta: { suave: "bg-warning-bg", texto: "text-warning-text", barra: "bg-warning", anillo: "ring-warning-text/40" },
  alto: { suave: "bg-danger-bg", texto: "text-danger-text", barra: "bg-danger", anillo: "ring-danger-text/40" },
};

/** Los mismos tonos en color (para el PDF): el fondo suave y el texto de cada uno, los del tema de la app. */
export const TONO_COLOR: Record<TonoGrado, { suave: string; texto: string }> = {
  bajo: { suave: "#DBEAFE", texto: "#1E40AF" },
  bien: { suave: "#ECFDF5", texto: "#047857" },
  alerta: { suave: "#FEF3C7", texto: "#B45309" },
  alto: { suave: "#FEE2E2", texto: "#B91C1C" },
};

/**
 * La escala del IMC de la hoja de la doctora (el medidor en semicírculo y la
 * barra del PDF), de la punta izquierda a la derecha, con el texto que se lee
 * sobre cada color. No son los colores del negocio: se lee igual en todos lados.
 */
export const ESCALA_IMC = [
  { fondo: "#7DD3FC", texto: "#0C4A6E" }, // celeste: bajo peso
  { fondo: "#2563EB", texto: "#FFFFFF" }, // azul: peso normal
  { fondo: "#FDBA74", texto: "#7C2D12" }, // naranja claro: sobrepeso
  { fondo: "#FB923C", texto: "#431407" }, // naranja: obesidad grado 1
  { fondo: "#C2410C", texto: "#FFFFFF" }, // naranja oscuro: grado 2
  { fondo: "#DC2626", texto: "#FFFFFF" }, // rojo: grado 3
];

/** El color del tramo i de n: con otra cantidad de grados, se reparte la misma escala. */
export const colorDeEscalaImc = (i: number, n: number) => ESCALA_IMC[n <= 1 ? 0 : Math.round((i * (ESCALA_IMC.length - 1)) / (n - 1))];
