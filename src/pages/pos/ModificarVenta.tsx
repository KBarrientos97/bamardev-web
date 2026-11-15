import { useMemo, useState } from "react";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { esCero, vuelto } from "../../lib/dinero";
import { fmtCantidad, fmtHora, fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import type { Categoria, DetalleVentaInput, FormaPago, PagoInput, Producto, Venta } from "../../types";
import PantallaCobro from "./PantallaCobro";
import PantallaVenta from "./PantallaVenta";
import { useCarrito } from "./useCarrito";
import { huellaDeCobro, useIntentoDeCobro } from "./useIntentoDeCobro";
import {
  MOTIVOS_DE_CAMBIO,
  cambioDeProductos,
  catalogoParaModificar,
  diferenciaDelCambio,
  hayCambios,
  lineasDeVenta,
  mediosDeDevolucion,
  textoDelMotivo,
  type MotivoDeCambio,
  type PlataDelCambio,
} from "./cambioDeVenta";

/**
 * Modificar una venta ya cobrada (15-nov).
 *
 * El cliente pagó, se llevó su ticket y vuelve: "mejor la gaseosa de 2 litros
 * y el cuarto a la brasa". Hasta hoy eso se anotaba en un talonario, fuera del
 * sistema. Acá se cambian los productos de ESA venta —el mismo comprobante y
 * el mismo número de pedido— en tres pasos:
 *
 *  1. la misma pantalla del Punto de venta, con el pedido ya cargado: la
 *     cajera saca lo que no va y toca lo nuevo donde lo busca siempre;
 *  2. si el cliente tiene que pagar la diferencia, el cobro de siempre
 *     (efectivo con su vuelto, QR o mixto) por ese monto;
 *  3. la confirmación: qué sale, qué entra, la plata, el motivo y el PIN de
 *     un encargado. Sin el PIN no se guarda nada, igual que al anular: es la
 *     misma puerta a la plata del cajón, y queda registrado para el dueño.
 */
export default function ModificarVenta({
  venta,
  productos,
  categorias,
  formasPago,
  sucursalId,
  onCancelar,
  onModificada,
}: {
  /** La venta entera (`GET /ventas/:id`): con sus renglones, sus pagos y su versión. */
  venta: Venta;
  /** El catálogo del POS, con el precio y el stock de la sucursal de la caja. */
  productos: Producto[];
  categorias: Categoria[];
  formasPago: FormaPago[];
  sucursalId?: number | null;
  onCancelar: () => void;
  /** La venta como quedó, y lo que hay que hacer con la plata (para decirlo en el recibo). */
  onModificada: (venta: Venta, plata: PlataDelCambio) => void;
}) {
  // El catálogo y las líneas se arman UNA vez, con lo que había al entrar: si
  // el catálogo se recarga en el medio, el carrito no tiene que saltar.
  const [catalogo] = useState(() => catalogoParaModificar(productos, venta));
  const [inicial] = useState(() => lineasDeVenta(venta, catalogo));
  const carrito = useCarrito("LOCAL", catalogo, true, { inicial });
  const intento = useIntentoDeCobro();

  const [paso, setPaso] = useState<"editar" | "cobrar">("editar");
  /** Con qué pagó el cliente la diferencia (sólo si el total sube). */
  const [pagos, setPagos] = useState<PagoInput[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const detalles = carrito.aDetalles();
  const total = carrito.total;
  const diferencia = diferenciaDelCambio(venta, total);
  const cambio = hayCambios(venta, detalles);
  const comprobante = venta.comprobante ?? `#${venta.id}`;

  const continuar = () => {
    if (!cambio || carrito.lineas.length === 0) return;
    if (diferencia > 0 && !esCero(diferencia)) {
      setPagos([]);
      setPaso("cobrar");
    } else {
      setConfirmando(true);
    }
  };

  const dialogo = confirmando && (
    <ConfirmarCambio
      venta={venta}
      detalles={detalles}
      total={total}
      diferencia={diferencia}
      pagos={pagos}
      formasPago={formasPago}
      lineasNuevas={carrito.lineas.map((l) => ({
        productoId: l.producto.id,
        producto: l.producto.nombre,
        cantidad: l.cantidad,
      }))}
      claveDe={(huella) => intento.actual(huella)}
      onClose={() => setConfirmando(false)}
      onSalir={onCancelar}
      onModificada={onModificada}
    />
  );

  if (paso === "cobrar") {
    return (
      <>
        <PantallaCobro
          total={diferencia}
          titulo="Cobrar la diferencia"
          subtitulo={`${comprobante} · pagó ${fmtMoney(venta.total)}, ahora es ${fmtMoney(total)}`}
          formasPago={formasPago}
          onAtras={() => {
            setConfirmando(false);
            setPaso("editar");
          }}
          onConfirmar={(p) => {
            setPagos(p);
            setConfirmando(true);
          }}
          // El envío es del diálogo de confirmación, que pide el PIN: acá
          // sólo se elige con qué paga.
          enviando={false}
          error=""
        />
        {dialogo}
      </>
    );
  }

  return (
    <>
      <PantallaVenta
        productos={catalogo}
        categorias={categorias}
        carrito={carrito}
        sucursalId={sucursalId}
        onCobrar={continuar}
        cabecera={
          <div className="flex items-center gap-2 border-b border-warning-text/20 bg-warning-bg px-3 py-2.5">
            <button
              onClick={onCancelar}
              aria-label="Volver sin cambiar la venta"
              className="rounded-lg p-1.5 text-warning-text hover:bg-white/60"
            >
              <Icon name="arrowLeft" size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-tight text-warning-text">
                Modificando la venta {comprobante}
              </p>
              <p className="text-xs leading-snug text-warning-text">
                De las {fmtHora(venta.fecha)} · pagó {fmtMoney(venta.total)}. Quitá lo que no va y tocá lo nuevo.
              </p>
            </div>
            <Boton variante="ghost" onClick={onCancelar} className="shrink-0 px-3 py-1.5 text-[13px]">
              Cancelar
            </Boton>
          </div>
        }
        modificacion={{
          titulo: `Cambio de ${comprobante}`,
          vacio: "La venta no puede quedar sin productos. Para sacarle todo, anulala desde «Ventas del turno».",
          bloqueo: cambio ? null : "Todavía no cambiaste nada de la venta.",
          etiqueta: !cambio
            ? "Guardar cambio"
            : diferencia > 0 && !esCero(diferencia)
              ? `Cobrar ${fmtMoney(diferencia)} de diferencia`
              : diferencia < 0 && !esCero(diferencia)
                ? `Devolver ${fmtMoney(-diferencia)} · Continuar`
                : "Guardar cambio",
          resumen: (
            <>
              <div className="flex justify-between text-texto-2">
                <dt>Ya pagó</dt>
                <dd>{fmtMoney(venta.total)}</dd>
              </div>
              <FilaDiferencia diferencia={diferencia} />
            </>
          ),
        }}
      />
      {dialogo}
    </>
  );
}

/** "A devolver al cliente Bs 3,00", "A cobrar de diferencia Bs 4,00" o "Sin diferencia". */
function FilaDiferencia({ diferencia }: { diferencia: number }) {
  if (esCero(diferencia)) {
    return (
      <div className="flex justify-between font-bold text-texto-2">
        <dt>Diferencia</dt>
        <dd>Sin diferencia</dd>
      </div>
    );
  }
  const devolver = diferencia < 0;
  return (
    <div className={`flex justify-between gap-2 font-extrabold ${devolver ? "text-danger-text" : "text-primary-700"}`}>
      <dt>{devolver ? "A devolver al cliente" : "A cobrar de diferencia"}</dt>
      <dd className="shrink-0">{fmtMoney(Math.abs(diferencia))}</dd>
    </div>
  );
}

/**
 * La confirmación del cambio: lo que va a pasar, dicho antes de que pase, y el
 * visto bueno. Mismo trato que `DialogoAnular`: motivo y PIN siempre.
 */
function ConfirmarCambio({
  venta,
  detalles,
  total,
  diferencia,
  pagos,
  formasPago,
  lineasNuevas,
  claveDe,
  onClose,
  onSalir,
  onModificada,
}: {
  venta: Venta;
  detalles: DetalleVentaInput[];
  total: number;
  diferencia: number;
  pagos: PagoInput[];
  formasPago: FormaPago[];
  lineasNuevas: { productoId: number; producto: string; cantidad: number }[];
  /** La clave de idempotencia de ESTE cambio (la misma si se reintenta igual). */
  claveDe: (huella: string) => string;
  onClose: () => void;
  /** Salir de la modificación (la venta cambió en otra pantalla o cambió un precio). */
  onSalir: () => void;
  onModificada: (venta: Venta, plata: PlataDelCambio) => void;
}) {
  const { usuario } = useAuth();
  // Quien autoriza con PIN se autoriza a sí mismo; el resto necesita que un
  // encargado teclee su usuario y su PIN acá, sin cerrarle la sesión.
  const pideUsuario = !tienePermiso(usuario, "autorizar.pin");
  const devolver = diferencia < 0 && !esCero(diferencia);
  const cobrar = diferencia > 0 && !esCero(diferencia);
  const medios = useMemo(
    () => (devolver ? mediosDeDevolucion(venta, formasPago, -diferencia) : []),
    [devolver, venta, formasPago, diferencia],
  );
  const [medioId, setMedioId] = useState<number | null>(() => medios[0]?.formaPagoId ?? null);
  const medio = medios.find((m) => m.formaPagoId === medioId) ?? null;

  const [motivo, setMotivo] = useState<MotivoDeCambio | "">("");
  const [detalle, setDetalle] = useState("");
  const [autorizador, setAutorizador] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  /** La venta ya no es la que se abrió: no se reintenta, se vuelve a la lista. */
  const [hayQueSalir, setHayQueSalir] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const { sale, entra } = cambioDeProductos(
    (venta.detalles ?? []).map((d) => ({ productoId: d.productoId, producto: d.producto, cantidad: d.cantidad })),
    lineasNuevas,
  );
  const nombreForma = (id: number) => formasPago.find((f) => f.id === id)?.nombre ?? "Pago";

  async function guardar() {
    setError("");
    if (devolver && !medio) return setError("No hay por dónde devolver la diferencia: falta la forma de pago «Efectivo».");
    // El porqué queda con el cambio: es lo que lee el dueño.
    if (!motivo) return setError("Elegí el motivo: queda guardado con el cambio.");
    if (motivo === "Otro" && detalle.trim().length < 3) return setError("Contá en pocas palabras por qué se cambia.");
    if (pideUsuario && autorizador.trim().length < 3) return setError("Poné el usuario del encargado que autoriza.");
    if (!/^\d{4,6}$/.test(pin)) return setError("El PIN tiene entre 4 y 6 dígitos.");

    const plata = cobrar ? { pagos } : devolver ? { devolucionFormaPagoId: medio!.formaPagoId } : {};
    setEnviando(true);
    try {
      const actualizada = await api.modificarVenta(venta.id, {
        detalles,
        version: venta.vecesModificada ?? 0,
        totalEsperado: total,
        // El detalle es sólo de «Otro»: lo escrito antes de cambiar de motivo no viaja.
        motivo: textoDelMotivo(motivo, motivo === "Otro" ? detalle : ""),
        ...(pideUsuario ? { autorizadorUsername: autorizador.trim() } : {}),
        autorizadorPin: pin,
        ...plata,
        // La misma clave mientras el cambio sea el mismo: si el envío entró y
        // se cortó la respuesta, el reintento devuelve la venta como quedó.
        clienteRequestId: claveDe(huellaDeCobro([venta.id, venta.vecesModificada ?? 0, detalles, plata])),
      });
      onModificada(actualizada, { diferencia, devolucion: devolver ? medio : null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cambio");
      // Otra pantalla la cambió (o la anuló), o cambió un precio: lo que se ve
      // acá ya no vale. Se vuelve a la lista para abrirla de nuevo.
      if (err instanceof ApiError && (err.codigo === "VENTA_CAMBIO" || err.codigo === "TOTAL_CAMBIO")) {
        setHayQueSalir(true);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Confirmar el cambio"
      subtitulo={`${venta.comprobante ?? `#${venta.id}`} · de ${fmtMoney(venta.total)} a ${fmtMoney(total)}`}
      onClose={onClose}
      ancho="max-w-md"
      // Hay un motivo y un PIN tecleados: un clic al costado no los borra.
      cerrarAlClicAfuera={false}
      acciones={
        hayQueSalir ? (
          <Boton onClick={onSalir}>Volver a las ventas del turno</Boton>
        ) : (
          <>
            <Boton variante="ghost" onClick={onClose}>
              Volver
            </Boton>
            <Boton onClick={guardar} disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar cambio"}
            </Boton>
          </>
        )
      }
    >
      <div className="space-y-3">
        {/* Qué cambia, producto por producto: es lo que la encargada mira
            antes de poner su PIN. */}
        {sale.length === 0 && entra.length === 0 ? (
          <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
            Los mismos productos: cambia la nota o si va a la mesa o para llevar.
          </p>
        ) : (
          // Sólo lo que hay: si nada sale (el cliente sumó algo), no hay un
          // recuadro que diga "Nada" ocupando media pantalla del celular.
          <div className={`grid gap-2 ${sale.length > 0 && entra.length > 0 ? "sm:grid-cols-2" : ""}`}>
            {sale.length > 0 && <ListaDelCambio titulo="Sale del pedido" lineas={sale} tono="sale" />}
            {entra.length > 0 && <ListaDelCambio titulo="Entra al pedido" lineas={entra} tono="entra" />}
          </div>
        )}

        {/* La plata, dicha con todas las letras antes de confirmar. */}
        {devolver && (
          <div className="rounded-xl bg-danger-bg px-3.5 py-3 text-danger-text">
            <p className="text-[15px] font-extrabold">Devolvele {fmtMoney(-diferencia)} al cliente</p>
            {medios.length > 1 && (
              <div className="mt-2">
                <Chips
                  valor={String(medioId ?? "")}
                  opciones={medios.map((m): [string, string] => [
                    String(m.formaPagoId),
                    m.saleDelCajon ? "En efectivo" : `Por ${m.nombre}`,
                  ])}
                  onChange={(k) => setMedioId(Number(k))}
                  envolver
                />
              </div>
            )}
            {medio && (
              <p className="mt-1.5 text-[13px]">
                {medio.saleDelCajon
                  ? "En efectivo: sale de la caja. El cierre del turno ya lo descuenta."
                  : `Por ${medio.nombre} o transferencia, desde la cuenta del negocio. No sale de la caja.`}
              </p>
            )}
          </div>
        )}
        {cobrar && (
          <div className="rounded-xl bg-primary-50 px-3.5 py-3 text-primary-700">
            <p className="text-[15px] font-extrabold">El cliente paga {fmtMoney(diferencia)} más</p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {pagos.map((p, i) => {
                const cambio = vuelto(p.recibido ?? p.monto, p.monto);
                return (
                  <li key={i}>
                    {nombreForma(p.formaPagoId)}: {fmtMoney(p.monto)}
                    {cambio > 0 && ` (recibís ${fmtMoney(p.recibido ?? p.monto)}, vuelto ${fmtMoney(cambio)})`}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {!devolver && !cobrar && (
          <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] font-semibold text-texto-2">
            Sin diferencia de plata: no se cobra ni se devuelve nada.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Motivo</p>
          {/* Vacío al abrir a propósito, como al anular: un motivo ya marcado
              se confirmaría sin leerlo. */}
          <Chips valor={motivo as MotivoDeCambio} opciones={MOTIVOS_DE_CAMBIO} onChange={setMotivo} envolver />
          {/* Sólo con «Otro» hay algo que escribir: con los demás, un toque
              alcanza y el diálogo entra entero en la pantalla de una notebook
              (con el campo siempre a la vista, el PIN quedaba bajo el pliegue). */}
          {motivo === "Otro" && (
            <Input
              className="mt-2"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.slice(0, 150))}
              placeholder="¿Por qué se cambia?"
              aria-label="Detalle del motivo"
              autoComplete="off"
              autoFocus
            />
          )}
        </div>

        {pideUsuario && (
          <Campo label="Usuario que autoriza" hint="Un encargado con PIN">
            <Input value={autorizador} onChange={(e) => setAutorizador(e.target.value)} autoComplete="off" />
          </Campo>
        )}
        <Campo label="PIN de autorización">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !enviando && !hayQueSalir) void guardar();
            }}
            autoComplete="off"
            placeholder="4 dígitos"
            className="tracking-[0.3em]"
          />
        </Campo>
        {/* Fuera del label: los tests buscan el campo por su etiqueta exacta. */}
        <p className="-mt-2 text-xs text-texto-4">
          Queda registrado quién cambió la venta y quién la autorizó, y le llega el aviso al administrador.
        </p>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function ListaDelCambio({
  titulo,
  lineas,
  tono,
}: {
  titulo: string;
  lineas: { producto: string; cantidad: number }[];
  tono: "sale" | "entra";
}) {
  return (
    <div className={`rounded-xl px-3.5 py-2.5 ${tono === "sale" ? "bg-muted" : "bg-primary-50"}`}>
      <p
        className={`text-[11px] font-bold uppercase tracking-wide ${tono === "sale" ? "text-texto-3" : "text-primary-700"}`}
      >
        {titulo}
      </p>
      <ul className="mt-1 space-y-0.5">
        {lineas.map((l, i) => (
          <li key={i} className={`text-[13px] ${tono === "sale" ? "text-texto-2 line-through" : "font-semibold text-texto"}`}>
            <span className="font-bold">{fmtCantidad(l.cantidad)}×</span> {l.producto}
          </li>
        ))}
      </ul>
    </div>
  );
}
