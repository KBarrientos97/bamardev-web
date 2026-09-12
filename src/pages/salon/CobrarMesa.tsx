import { useCallback, useRef, useState } from "react";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import PantallaCobro from "../pos/PantallaCobro";
import type { PagoInput } from "../../types";
import type { Mesa } from "../../types/salon";
import { consumoDeMesa } from "./logicaSalon";

/**
 * El mesero cobra su propia mesa.
 *
 * Existe sólo si el negocio prendió la capacidad `mesero_cobra`. Es el modelo
 * de *server banking*: el mesero cobra a su bolsillo y después le liquida al
 * cajero, que aprueba (ver `Entregas`). Lo que lo hace seguro es la matemática
 * del arqueo — la venta suma al efectivo del turno, pero el esperado del cajón
 * **resta** lo que el mesero todavía tiene encima.
 *
 * Reusa `PantallaCobro` del POS en vez de copiarla: el vuelto, el QR y el pago
 * mixto ya están resueltos ahí, y un segundo cobro sería un segundo lugar donde
 * arreglar la plata cada vez que algo cambie. El mesero NO entra al POS —su rol
 * no lo permite— pero esa pantalla no depende del POS: recibe todo por props.
 *
 * No se ofrece fiar: una cuenta por cobrar la abre quien maneja el crédito del
 * negocio, no quien está sirviendo mesas.
 */
export default function CobrarMesa({
  mesa,
  onAtras,
  onCobrada,
}: {
  mesa: Mesa;
  onAtras: () => void;
  onCobrada: (mensaje: string) => void;
}) {
  const formasPago = useApi(() => api.getFormasPago(), []);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  /**
   * La misma clave para todos los reintentos de ESTE cobro.
   *
   * Si el wifi del local se corta justo después de que el backend registró la
   * venta, el reintento llega con la misma clave y no cobra dos veces. Se
   * renueva recién cuando el cobro entró.
   */
  const clienteRequestId = useRef(crypto.randomUUID());

  // Lo mismo que muestra el detalle de la mesa: el consumo que mandó el
  // backend y, si todavía no vino, la suma de las comandas.
  const total = consumoDeMesa(mesa);

  const cobrar = useCallback(
    async (pagos: PagoInput[]) => {
      if (enviando) return;
      setError("");
      setEnviando(true);
      try {
        await api.cobrarMesa(mesa.id, {
          pagos,
          clienteRequestId: clienteRequestId.current,
        });
        clienteRequestId.current = crypto.randomUUID();
        onCobrada(`${mesa.codigo} cobrada · ${fmtMoney(total)}`);
      } catch (e) {
        // El mensaje del backend importa acá: si el negocio apagó la capacidad
        // mientras la pantalla estaba abierta, dice exactamente eso ("en este
        // negocio el cobro lo hace la caja") y el mesero sabe qué hacer.
        setError(e instanceof Error ? e.message : "No se pudo cobrar la mesa");
        setEnviando(false);
      }
    },
    [enviando, mesa.id, mesa.codigo, total, onCobrada],
  );

  return (
    <PantallaCobro
      total={total}
      formasPago={formasPago.datos ?? []}
      onAtras={onAtras}
      onConfirmar={cobrar}
      enviando={enviando}
      error={error || formasPago.error}
    />
  );
}
