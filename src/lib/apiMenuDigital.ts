import { RECIBO_DE_FABRICA, type AjustesRecibo, type EditorMenu, type PantallaMenu, type PlatoMenu } from "../types/menuDigital";
import { request } from "./api";

/**
 * El menú digital (feature `menu_digital`), el logo del negocio y el diseño
 * del recibo. Aparte de `api.ts` por lo mismo que `apiTickets.ts`.
 */

/** Una ruta pública del API (foto, logo) como URL para un `<img>`: la misma regla que la TV. */
export { urlPublica as urlApi } from "../publico/tv/apiTv";

/**
 * Lo que el servidor todavía no manda, de fábrica. Un campo nuevo del recibo
 * (la letra, 5-nov) llega a la web antes que al backend de QA o de PROD: sin
 * esto el papel salía con `undefined` en vez de con la letra Normal.
 */
const conLoQueFalta = (r: AjustesRecibo): AjustesRecibo => ({ ...RECIBO_DE_FABRICA, ...r });

const conArchivo = (archivo: Blob, nombre: string) => {
  const f = new FormData();
  f.append("archivo", archivo, nombre);
  return f;
};

export const apiMenuDigital = {
  /**
   * `sucursalId` (PLAN-SUCURSAL-TOTAL §10.5): de qué local se ven los precios y la
   * disponibilidad. Sólo lo manda la organización con 2+ locales (quien es de un
   * local ve siempre el suyo, y sin él el backend usa el principal). Sólo la
   * lectura lo acepta: las respuestas de los PATCH vienen del local del usuario.
   */
  editor: (sucursalId?: number | null) =>
    request<EditorMenu>(`/menu-digital${sucursalId != null ? `?sucursalId=${sucursalId}` : ""}`),
  guardarPantallas: (pantallas: PantallaMenu[]) =>
    request<PantallaMenu[]>("/menu-digital/pantallas", { method: "PUT", body: JSON.stringify({ pantallas }) }),
  editarPlato: (
    id: number,
    cambios: Partial<Pick<PlatoMenu, "descripcion" | "etiqueta" | "destacado" | "enMenu">> & { agotado?: boolean },
  ) => request<PlatoMenu>(`/menu-digital/platos/${id}`, { method: "PATCH", body: JSON.stringify(cambios) }),
  subirFoto: (id: number, archivo: Blob) =>
    request<PlatoMenu>(`/menu-digital/platos/${id}/foto`, { method: "POST", body: conArchivo(archivo, "plato.webp") }),
  quitarFoto: (id: number) => request<PlatoMenu>(`/menu-digital/platos/${id}/foto`, { method: "DELETE" }),

  recibo: () =>
    request<{ recibo: AjustesRecibo; logo: string | null }>("/pantallas/recibo").then((x) => ({
      ...x,
      recibo: conLoQueFalta(x.recibo),
    })),
  guardarRecibo: (recibo: Partial<AjustesRecibo>) =>
    request<AjustesRecibo>("/pantallas/recibo", { method: "PATCH", body: JSON.stringify({ recibo }) }).then(
      conLoQueFalta,
    ),
  subirLogo: (archivo: Blob) =>
    request<{ logo: string }>("/pantallas/logo", { method: "POST", body: conArchivo(archivo, "logo.webp") }),
  quitarLogo: () => request<{ logo: null }>("/pantallas/logo", { method: "DELETE" }),
};
