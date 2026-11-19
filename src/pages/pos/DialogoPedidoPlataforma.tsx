import { useId, useState, type KeyboardEvent } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { parsearMonto } from "../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import { NOMBRE_PLATAFORMA, type Plataforma } from "../../lib/pedidosPlataforma/tipos";
import { useCabeceraDelPapel, useImpresionTexto, VistaTicketTexto } from "./ImprimirTicketTexto";
import { textoTicketPlataforma, type PedidoParaImprimir } from "./ticketPlataforma";

/**
 * Confirmar un pedido de Yango o PedidosYa tomado desde el POS
 * (PLAN-PEDIDOS-PLATAFORMA §5). No se cobra: la app de delivery le cobra al
 * cliente y le paga al local después, así que acá se anota lo que salió, a
 * cuánto lo cobra la app y, opcionalmente, el N° con que la app lo conoce
 * (sirve para cruzarlo a mano con su liquidación).
 *
 * El orden copia la pantalla del pedido en la app de delivery
 * (CONTRATO-PRECIO-PLATAFORMA, 19-nov), para comparar pantalla con pantalla:
 * cada producto con su precio EN LA APP (suele ser más caro que en el local),
 * el descuento que la app le hizo al cliente por cuenta del local, el total,
 * el N° y una nota. El precio de la app se aprende: si el cajero lo corrige y
 * deja tildado «Recordar», el próximo pedido de esa app ya sale con ése.
 *
 * El camino rápido no cambia: el foco arranca en el N° y Enter registra.
 *
 * Se abre con el carrito armado. «Registrar» no cierra el diálogo por su
 * cuenta si falla: el 4xx del servidor (una feature apagada, un producto que
 * ya no existe) se dice acá, con el carrito intacto, para corregir o volver.
 */

export interface LineaDelPedido {
  clave: number | string;
  productoId: number;
  nombre: string;
  cantidad: number;
  /** El precio de UNA unidad en el local, sin los toppings. */
  precioLocal: number;
  /**
   * Los toppings extra de UNA unidad. En la app valen lo mismo que en el local
   * (el backend los cotiza como siempre): se suman al precio de la app.
   */
  extraPorUnidad?: number;
  /** El precio de la app que ya está recordado para esta plataforma; sin él, el del local. */
  precioRecordado?: number;
  /** Los toppings del vaso en una línea («+ Oreo, Chubi»), si los lleva. */
  agregados?: string;
}

/** Lo que el cajero confirmó, listo para armar el pedido. */
export interface PedidoConfirmado {
  codigoExterno?: string;
  /** El precio de UNA unidad en la app, renglón por renglón, en el orden de `lineas`. */
  precios: { clave: number | string; productoId: number; precioApp: number; precioLocal: number }[];
  /** Bs del pedido entero; 0 = sin descuento. */
  descuento: number;
  observaciones?: string;
  /** La casilla estaba a la vista (se cambió algún precio) y tildada. */
  recordarPrecios: boolean;
  /** La suma de los renglones (precio de la app + toppings) × cantidad. */
  subtotal: number;
  /** Subtotal − descuento: lo que cobra la app. */
  total: number;
}

/** El N° de la app: el backend lo guarda hasta 64 caracteres. */
const MAX_CODIGO = 64;
/** Las observaciones: el backend guarda hasta 200 letras. */
const MAX_OBSERVACIONES = 200;
/** Lo más que acepta el backend como precio de la app. */
const PRECIO_MAXIMO = 9_999_999;

/**
 * Lo que se deja escribir en un campo de plata: dígitos y hasta 2 decimales
 * (la coma ya llega convertida en punto por `Input`). Siete enteros cubren el
 * máximo del backend.
 */
const PLATA_TECLEABLE = /^\d{0,7}(\.\d{0,2})?$/;

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Medio centavo: por debajo de eso dos precios son el mismo. */
const mismoPrecio = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** «21» o «12.50»: el precio como arranca en el campo. */
const textoDePrecio = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Un precio de la app válido (>= 0, hasta 2 decimales, hasta el máximo), o null. */
function precioDelTexto(texto: string): number | null {
  const n = parsearMonto(texto);
  if (n == null || n < 0 || n > PRECIO_MAXIMO) return null;
  return mismoPrecio(centavos(n), n) ? centavos(n) : null;
}

