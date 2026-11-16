import { useEffect, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import type { AjustesRecibo } from "../../types/menuDigital";
import { apiMenuDigital } from "../apiMenuDigital";
import { aplicaDisenoRecibo, pideDisenoRecibo } from "./reglasRecibo";

export interface ReciboNegocio {
  recibo: AjustesRecibo;
  /** Ruta del logo (relativa al API), o null si no hay. */
  logo: string | null;
  /**
   * Si el negocio guardó su diseño o subió su logo (backend `c3e880f`,
   * 15-nov). Un restaurante sin los extras de las TVs imprime con el diseño
   * sólo con `true` (ver `aplicaDisenoRecibo`). Un backend anterior no lo
   * manda: queda como no configurado, que es lo seguro.
   */
  configurado?: boolean;
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
 * El diseño del recibo y el logo del negocio, o null: el recibo sale como
 * siempre.
 *
 * Con alguno de los extras de pantallas (tickets o menú digital), como hasta
 * el 15-nov. Desde entonces también en todo restaurante, porque «Ticket y
 * recibo» es de base ahí; pero sin los extras se usa sólo si el negocio lo
 * configuró, así el que nunca abrió la pantalla imprime idéntico a antes. En
 * los demás rubros no se pide nada al servidor.
 */
export function useReciboNegocio(): ReciboNegocio | null {
  const { negocio, rubro } = useAuth();
  const features = negocio?.features;
  const pide = pideDisenoRecibo(features, rubro);
  const negocioId = negocio?.id;
  const [valor, setValor] = useState<ReciboNegocio | null>(() =>
    pide && guardado && guardado.negocioId === negocioId ? guardado.valor : null,
  );

  useEffect(() => {
    if (!pide || negocioId == null) return;
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
  }, [pide, negocioId]);

  if (!pide || !valor) return null;
  return aplicaDisenoRecibo(features, rubro, valor.configurado) ? valor : null;
}
