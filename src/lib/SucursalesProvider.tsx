import { useMemo, type ReactNode } from "react";
import { api } from "./api";
import { FuenteSucursalesCtx, crearFuenteSucursales } from "./sucursalesCompartidas";

/**
 * Comparte la lista de locales entre todos los `useSucursales` de la sesión.
 * Va dentro del `AuthProvider`; la clave de la sesión la manda cada hook
 * (negocio + usuario), así que al entrar con otro usuario no se reusa la lista
 * del anterior.
 */
export function SucursalesProvider({ children }: { children: ReactNode }) {
  const fuente = useMemo(() => crearFuenteSucursales(() => api.getSucursales()), []);
  return <FuenteSucursalesCtx.Provider value={fuente}>{children}</FuenteSucursalesCtx.Provider>;
}
