import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";
import { enlaceDeCuotas, modulosDeCuotaVenta } from "../../lib/academia/cobroCuotas";
import { compartirComoImagen } from "../../lib/compartirTicket";
import { aCentavos, esPositivo } from "../../lib/dinero";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../../lib/format";
import { marcaConsumo } from "../../lib/rubro";
import { numeroTicket } from "../../lib/tickets/llamado";
import { useAuth } from "../../store/AuthContext";
import type { Venta } from "../../types";
import EnlaceEstadoCuenta from "../academia/EnlaceEstadoCuenta";
import ComandaCocina from "./ComandaCocina";
import { totalEnLetras } from "../../lib/menuDigital/enLetras";
import { useReciboNegocio } from "../../lib/menuDigital/useReciboNegocio";
import { CabeceraNegocio, HojaAngosta, QrRecibo } from "./PiezasRecibo";

/**
 * Comprobante de la venta recién cobrada.
 *
 * El ticket copia el formato de la app (`fragment_recibo.xml` + `TicketItems`):
 * cabecera etiquetada, artículos en dos renglones con el badge M/LL, Subtotal
 * y TOTAL, y el desglose de efectivo/QR/cambio. Es el mismo papel que recibe
 * el cliente en el mostrador, salga de la tablet o de la web.
 *
 * Al imprimir sale SÓLO este ticket: el `id="area-impresion"` es lo único que
 * `index.css` deja visible, y el papel es rollo de 80 mm.
 */
