import { useCallback, useState } from "react";
import { api } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import PantallaCobro from "../pos/PantallaCobro";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import type { PagoInput } from "../../types";
import type { Mesa } from "../../types/salon";
import { avisoCuentaCambiada, cuerpoCobroDeMesa, esCajaCerrada, esCuentaCambiada } from "./cobroDeMesa";
import { ElegirCajaDeCuenta } from "./ElegirCajaDeCuenta";
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
 *
 * ¿A qué caja va la cuenta? Si en el local de la mesa hay UNA caja abierta, a
 * ésa, sin preguntar nada. Si hay varias (de distintos usuarios), el mesero
 * elige: la plata que junta se la entrega a ese cajero y el cobro entra a su
 * arqueo. Sin elegir no se puede cobrar.
 */
export default function CobrarMesa({
  mesa,
  sucursalId,
  onAtras,
  onCobrada,
  onCuentaCambiada,
}: {
  mesa: Mesa;
  /**
   * El local de la mesa, si el panel ya lo sabe (la mesa que vuelve de separar
   * o unir no lo trae). Sin esto se usa el de la mesa y, en su defecto, el del
   * propio mesero.
   */
  sucursalId?: number | null;
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
  const { usuario } = useAuth();
  const formasPago = useApi(() => api.getFormasPago(), []);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Las cajas abiertas en el local de la mesa. Si no se pueden leer (sin señal,
  // un backend anterior), no se pregunta: el cobro va a la caja del local como
  // siempre, que es lo que el backend hace sin `cajaId`.
  const sede = sucursalId ?? mesa.sucursalId ?? usuario?.sucursalId ?? null;
  const cajasDelLocal = useApi(
    () =>
      sede != null
        ? api.cajasDelLocal(sede).catch(() => ({ cajas: [] }))
        : Promise.resolve({ cajas: [] }),
    [sede],
    { clave: sede },
  );
  const cajas = cajasDelLocal.datos?.cajas ?? [];
  const hayQueElegir = cajas.length > 1;
  const [cajaElegida, setCajaElegida] = useState<number | null>(null);
  // Una caja que ya no está en la lista (se cerró mientras tanto) no vale.
  const cajaId = hayQueElegir && cajas.some((c) => c.id === cajaElegida) ? cajaElegida : null;
  // Mientras la lista no llegó no se sabe si hay que preguntar: confirmar
  // antes dejaba al mesero cobrar sin enterarse de que había que elegir.
  const leyendoCajas = sede != null && cajasDelLocal.cargando && cajasDelLocal.datos == null;
  const faltaElegir = hayQueElegir && cajaId == null;

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
      if (faltaElegir) {
        setError("Elegí a qué caja va esta cuenta antes de cobrar.");
        return;
      }
      setError("");
      setEnviando(true);
      try {
        await api.cobrarMesa(
          mesa.id,
          cuerpoCobroDeMesa(
            total,
            pagos,
            extra?.propinaMesa,
            intento.actual(`mesa:${mesa.id}`),
            cajaId,
          ),
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
        // La caja elegida se cerró mientras el mesero cobraba: se vuelve a leer
        // cuáles hay, se avisa y se le pide elegir de nuevo. El cobro armado
        // (lo recibido, la propina) queda en pantalla; la clave del intento
        // sigue siendo la misma porque ese cobro no llegó a registrarse.
        if (cajaId != null && esCajaCerrada(e)) {
          setCajaElegida(null);
          cajasDelLocal.recargar();
          setError(`${e instanceof Error ? e.message : "La caja ya no está abierta."} Elegí otra caja.`);
          setEnviando(false);
          return;
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
    [enviando, faltaElegir, cajaId, cajasDelLocal, mesa.id, mesa.codigo, total, intento, onCobrada, onCuentaCambiada],
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
      bloqueado={leyendoCajas || faltaElegir}
      destino={
        hayQueElegir && (
          <ElegirCajaDeCuenta cajas={cajas} elegida={cajaId} onElegir={setCajaElegida} />
        )
      }
    />
  );
}
