import { request } from "./api";

/**
 * Un acceso de despacho (`accesos-despacho` del backend): la cuenta con la que
 * la tablet de la cocina entra sólo a Despacho. No ocupa lugar del plan.
 */
export interface AccesoDespacho {
  id: number;
  usuario: string;
  activo: boolean;
  ultimoLogin: string | null;
  creadoEn: string;
  sucursalId: number | null;
  sucursal: string | null;
}

const enviar = <T>(ruta: string, method: "POST" | "PATCH", cuerpo: object) =>
  request<T>(ruta, { method, body: JSON.stringify(cuerpo) });

export const apiAccesosDespacho = {
  listar: () => request<AccesoDespacho[]>("/accesos-despacho"),
  crear: (datos: { username: string; password: string; sucursalId?: number }) =>
    enviar<AccesoDespacho>("/accesos-despacho", "POST", datos),
  cambiarPassword: (id: number, password: string) =>
    enviar<{ mensaje: string }>(`/accesos-despacho/${id}/password`, "PATCH", { password }),
  cambiarEstado: (id: number, activo: boolean) =>
    enviar<AccesoDespacho>(`/accesos-despacho/${id}/estado`, "PATCH", { activo }),
};
