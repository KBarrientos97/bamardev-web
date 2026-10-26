import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Modal } from "../../components/ui";
import { quedoEnDuda } from "../../lib/cupo";
import { fmtMoney } from "../../lib/format";
import { montoParaEditar } from "../../lib/montoTecleado";
import { useBloqueoCupo } from "../../lib/useBloqueoCupo";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { devolucionDe, round2, textoDevolucion } from "./calculo";
import { avisoCuentaRecalculada, etiquetaCuenta, type CobroIntentado, type CobroSugerido } from "./CerrarMesa.datos";
import { CambioDelCobro, FormCobro } from "./Cobro";
import { huellaAdelanto } from "./reintentos";
import { agruparItems, billar } from "./store";
import type { CuentaSinMesa } from "./tipos";
import { BotonB, BotonesCuentaNueva, ErrorAccion, Fila, Nota } from "./ui";
import { useAccion } from "./useAccion";
import { useCobro } from "./useCobro";
import { textoMetodo, vistaCuenta } from "./vista";

/**
 * Las cuentas abiertas (21-oct): gente que se sienta a tomar sin jugar. Se
 * abren con un nombre, se les carga consumo (la pantalla del consumo), pagan
 * de a poco (`ModalPagoCuenta`) y al final se cobra el saldo
 * (`ModalCobrarCuenta`). Es la misma plata que la cuenta de una mesa, sin el
 * tiempo.
 */

/** Abrir una cuenta: sólo el nombre con que la van a reconocer en el tablero. */
export function ModalNuevaCuenta({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState("");
  const accion = useAccion();
  // Con wifi malo, el reintento de la misma cuenta no abre otra (el backend
  // devuelve la que ya entró).
  const intento = useIntentoDeCobro();
  /**
   * Plan Emprendedor: como abrir una mesa, ocupa un lugar del cupo del día
   * (el cobro final ya no consume otro). Sin lugar ni créditos, la hoja de
   * compra y este diálogo se cierra (una sola capa, como "Abrir mesa").
   */
  const { verificar, manejarError, registrar } = useBloqueoCupo("VENTA", { refrescarAlMontar: true });
  const enDuda = useRef(false);
  const limpio = nombre.trim().replace(/\s+/g, " ");

  const abrirla = async () => {
    if (limpio.length < 2 || accion.enviando) return;
    if (!enDuda.current && !verificar()) {
      onClose();
      return;
    }
    let id: number | null = null;
    const ok = await accion.ejecutar(
      async () => {
        const r = await billar.abrirCuenta(limpio, intento.actual(`cuenta:${limpio.toLowerCase()}`));
        registrar(r);
        id = r.cuenta.id;
      },
      (err) => {
        enDuda.current = quedoEnDuda(err);
        if (!manejarError(err)) return false;
        onClose();
        return true;
      },
    );
    if (!ok || id == null) return;
    enDuda.current = false;
    intento.registrado();
    onClose();
    navigate(`/billar?ver=cuentas&cuenta=${id}`, { replace: true });
  };

  return (
    <Modal
      abierto
      titulo="Nueva cuenta"
      subtitulo="Para los que se sientan a tomar sin jugar: se anota lo que piden y pagan cuando quieran, de a poco o todo al final."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB variante="verde" icono="check" disabled={limpio.length < 2 || accion.enviando} onClick={() => void abrirla()}>
            {accion.enviando ? "Abriendo…" : "Abrir cuenta"}
          </BotonB>
        </>
      }
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void abrirla();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Nombre de la cuenta</span>
          <Input
            autoFocus
            value={nombre}
            maxLength={40}
            onChange={(ev) => setNombre(ev.target.value)}
            placeholder="Ej. Mesa de afuera, Juan, Barra"
          />
        </label>
        <p className="mt-1.5 text-xs text-texto-4">Cómo la van a reconocer en el tablero: la mesa, la persona o el lugar.</p>
      </form>
      <ErrorAccion texto={accion.error} />
    </Modal>
  );
}

