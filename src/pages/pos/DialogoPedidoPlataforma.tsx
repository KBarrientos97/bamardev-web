import { useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import { NOMBRE_PLATAFORMA, type Plataforma } from "../../lib/pedidosPlataforma/tipos";
import { useCabeceraDelPapel, useImpresionTexto, VistaTicketTexto } from "./ImprimirTicketTexto";
import { textoTicketPlataforma, type PedidoParaImprimir } from "./ticketPlataforma";

/**
 * Confirmar un pedido de Yango o PedidosYa tomado desde el POS
 * (PLAN-PEDIDOS-PLATAFORMA §5). No se cobra: la app de delivery le cobra al
 * cliente y le paga al local después, así que acá sólo se anota lo que salió
 * y, opcionalmente, el N° con que la app lo conoce (sirve para cruzarlo a
 * mano con su liquidación).
 *
 * Se abre con el carrito armado. «Registrar» no cierra el diálogo por su
 * cuenta si falla: el 4xx del servidor (una feature apagada, un producto que
 * ya no existe) se dice acá, con el carrito intacto, para corregir o volver.
 */

export interface LineaDelPedido {
  clave: number | string;
  nombre: string;
  cantidad: number;
  /** El precio de UNA unidad con sus toppings extra, para que el total cuadre. */
  precio: number;
  /** Los toppings del vaso en una línea («+ Oreo, Chubi»), si los lleva. */
  agregados?: string;
}

/** El N° de la app: el backend lo guarda hasta 64 caracteres. */
const MAX_CODIGO = 64;

export default function DialogoPedidoPlataforma({
  plataforma,
  lineas,
  total,
  onClose,
  onRegistrar,
}: {
  plataforma: Plataforma;
  lineas: LineaDelPedido[];
  total: number;
  onClose: () => void;
  /** Si lanza, el mensaje se muestra y el diálogo sigue abierto. */
  onRegistrar: (codigoExterno: string | undefined) => Promise<void>;
}) {
  const nombre = NOMBRE_PLATAFORMA[plataforma];
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function registrar() {
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      await onRegistrar(codigo.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pedido.");
      setEnviando(false);
    }
    // Registrado: quien lo abrió lo cierra y vacía el carrito.
  }

  return (
    <Modal
      abierto
      titulo={`Pedido de ${nombre}`}
      subtitulo={`${lineas.length} ${lineas.length === 1 ? "producto" : "productos"} · ${fmtMoney(total)}`}
      onClose={() => {
        if (!enviando) onClose();
      }}
      ancho="max-w-md"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={enviando}>
            Volver
          </Boton>
          <Boton onClick={() => void registrar()} disabled={enviando}>
            {enviando ? "Registrando…" : "Registrar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <ul className="divide-y divide-borde-soft rounded-xl border border-borde-soft">
          {lineas.map((l) => (
            <li key={l.clave} className="flex items-center justify-between gap-3 px-3.5 py-2 text-[13px]">
              <span className="min-w-0 text-texto-2">
                <span className="block truncate">
                  <b className="text-texto">{fmtCantidad(l.cantidad)}×</b> {l.nombre}
                </span>
                {l.agregados && <span className="block text-xs text-texto-3">{l.agregados}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-texto">
                {fmtMoney(l.precio * l.cantidad)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between px-1 text-base font-extrabold text-texto">
          <span>Total</span>
          <span className="tabular-nums">{fmtMoney(total)}</span>
        </div>

        <Campo label={`N° de pedido de ${nombre} (opcional)`}>
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.slice(0, MAX_CODIGO))}
            maxLength={MAX_CODIGO}
            autoComplete="off"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void registrar();
            }}
          />
        </Campo>

        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
          Queda en el reporte de {nombre}.
        </p>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/**
 * Registrado el pedido, con «Imprimir el pedido al registrarlo» prendido
 * (CONTRATO-DELIVERY-FULL-18NOV §9): la vista del ticket con «Imprimir» y
 * «Listo». Con el ajuste apagado esta ventana no existe: sale el aviso de
 * siempre. Sin señal el pedido quedó en la cola y se imprime igual, con lo
 * que se cargó en el carrito.
 */
export function PedidoPlataformaRegistrado({ pedido, onListo }: { pedido: PedidoParaImprimir; onListo: () => void }) {
  const nombre = NOMBRE_PLATAFORMA[pedido.plataforma];
  const cabecera = useCabeceraDelPapel(pedido.sede);
  const { imprimir, papel } = useImpresionTexto("ticket-plataforma");
  const texto = textoTicketPlataforma({ ...pedido, ...cabecera });
  return (
    <Modal
      abierto
      titulo={
        pedido.encolado
          ? `Pedido de ${nombre} guardado: sube solo cuando vuelva la señal`
          : `Pedido de ${nombre} registrado`
      }
      onClose={onListo}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onListo}>
            Listo
          </Boton>
          <Boton icono="printer" onClick={() => imprimir(texto)}>
            Imprimir
          </Boton>
        </>
      }
    >
      <VistaTicketTexto texto={texto} />
      {papel}
    </Modal>
  );
}
