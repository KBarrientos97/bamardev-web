import { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import type { AjustesRecibo } from "../../types/menuDigital";
import { apiMenuDigital } from "../apiMenuDigital";

export interface ReciboNegocio {
  recibo: AjustesRecibo;
  /** Ruta del logo (relativa al API), o null si no hay. */
  logo: string | null;
}

/**
 * Lo guardado, por negocio, para no pedirlo en cada venta: el recibo se
 * dibuja después de cada cobro, y un pedido por cobro sería una espera más
 * con el cliente adelante. Se vuelve a pedir al guardar desde Configuración
 * (`olvidarReciboNegocio`) o al recargar la página.
 */
let guardado: { negocioId: number; valor: ReciboNegocio } | null = null;

export function olvidarReciboNegocio(valor?: ReciboNegocio, negocioId?: number) {
  guardado = valor && negocioId != null ? { negocioId, valor } : null;
}

/**
 * El diseño del recibo y el logo del negocio, sólo si tiene alguno de los
 * extras de pantallas (tickets o menú digital). Sin ellos devuelve null y el
 * recibo sale como siempre, sin pedir nada al servidor.
 */
export function useReciboNegocio(): ReciboNegocio | null {
  const { negocio } = useAuth();
  const features = negocio?.features ?? [];
  const activo = features.includes("tickets_pedido") || features.includes("menu_digital");
  const negocioId = negocio?.id;
  const [valor, setValor] = useState<ReciboNegocio | null>(() =>
    activo && guardado && guardado.negocioId === negocioId ? guardado.valor : null,
  );

  useEffect(() => {
    if (!activo || negocioId == null) return;
    if (guardado && guardado.negocioId === negocioId) {
      setValor(guardado.valor);
      return;
    }
    let vivo = true;
    apiMenuDigital
      .recibo()
      .then((r) => {
        guardado = { negocioId, valor: r };
        if (vivo) setValor(r);
      })
      .catch(() => {
        // Sin el diseño, el recibo sale como siempre: no se frena un cobro por esto.
      });
    return () => {
      vivo = false;
    };
  }, [activo, negocioId]);

  return activo ? valor : null;
}