/** Un cobro parcial: "ir matando la cuenta de a poco". Hasta lo que se debe ahora. */
export function ModalPagoCuenta({ cuenta, onClose }: { cuenta: CuentaSinMesa; onClose: () => void }) {
  // El saldo de cuando se abrió: si otro equipo carga algo mientras se
  // escribe, el tope no se mueve.
  const [saldo] = useState(() => vistaCuenta(cuenta, Date.now()).calc.saldo);
  const cobro = useCobro(saldo, true);
  const accion = useAccion();
  // Con wifi malo la respuesta se pierde y el cajero vuelve a tocar
  // "Registrar": el mismo id hace que el cobro entre una sola vez al cajón.
  const intento = useIntentoDeCobro();
  const registrar = async () => {
    const pago = cobro.pago;
    if (!pago) return;
    const clave = intento.actual(huellaAdelanto(cuenta.sesion.id, pago));
    if (!(await accion.ejecutar(() => billar.pagarCuenta(cuenta.id, pago, clave)))) return;
    intento.registrado();
    onClose();
  };
  return (
    <Modal
      abierto
      titulo={`Registrar cobro · ${cuenta.nombre}`}
      subtitulo="Un pago parcial: se descuenta del saldo y el resto se cobra al final."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-lg"
      acciones={
        <>
          <CambioDelCobro cobro={cobro} />
          <BotonB onClick={onClose}>Cancelar</BotonB>
          <BotonB variante="verde" icono="check" disabled={!cobro.pago || accion.enviando} onClick={() => void registrar()}>
            {accion.enviando ? "Registrando…" : `Registrar ${fmtMoney(cobro.monto)}`}
          </BotonB>
        </>
      }
    >
      <FormCobro cobro={cobro} cambioEnElPie de="la cuenta" />
      <ErrorAccion texto={accion.error} />
    </Modal>
  );
}

/**
 * Cobrar el saldo y cerrar la cuenta: una venta normal con lo que tomaron, y
 * los cobros parciales como pagos de esa venta. Sin reloj, el monto sólo
 * cambia si otro equipo carga, anula o cobra algo.
 *
 * Se cobra la cuenta como estaba al abrir el cobro (la "foto", como el cierre
 * de una mesa). Con la cuenta en vivo, el sondeo de cada 5 s cambiaba el monto
 * del botón y el cambio mientras el cajero cobraba, y el servidor lo aceptaba
 * porque se le mandaba el total nuevo: con el vuelto de la cuenta vieja ya
 * dado, el cajón quedaba corto (revisión del 23-oct). Ahora, si la cuenta
 * cambia, se avisa con el mismo aviso del cierre de una mesa y no se cobra
 * hasta tomar la cuenta nueva; la vieja, si igual llega, el servidor no la
 * cobra (MESA_CAMBIO).
 *
 * `cuenta` es la del tablero: undefined si ya se cobró o se anuló. El modal se
 * queda con la de cuando se abrió y, si la del tablero se va, lo dice (ver
 * `seFue`) en vez de desaparecer.
 */
export function ModalCobrarCuenta({ cuenta, onClose }: { cuenta?: CuentaSinMesa; onClose: () => void }) {
  const [alAbrir] = useState(cuenta);
  // Abierto para una cuenta que ya no estaba (un aviso viejo): no hay qué cobrar.
  return alAbrir ? <CobrarCuenta alAbrir={alAbrir} viva={cuenta} onClose={onClose} /> : <SinCuenta onClose={onClose} />;
}

function SinCuenta({ onClose }: { onClose: () => void }) {
  useEffect(onClose, [onClose]);
  return null;
}

