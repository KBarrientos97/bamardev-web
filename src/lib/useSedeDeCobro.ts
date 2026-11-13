import { useEffect, useState } from "react";
import { api } from "./api";
import { esUnLocal, modoDeSucursal } from "./useSucursales";
import { useAuth } from "../store/AuthContext";

/**
 * La sucursal en la que se está cobrando, para pedir el QR de ESA sede.
 *
 * Con "Un QR para cada sucursal" el backend le da a quien es de un local el de
 * su sede sin que lo pida; a quien es de la organización le da el general salvo
 * que le diga cuál. Una organización cobra en la sede de su caja abierta, así
 * que sale de ahí (`/caja/actual`).
 *
 * Sólo trabaja para la organización de un negocio con 2+ locales
 * (`modoDeSucursal`, desde la sesión, sin red): para todos los demás —un solo
 * local, o atado a uno— devuelve `{ sedeId: null, listo: true }` en el acto, sin
 * una sola llamada ni un solo cambio de estado (el cobro no se vuelve a
 * dibujar por esto), y el QR se pide como siempre.
 *
 * `listo` es falso mientras la organización espera su caja: pedir el QR antes
 * traería el general y lo pintaría un instante.
 */
export function useSedeDeCobro(): { sedeId: number | null; listo: boolean } {
  const { usuario, negocio } = useAuth();
  const organizacion =
    modoDeSucursal({
      asignado: usuario?.sucursalId != null,
      unLocal: esUnLocal(negocio),
      locales: negocio?.sucursalesActivas,
    }) === "organizacion";
  // undefined = todavía no llegó la caja; null = sin caja (o no se pudo saber).
  const [sede, setSede] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!organizacion) return;
    let vivo = true;
    api
      .cajaActual()
      .then((r) => {
        if (vivo) setSede(r?.caja?.almacenId ?? null);
      })
      .catch(() => {
        if (vivo) setSede(null);
      });
    return () => {
      vivo = false;
    };
  }, [organizacion]);

  if (!organizacion) return { sedeId: null, listo: true };
  return { sedeId: sede ?? null, listo: sede !== undefined };
}
