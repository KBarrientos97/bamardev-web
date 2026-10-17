import { Icon } from "../../components/Icon";
import { Modal } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import { fechaDe, fmtCobrado, horaDe, textoDevolucion } from "./calculo";
import { useDialogos } from "./dialogos";
import { useAhora } from "./reloj";
import { tipoDe, useBillar } from "./store";
import { BotonB, Circulo } from "./ui";
import { origenDe, textoMetodo, vistaDe } from "./vista";

/** El detalle de una venta (§7.9): con Ticket, Anular (PIN) y Listo. */
export function ModalVenta({ codigo, onClose }: { codigo: string; onClose: () => void }) {
  const e = useBillar();
  const { abrir } = useDialogos();
  const v = e.ventas.find((x) => x.codigo === codigo);
  if (!v) return null;
  const sub = v.origen === "rapida" ? "Venta rápida" : `Mesa ${v.mesaId}`;

  return (
    <Modal
      abierto
      titulo={`Venta ${v.codigo}`}
      subtitulo={`${sub} · ${horaDe(v.hora)}`}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          {!v.anulada && (
            <BotonB variante="rosa" icono="trash" className="mr-auto" onClick={() => abrir({ tipo: "anularVenta", codigo })}>
              Anular venta
            </BotonB>
          )}
          <BotonB icono="fileText" onClick={() => abrir({ tipo: "ticket", codigo })}>
            Ticket
          </BotonB>
          <BotonB variante="verde" onClick={onClose}>
            Listo
          </BotonB>
        </>
      }
    >
      {v.anulada && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">
          <Icon name="alert" size={16} />
          <p>
            <b>Anulada {horaDe(v.anulada.hora)}</b> · {v.anulada.motivo} · autorizó {v.anulada.quien}
          </p>
        </div>
      )}
      <div className="space-y-1.5 text-[13px]">
        {v.origen === "mesa" && (
          <Linea izq={`Tiempo de mesa (${fmtCobrado(v.tiempoMin)})`} der={fmtMoney(v.tiempoBs + (v.promo?.descuento ?? 0))} />
        )}
        {/* La pausa a la vista: el cliente ve el tiempo que no se le cobró, y
            el dueño, cuánto se pausó en cada mesa sin abrir otro reporte. */}
        {v.origen === "mesa" && v.pausaMin ? (
          <p className="text-[12px] text-texto-4">En pausa {fmtCobrado(v.pausaMin)} · no se cobra</p>
        ) : null}
        {v.promo && <Linea izq={`${v.promo.nombre} −${v.promo.pct} %`} der={`−${fmtMoney(v.promo.descuento)}`} verde />}
        {v.items.map((i) => (
          <Linea key={`${i.productoId}-${i.precio}`} izq={`${i.cant}× ${i.nombre}`} der={fmtMoney(i.precio * i.cant)} />
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t border-borde pt-3">
        <span className="text-[15px] font-bold uppercase text-texto">Total</span>
        <span className={`text-xl font-extrabold tabular-nums text-texto ${v.anulada ? "line-through opacity-60" : ""}`}>
          {fmtMoney(v.total)}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[13px]">
        {v.pagos.map((p) => (
          <div key={p.id} className="flex items-baseline justify-between gap-3 text-texto-3">
            <span>
              {textoMetodo(p)}
              {p.nota ? ` · ${p.nota}` : ""} · {horaDe(p.hora)}
            </span>
            <span className="font-semibold tabular-nums text-texto">{fmtMoney(p.monto)}</span>
          </div>
        ))}
        {v.devuelto && textoDevolucion(v.devuelto) && (
          <p className="text-texto-3">Devuelto al cliente: {textoDevolucion(v.devuelto)}</p>
        )}
      </div>
    </Modal>
  );
}

function Linea({ izq, der, verde = false }: { izq: string; der: string; verde?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${verde ? "text-primary-700" : "text-texto-2"}`}>
      <span>{izq}</span>
      <span className={`shrink-0 font-semibold tabular-nums ${verde ? "" : "text-texto"}`}>{der}</span>
    </div>
  );
}

/**
 * El ticket de 80 mm (§7.8). Al imprimir sale sólo esto: el `id` es el que
 * `index.css` deja visible, igual que el ticket del POS. La cabecera es la del
 * POS (el nombre del negocio) más la sucursal: la dirección y el NIT de la
 * maqueta no están cargados en ningún lado.
 */
export function ModalTicket({ codigo, onClose }: { codigo: string; onClose: () => void }) {
  const e = useBillar();
  const { negocio } = useAuth();
  const v = e.ventas.find((x) => x.codigo === codigo);
  if (!v) return null;
  const sep = <div className="my-2 border-t border-dashed border-slate-400" />;
  const fila = (a: string, b: string, fuerte = false) => (
    <div className={`flex justify-between gap-2 ${fuerte ? "font-bold" : ""}`}>
      <span>{a}</span>
      <span className="text-right">{b}</span>
    </div>
  );
  const efectivoFinal = v.pagos.filter((p) => p.metodo === "Efectivo").at(-1);

  return (
    <Modal
      abierto
      titulo={`Ticket ${v.codigo}`}
      subtitulo="Vista previa · impresora térmica 80 mm"
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cerrar</BotonB>
          <BotonB variante="verde" icono="printer" onClick={() => window.print()}>
            Imprimir
          </BotonB>
        </>
      }
    >
      <div className="rounded-xl bg-slate-100 p-4">
        <article
          id="area-impresion"
          className="mx-auto max-w-[300px] bg-white px-4 py-5 font-mono text-[11px] leading-relaxed text-black shadow-sm"
        >
          <header className="text-center">
            <p className="text-[13px] font-bold uppercase">{negocio?.nombre ?? "BamarDev"}</p>
            {e.sucursal && <p>{e.sucursal}</p>}
          </header>
          {v.anulada && <p className="mt-2 text-center text-[13px] font-bold">*** ANULADA ***</p>}
          {sep}
          {fila("Venta", v.codigo, true)}
          {fila("Fecha", `${fechaDe(v.hora)} · ${horaDe(v.hora)}`)}
          {fila("Cajero", v.cajero)}
          {v.cliente && fila("Cliente", v.cliente)}
          {fila("Origen", origenDe(v, e.tipos))}
          {sep}
          {v.origen === "mesa" && fila(`Tiempo de mesa ${fmtCobrado(v.tiempoMin)}`, fmtMoney(v.tiempoBs + (v.promo?.descuento ?? 0)))}
          {v.origen === "mesa" && v.pausaMin ? fila(`  En pausa ${fmtCobrado(v.pausaMin)}`, "no se cobra") : null}
          {v.promo && fila(`  ${v.promo.nombre}`, `−${fmtMoney(v.promo.descuento)}`)}
          {v.items.map((i) => (
            <div key={`${i.productoId}-${i.precio}`}>{fila(`${i.cant} × ${i.nombre}`, fmtMoney(i.precio * i.cant))}</div>
          ))}
          {sep}
          <div className="text-[13px]">{fila("TOTAL", fmtMoney(v.total), true)}</div>
          {v.pagos.map((p) => (
            <div key={p.id}>
              {fila(
                `${p.metodo === "Mixto" && p.partes ? `Mixto (Ef. ${p.partes.efectivo} + QR ${p.partes.qr})` : p.metodo}${p.nota ? ` · ${p.nota}` : ""}`,
                fmtMoney(p.monto),
              )}
            </div>
          ))}
          {/* Con devolución no hubo cobro final: el único cambio es el que
              sobró de los adelantos, y un adelanto que queda entero afuera no
              es un pago de la venta. Decía "Cambio Bs 10" con Bs 60 devueltos. */}
          {v.devuelto ? (
            <>
              {v.devuelto.efectivo > 0.005 && fila("Devuelto en efectivo", fmtMoney(v.devuelto.efectivo))}
              {v.devuelto.otros.map((o) => (
                <div key={o.metodo}>{fila(`Devuelto por ${o.metodo}`, fmtMoney(o.monto))}</div>
              ))}
            </>
          ) : (
            v.recibido !== undefined &&
            efectivoFinal && (
              <>
                {fila("Recibido", fmtMoney(v.recibido))}
                {fila("Cambio", fmtMoney(v.cambio ?? 0))}
              </>
            )
          )}
          {sep}
          <p className="text-center">Comprobante interno · no válido como factura</p>
        </article>
      </div>
    </Modal>
  );
}

/**
 * Historial de la mesa en el turno (§7.10): sus ventas, y arriba lo que lleva
 * acumulado si está abierta. Tocar una fila abre la venta.
 */
export function ModalHistorial({ mesaId, onClose }: { mesaId: number; onClose: () => void }) {
  const e = useBillar();
  const ahora = useAhora();
  const { abrir } = useDialogos();
  const mesa = e.mesas.find((m) => m.id === mesaId);
  if (!mesa) return null;
  const ventas = e.ventas.filter((v) => v.mesaId === mesaId).sort((a, b) => b.hora - a.hora);
  const validas = ventas.filter((v) => !v.anulada);
  const vista = vistaDe(e, mesa, ahora);
  const c = vista.cuenta;
  const tiempo = validas.reduce((t, v) => t + v.tiempoMin, 0);
  const vendido = validas.reduce((t, v) => t + v.total, 0);
  const th = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-texto-3";

  return (
    <Modal
      abierto
      titulo={`Historial de Mesa ${mesa.id}${mesa.alias ? ` · ${mesa.alias}` : ""}`}
      subtitulo={`Turno actual · ${tipoDe(e, mesa).nombre}`}
      onClose={onClose}
      ancho="max-w-2xl"
      acciones={
        <BotonB variante="verde" onClick={onClose}>
          Listo
        </BotonB>
      }
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["Usos", String(validas.length)],
          ["Tiempo cobrado", fmtCobrado(tiempo)],
          ["Vendido", fmtMoney(vendido)],
        ].map(([k, val]) => (
          <div key={k} className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700 sm:text-[11px]">{k}</p>
            <p className="text-lg font-extrabold tabular-nums text-texto sm:text-xl">{val}</p>
          </div>
        ))}
      </div>

      {ventas.length === 0 && !c ? (
        <div className="mt-4 flex flex-col items-center gap-2 py-8 text-center text-[13px] text-texto-3">
          <Circulo icono="clock" tono="gris" />
          Esta mesa todavía no se usó en este turno.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-borde">
          <table className="w-full text-[13px]">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className={th}>Hora</th>
                <th className={th}>Venta</th>
                <th className={`${th} text-right`}>Tiempo</th>
                <th className={`${th} hidden text-right sm:table-cell`}>Tiempo Bs</th>
                <th className={`${th} hidden text-right sm:table-cell`}>Consumos</th>
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {c && mesa.sesion && (
                <tr className="border-t border-borde-soft bg-primary-50/70">
                  <td className="px-3 py-3 tabular-nums">{horaDe(mesa.sesion.start)}</td>
                  <td className="px-3">
                    <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-[11px] font-bold uppercase text-primary-700">
                      En curso
                    </span>
                  </td>
                  <td className="px-3 text-right tabular-nums">{fmtCobrado(c.cobradoMin)}</td>
                  <td className="hidden px-3 text-right tabular-nums sm:table-cell">{fmtMoney(c.tiempoBs)}</td>
                  <td className="hidden px-3 text-right tabular-nums sm:table-cell">{fmtMoney(c.consumosBs)}</td>
                  <td className="px-3 text-right font-bold tabular-nums">{fmtMoney(c.total)}</td>
                </tr>
              )}
              {ventas.map((v) => (
                <tr
                  key={v.codigo}
                  onClick={() => abrir({ tipo: "venta", codigo: v.codigo })}
                  className={`cursor-pointer border-t border-borde-soft hover:bg-muted ${v.anulada ? "text-texto-4" : ""}`}
                >
                  <td className="px-3 py-3 tabular-nums">{horaDe(v.hora)}</td>
                  <td className="px-3 font-bold">
                    {v.codigo}
                    {v.anulada && (
                      <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                        Anulada
                      </span>
                    )}
                  </td>
                  <td className="px-3 text-right tabular-nums">{fmtCobrado(v.tiempoMin)}</td>
                  <td className="hidden px-3 text-right tabular-nums sm:table-cell">{fmtMoney(v.tiempoBs)}</td>
                  <td className="hidden px-3 text-right tabular-nums sm:table-cell">{fmtMoney(v.consumosBs)}</td>
                  <td className={`px-3 text-right font-bold tabular-nums ${v.anulada ? "line-through" : ""}`}>
                    {fmtMoney(v.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
