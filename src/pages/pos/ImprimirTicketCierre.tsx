import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";
import type { ReporteCierreProductos } from "../../types";
import { useImpresionTexto } from "./ImprimirTicketTexto";
import { textoTicketCierre, type DatosTicketCierre } from "./ticketCierre";

/**
 * El botón «Imprimir ticket» del cierre de caja (PLAN-ELGANADERO-16NOV §4.2).
 *
 * Usa el mismo mecanismo que el recibo de 58 mm: un `#area-impresion` que es
 * lo ÚNICO visible al imprimir (index.css), con el rollo fijado por
 * `--ancho-ticket` (48 mm útiles de los 58) y el diálogo de impresión del
 * navegador. Sale sólo con el botón, nunca solo.
 *
 * SIEMPRE en negrita y en negro puro (CONTRATO-DELIVERY-FULL-18NOV, ítem 2):
 * en la térmica el texto normal salía claro. Antes dependía de «Letra gruesa»
 * de Ticket y recibo; ahora va siempre (ver `ImprimirTicketTexto`).
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
  const { imprimir, papel } = useImpresionTexto("ticket-cierre");
  const alTocar = () => imprimir(textoTicketCierre(productos, datos));

  return (
    <>
      {fila ? (
        <button
          type="button"
          onClick={alTocar}
          className={`flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted ${className}`}
        >
          <Icon name="printer" size={17} />
          Imprimir ticket
        </button>
      ) : (
        <Boton variante="ghost" icono="printer" onClick={alTocar} className={className}>
          Imprimir ticket
        </Boton>
      )}
      {papel}
    </>
  );
}
