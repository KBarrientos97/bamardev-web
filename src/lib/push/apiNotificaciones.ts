import { request } from "../api";

/**
 * Cliente de las notificaciones de cada usuario (PLAN-PUSH §10.2). Pasa por
 * `request` como el resto: la sesión vencida y el 403 de licencia valen igual.
 *
 * La lista ya viene filtrada por el backend (rol, permisos, features, rubro):
 * la pantalla no decide qué avisos le tocan a quién, sólo los muestra.
 */
export type GrupoNotificacion = "CAJA" | "VENTAS" | "COBROS" | "CUENTA" | "SEGURIDAD";

export interface PreferenciaNotificacion {
  tipo: string;
  grupo: GrupoNotificacion;
  nombre: string;
  descripcion: string;
  /** false = no se puede apagar (hoy, la licencia suspendida). */
  apagable: boolean;
  activa: boolean;
}

/** Lo que devuelve "Enviarme una de prueba". */
export interface ResultadoPrueba {
  dispositivos: number;
  enviadas: number;
  invalidas: number;
  fallidas: number;
}

export const apiNotificaciones = {
  preferencias: () => request<PreferenciaNotificacion[]>("/notificaciones/preferencias"),

  /** Devuelve la lista entera, ya con el cambio. */
  cambiar: (tipo: string, activa: boolean) =>
    request<PreferenciaNotificacion[]>(`/notificaciones/preferencias/${encodeURIComponent(tipo)}`, {
      method: "PUT",
      body: JSON.stringify({ activa }),
    }),

  /** Una push de prueba a todos los equipos de este usuario. */
  prueba: () => request<ResultadoPrueba>("/auth/dispositivos-push/prueba", { method: "POST" }),
};
