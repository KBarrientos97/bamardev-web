import { useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { AvisoOk, Cargando, Confirmar, ErrorMsg, useAviso } from "../../components/ui";
import { apiTickets } from "../../lib/apiTickets";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { ConfigTickets as Config, NumeracionTickets } from "../../types/tickets";
import { Segmentado, SiNo, Tarjeta } from "./piezas";

/**
 * Configuración › Tickets y despacho (pedido del 10-nov).
 *
 * Nació de una pollería con dos cajeras (mañana y tarde, cada una con su
 * usuario) que todavía se está acostumbrando a vender y no usa la pantalla de
 * Despacho: canta el número que sale en el recibo. Con los pedidos esperando
 * en Despacho, ninguna podía cerrar sesión. Dos decisiones del dueño:
 *
 *  - **Usar Despacho**. Apagado, el número sigue saliendo en el recibo y la
 *    comanda, pero el pedido nace entregado y nadie se traba. Lo que esperaba
 *    al apagarlo se da por entregado (el backend dice cuántos).
 *  - **Cuándo vuelve a 001**: cada día (lo de siempre y lo más común) o cada
 *    turno de caja.
 *
 * Se guarda al tocar, como el resto de la configuración de las pantallas.
 * Mientras un cambio viaja los controles no responden: dos toques seguidos
 * mandaban dos PATCH y el segundo podía pisar al primero con lo de antes.
 */
const NUMERACIONES: { valor: NumeracionTickets; texto: string }[] = [
  { valor: "DIARIA", texto: "Cada día" },
  { valor: "POR_TURNO", texto: "Cada turno de caja" },
];

const TEXTO_NUMERACION: Record<NumeracionTickets, string> = {
  DIARIA:
    "El número sigue de una cajera a la otra y vuelve a 001 a las 6 de la mañana. Es lo más común: en el día no se repite ningún número.",
  POR_TURNO:
    "Cada caja que se abre empieza en 001, como el número de venta (V-000001), y también vuelve a 001 a las 6 de la mañana. Si en el local cobran dos cajas a la vez, cada una lleva su cuenta y los números se repiten: ahí conviene «Cada día».",
};

function textoEntregados(n: number): string {
  return n === 1
    ? "Se dio por entregado 1 pedido que esperaba en Despacho."
    : `Se dieron por entregados ${n} pedidos que esperaban en Despacho.`;
}

export default function ConfigTickets() {
  const { fijarUsaDespacho } = useAuth();
  const estado = useApi(() => apiTickets.config(), []);
  const [apagando, setApagando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(10000);

  const guardar = async (cambios: Partial<Config>) => {
    if (guardando) return;
    setGuardando(true);
    setError("");
    try {
      const r = await apiTickets.guardarConfig(cambios);
      estado.setDatos({ usaDespacho: r.usaDespacho, numeracion: r.numeracion });
      // "Despacho" se va (o vuelve) del menú de quien lo cambió ya mismo.
      fijarUsaDespacho(r.usaDespacho);
      if (cambios.usaDespacho === false) {
        setAviso(
          "Listo: el despacho está apagado." + (r.entregados > 0 ? ` ${textoEntregados(r.entregados)}` : ""),
        );
      } else if (cambios.usaDespacho === true) {
        setAviso("Listo: los pedidos que se cobren desde ahora esperan en Despacho.");
      } else {
        setAviso(
          r.numeracion === "POR_TURNO"
            ? "Listo: cada caja que se abra empieza en 001."
            : "Listo: el número vuelve a 001 cada día a las 6 de la mañana.",
        );
      }
    } catch (e) {
      // El control queda como estaba: `estado.datos` no se tocó.
      setError(e instanceof Error ? e.message : "No se pudo guardar el cambio");
    } finally {
      setGuardando(false);
      setApagando(false);
    }
  };

  const datos = estado.datos;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Tickets y despacho"
        subtitulo="Cómo se numeran los pedidos y si se usa la pantalla de Despacho."
      />
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : (
        <>
          <Tarjeta titulo="Pantalla de despacho">
            <SiNo
              activo={datos.usaDespacho}
              onCambiar={(prender) => {
                if (guardando) return;
                if (prender) void guardar({ usaDespacho: true });
                else setApagando(true);
              }}
              etiqueta="Usar Despacho"
              detalle={
                datos.usaDespacho
                  ? "Cada pedido con número queda en Despacho hasta que se marca entregado, y la TV lo llama. La cajera no puede cerrar sesión con pedidos sin entregar."
                  : "El número sigue saliendo en el recibo y en la comanda, pero los pedidos no quedan esperando en Despacho: nadie tiene que marcarlos entregados y la cajera cierra sesión sin trabas."
              }
            />
          </Tarjeta>

          <Tarjeta titulo="Numeración de los tickets">
            <Segmentado<NumeracionTickets>
              etiqueta="Cuándo vuelve a 001 el número del ticket"
              opciones={NUMERACIONES}
              valor={datos.numeracion}
              onCambiar={(numeracion) => {
                if (guardando || numeracion === datos.numeracion) return;
                void guardar({ numeracion });
              }}
            />
            <p className="mt-3 text-[13px] text-texto-2">{TEXTO_NUMERACION[datos.numeracion]}</p>
            <p className="mt-2 text-[12px] text-texto-3">
              El cambio no reinicia el turno que está abierto: sigue con su número.
            </p>
          </Tarjeta>
        </>
      )}

      <Confirmar
        abierto={apagando}
        titulo="¿Dejar de usar Despacho?"
        texto="Los pedidos que quedan en Despacho se dan por entregados y los que se cobren desde ahora ya no esperan ahí. El número sigue saliendo en el recibo. Lo podés volver a prender cuando quieras."
        etiquetaOk="Apagar"
        procesando={guardando}
        onCancel={() => setApagando(false)}
        onOk={() => void guardar({ usaDespacho: false })}
      />
    </div>
  );
}
