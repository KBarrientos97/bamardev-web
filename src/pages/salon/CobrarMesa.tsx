import { useCallback, useState } from "react";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import PantallaCobro from "../pos/PantallaCobro";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import type { PagoInput } from "../../types";
import type { Mesa } from "../../types/salon";
import { avisoCuentaCambiada, cuerpoCobroDeMesa, esCuentaCambiada } from "./cobroDeMesa";
import { consumoDeMesa, etiquetaMesa } from "./logicaSalon";

/**
 * El mesero cobra su propia mesa.
 *
 * Existe sólo si el negocio prendió la capacidad `mesero_cobra`. Es el modelo
 * de *server banking*: el mesero cobra a su bolsillo y después le liquida al
 * cajero, que aprueba (ver `Entregas`). Lo que lo hace seguro es la matemática
 * del arqueo — la venta suma al efectivo del turno, pero el esperado del cajón
 * **resta** lo que el mesero todavía tiene encima — y el aviso de cuánto
 * efectivo se queda, que `PantallaCobro` le muestra antes de cobrar.
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
  onCuentaCambiada,
}: {
  mesa: Mesa;
  onAtras: () => void;
  /**
   * La mesa quedó cobrada. Llega releída (PAGADA, con su cobro) para abrirle
   * el recibo al cliente, o null si no se pudo releer: el cobro igual entró.
   */
  onCobrada: (mensaje: string, cobrada: Mesa | null) => void;
  /**
   * La cuenta cambió mientras se cobraba (el mesero de al lado le sumó un
   * pedido). Llega la mesa recargada, para volver a mirarla antes de cobrar.
   */
  onCuentaCambiada: (mesa: Mesa, aviso: string) => void;
}) {
  const formasPago = useApi(() => api.getFormasPago(), []);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  /**
   * La misma clave para todos los reintentos de ESTE cobro: si el wifi del
   * local se corta justo después de que el backend registró la venta, el
   * reintento no cobra dos veces. Se renueva recién cuando el cobro entró.
   */
  const intento = useIntentoDeCobro();

  // El total con el que se abrió el cobro, congelado: es el que el mesero le
  // cantó al cliente, y viaja como `totalEsperado` para que el backend avise
  // si la mesa cambió en el medio en vez de cobrar otro número.
  const total = consumoDeMesa(mesa);

  const cobrar = useCallback(
    async (pagos: PagoInput[], extra?: { propinaMesa?: number }) => {
      if (enviando) return;
      setError("");
      setEnviando(true);
      try {
        await api.cobrarMesa(
          mesa.id,
          cuerpoCobroDeMesa(total, pagos, extra?.propinaMesa, intento.actual(`mesa:${mesa.id}`)),
        );
      } catch (e) {
        // Le sumaron algo a la mesa mientras cobraba: se vuelve a ella,
        // recargada, para mirar la cuenta nueva con el cliente. Cobrar acá
        // con el total recalculado salteaba la regla de no cobrar con platos
        // sin servir, que es justo lo que suele traer el pedido nuevo.
        if (esCuentaCambiada(e)) {
          const recargada = await api.mesa(mesa.id).catch(() => null);
          if (recargada) {
            setEnviando(false);
            onCuentaCambiada(recargada, avisoCuentaCambiada(recargada, "mesero"));
            return;
          }
        }
        // El mensaje del backend importa acá: si el negocio apagó la capacidad
        // mientras la pantalla estaba abierta, dice exactamente eso ("en este
        // negocio el cobro lo hace la caja") y el mesero sabe qué hacer.
        setError(e instanceof Error ? e.message : "No se pudo cobrar la mesa");
        setEnviando(false);
        return;
      }
      intento.registrado();
      // El cliente acaba de pagar y el mesero está al lado: lo que sigue es
      // darle el recibo, no volver al salón a buscarlo (como en la app). El
      // recibo se arma con la mesa ya cobrada, así que se relee.
      const cobrada = await api.mesa(mesa.id).catch(() => null);
      onCobrada(`${mesa.codigo} cobrada · ${fmtMoney(total)}`, cobrada);
    },
    [enviando, mesa.id, mesa.codigo, total, intento, onCobrada, onCuentaCambiada],
  );

  return (
    <PantallaCobro
      total={total}
      subtitulo={etiquetaMesa(mesa)}
      formasPago={formasPago.datos ?? []}
      onAtras={onAtras}
      onConfirmar={cobrar}
      enviando={enviando}
      error={error || formasPago.error}
      cobroDeMesa="mesero"
    />
  );
}