export default function DialogoPedidoPlataforma({
  plataforma,
  lineas,
  onClose,
  onRegistrar,
}: {
  plataforma: Plataforma;
  lineas: LineaDelPedido[];
  onClose: () => void;
  /** Si lanza, el mensaje se muestra y el diálogo sigue abierto. */
  onRegistrar: (pedido: PedidoConfirmado) => Promise<void>;
}) {
  const nombre = NOMBRE_PLATAFORMA[plataforma];
  const idAyuda = useId();
  const [codigo, setCodigo] = useState("");
  // Cada renglón arranca con el precio recordado de esta app o, si no hay, con
  // el del local: el «precio de arranque», contra el que se decide si se
  // cambió algo (y aparece «Recordar»).
  const [arranque, setArranque] = useState(() => new Map(lineas.map((l) => [l.clave, l.precioRecordado ?? l.precioLocal])));
  const [textos, setTextos] = useState<Record<string, string>>(() =>
    Object.fromEntries(lineas.map((l) => [String(l.clave), textoDePrecio(l.precioRecordado ?? l.precioLocal)])),
  );
  /** Los renglones cuyo precio tocó el cajero: ésos no se ponen al día nunca. */
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [textoDescuento, setTextoDescuento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  // Tildada de entrada: quien corrige el precio casi siempre quiere que quede.
  const [recordar, setRecordar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Ponerse al día (19-nov): el diálogo se abre con la copia de este equipo y
  // el POS vuelve a pedir los precios por detrás. Si llega otro precio de
  // arranque para un renglón que el cajero no tocó (su texto sigue siendo el
  // de arranque), ese renglón pasa al nuevo. Lo que el cajero escribió no se
  // pisa nunca, y nada cambia mientras se está enviando. Se ajusta durante el
  // dibujo (no en un efecto) para que no se vea un instante el precio viejo.
  if (!enviando) {
    let nuevoArranque: Map<number | string, number> | null = null;
    let nuevosTextos: Record<string, string> | null = null;
    for (const l of lineas) {
      const k = String(l.clave);
      const antes = arranque.get(l.clave);
      const ahora = l.precioRecordado ?? l.precioLocal;
      if (antes === undefined || mismoPrecio(antes, ahora) || tocados.has(k)) continue;
      if ((textos[k] ?? "") !== textoDePrecio(antes)) continue;
      nuevoArranque ??= new Map(arranque);
      nuevosTextos ??= { ...textos };
      nuevoArranque.set(l.clave, ahora);
      nuevosTextos[k] = textoDePrecio(ahora);
    }
    if (nuevoArranque && nuevosTextos) {
      setArranque(nuevoArranque);
      setTextos(nuevosTextos);
    }
  }

  const renglones = lineas.map((l) => {
    const texto = textos[String(l.clave)] ?? "";
    const precio = precioDelTexto(texto);
    const inicial = arranque.get(l.clave) ?? l.precioLocal;
    return {
      l,
      texto,
      precio,
      // Lo que cobra la app por este renglón: su precio más los toppings, por la cantidad.
      monto: centavos(((precio ?? 0) + (l.extraPorUnidad ?? 0)) * l.cantidad),
      cambiado: precio != null && !mismoPrecio(precio, inicial),
    };
  });
  const subtotal = centavos(renglones.reduce((s, r) => s + r.monto, 0));
  // Vacío (o sólo un punto a medio escribir) = sin descuento.
  const descuento = centavos(Math.max(0, parsearMonto(textoDescuento) ?? 0));
  // Nunca en negativo: un descuento mayor que el pedido deja Bs 0 a la vista y
  // el error sale al tocar Registrar (que no registra).
  const total = Math.max(0, centavos(subtotal - descuento));
  // La casilla sólo tiene sentido si hay algo nuevo que recordar.
  const algunoCambiado = renglones.some((r) => r.cambiado);

  async function registrar() {
    if (enviando) return;
    setError("");
    const sinPrecio = renglones.find((r) => r.precio == null);
    if (sinPrecio) {
      setError(`Poné el precio de «${sinPrecio.l.nombre}» en ${nombre}.`);
      return;
    }
    if (descuento > subtotal + 0.005) {
      setError("El descuento no puede ser mayor que el pedido.");
      return;
    }
    setEnviando(true);
    try {
      await onRegistrar({
        codigoExterno: codigo.trim() || undefined,
        precios: renglones.map((r) => ({
          clave: r.l.clave,
          productoId: r.l.productoId,
          precioApp: r.precio ?? r.l.precioLocal,
          precioLocal: r.l.precioLocal,
        })),
        descuento,
        observaciones: observaciones.trim() || undefined,
        recordarPrecios: algunoCambiado && recordar,
        subtotal,
        total,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pedido.");
      setEnviando(false);
    }
    // Registrado: quien lo abrió lo cierra y vacía el carrito.
  }

  const alEnter = (e: KeyboardEvent) => {
    if (e.key === "Enter") void registrar();
  };

  return (
    <Modal
      abierto
      titulo={`Pedido de ${nombre}`}
      subtitulo={`${lineas.length} ${lineas.length === 1 ? "producto" : "productos"} · ${fmtMoney(total)}`}
      onClose={() => {
        if (!enviando) onClose();
      }}
      ancho="max-w-lg"
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
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-semibold text-texto-2">Precios como figuran en {nombre}</p>
          <ul className="divide-y divide-borde-soft rounded-xl border border-borde-soft">
            {renglones.map(({ l, texto, precio, monto }) => (
              <li key={l.clave} className="px-3.5 py-2.5 text-[13px]">
                {/* En la compu, todo en una fila. En el celular no entra: el nombre
                    ocupa su renglón entero (y baja si es largo) y el precio con el
                    monto pasan abajo, pegados a la derecha. */}
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
                  <div className="min-w-[9rem] flex-1 text-texto-2">
                    <span className="block break-words">
                      <b className="text-texto">{fmtCantidad(l.cantidad)}×</b> {l.nombre}
                    </span>
                    {(precio == null || !mismoPrecio(precio, l.precioLocal)) && (
                      <span className="block text-xs text-texto-3">En el local: {fmtMoney(l.precioLocal)}</span>
                    )}
                    {l.agregados && <span className="block break-words text-xs text-texto-3">{l.agregados}</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-texto-3">Bs</span>
                    <Input
                      type="number"
                      value={texto}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (!PLATA_TECLEABLE.test(v)) return;
                        const k = String(l.clave);
                        setTextos((t) => ({ ...t, [k]: v }));
                        setTocados((s) => (s.has(k) ? s : new Set(s).add(k)));
                      }}
                      autoComplete="off"
                      aria-label={`Precio de «${l.nombre}» en ${nombre}`}
                      className="!w-[5.5rem] !px-2.5 !py-2 text-right tabular-nums"
                    />
                    {l.cantidad !== 1 && <span className="text-texto-3">c/u</span>}
                  </div>
                  <span className="min-w-[4.75rem] shrink-0 text-right font-semibold tabular-nums text-texto">
                    {fmtMoney(monto)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 px-1">
          {descuento > 0 && (
            <div className="flex items-baseline justify-between gap-3 text-[13px] text-texto-2">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmtMoney(subtotal)}</span>
            </div>
          )}
          <label className="flex items-center justify-between gap-3 text-[13px] font-semibold text-texto-2">
            <span>Descuento (Bs)</span>
            <Input
              type="number"
              value={textoDescuento}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (PLATA_TECLEABLE.test(v)) setTextoDescuento(v);
              }}
              placeholder="0"
              autoComplete="off"
              className="!w-28 !px-2.5 !py-2 text-right tabular-nums"
            />
          </label>
          <div className="flex items-baseline justify-between gap-3 text-base font-extrabold text-texto">
            <span>Total</span>
            <span className="tabular-nums">{fmtMoney(total)}</span>
          </div>
        </div>

        <div>
          <Campo label={`N° de pedido de ${nombre} (opcional)`}>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.slice(0, MAX_CODIGO))}
              maxLength={MAX_CODIGO}
              autoComplete="off"
              autoFocus
              aria-describedby={plataforma === "PEDIDOS_YA" ? idAyuda : undefined}
              onKeyDown={alEnter}
            />
          </Campo>
          {/* Fuera del <label>: así el nombre del campo sigue siendo sólo el rótulo. */}
          {plataforma === "PEDIDOS_YA" && (
            <p id={idAyuda} className="mt-1 text-xs text-texto-3">
              En PedidosYa usá el número largo (ej. 2351234567): es el que figura en la liquidación.
            </p>
          )}
        </div>

        <Campo label="Observaciones (opcional)">
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value.slice(0, MAX_OBSERVACIONES))}
            maxLength={MAX_OBSERVACIONES}
            placeholder="Ej. sin ají"
            autoComplete="off"
            onKeyDown={alEnter}
          />
        </Campo>

        {algunoCambiado && (
          <label className="flex items-start gap-2.5 px-1 text-[13px] text-texto-2">
            <input
              type="checkbox"
              className="mt-0.5 h-[18px] w-[18px] shrink-0"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
            />
            <span>Recordar estos precios para los próximos pedidos de {nombre}</span>
          </label>
        )}

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