function CobrarCuenta({
  alAbrir,
  viva,
  onClose,
}: {
  alAbrir: CuentaSinMesa;
  viva?: CuentaSinMesa;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [cuenta, setCuenta] = useState(alAbrir);
  const { calc } = vistaCuenta(cuenta, Date.now());
  const cobro = useCobro(calc.saldo);
  const accion = useAccion();
  const intento = useIntentoDeCobro();
  /** Ya se cobró desde acá: lo que pase con la cuenta después no es un aviso. */
  const cobrada = useRef(false);
  const items = agruparItems(cuenta.sesion.consumos);
  /** Lo pagado de más (se anuló un consumo después de un cobro parcial): hay que devolverlo. */
  const aFavor = round2(calc.pagado - calc.total);
  const devolver = textoDevolucion(devolucionDe(cuenta.sesion.pagos, calc.total));
  /**
   * La cuenta ya no está abierta: se cobró o se anuló en otro equipo, o este
   * mismo cobro entró y se perdió la respuesta. El modal desaparecía solo, sin
   * el aviso ni el ticket, y el cajero no sabía si había cobrado (revisión del
   * 23-oct; el cierre de una mesa ya lo decía).
   */
  const seFue = !viva && !accion.enviando && !cobrada.current;

  // Lo que el cobro ya tenía encaminado, para decir qué hacer con lo entregado
  // si la cuenta cambió (lo mismo que arma el cierre de una mesa).
  const qrALaVista =
    cobro.metodo === "QR" || (cobro.metodo === "Mixto" && cobro.montoQr > 0 && cobro.montoQr < cobro.monto);
  const enCurso: CobroIntentado = {
    hasta: 0,
    total: calc.total,
    saldo: calc.saldo,
    pagado: calc.pagado,
    aFavor: Math.max(0, aFavor),
    qr: qrALaVista ? cobro.montoQr : 0,
    qrConfirmado: cobro.qrConfirmado,
    efectivo:
      cobro.metodo === "Efectivo"
        ? cobro.sinRecibido
          ? 0
          : Math.min(cobro.recibido, calc.saldo)
        : cobro.metodo === "Mixto" && qrALaVista
          ? Math.max(0, round2(cobro.monto - cobro.montoQr))
          : 0,
  };
  const nueva = viva ? vistaCuenta(viva, Date.now()).calc : null;
  const avisoOtro =
    viva && nueva
      ? avisoCuentaRecalculada(
          enCurso,
          {
            total: nueva.total,
            saldo: nueva.saldo,
            pagado: nueva.pagado,
            devolver: textoDevolucion(devolucionDe(viva.sesion.pagos, nueva.total)),
          },
          "otroEquipo",
        )
      : null;
  /** `pago`: "Todavía no pagó" (con el QR sin confirmar) deja el cobro de cero, sin la sugerencia. */
  const usarCuentaNueva = (pago = true) => {
    if (!viva) return;
    const sugerido: CobroSugerido = pago ? (avisoOtro?.sugerido ?? null) : null;
    setCuenta(viva);
    cobro.reiniciar();
    if (sugerido) {
      cobro.setMetodo(sugerido.metodo);
      if (sugerido.metodo === "Mixto") cobro.setEfectivoTexto(montoParaEditar(sugerido.efectivo));
    }
    // El "no" del servidor por la cuenta vieja ya está explicado; otros (sin
    // conexión, caja cerrada) quedan: pueden decir que el cobro entró.
    const codigo = accion.codigo ?? "";
    if (codigo.startsWith("MESA_") || codigo === "MONTO_DISTINTO") accion.setError("");
  };
  const listo = !seFue && !avisoOtro && (calc.saldo > 0 ? !!cobro.pago : true);

  const cobrar = async () => {
    const pago = calc.saldo > 0 ? cobro.pago : null;
    if (calc.saldo > 0 && !pago) return;
    let hecho: Awaited<ReturnType<typeof billar.cerrarCuenta>> | null = null;
    const ok = await accion.ejecutar(async () => {
      hecho = await billar.cerrarCuenta(cuenta.id, {
        totalEsperado: calc.total,
        pago: pago ?? undefined,
        // La misma clave para el mismo cobro: si el primero entró y se perdió
        // la respuesta, el backend devuelve esa venta en vez de cobrar dos veces.
        clienteRequestId: intento.actual(`cerrar-cuenta:${cuenta.id}:${calc.total}:${calc.pagado}`),
      });
      cobrada.current = true;
    });
    const r = hecho as Awaited<ReturnType<typeof billar.cerrarCuenta>> | null;
    if (!ok || !r) return;
    intento.registrado();
    onClose();
    if (r.reintento && pago) {
      // El reintento devolvió una venta que ya había entrado: pudo quedar con
      // el medio del primer intento. Que no salga el aviso verde con el nuevo.
      billar.avisar({
        tono: "ambar",
        titulo: `La cuenta «${cuenta.nombre}» ya se había cobrado (${r.codigo})`,
        texto: "Mirá con qué medio quedó. Si pagó de otra forma, usá «Corregir pago» en el detalle de la venta antes de cerrar la caja.",
        accion: { tipo: "venta", codigo: r.codigo },
      });
    } else {
      billar.avisar({
        tono: "verde",
        titulo: `Venta ${r.codigo} completada · Cuenta «${cuenta.nombre}» cobrada`,
        texto:
          pago?.metodo === "Efectivo"
            ? `Cambio ${fmtMoney(cobro.cambio)}`
            : pago
              ? textoMetodo(pago)
              : aFavor > 0.005
                ? `Devolvé ${devolver} al cliente.`
                : "Estaba todo pagado.",
        accion: { tipo: "ticket", codigo: r.codigo },
      });
    }
    navigate("/billar?ver=cuentas", { replace: true });
  };

  return (
    <Modal
      abierto
      titulo={`Cobrar cuenta · ${cuenta.nombre}`}
      subtitulo="Se cobra el saldo y la cuenta se cierra."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-lg"
      acciones={
        seFue ? (
          <>
            <BotonB onClick={onClose}>Cerrar</BotonB>
            <BotonB
              variante="verde"
              icono="fileText"
              onClick={() => {
                onClose();
                navigate("/billar/ventas");
              }}
            >
              Ver las ventas
            </BotonB>
          </>
        ) : (
          <>
            {calc.saldo > 0 && <CambioDelCobro cobro={cobro} />}
            <BotonB onClick={onClose}>Cancelar</BotonB>
            <BotonB variante="verde" icono="check" disabled={!listo || accion.enviando} onClick={() => void cobrar()}>
              {accion.enviando ? "Cobrando…" : calc.saldo > 0 ? `Cobrar ${fmtMoney(calc.saldo)} y cerrar` : "Cerrar cuenta"}
            </BotonB>
          </>
        )
      }
    >
      <div className="mb-4 space-y-1 rounded-xl border border-borde bg-muted px-4 py-3 text-[13px]">
        {items.map((i) => (
          <Fila key={`${i.productoId}-${i.precio}`} etiqueta={`${i.cant}× ${i.nombre}`} valor={fmtMoney(i.precio * i.cant)} />
        ))}
        <div className="mt-1 border-t border-borde pt-1.5">
          <Fila etiqueta="Total" valor={fmtMoney(calc.total)} fuerte />
          {calc.pagado > 0 && <Fila etiqueta="Ya pagó" valor={`− ${fmtMoney(calc.pagado)}`} />}
          <Fila
            etiqueta={<b className="text-amber-800">Saldo</b>}
            valor={<b className="tabular-nums text-amber-800">{fmtMoney(calc.saldo)}</b>}
          />
        </div>
      </div>
      {seFue ? (
        <Nota tono="ambar" icono="alert">
          <b>La cuenta «{cuenta.nombre}» ya no está abierta:</b> se cobró o se anuló, quizás desde otro equipo. Si la estabas
          cobrando y no viste el aviso, el cobro pudo haber entrado: mirá en Ventas antes de cobrarla de nuevo.
        </Nota>
      ) : (
        <>
          {avisoOtro && nueva && (
            <div className="mb-4 space-y-2">
              <Nota tono="ambar" icono="alert">
                {avisoOtro.texto}
              </Nota>
              <BotonesCuentaNueva
                qrSinConfirmar={!!avisoOtro.qrSinConfirmar}
                etiqueta={`Usar la cuenta nueva${etiquetaCuenta(nueva)}`}
                enviando={accion.enviando}
                usar={usarCuentaNueva}
              />
            </div>
          )}
          {calc.saldo > 0 ? (
            <FormCobro cobro={cobro} cambioEnElPie />
          ) : aFavor > 0.005 ? (
            <Nota tono="ambar" icono="alert">
              Pagó de más: al cerrar, devolvele <b>{devolver}</b>.
            </Nota>
          ) : (
            <Nota icono="checkCirculo">Ya está todo pagado: se cierra sin cobrar nada más.</Nota>
          )}
        </>
      )}
      <ErrorAccion texto={accion.error} />
    </Modal>
  );
}
