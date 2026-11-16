import { useEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync, createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";
import { useReciboNegocio } from "../../lib/menuDigital/useReciboNegocio";
import type { ReporteCierreProductos } from "../../types";
import { textoTicketCierre, type DatosTicketCierre } from "./ticketCierre";

/**
 * El botón «Imprimir ticket» del cierre de caja (PLAN-ELGANADERO-16NOV §4.2).
 *
 * Usa el mismo mecanismo que el recibo de 58 mm: un `#area-impresion` que es
 * lo ÚNICO visible al imprimir (index.css), con el rollo fijado por
 * `--ancho-ticket` (48 mm útiles de los 58) y el diálogo de impresión del
 * navegador. «Letra gruesa» de Ticket y recibo también aplica (`papel-negrita`).
 * Sale sólo con el botón, nunca solo.
 *
 * El papel se monta recién al tocar el botón y se retira al terminar la
 * impresión: así nunca hay dos `#area-impresion` a la vez (el cierre y el
 * modal de «Productos vendidos» tienen cada uno su botón) ni un ticket
 * escondido en el DOM de cada pantalla.
 */
export default function ImprimirTicketCierre({
  productos,
  datos,
  className = "",
  fila = false,
}: {
  productos: ReporteCierreProductos;
  datos: DatosTicketCierre;
  className?: string;
  /** Como el botón de «Productos vendidos» del cierre: de lado a lado, con la letra del renglón. */
  fila?: boolean;
}) {
  const conf = useReciboNegocio();
  const [imprimiendo, setImprimiendo] = useState(false);
  const alTerminar = useRef<(() => void) | null>(null);

  // Si la pantalla se cierra con el diálogo abierto, no queda el oyente colgado.
  useEffect(
    () => () => {
      if (alTerminar.current) window.removeEventListener("afterprint", alTerminar.current);
    },
    [],
  );

  function imprimir() {
    const fin = () => {
      window.removeEventListener("afterprint", fin);
      alTerminar.current = null;
      setImprimiendo(false);
    };
    alTerminar.current = fin;
    window.addEventListener("afterprint", fin);
    // El papel tiene que estar en el DOM antes de que el navegador arme la impresión.
    flushSync(() => setImprimiendo(true));
    window.print();
  }

  return (
    <>
      {fila ? (
        <button
          type="button"
          onClick={imprimir}
          className={`flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted ${className}`}
        >
          <Icon name="printer" size={17} />
          Imprimir ticket
        </button>
      ) : (
        <Boton variante="ghost" icono="printer" onClick={imprimir} className={className}>
          Imprimir ticket
        </Boton>
      )}
      {imprimiendo &&
        createPortal(
          <article
            id="area-impresion"
            data-testid="ticket-cierre"
            className={`hidden print:block${conf?.recibo.negrita === true ? " papel-negrita" : ""}`}
            style={{ "--ancho-ticket": "48mm" } as CSSProperties}
          >
            {/* 32 columnas: con una letra de ancho fijo de 2,4 mm el renglón mide ~46 mm y entra en los 48 del rollo. */}
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre",
                fontFamily: '"Courier New", Courier, "Liberation Mono", monospace',
                fontSize: "2.4mm",
                lineHeight: 1.3,
              }}
            >
              {textoTicketCierre(productos, datos)}
            </pre>
          </article>,
          document.body,
        )}
    </>
  );
}
