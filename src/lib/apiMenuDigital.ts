import type { AjustesRecibo, EditorMenu, PantallaMenu, PlatoMenu } from "../types/menuDigital";
import { request } from "./api";

/**
 * El menú digital (feature `menu_digital`), el logo del negocio y el diseño
 * del recibo. Aparte de `api.ts` por lo mismo que `apiTickets.ts`.
 */

/** Una ruta pública del API (foto, logo) como URL para un `<img>`: la misma regla que la TV. */
export { urlPublica as urlApi } from "../publico/tv/apiTv";

const conArchivo = (archivo: Blob, nombre: string) => {
  const f = new FormData();
  f.append("archivo", archivo, nombre);
  return f;
};

export const apiMenuDigital = {
  editor: () => request<EditorMenu>("/menu-digital"),
  guardarPantallas: (pantallas: PantallaMenu[]) =>
    request<PantallaMenu[]>("/menu-digital/pantallas", { method: "PUT", body: JSON.stringify({ pantallas }) }),
  editarPlato: (
    id: number,
    cambios: Partial<Pick<PlatoMenu, "descripcion" | "etiqueta" | "destacado" | "enMenu">> & { agotado?: boolean },
  ) => request<PlatoMenu>(`/menu-digital/platos/${id}`, { method: "PATCH", body: JSON.stringify(cambios) }),
  subirFoto: (id: number, archivo: Blob) =>
    request<PlatoMenu>(`/menu-digital/platos/${id}/foto`, { method: "POST", body: conArchivo(archivo, "plato.webp") }),
  quitarFoto: (id: number) => request<PlatoMenu>(`/menu-digital/platos/${id}/foto`, { method: "DELETE" }),

  recibo: () => request<{ recibo: AjustesRecibo; logo: string | null }>("/pantallas/recibo"),
  guardarRecibo: (recibo: Partial<AjustesRecibo>) =>
    request<AjustesRecibo>("/pantallas/recibo", { method: "PATCH", body: JSON.stringify({ recibo }) }),
  subirLogo: (archivo: Blob) =>
    request<{ logo: string }>("/pantallas/logo", { method: "POST", body: conArchivo(archivo, "logo.webp") }),
  quitarLogo: () => request<{ logo: null }>("/pantallas/logo", { method: "DELETE" }),
};
