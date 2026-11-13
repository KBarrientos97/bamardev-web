import { request } from "./api";

/** Lo que muestra una TV conectada: la de tickets o una del menú digital. */
export type MuestraTv = "TICKETS" | "MENU";

/**
 * Un televisor del local conectado con código (`pantallas/televisores` del
 * backend, Kevin 4-nov): la TV abre `/tv`, muestra un código y se conecta
 * desde acá. Después se le cambia lo que muestra sin tocarla.
 */
export interface TelevisorLocal {
  id: number;
  nombre: string;
  muestra: MuestraTv;
  menu: number | null;
  /** El nombre de la TV del menú que muestra ("TV 1 · Pollos"). */
  menuNombre: string | null;
  sucursalId: number | null;
  conectadaEn: string | null;
  /** Preguntó en el último minuto y medio: está prendida. */
  prendida: boolean;
}

/** Algo que quien mira la lista le puede poner a una TV (según extras y permisos). */
export interface OpcionTv {
  muestra: MuestraTv;
  menu: number | null;
  nombre: string;
}

const enviar = <T>(ruta: string, method: "POST" | "PATCH", cuerpo: object) =>
  request<T>(ruta, { method, body: JSON.stringify(cuerpo) });

export const apiTelevisores = {
  listar: () => request<{ televisores: TelevisorLocal[]; opciones: OpcionTv[] }>("/pantallas/televisores"),
  /**
   * `sucursalId` (PLAN-SUCURSAL-TOTAL §10.3): el local donde queda la TV. Sólo lo
   * manda la organización con 2+ locales; sin él, el backend la deja en el local
   * de quien la conecta (o en el principal).
   */
  conectar: (datos: {
    codigo: string;
    muestra: MuestraTv;
    menu?: number;
    nombre?: string;
    sucursalId?: number;
  }) =>
    enviar<TelevisorLocal>("/pantallas/televisores", "POST", datos),
  cambiar: (id: number, datos: { muestra?: MuestraTv; menu?: number; nombre?: string }) =>
    enviar<TelevisorLocal>(`/pantallas/televisores/${id}`, "PATCH", datos),
  desconectar: (id: number) => request<{ ok: true }>(`/pantallas/televisores/${id}`, { method: "DELETE" }),
};

/** La opción que corresponde a lo que muestra una TV, para marcarla en el selector. */
export function claveOpcion(o: { muestra: MuestraTv; menu: number | null }): string {
  return o.muestra === "MENU" ? `MENU:${o.menu}` : "TICKETS";
}
