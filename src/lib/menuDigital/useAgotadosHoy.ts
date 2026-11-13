import { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { apiMenuDigital } from "../apiMenuDigital";

/** Cada cuánto la caja vuelve a mirar qué se agotó (lo marca el encargado en el Menú digital). */
const CADA_MS = 60_000;

const NINGUNO = new Set<number>();

/**
 * Los platos marcados "agotado hoy" en el Menú digital (extra `menu_digital`):
 * la caja no los ofrece, igual que un producto sin stock. Un elaborado no
 * tiene stock que llegue a cero, así que es la única forma de frenar la venta
 * de lo que ya no hay (la TV ya lo muestra tachado).
 *
 * "Agotado hoy" es de cada local (como el stock): `sucursalId` es el de la caja.
 * Sin él el backend usa el del usuario o el principal, que es lo de siempre.
 *
 * Sin el extra no pide nada y devuelve un conjunto vacío: la caja de siempre.
 */
export function useAgotadosHoy(sucursalId?: number | null): Set<number> {
  const { negocio } = useAuth();
  const activo = !!negocio?.features?.includes("menu_digital");
  const [ids, setIds] = useState<Set<number>>(NINGUNO);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    // Lo que había es de otro local: no se muestra mientras llega la lista del nuevo.
    setIds(NINGUNO);
    const traer = () => {
      if (document.hidden) return;
      apiMenuDigital
        .agotadosHoy(sucursalId)
        .then((r) => vivo && setIds(new Set(r.productoIds)))
        .catch(() => {
          // Sin conexión se queda con lo último: el cobro no se frena por esto.
        });
    };
    traer();
    const id = setInterval(traer, CADA_MS);
    document.addEventListener("visibilitychange", traer);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", traer);
    };
  }, [activo, sucursalId]);

  return activo ? ids : NINGUNO;
}