export default function PantallaRecibo({
  venta,
  onNuevaVenta,
  onHistorial,
  etiquetaNueva = "Nueva venta",
  reimpresion = false,
}: {
  venta: Venta;
  onNuevaVenta: () => void;
  onHistorial: () => void;
  /** El botón principal: "Nueva venta" en el POS, "Cobrar a otro" en el instituto (A1). */
  etiquetaNueva?: string;
  /**
   * Abierta desde el historial ("Ver comprobante"), no recién cobrada: no se
   * imprime sola ni ofrece la comanda con el foco. La cocina ya la tuvo, y
   * reabrir el comprobante de la 0072 una hora después la volvía a mandar.
   */
  reimpresion?: boolean;
}) {
  const { negocio, incluye, rubro } = useAuth();
  // El diseño del recibo (logo, datos del negocio, QR, pie): sólo en un
  // negocio con las pantallas del local. Sin él, null, y el recibo sale
  // exactamente como siempre.
  const conf = useReciboNegocio();
  const r = conf?.recibo ?? null;

  /**
   * El ticket que se rasteriza al compartir: se manda la MISMA vista que se
   * imprime, no una versión aparte que después se desincroniza.
   */
  const ticket = useRef<HTMLElement>(null);
  const [compartiendo, setCompartiendo] = useState(false);
  const [avisoCompartir, setAvisoCompartir] = useState("");

  /**
   * Con lugar (las dos columnas, desde 48rem como `@3xl`), los botones van
   * debajo de "Venta registrada", al lado del ticket, y no en una barra
   * pegada al borde de abajo con media pantalla vacía en el medio (Kevin,
   * 27-oct, cobrando en el Punto de venta). Se mide el lugar y no la ventana,
   * como las columnas; y antes de pintar, para que la barra no se vea un
   * instante abajo. Sin `ResizeObserver` (los tests) queda la barra de siempre.
   */
  const raiz = useRef<HTMLDivElement>(null);
  const [ancha, setAncha] = useState(false);
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = (ancho: number) => setAncha(ancho >= 768);
    medir(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => medir(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function compartir() {
    if (!ticket.current || compartiendo) return;
    setAvisoCompartir("");
    setCompartiendo(true);
    const res = await compartirComoImagen(
      ticket.current,
      venta.comprobante ?? `recibo-${venta.id}`,
    );
    setCompartiendo(false);
    // Cancelar el diálogo del sistema no es un error que mostrar.
    if (!res.ok && res.motivo === "no_soportado") {
      setAvisoCompartir("Se descargó la imagen del recibo para que la adjuntes.");
    } else if (!res.ok && res.motivo === "error") {
      setAvisoCompartir("No se pudo generar la imagen del recibo.");
    }
  }

  const detalles = venta.detalles ?? [];
  const pagos = venta.pagos ?? [];

  // El badge M/LL sólo aplica a ventas de local: en delivery/recoger todo va
  // para llevar y ensuciaría el ticket (misma regla que TicketItems.kt). En una
  // farmacia no hay mesas, y la "M" en el ticket no querría decir nada.
  //
  // Se pregunta por el RUBRO y no por `incluye("mesa_llevar")`: eso también
  // depende del plan, y a un restaurante al que el panel le saque la feature se
  // le borraban las marcas de un ticket que siempre las tuvo.
  const mostrarConsumo = venta.tipoPedido === "LOCAL" && marcaConsumo(rubro);

  // Subtotal = suma de las líneas.
  const subtotal = detalles.reduce((acum, d) => acum + d.subtotal, 0);
  // El TOTAL del papel es lo que paga el cliente: Subtotal (menos descuentos)
  // más el envío. `venta.total` es sólo lo de los productos, porque el backend
  // guarda la tarifa aparte, y el ticket salía "Subtotal 50 · Envío 8 · TOTAL
  // 50", también el de un delivery cobrado en caja, mientras el de la misma
  // venta sin internet decía 58 (BUG-pedidos-11, BUG-cobro-5).
  const envio = venta.tarifaEnvio ?? 0;
  const totalTicket = aCentavos(venta.total + envio);

  // Efectivo y QR salen desglosados como en la app, no como una lista genérica
  // de pagos: el cliente busca "Efectivo recibido" y "Cambio entregado".
  const efectivo = pagos.find((p) => /efectivo/i.test(p.formaPago ?? ""));
  const qr = pagos.find((p) => /qr|transfer/i.test(p.formaPago ?? ""));

  // Belleza (QA PER-01): el pago guarda lo recibido de la VENTA (así el
  // backend calcula bien el vuelto), y la propina en efectivo va aparte. Pero
  // el cliente entregó todo junto: el papel dice lo que dio, propina incluida.
  const propinas = venta.propinas ?? [];
  const propinaEnEfectivo =
    Math.round(
      propinas.filter((x) => /efectivo/i.test(x.formaPago)).reduce((s, x) => s + x.monto, 0) * 100,
    ) / 100;
  // Lo mismo con el QR (QA DIA-02): la transferencia del cliente trae la
  // propina por QR; el papel dice lo que transfirió, no sólo lo de la venta.
  const propinaPorQr =
    Math.round(
      propinas.filter((x) => /qr|transfer/i.test(x.formaPago)).reduce((s, x) => s + x.monto, 0) * 100,
    ) / 100;
  const montoQr = Math.round(((qr?.monto ?? 0) + propinaPorQr) * 100) / 100;
  const efectivoRecibido = efectivo
    ? Math.round(((efectivo.recibido ?? efectivo.monto) + propinaEnEfectivo) * 100) / 100
    : 0;
  // El cobro manda el cambio; una reimpresión desde el historial (QA PER-08)
  // no lo trae, pero cada pago guarda el suyo.
  const cambio =
    typeof venta.cambio === "number"
      ? venta.cambio
      : Math.round(pagos.reduce((s, p) => s + (p.entregado ?? 0), 0) * 100) / 100;
  const metodo =
    venta.formasPago?.join(" + ") ||
    pagos
      .map((p) => p.formaPago)
      .filter(Boolean)
      .join(" + ") ||
    // Un fiado sin adelanto no tiene ningún pago: decía "Pago: —", como si
    // faltara un dato, cuando lo que pasó es que se lo llevó a crédito.
    (venta.credito ? "A crédito" : "—");

  // El número de pedido (extra `tickets_pedido`): con él, la pantalla lo
  // muestra grande, el botón principal imprime el recibo Y la comanda de
  // cocina, y los dos papeles salen en una sola impresión (ver ComandaCocina).
  // Sin él, todo sale exactamente como siempre.
  const ticketPedido = venta.ticket ?? null;
  const conTicket = !!ticketPedido && !venta.pendienteSync;

  const imprimirYCompartir = incluye("recibo_pdf") && (
    <>
      {!conTicket && (
        <Boton variante="ghost" icono="printer" onClick={() => window.print()}>
          Imprimir
        </Boton>
      )}
      {/* Siempre visible: si el equipo no sabe compartir archivos, la
          imagen se descarga, que en un escritorio es lo más parecido. */}
      <Boton variante="ghost" icono="arrowUpRight" onClick={compartir} disabled={compartiendo}>
        {compartiendo ? "Generando…" : "Compartir"}
      </Boton>
    </>
  );
  const historial = (
    <Boton variante="ghost" onClick={onHistorial}>
      Historial
    </Boton>
  );
  const nueva = (clase: string) => (
    <Boton
      id="recibo-nueva-venta"
      icono="plus"
      variante={conTicket ? "ghost" : "primary"}
      onClick={onNuevaVenta}
      className={clase}
    >
      {etiquetaNueva}
    </Boton>
  );
  /**
   * Cada papel también se imprime solo, con la impresora de su rótulo (Kevin,
   * 29-oct): la caja y la cocina pueden tener cada una su impresora, y si no
   * imprimen juntas hay que mandar dos veces, una a cada una. `index.css`
   * esconde el otro papel según `data-imprimir`; `flushSync` lo deja puesto
   * en el DOM antes de que el navegador arme la impresión.
   */
  const [soloPapel, setSoloPapel] = useState<"recibo" | "comanda" | null>(null);
  /** Ya salió una impresión (sola o a mano): la de "al cobrar" no se repite. */
  const yaImprimio = useRef(false);
  const imprimir = useCallback((papel: "recibo" | "comanda" | null = null) => {
    // Lo marca también la impresión a mano: si la cajera aprieta Enter antes
    // de que llegue el diseño del recibo (la primera venta del día), la
    // automática no tiene que salir después y duplicar la comanda.
    yaImprimio.current = true;
    flushSync(() => setSoloPapel(papel));
    window.print();
  }, []);
  /** "Por separado" al cobrar: la comanda espera a que se cierre la impresión del recibo. */
  const despues = useRef<"comanda" | null>(null);
  // Con número de pedido, lo primero después de cobrar es imprimir: el botón
  // nace con el foco (Enter imprime) y, al cerrar el diálogo de impresión, el
  // foco pasa a "Nueva venta" (otro Enter y se sigue vendiendo). Cobrar y
  // despachar sin tocar el mouse.
  const imprimirTodo = (clase: string) =>
    reimpresion ? (
      // Desde el historial se reimprime el recibo; la comanda, si se perdió,
      // con el botón de su rótulo. Sin el foco: un Enter de más no reimprime.
      <Boton icono="printer" onClick={() => imprimir("recibo")} className={clase}>
        Imprimir recibo
      </Boton>
    ) : (
      <Boton icono="printer" autoFocus onClick={() => imprimir()} className={clase}>
        Imprimir recibo y comanda
      </Boton>
    );
  useEffect(() => {
    if (!conTicket) return;
    const alTerminar = () => {
      // Cerrado el recibo, va la comanda en su propia impresión. Un rato
      // después y no dentro del evento: el navegador todavía está cerrando
      // la anterior.
      const siguiente = despues.current;
      if (siguiente) {
        despues.current = null;
        setTimeout(() => imprimir(siguiente), 300);
        return;
      }
      setSoloPapel(null);
      document.getElementById("recibo-nueva-venta")?.focus();
    };
    window.addEventListener("afterprint", alTerminar);
    return () => window.removeEventListener("afterprint", alTerminar);
  }, [conTicket, imprimir]);
  // "Imprimir solo al cobrar" (Configuración del recibo): el diálogo se abre
  // apenas aparece la venta, una sola vez. Con Chrome en modo kiosco
  // (--kiosk-printing) ni siquiera hay diálogo: sale directo, cero toques. Si
  // el diseño llega tarde (la primera venta del día), no imprime a destiempo.
  // Desde el 29-oct cada papel se elige solo: el recibo, la comanda, o los
  // dos, juntos o por separado (uno para cada impresora).
  const montada = useRef(Date.now());
  const ac = r?.alCobrar;
  const alCobrar =
    !ac || (!ac.recibo && !ac.comanda)
      ? null
      : ac.recibo && ac.comanda
        ? ac.juntos
          ? "juntos"
          : "separados"
        : ac.recibo
          ? "recibo"
          : "comanda";
  useEffect(() => {
    if (!conTicket || !alCobrar || reimpresion || yaImprimio.current) return;
    if (Date.now() - montada.current > 4000) return;
    // La marca va adentro del timeout: si el efecto se limpia antes (React lo
    // corre dos veces en desarrollo), la segunda vuelta todavía imprime.
    const id = setTimeout(() => {
      yaImprimio.current = true;
      if (alCobrar === "separados") {
        despues.current = "comanda";
        imprimir("recibo");
      } else {
        imprimir(alCobrar === "juntos" ? null : alCobrar);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [conTicket, alCobrar, reimpresion, imprimir]);
  const anchoPapel = r?.ancho === 58 ? { ticket: "48mm", pantalla: "max-w-[250px]" } : null;

  // El ticket: el `id` lo hace lo ÚNICO visible al imprimir (index.css). Con
  // número de pedido el `id` pasa al envoltorio del recibo y la comanda.
  const papelRecibo = (
    <article
      id={conTicket ? undefined : "area-impresion"}
      ref={ticket}
      className={`card mx-auto ${anchoPapel?.pantalla ?? "max-w-[320px]"} p-5 print:border-0 print:shadow-none ${conTicket ? "recibo-impreso print:max-w-none print:p-0" : ""}`}
      // El rollo de 58 mm (Configuración del recibo): el ticket se angosta
      // al imprimir (index.css lee la variable) y también en la pantalla.
      style={!conTicket && anchoPapel ? ({ "--ancho-ticket": anchoPapel.ticket } as CSSProperties) : undefined}
    >
      {r ? (
        <CabeceraNegocio r={r} logo={conf?.logo ?? null} nombre={negocio?.nombre ?? "BamarDev"} />
      ) : (
        <header className="pb-2 text-center">
          <h2 className="text-base font-bold text-texto">
            {negocio?.nombre ?? "BamarDev"}
          </h2>
        </header>
      )}

      {/* El número que el cliente espera oír: grande y en su recuadro, lo
          primero que se ve del papel. */}
      {conTicket && (
        <div className="mx-auto mb-2 w-fit rounded-lg border-2 border-texto px-4 py-1 text-center">
          <p className="text-[10px] font-bold tracking-[0.3em] text-texto-3">TICKET N°</p>
          <p className="font-mono text-[44px] font-black leading-none tracking-tight text-texto">
            {numeroTicket(ticketPedido!.numero)}
          </p>
        </div>
      )}

      {/* Cabecera en filas etiquetadas, como en la app: el número de ticket
          queda siempre en el mismo lugar y el cliente lo encuentra solo. */}
      <dl className="border-t border-dashed border-borde pt-2 text-xs">
        <FilaDato
          // Con número de pedido, "Ticket" es el número de arriba: el
          // comprobante pasa a llamarse por lo que es, la venta.
          etiqueta={conTicket ? "Venta:" : "Ticket:"}
          valor={venta.pendienteSync ? "SIN SINCRONIZAR" : (venta.comprobante ?? `#${venta.id}`)}
        />
        <FilaDato etiqueta="Fecha:" valor={fmtFechaHora(venta.fecha)} />
        {/* Cobrando una mesa, el ticket salía como uno de mostrador: sin
            mesa ni mesero (visto en QA). El cliente reconoce su cuenta por
            la mesa, y el mesero es a quien se le reclama. */}
        {/* El código y no el nombre: el nombre suele ser "Mesa M1" y
            quedaba "Mesa: Mesa M1". El código es lo que dice el salón. */}
        {venta.mesa && <FilaDato etiqueta="Mesa:" valor={venta.mesa} />}
        {venta.mesero && <FilaDato etiqueta="Atendió:" valor={venta.mesero} />}
        {venta.cajero && (!r || r.cajero) && <FilaDato etiqueta="Cajero:" valor={venta.cajero} />}
        <FilaDato etiqueta="Pago:" valor={metodo} />
        {/* El papel que sale con el pedido identifica la entrega, como el de
            Android (ReciboVentaDialog): traía sólo productos y totales, sin
            a quién ni a dónde iba (QA 29-oct). */}
        {(venta.tipoPedido === "DELIVERY" || venta.tipoPedido === "RECOGER") && (
          <>
            <FilaDato etiqueta="Pedido:" valor={venta.tipoPedido === "DELIVERY" ? "Delivery" : "Para recoger"} />
            {venta.clienteNombre && <FilaDato etiqueta="Cliente:" valor={venta.clienteNombre} />}
            {venta.clienteTelefono && <FilaDato etiqueta="Teléfono:" valor={venta.clienteTelefono} />}
            {venta.tipoPedido === "DELIVERY" && venta.clienteDireccion && (
              <FilaDato etiqueta="Dirección:" valor={venta.clienteDireccion} />
            )}
            {venta.repartidor?.nombre && <FilaDato etiqueta="Repartidor:" valor={venta.repartidor.nombre} />}
            {venta.notaPedido && <FilaDato etiqueta="Nota:" valor={venta.notaPedido} />}
          </>
        )}
      </dl>

      <div className="mt-2 border-t border-dashed border-borde pt-1">
        {conTicket && mostrarConsumo
          ? // Con número de pedido, en bloques "EN MESA" y "PARA LLEVAR"
            // en vez de la M/LL de cada renglón: el cliente de un pedido
            // mixto ve de un vistazo qué se lleva.
            porConsumo(detalles).map((g) => (
              <div key={g.consumo}>
                <p className="mt-1.5 border-b border-texto pb-0.5 text-[11px] font-extrabold tracking-[0.14em] text-texto">
                  {g.consumo === "MESA" ? "EN MESA" : "PARA LLEVAR"}
                </p>
                {g.lineas.map((d, i) => (
                  <LineaTicket key={i} linea={d} mostrarConsumo={false} />
                ))}
              </div>
            ))
          : detalles.map((d, i) => (
              <LineaTicket
                key={i}
                linea={d}
                mostrarConsumo={mostrarConsumo}
                cuota={cuotaDeLinea(venta, d.cuotaId)}
              />
            ))}
      </div>

      <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm">
        <div className="flex justify-between text-texto-2">
          <dt>Subtotal</dt>
          <dd>{fmtMoney(subtotal)}</dd>
        </div>
        {/* Cupones y promociones: cada uno con su nombre. Sólo en una
            venta con descuento; el ticket de siempre no cambia. */}
        {(venta.descuentos ?? []).map((x, i) => (
          <div key={i} className="flex justify-between text-texto-2">
            <dt>
              {x.nombre}
              {x.codigo ? ` (${x.codigo})` : ""}
            </dt>
            <dd className="shrink-0 whitespace-nowrap">− {fmtMoney(x.monto)}</dd>
          </div>
        ))}
        {esPositivo(envio) && (
          <div className="flex justify-between text-texto-2">
            <dt>Envío</dt>
            <dd>{fmtMoney(envio)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-borde pt-1 text-base font-extrabold text-texto">
          <dt>TOTAL</dt>
          <dd>{fmtMoney(totalTicket)}</dd>
        </div>
        {r?.totalEnLetras && (
          <p className="text-[11px] italic leading-snug text-texto-2">{totalEnLetras(totalTicket)}</p>
        )}
      </dl>
      {/* Lo cobrado en la caja (o registrado al entregar) es lo de los
          productos: sin esta línea, un TOTAL mayor que lo pagado se leía
          como un cobro de menos. */}
      {esPositivo(envio) && (
        <p className="mt-1 text-right text-xs text-texto-3">El envío lo cobra el repartidor.</p>
      )}

      {/* Sin "Método de pago y cambio" (Configuración del recibo) el bloque
          no sale; el método igual queda en la cabecera ("Pago:"). */}
      <dl className={`mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm ${r && !r.pagoYCambio ? "hidden" : ""}`}>
        <div className="flex justify-between text-texto-2">
          <dt>Método de pago</dt>
          <dd className="font-bold text-texto">{metodo}</dd>
        </div>
        {efectivo && (
          <div className="flex justify-between text-texto-2">
            <dt>
              Efectivo recibido
              {propinaEnEfectivo > 0 && (
                <span className="block text-xs">(incluye la propina)</span>
              )}
            </dt>
            <dd className="font-bold text-texto">{fmtMoney(efectivoRecibido)}</dd>
          </div>
        )}
        {(qr || propinaPorQr > 0) && (
          <div className="flex justify-between text-texto-2">
            <dt>
              Monto QR
              {propinaPorQr > 0 && (
                <span className="block text-xs">{qr ? "(incluye la propina)" : "(la propina)"}</span>
              )}
            </dt>
            <dd className="font-bold text-texto">{fmtMoney(montoQr)}</dd>
          </div>
        )}
        {cambio > 0 && (
          // Con `gap`: en el ticket de 320 px se leía "Cambio entregadoBs 27,00".
          <div className="flex justify-between gap-2 font-bold text-texto">
            <dt>Cambio entregado</dt>
            <dd>{fmtMoney(cambio)}</dd>
          </div>
        )}
        {/* Belleza: lo que se pagó con cada vale y lo que le queda (QA
            N2-12). Sólo si la venta usó vales: el ticket de siempre no
            cambia. */}
        {(venta.giftCards ?? []).map((g) => (
          <div key={g.codigo} className="text-texto-2">
            <div className="flex justify-between">
              <dt>Vale {g.codigo}</dt>
              <dd className="font-bold text-texto">{fmtMoney(g.usado)}</dd>
            </div>
            <p className="text-right text-xs">Le quedan {fmtMoney(g.saldo)}</p>
          </div>
        ))}
      </dl>

      {propinas.length > 0 && (
        <dl className="mt-2 space-y-1 border-t border-dashed border-borde pt-2 text-sm" aria-label="Propinas">
          <p className="text-xs font-bold tracking-wide text-texto">PROPINAS</p>
          {propinas.map((x, i) => (
            <div key={i} className="flex justify-between text-texto-2">
              <dt>
                Para {x.recurso} ({x.formaPago})
              </dt>
              <dd className="font-bold text-texto">{fmtMoney(x.monto)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Educación (E10): cada cuota cobrada con lo que queda y, al pie, el
          saldo del curso después de este pago y la próxima cuota. Sólo si
          la venta cobró cuotas: el ticket de siempre no cambia. */}
      {venta.cuotas && venta.cuotas.length > 0 && (
        <CuotasRecibo cuotas={venta.cuotas} pagador={venta.pagadorCuotas ?? null} />
      )}
      {venta.cuotas && venta.cuotas.length > 0 && (
        <EnlaceEstadoCuenta enlacePago={enlaceDeCuotas(venta.cuotas)} inscripcionId={venta.inscripcionCuotas} />
      )}

      {venta.credito && (
        <div className="mt-2 border-t border-dashed border-borde pt-2 text-sm">
          <p className="text-center text-xs font-bold tracking-wide text-texto">
            VENTA A CRÉDITO
          </p>
          <dl className="mt-1 space-y-1">
            <FilaDato etiqueta="Cliente" valor={venta.credito.clienteNombre} />
            {venta.credito.adelanto > 0 && (
              <FilaDato
                etiqueta="Adelanto de hoy"
                valor={fmtMoney(venta.credito.adelanto)}
              />
            )}
            {/* Con el mismo `gap-2` de FilaDato: sin él, en el ticket angosto
                se leía "SALDO POR COBRARBs 37,00", pegado. */}
            <div className="flex justify-between gap-2 font-bold text-texto">
              <dt>SALDO POR COBRAR</dt>
              <dd className="text-right">{fmtMoney(venta.credito.saldo)}</dd>
            </div>
            <FilaDato
              etiqueta="Paga el"
              valor={fmtFecha(venta.credito.fechaCompromiso)}
            />
          </dl>
        </div>
      )}

      {r && (r.qr.mostrar || (conTicket && r.minutosEstimados > 0)) && (
        <QrRecibo r={r} conTicket={conTicket} />
      )}

      <div className="mt-3 border-t border-dashed border-borde pt-2 text-center text-xs text-texto-3">
        {r ? (
          <>
            {r.mensaje && <p className="font-semibold text-texto">{r.mensaje}</p>}
            {r.mensaje2 && <p className="mt-0.5">{r.mensaje2}</p>}
          </>
        ) : (
          <>
            <p>¡Gracias por su compra!</p>
            <p className="mt-0.5">Conserve este recibo</p>
          </>
        )}
      </div>
    </article>
  );

  const avisoAbajo = !ancha && avisoCompartir && (
    <p className="border-t border-borde bg-muted px-4 py-2 text-center text-[13px] text-texto-2 print:hidden">
      {avisoCompartir}
    </p>
  );
  const barraAbajo = !ancha && (
    // Con `flex-wrap`: a 390 px, con Imprimir y Compartir, "Nueva venta"
    // quedaba cortado afuera de la pantalla. Ahora baja a su renglón.
    <div className="flex flex-wrap gap-2 border-t border-borde bg-white py-4 print:hidden px-[max(1rem,calc(50%-16rem+1rem))]">
      {conTicket && imprimirTodo("min-w-[12rem] flex-[2]")}
      {imprimirYCompartir}
      {historial}
      {nueva("min-w-[10rem] flex-1")}
    </div>
  );

  if (conTicket) {
    // Con número de pedido (maqueta de Claude Design, 29-oct): a la izquierda
    // lo que la caja mira y toca —la venta, el número que se canta y los
    // botones— y a la derecha los dos papeles lado a lado, cada uno con su
    // impresora. En una sola columna la comanda quedaba abajo, fuera de la
    // vista. Sin lugar para los dos, la comanda baja debajo del recibo.
    const numero = ticketPedido!.numero;
    return (
      <div ref={raiz} className="@container flex h-full min-h-0 w-full flex-col">
        {anchoPapel && <HojaAngosta />}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 @3xl:px-8 @3xl:py-8">
          <div className="mx-auto w-full max-w-[66rem] @3xl:flex @3xl:items-start @3xl:gap-10">
            <div className="mx-auto w-full max-w-sm print:hidden @3xl:mx-0 @3xl:w-80 @3xl:shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                  <Icon name="check" size={24} strokeWidth={2.5} />
                </span>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-texto">Venta registrada</h1>
                  <p className="text-[13px] text-texto-3">{venta.comprobante ?? `#${venta.id}`}</p>
                </div>
              </div>
              <NumeroGrande numero={numero} detalles={detalles} />
              {ancha && (
                <div className="mt-5 space-y-3">
                  {imprimirTodo("w-full py-3.5 text-base")}
                  {nueva("w-full py-3 text-base")}
                  <div className="flex flex-wrap justify-center gap-2">
                    {imprimirYCompartir}
                    {historial}
                  </div>
                  {avisoCompartir && <p className="text-center text-[13px] text-texto-2">{avisoCompartir}</p>}
                </div>
              )}
            </div>

            {/* Los dos papeles en la misma impresión, con un corte en el
                medio (index.css), o cada uno solo con el botón de su rótulo. */}
            <div
              id="area-impresion"
              data-imprimir={soloPapel ?? undefined}
              className="mt-6 flex flex-wrap items-start justify-center gap-x-6 gap-y-5 print:mt-0 print:block @3xl:mt-0 @3xl:flex-1 @3xl:justify-start"
              style={anchoPapel ? ({ "--ancho-ticket": anchoPapel.ticket } as CSSProperties) : undefined}
            >
              <section className="w-full max-w-[320px] print:max-w-none">
                <RotuloPapel
                  icono="printer"
                  papel="Recibo del cliente"
                  impresora="Impresora de caja"
                  accion="Imprimir solo el recibo"
                  onImprimir={() => imprimir("recibo")}
                />
                {papelRecibo}
              </section>
              <section className="w-full max-w-[320px] print:max-w-none">
                <RotuloPapel
                  icono="fuego"
                  papel="Comanda de cocina"
                  impresora="Impresora de cocina"
                  accion="Imprimir solo la comanda"
                  onImprimir={() => imprimir("comanda")}
                />
                <ComandaCocina
                  venta={venta}
                  numero={numero}
                  negocio={negocio?.nombre ?? ""}
                  minutos={r?.minutosEstimados ?? 0}
                />
              </section>
            </div>
          </div>
        </div>
        {avisoAbajo}
        {barraAbajo}
      </div>
    );
  }

  // Con lugar (26-oct): "Venta registrada" a la izquierda y el ticket a la
  // derecha, en vez de la columna del celular en el medio. Igual que el cobro,
  // mide su lugar y no la ventana. Desde el 27-oct, en 52rem y no en 60rem:
  // con 60 el aviso y el ticket quedaban cada uno en una punta.
  return (
    <div ref={raiz} className="@container flex h-full min-h-0 w-full flex-col">
      {anchoPapel && <HojaAngosta />}
      <div className="min-h-0 flex-1 overflow-y-auto py-4 px-[max(1rem,calc(50%-16rem+1rem))] @3xl:px-[max(1.5rem,calc(50%-26rem+1.5rem))] @3xl:grid @3xl:grid-cols-2 @3xl:content-start @3xl:items-start @3xl:gap-8 @3xl:py-8">
        <div className="mb-4 flex flex-col items-center text-center print:hidden @3xl:mb-0">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              venta.pendienteSync ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
            }`}
          >
            <Icon name={venta.pendienteSync ? "wifiOff" : "check"} size={28} strokeWidth={2.5} />
          </span>
          <h1 className="mt-3 text-lg font-bold text-texto">
            {venta.pendienteSync ? "Venta guardada sin internet" : "Venta registrada"}
          </h1>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {/* Cobrada sin señal (app del iPhone): todavía no tiene número; se
                lo pone el servidor al subirla. Lo mismo que el SIN
                SINCRONIZAR del ticket de Android. */}
            {venta.pendienteSync
              ? "Se sube sola cuando vuelva la conexión. El número lo pone el sistema al subirla."
              : (venta.comprobante ?? `#${venta.id}`)}
          </p>
          {ancha && (
            <div className="mt-6 w-full max-w-sm space-y-3">
              {nueva("w-full")}
              <div className="flex flex-wrap justify-center gap-2">
                {imprimirYCompartir}
                {historial}
              </div>
              {avisoCompartir && <p className="text-[13px] text-texto-2">{avisoCompartir}</p>}
            </div>
          )}
        </div>

        {papelRecibo}
      </div>
      {avisoAbajo}
      {barraAbajo}
    </div>
  );
}

/**
 * El número de pedido en la pantalla, para cantárselo al cliente al darle el
 * papel. Con las marcas de lo que lleva: en mesa, para llevar o las dos.
 */
function NumeroGrande({ numero, detalles }: { numero: number; detalles: NonNullable<Venta["detalles"]> }) {
  const enMesa = detalles.some((d) => d.consumo === "MESA");
  const llevar = detalles.some((d) => d.consumo !== "MESA");
  return (
    <div className="mt-5 w-full rounded-3xl border border-borde bg-white px-4 py-5 text-center shadow-sm">
      <p className="text-[11px] font-bold tracking-[0.18em] text-texto-3">NÚMERO DE TICKET DEL CLIENTE</p>
      <p className="mt-2 text-[80px] font-black leading-none tracking-tight text-primary-700 tabular-nums">
        {numeroTicket(numero)}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        {enMesa && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-[13px] font-bold text-primary-700">
            <Icon name="cubiertos" size={14} />
            En mesa
          </span>
        )}
        {llevar && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-[13px] font-bold text-amber-950">
            <Icon name="bolsa" size={14} />
            Para llevar
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Qué papel es y a qué impresora va, con su botón para imprimirlo solo. En
 * pantalla nada más: no sale en el papel.
 */
function RotuloPapel({
  icono,
  papel,
  impresora,
  accion,
  onImprimir,
}: {
  icono: "printer" | "fuego";
  papel: string;
  impresora: string;
  /** El nombre del botón para el lector de pantalla y el globito del mouse. */
  accion: string;
  onImprimir: () => void;
}) {
  return (
    <div className="mx-auto mb-2 flex max-w-[320px] items-center gap-2 print:hidden">
      <Icon name={icono} size={16} className="shrink-0 text-texto-3" />
      <p className="min-w-0 flex-1 leading-tight">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-texto-2">{papel}</span>
        <span className="block text-[11px] text-texto-3">{impresora}</span>
      </p>
      <button
        type="button"
        onClick={onImprimir}
        aria-label={accion}
        title={accion}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-borde bg-white px-3 text-[13px] font-semibold text-texto transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
      >
        <Icon name="printer" size={20} />
        Imprimir
      </button>
    </div>
  );
}

/** Los renglones en mesa primero y después los para llevar, cada grupo en su orden. */
function porConsumo(detalles: NonNullable<Venta["detalles"]>) {
  const enMesa = detalles.filter((d) => d.consumo === "MESA");
  const llevar = detalles.filter((d) => d.consumo !== "MESA");
  return [
    ...(enMesa.length ? [{ consumo: "MESA" as const, lineas: enMesa }] : []),
    ...(llevar.length ? [{ consumo: "LLEVAR" as const, lineas: llevar }] : []),
  ];
}

/** Fila etiqueta/valor de la cabecera y del bloque de crédito. */
function FilaDato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-texto-3">{etiqueta}</dt>
      <dd className="text-right font-bold text-texto">{valor}</dd>
    </div>
  );
}

/**
 * Un artículo en DOS renglones, como `row_ticket_item.xml`:
 *
 *     Brasa cuarto                    M
 *     1 × Bs 26.00             Bs 26.00
 *
 * En una sola línea, a 72 mm de ancho el nombre se come el espacio y sale
 * cortado con "…". Partido, el nombre tiene el renglón entero y los números
 * quedan alineados en columna, que es como se lee un ticket.
 */
function LineaTicket({
  linea,
  mostrarConsumo,
  cuota,
}: {
  linea: NonNullable<Venta["detalles"]>[number];
  mostrarConsumo: boolean;
  /**
   * Educación: la cuota que cobró. Con los módulos que cubre, el renglón dice
   * «Barbería · M2 Degradados» (D6); si no, el concepto delante del producto
   * («Cuota 2/2 · Barbería»).
   */
  cuota?: { concepto: string; modulos?: string };
}) {
  const enMesa = linea.consumo === "MESA";
  return (
    <div className="py-1 text-[13px]">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-semibold text-texto">{cuota ? (cuota.modulos ? `${linea.producto} · ${cuota.modulos}` : `${cuota.concepto} · ${linea.producto}`) : linea.producto}</p>
        {mostrarConsumo && (
          <span
            className={`shrink-0 font-bold ${enMesa ? "text-primary-700" : "text-texto-3"}`}
          >
            {enMesa ? "M" : "LL"}
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 text-texto-3">
        <span>
          {fmtNum(linea.cantidad)} × {fmtMoney(linea.precio)}
        </span>
        <span className="shrink-0 font-bold text-texto">{fmtMoney(linea.subtotal)}</span>
      </div>
      {!!linea.descuento && linea.descuento > 0 && (
        <div className="flex items-start justify-between gap-2 text-xs text-texto-3">
          <span>{linea.descuentoNombre ?? "Descuento"}</span>
          <span className="shrink-0">− {fmtMoney(linea.descuento)}</span>
        </div>
      )}
      {linea.nota && <p className="text-xs italic text-texto-3">{linea.nota}</p>}
      {/* Belleza: quién lo hizo y, si es de un paquete, qué sesión fue o qué
          trae. Una venta sin profesional ni paquetes no lo trae y el ticket
          de siempre no cambia. */}
      {linea.recurso && <p className="text-xs text-texto-3">Atendió: {linea.recurso}</p>}
      {linea.paquete && (
        <p className="text-xs font-semibold text-texto-2">
          {linea.paquete.tipo === "SESION" ? `${linea.paquete.nombre}: ` : ""}
          {linea.paquete.texto}
        </p>
      )}
    </div>
  );
}

/** La cuota que cobró un renglón, con los módulos que cubre (D6); `undefined` si no es de una cuota. */
function cuotaDeLinea(venta: Venta, cuotaId: number | null | undefined): { concepto: string; modulos?: string } | undefined {
  const q = cuotaId != null ? venta.cuotas?.find((x) => x.cuotaId === cuotaId) : undefined;
  return q ? { concepto: q.concepto, modulos: modulosDeCuotaVenta(q) } : undefined;
}

/**
 * Las cuotas del recibo. Todas las de una venta son de una inscripción (el
 * POS cobra las de un alumno por vez): el saldo del curso y la próxima cuota
 * son los de la última, que es como quedó la inscripción después de la venta.
 */
function CuotasRecibo({
  cuotas,
  pagador,
}: {
  cuotas: NonNullable<Venta["cuotas"]>;
  /** Quién pagó, cuando no fue el alumno. */
  pagador: Venta["pagadorCuotas"] | null;
}) {
  const ultima = cuotas[cuotas.length - 1];
  return (
    <div className="mt-2 border-t border-dashed border-borde pt-2 text-sm" aria-label="Cuotas">
      <p className="text-xs font-bold tracking-wide text-texto">CUOTAS · {cuotas[0].alumno.toUpperCase()}</p>
      {pagador && <p className="text-xs text-texto-2">Pagó: {pagador.nombre} (tutor)</p>}
      <dl className="mt-1 space-y-1">
        {cuotas.map((q) => (
          <div key={q.cuotaId} className="text-texto-2">
            <div className="flex justify-between gap-2">
              <dt>{modulosDeCuotaVenta(q) ? `${q.concepto} · ${modulosDeCuotaVenta(q)}` : q.concepto}</dt>
              <dd className="shrink-0 font-bold text-texto">{fmtMoney(q.cobrado)}</dd>
            </div>
            <p className="text-right text-xs">{q.saldo > 0 ? `Queda ${fmtMoney(q.saldo)}` : "Pagada"}</p>
          </div>
        ))}
        {ultima.saldoCurso != null && (
          <div className="flex justify-between font-bold text-texto">
            <dt>SALDO DEL CURSO</dt>
            <dd>{fmtMoney(ultima.saldoCurso)}</dd>
          </div>
        )}
        <p className="text-xs text-texto-3">
          {ultima.saldoCurso === 0
            ? "Curso pagado por completo."
            : ultima.proximaCuota
              ? `Próxima cuota: ${fmtMoney(ultima.proximaCuota.monto)} el ${fmtFecha(ultima.proximaCuota.vence)}`
              : ""}
        </p>
      </dl>
    </div>
  );
}
