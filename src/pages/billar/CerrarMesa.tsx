import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Vacio } from "../../components/ui";
import { aCentavos } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import type { CreditoInput, PagoInput } from "../../types";
import PantallaCredito from "../pos/PantallaCredito";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { cuentaDe, fmtCobrado, fmtCrono, horaDe, round2, segundosJugados } from "./calculo";
import { FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { useAccion } from "./useAccion";
import { CajaCerradaAviso } from "./ModalesCaja";
import { ahoraServidor, useAhora } from "./reloj";
import { agruparItems, billar, tipoDe, useBillar } from "./store";
import { BotonB, Circulo, Encabezado, ErrorAccion, Nota, Rotulo } from "./ui";
import { textoMetodo } from "./vista";

/**
 * Cerrar la mesa (§7.6): el resumen de la cuenta a la izquierda y el cobro del
 * saldo a la derecha. Confirmar crea una venta normal y deja la mesa libre.
 *
 * La cuenta se calcula al entrar y queda quieta mientras se cobra: si el
 * tiempo sube de tramo mientras se cuenta el vuelto, el monto no cambia bajo
 * los dedos del cajero. El servidor cobra hasta esa misma hora (`hasta`) con
 * las mismas fórmulas, y si su total no es el que se ve acá (otra caja cargó
 * algo, o pasaron más de 5 minutos), no cobra: la cuenta se recalcula a la
 * hora de ahora y el cajero confirma de nuevo viendo el monto nuevo.
 *
 * El fiado es la pantalla de crédito del POS: el cliente de Cuentas por
 * cobrar, el plazo, el adelanto y el límite con PIN, todo igual.
 */
export default function CerrarMesa() {
  const { mesaId } = useParams();
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [hasta, setHasta] = useState(() => ahoraServidor());
  const [fiando, setFiando] = useState(false);
  const accion = useAccion();
  const intento = useIntentoDeCobro();
  useEffect(() => {
    if (accion.codigo === "MESA_CAMBIO") setHasta(ahoraServidor());
  }, [accion.codigo]);
  const mesa = e.mesas.find((m) => m.id === Number(mesaId));
  const sVivo = mesa?.estado === "abierta" ? mesa.sesion : undefined;
  // La cuenta sale de una FOTO de la sesión, no de la que trae el sondeo. Antes
  // se recalculaba cada 5 s: si otro equipo cargaba algo mientras se cobraba,
  // el monto cambiaba solo y `totalEsperado` viajaba ya actualizado, así que el
  // servidor lo aceptaba. Con "Recibido" vacío la venta asentaba en efectivo
  // más de lo que había entrado al cajón (QA del 12-oct).
  const [foto, setFoto] = useState(sVivo);
  useEffect(() => {
    if (sVivo && foto?.id !== sVivo.id) setFoto(sVivo);
  }, [sVivo, foto]);
  const s = sVivo && foto?.id === sVivo.id ? foto : sVivo;
  const tipo = mesa ? tipoDe(e, mesa) : null;
  const c = s && tipo ? cuentaDe(s, tipo, hasta) : null;
  const cobro = useCobro(c?.saldo ?? 0);
  // Lo que debe la mesa con lo último que llegó. Si no es lo de la foto, se
  // avisa y no se cobra hasta que el cajero mire el monto nuevo.
  const cVivo = sVivo && tipo ? cuentaDe(sVivo, tipo, hasta) : null;
  const cambioLaCuenta =
    !!c && !!cVivo && (aCentavos(cVivo.total) !== aCentavos(c.total) || aCentavos(cVivo.saldo) !== aCentavos(c.saldo));
  const usarCuentaNueva = () => {
    setFoto(sVivo);
    setHasta(ahoraServidor());
    cobro.reiniciar();
  };

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
    // Recién cobrada, la mesa ya figura libre pero todavía se traen las ventas
    // del turno: decía "Puede que ya la haya cerrado otra caja" justo después
    // de que este cajero la cobró.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Cerrar Mesa ${mesaId}`}>{reloj}</Encabezado>
        {accion.enviando ? (
          <Vacio icono="bola" titulo="Registrando la venta…" texto={`La Mesa ${mesaId} ya quedó libre.`} />
        ) : (
          <Vacio
            icono="bola"
            titulo={`La Mesa ${mesaId} no está abierta`}
            texto="Puede que ya la haya cerrado otra caja."
            accion={<BotonB onClick={() => navigate("/billar")}>Volver al tablero</BotonB>}
          />
        )}
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

  /** Lo pagado de más (la cuenta bajó después de un adelanto): hay que devolverlo. */
  const aFavor = round2(c.pagado - c.total);

  // Lo que identifica ESTE cobro: la sesión y la hora de la cuenta. Un
  // reintento de lo mismo manda el mismo id y, si el primero había entrado,
  // el backend devuelve esa venta en vez de cobrar dos veces.
  const huella = `cerrar:${s.id}:${hasta}`;

  const cobrar = async (cobroFinal: Parameters<typeof billar.cerrar>[1], texto: string) => {
    let codigo = "";
    const ok = await accion.ejecutar(async () => {
      codigo = await billar.cerrar(mesa.id, cobroFinal);
    });
    if (!ok) return;
    intento.registrado();
    terminar(codigo, texto);
  };

  const confirmar = () => {
    const pago = c.saldo > 0 ? cobro.pago : undefined;
    if (c.saldo > 0 && !pago) return;
    void cobrar(
      { hasta, totalEsperado: c.total, pago: pago ?? undefined, clienteRequestId: intento.actual(huella) },
      pago?.metodo === "Efectivo"
        ? `Cambio ${fmtMoney(cobro.cambio)}`
        : pago
          ? textoMetodo(pago)
          : aFavor > 0.005
            ? `Devolvé ${fmtMoney(aFavor)} al cliente.`
            : "Estaba todo pagado.",
    );
  };

  const fiar = (credito: CreditoInput, pagos: PagoInput[]) => {
    const adelanto = pagos.reduce((t, p) => t + p.monto, 0);
    void cobrar(
      {
        hasta,
        totalEsperado: c.total,
        credito: { credito, pagos },
        clienteRequestId: intento.actual(`${huella}:fiado`),
      },
      `${fmtMoney(c.saldo - adelanto)} a cuentas por cobrar${credito.clienteNombre ? ` (${credito.clienteNombre})` : ""}.`,
    );
  };

  if (fiando) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo={`Fiado · Mesa ${mesa.id}`}>{reloj}</Encabezado>
        <PantallaCredito
          total={c.saldo}
          formasPago={e.formasPago}
          onAtras={() => {
            accion.setError("");
            setFiando(false);
          }}
          onConfirmar={fiar}
          enviando={accion.enviando}
          error={accion.error}
        />
      </div>
    );
  }

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
              {cambioLaCuenta && cVivo && (
                <div className="space-y-2">
                  <Nota tono="ambar" icono="alert">
                    La cuenta cambió mientras cobrabas (otro equipo cargó o cobró algo): ahora el saldo es{" "}
                    {fmtMoney(cVivo.saldo)}.
                  </Nota>
                  <BotonB variante="verde" className="w-full" onClick={usarCuentaNueva}>
                    Usar la cuenta nueva · {fmtMoney(cVivo.saldo)}
                  </BotonB>
                </div>
              )}
              {c.saldo > 0 ? (
                <>
                  <FormCobro cobro={cobro} />
                  <ErrorAccion texto={accion.error} />
                  <BotonB
                    variante="verde"
                    grande
                    className="w-full"
                    disabled={!cobro.pago || accion.enviando || cambioLaCuenta}
                    onClick={confirmar}
                  >
                    {accion.enviando ? "Cobrando…" : `Confirmar cobro y cerrar mesa · ${fmtMoney(c.saldo)}`}
                  </BotonB>
                  {/* Sin permiso de fiar, el servidor lo rechaza: el botón ni aparece. */}
                  {tienePermiso(usuario, "credito.otorgar") && (
                    <BotonB
                      icono="fileText"
                      className="w-full"
                      disabled={accion.enviando || cambioLaCuenta}
                      onClick={() => setFiando(true)}
                    >
                      Pasar saldo a fiado
                    </BotonB>
                  )}
                </>
              ) : (
                <>
                  {/* Lo pagado puede pasar el total si la cuenta bajó después de
                      un adelanto (entró una promo, se anuló un consumo). El
                      arqueo ya da ese sobrante por devuelto, pero la pantalla
                      decía "Ya está todo pagado" y nadie se lo devolvía: el
                      cliente pagaba de más y la caja cerraba con sobrante. */}
                  {aFavor > 0.005 ? (
                    <Nota tono="ambar" icono="alert">
                      Pagó {fmtMoney(aFavor)} de más (la cuenta bajó después de pagar): devolvéselo al cliente al cerrar.
                    </Nota>
                  ) : (
                    <Nota icono="checkCirculo">Ya está todo pagado. Cerrar la deja libre y registra la venta.</Nota>
                  )}
                  <ErrorAccion texto={accion.error} />
                  <BotonB
                    variante="verde"
                    grande
                    icono="check"
                    className="w-full"
                    disabled={accion.enviando || cambioLaCuenta}
                    onClick={confirmar}
                  >
                    {accion.enviando ? "Cerrando…" : "Cerrar mesa"}
                  </BotonB>
                </>
              )}
              {/* Sin punto final: la hora ya termina en "p. m." y quedaba "p. m..". */}
              <p className="text-center text-[12px] text-texto-4">Calculado a las {horaDe(hasta)}</p>
            </section>
          </div>
        </div>
      </div>

    </div>
  );
}
