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
