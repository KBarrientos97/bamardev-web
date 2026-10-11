import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Input, Modal, Vacio } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { cuentaDe, fmtCobrado, fmtCrono, horaDe, segundosJugados } from "./calculo";
import { FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { CajaCerradaAviso } from "./ModalesCaja";
import { useAhora } from "./reloj";
import { agruparItems, billar, tipoDe, useBillar } from "./store";
import { BotonB, Circulo, Encabezado, Nota, Rotulo } from "./ui";
import { textoMetodo } from "./vista";

/**
 * Cerrar la mesa (§7.6): el resumen de la cuenta a la izquierda y el cobro del
 * saldo a la derecha. Confirmar crea una venta normal y deja la mesa libre.
 *
 * La cuenta se calcula al entrar y queda quieta mientras se cobra: si el
 * tiempo sube de tramo mientras se cuenta el vuelto, el monto no cambia bajo
 * los dedos del cajero.
 */
export default function CerrarMesa() {
  const { mesaId } = useParams();
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const [hasta] = useState(() => Date.now());
  const [fiando, setFiando] = useState(false);
  const mesa = e.mesas.find((m) => m.id === Number(mesaId));
  const s = mesa?.estado === "abierta" ? mesa.sesion : undefined;
  const tipo = mesa ? tipoDe(e, mesa) : null;
  const c = s && tipo ? cuentaDe(s, tipo, hasta) : null;
  const cobro = useCobro(c?.saldo ?? 0);

  const reloj = (
    <span className="flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-texto-2">
      <Icon name="clock" size={16} />
      {horaDe(ahora)}
    </span>
  );

  if (!e.caja.abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Cerrar Mesa ${mesaId}`} />
        <CajaCerradaAviso />
      </div>
    );
  }
  if (!mesa || !s || !c || !tipo) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Cerrar Mesa ${mesaId}`}>{reloj}</Encabezado>
        <Vacio
          icono="bola"
          titulo={`La Mesa ${mesaId} no está abierta`}
          texto="Puede que ya la haya cerrado otra caja."
          accion={<BotonB onClick={() => navigate("/billar")}>Volver al tablero</BotonB>}
        />
      </div>
    );
  }

  const terminar = (codigo: string | null, texto: string) => {
    if (codigo) {
      billar.avisar({
        tono: "verde",
        titulo: `Venta ${codigo} completada · Mesa ${mesa.id} quedó libre`,
        texto,
        accion: { tipo: "ticket", codigo },
      });
    }
    navigate("/billar", { replace: true });
  };

  const confirmar = () => {
    const pago = c.saldo > 0 ? cobro.pago : undefined;
    if (c.saldo > 0 && !pago) return;
    const codigo = billar.cerrar(mesa.id, { pago: pago ?? undefined }, hasta);
    terminar(
      codigo,
      pago?.metodo === "Efectivo" ? `Cambio ${fmtMoney(cobro.cambio)}` : pago ? textoMetodo(pago) : "Estaba todo pagado.",
    );
  };

  const secs = segundosJugados(s, hasta);
  const items = agruparItems(s.consumos);
  const detalleTiempo = s.prepago
    ? `cobrado ${fmtCobrado(c.cobradoMin)} (tiempo fijo ${s.prepago.min / 60} h${c.excedenteMin ? ` + ${fmtCobrado(c.excedenteMin)} de excedente` : ""})`
    : `cobrado ${fmtCobrado(c.cobradoMin)}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo={`Cerrar Mesa ${mesa.id}`}>{reloj}</Encabezado>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto max-w-5xl">
          <Link
            to={`/billar?mesa=${mesa.id}`}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-texto-2 hover:text-texto"
          >
            <Icon name="arrowLeft" size={15} />
            Volver al tablero
          </Link>
          <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
            <section className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-borde px-5 py-4">
                <Circulo icono="fileText" size={36} />
                <h2 className="flex-1 text-[15px] font-bold text-texto">Resumen de Mesa {mesa.id}</h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {tipo.nombre}
                </span>
              </div>
              <div className="space-y-4 px-5 py-4 text-[13px]">
                <div>
                  <Rotulo icono="clock">Tiempo</Rotulo>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-texto">Jugado {fmtCrono(secs)}</p>
                      <p className="text-[12px] text-texto-3">
                        Inicio {horaDe(s.start)} · {detalleTiempo}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums text-texto">
                      {fmtMoney(c.tiempoBs + (c.promo?.descuento ?? 0))}
                    </span>
                  </div>
                  {c.promo && (
                    <div className="mt-1 flex justify-between text-primary-700">
                      <span>
                        {c.promo.nombre} −{c.promo.pct} %
                      </span>
                      <span className="font-semibold tabular-nums">−{fmtMoney(c.promo.descuento)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-borde-soft pt-4">
                  <Rotulo icono="cart" extra={fmtMoney(c.consumosBs)}>
                    Consumos
                  </Rotulo>
                  {items.length === 0 ? (
                    <p className="mt-2 text-texto-3">Sin consumos.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {items.map((i) => (
                        <li key={`${i.productoId}-${i.precio}`} className="flex items-center gap-3">
                          <span className="flex h-6 min-w-7 items-center justify-center rounded-md bg-slate-100 px-1 text-[12px] font-bold text-texto-2">
                            {i.cant}×
                          </span>
                          <span className="flex-1 text-texto">{i.nombre}</span>
                          <span className="font-semibold tabular-nums text-texto">{fmtMoney(i.precio * i.cant)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1 border-t border-borde pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-semibold text-texto">TOTAL</span>
                    <span className="text-xl font-extrabold tabular-nums text-texto">{fmtMoney(c.total)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-amber-800">
                    <span>PAGADO</span>
                    <span className="tabular-nums">{fmtMoney(c.pagado)}</span>
                  </div>
                  {s.pagos.map((p) => (
                    <div key={p.id} className="flex justify-between pl-3 text-texto-3">
                      <span>
                        {textoMetodo(p)}
                        {p.nota ? ` · ${p.nota}` : ""}
                      </span>
                      <span className="tabular-nums">{fmtMoney(p.monto)}</span>
                    </div>
                  ))}
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="font-bold text-amber-800">SALDO</span>
                    <span className="text-xl font-extrabold tabular-nums text-amber-800">{fmtMoney(c.saldo)}</span>
                  </div>
                </div>
                {(s.cliente || s.garantia) && (
                  <p className="text-[12px] text-texto-3">
                    {s.cliente ? `Cliente: ${s.cliente}` : ""}
                    {s.cliente && s.garantia && s.garantia !== "Ninguna" ? " · " : ""}
                    {s.garantia && s.garantia !== "Ninguna" ? `Garantía: ${s.garantia} (devolverla)` : ""}
                  </p>
                )}
              </div>
            </section>

            <section className="card space-y-4 p-4 sm:p-5">
              <div className="rounded-2xl bg-gradient-to-br from-primary-boton to-primary-700 px-5 py-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Total a cobrar</p>
                <p className="text-3xl font-extrabold tabular-nums">{fmtMoney(c.saldo)}</p>
                <p className="text-[13px] text-white/85">
                  Mesa {mesa.id} · Total {fmtMoney(c.total)} · Pagado {fmtMoney(c.pagado)}
                </p>
              </div>
              {c.saldo > 0 ? (
                <>
                  <FormCobro cobro={cobro} />
                  <BotonB variante="verde" grande className="w-full" disabled={!cobro.pago} onClick={confirmar}>
                    Confirmar cobro y cerrar mesa · {fmtMoney(c.saldo)}
                  </BotonB>
                  <BotonB icono="fileText" className="w-full" onClick={() => setFiando(true)}>
                    Pasar saldo a fiado
                  </BotonB>
                </>
              ) : (
                <>
                  <Nota icono="checkCirculo">Ya está todo pagado. Cerrar la deja libre y registra la venta.</Nota>
                  <BotonB variante="verde" grande icono="check" className="w-full" onClick={confirmar}>
                    Cerrar mesa
                  </BotonB>
                </>
              )}
              <p className="text-center text-[12px] text-texto-4">Calculado a las {horaDe(hasta)}.</p>
            </section>
          </div>
        </div>
      </div>

      {fiando && (
        <ModalFiado
          saldo={c.saldo}
          clienteInicial={s.cliente ?? ""}
          onClose={() => setFiando(false)}
          onConfirmar={(cliente) => {
            const codigo = billar.cerrar(mesa.id, { fiado: { cliente } }, hasta);
            terminar(codigo, `${fmtMoney(c.saldo)} a cuentas por cobrar (${cliente}).`);
          }}
        />
      )}
    </div>
  );
}

/**
 * Fiado (§7.6): pide a nombre de quién; la deuda va a Cuentas por cobrar.
 * MAQUETA: con el backend se elige el cliente de esa lista.
 */
function ModalFiado({
  saldo,
  clienteInicial,
  onClose,
  onConfirmar,
}: {
  saldo: number;
  clienteInicial: string;
  onClose: () => void;
  onConfirmar: (cliente: string) => void;
}) {
  const [cliente, setCliente] = useState(clienteInicial);
  return (
    <Modal
      abierto
      titulo="Pasar saldo a fiado"
      subtitulo={`${fmtMoney(saldo)} quedan en Cuentas por cobrar.`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB variante="verde" disabled={!cliente.trim()} onClick={() => onConfirmar(cliente.trim())}>
            Fiar {fmtMoney(saldo)} y cerrar
          </BotonB>
        </>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">¿A nombre de quién?</span>
        <Input autoFocus value={cliente} onChange={(ev) => setCliente(ev.target.value)} placeholder="Nombre del cliente" />
      </label>
    </Modal>
  );
}
