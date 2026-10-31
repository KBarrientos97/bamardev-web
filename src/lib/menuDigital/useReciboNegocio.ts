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
 * Lo guardado, por negocio, para no esperarlo en cada venta: el recibo se
 * dibuja después de cada cobro, y un pedido por cobro sería una espera más
 * con el cliente adelante. Se pinta con esto y, pasada la vigencia, se vuelve
 * a pedir por detrás; guardar desde Configuración en el mismo equipo lo
 * reemplaza en el acto (`olvidarReciboNegocio`).
 */
let guardado: { negocioId: number; valor: ReciboNegocio; desde: number } | null = null;

/**
 * Sin vencimiento, la pestaña de la caja (abierta todo el día) seguía con el
 * diseño de la mañana: el dueño prendía "Imprimir solo al cobrar" o pasaba a
 * 58 mm desde su celular y la caja no se enteraba hasta un F5.
 */
const VIGENCIA_MS = 60_000;

export function olvidarReciboNegocio(valor?: ReciboNegocio, negocioId?: number) {
  guardado = valor && negocioId != null ? { negocioId, valor, desde: Date.now() } : null;
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
    const previo = guardado && guardado.negocioId === negocioId ? guardado : null;
    if (previo) {
      setValor(previo.valor);
      if (Date.now() - previo.desde < VIGENCIA_MS) return;
    }
    let vivo = true;
    apiMenuDigital
      .recibo()
      .then((r) => {
        guardado = { negocioId, valor: r, desde: Date.now() };
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
