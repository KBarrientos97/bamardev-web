import { Fragment, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { publicarContadorBillar } from "../../lib/billar/contador";
import { fmtMoney } from "../../lib/format";
import { desbloquearAudio, hablar, marcarAvisado, nivelAlcanzado, textosAviso, yaAvisado, zumbido } from "./alertas";
import {
  consumosDe,
  cuentaDe,
  devolucionDe,
  fmtTarifaCorta,
  pagadoDe,
  segundosDesdeQueSeAbrio,
  segundosJugados,
  sePuedeAnular,
  textoDevolucion,
} from "./calculo";
import { detalleAnularVenta, efectivoEnOtraCaja, sePuedeCorregirPago } from "./Avisos.datos";
import { ModalCorregirPago } from "./CorregirPago";
import { useDialogos, type Dialogo } from "./dialogos";
import { ModalAbrir, ModalExtender } from "./ModalTiempo";
import { ModalAvisos } from "./ModalesCaja";
import { MOTIVOS_PAUSA } from "./ModalesMesa.datos";
import {
  ModalCambiar,
  ModalEditarInicio,
  ModalMotivo,
  ModalPago,
  ModalPin,
  ModalReservar,
} from "./ModalesMesa";
import { ModalHistorial, ModalTicket, ModalVenta } from "./ModalesVenta";
import { ahoraServidor, useAhora } from "./reloj";
import { billar, leerBillar, recargar, tableroViejo, tipoDe, useBillar, type EstadoBillar, type Toast } from "./store";

/**
 * El motor de los avisos de tiempo fijo (§6). Revisa cada segundo, avisa una
 * vez por umbral y sesión, y publica el contador del menú. Va montado en todas
 * las pantallas del billar: el aviso llega aunque el cajero esté en Ventas.
 */
export function MotorAvisos() {
  const ahora = useAhora();
  // Con la pestaña escondida el sondeo no corre: avisaba "tiempo cumplido" de
  // una mesa que otro equipo ya había extendido o cobrado, y no avisaba las que
  // se abrieron en otro lado (revisión del 16-oct). Con la copia vieja se pide
  // el tablero y se avisa con lo que llega; si el servidor no contesta en 30 s,
  // se avisa con lo que hay, como antes (sin internet igual tiene que sonar).
  const viejoDesde = useRef<number | null>(null);
  const pedidoEn = useRef(0);

  // El navegador no deja sonar nada hasta el primer toque: se desbloquea ahí.
  useEffect(() => {
    const una = () => void desbloquearAudio();
    document.addEventListener("pointerdown", una, { once: true });
    return () => document.removeEventListener("pointerdown", una);
  }, []);

  useEffect(() => {
    const e = leerBillar();
    if (!e.cargado) return;
    if (tableroViejo()) {
      const ya = Date.now();
      if (ya - pedidoEn.current > 3_000) {
        pedidoEn.current = ya;
        void recargar();
      }
      viejoDesde.current ??= ya;
      if (ya - viejoDesde.current < 30_000) return;
    } else {
      viejoDesde.current = null;
    }
    let alerta = false;
    for (const m of e.mesas) {
      const s = m.sesion;
      if (m.estado !== "abierta" || !s?.prepago || s.pausedAt) continue;
      const restante = s.prepago.min * 60 - segundosJugados(s, ahora);
      if (restante <= Math.max(0, ...e.ajustes.avisos) * 60) alerta = true;
      const nivel = nivelAlcanzado(restante, e.ajustes.avisos);
      if (nivel === null || yaAvisado(s.id, nivel, s.prepago.min)) continue;
      marcarAvisado(s.id, nivel, e.ajustes.avisos, s.prepago.min);
      const t = textosAviso(m.id, restante, s.prepago.min / 60, fmtTarifaCorta(tipoDe(e, m).tarifa));
      billar.avisar({
        tono: nivel > 1 ? "ambar" : "rojo",
        titulo: t.titulo,
        texto: t.texto,
        accion: { tipo: "extender", mesaId: m.id },
      });
      if (!e.ajustes.silencio) {
        const dura = e.ajustes.sonido ? zumbido(nivel) : 0;
        if (e.ajustes.voz) hablar(t.voz, dura + 0.2);
      }
    }
    publicarContadorBillar({ abiertas: e.mesas.filter((m) => m.estado === "abierta").length, alerta });
  }, [ahora]);

  return null;
}

const TONO_TOAST: Record<Toast["tono"], { caja: string; circulo: string; icono: "relojArena" | "alert" | "check" }> = {
  ambar: { caja: "border-amber-200", circulo: "bg-amber-100 text-amber-700", icono: "relojArena" },
  rojo: { caja: "border-rose-200", circulo: "bg-rose-100 text-rose-700", icono: "alert" },
  verde: { caja: "border-primary-200", circulo: "bg-primary-50 text-primary-700", icono: "check" },
};

/**
 * Los avisos flotantes de arriba a la derecha. Se van solos a los 15 s.
 *
 * Viven en el Layout (ver `DeFondo`), fuera de los diálogos del billar: su
 * botón lleva a la pantalla con la acción en la dirección (`accion=extender`,
 * `ticket=`), y es esa pantalla la que abre el diálogo, si todavía tiene
 * sentido (la mesa sigue en juego, la venta existe).
 */
export function Toasts() {
  const { toasts } = useBillar();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // El ticket se abre donde está el cajero si ya está en el billar; si no, en el tablero.
  const enBillar = pathname.startsWith("/billar/") && pathname !== "/billar/salon" ? pathname : "/billar";
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[360px]"
    >
      {toasts.map((t) => (
        <UnToast
          key={t.id}
          t={t}
          onAccion={() => {
            billar.descartar(t.id);
            const a = t.accion;
            if (!a) return;
            if (a.tipo === "extender") navigate(`/billar?mesa=${a.mesaId}&accion=extender`);
            else if (a.tipo === "ver") navigate(`/billar?mesa=${a.mesaId}`);
            else if (a.tipo === "venta") navigate(`${enBillar}?venta=${encodeURIComponent(a.codigo)}`);
            else navigate(`${enBillar}?ticket=${encodeURIComponent(a.codigo)}`);
          }}
        />
      ))}
    </div>
  );
}

function UnToast({ t, onAccion }: { t: Toast; onAccion: () => void }) {
  const estilo = TONO_TOAST[t.tono];
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    reloj.current = setTimeout(() => billar.descartar(t.id), 15_000);
    return () => {
      if (reloj.current) clearTimeout(reloj.current);
    };
  }, [t.id]);
  const etiqueta =
    t.accion?.tipo === "extender"
      ? "Extender"
      : t.accion?.tipo === "ticket"
        ? "Imprimir ticket"
        : t.accion?.tipo === "venta"
          ? "Ver la venta"
          : t.accion
            ? "Ver mesa"
            : null;
  return (
    <div
      role={t.tono === "rojo" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-xl ${estilo.caja}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${estilo.circulo}`}>
        <Icon name={estilo.icono} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-texto">{t.titulo}</p>
        {t.texto && <p className="text-[12px] text-texto-3">{t.texto}</p>}
        {etiqueta && (
          <button type="button" onClick={onAccion} className="mt-1 text-[13px] font-bold text-primary-700 hover:underline">
            {etiqueta}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => billar.descartar(t.id)}
        aria-label="Cerrar aviso"
        className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-texto-3 hover:bg-muted"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/**
 * El diálogo de arriba de la pila (ver `dialogos.tsx`).
 *
 * Si ya no hay qué mostrar (la mesa se cerró o se movió desde otra caja, o el
 * "Extender" de un aviso viejo apunta a una mesa sin tiempo fijo), el diálogo
 * se saca de la pila. Antes quedaba invisible arriba de todo: Escape dejaba de
 * cerrar el panel y reaparecía solo al abrir esa mesa más tarde.
 */
export function DialogoActual() {
  const { actual, quitar } = useDialogos();
  const e = useBillar();
  // Cada diálogo se cierra a sí mismo (`quitar`), no "el de arriba": si ya se
  // había ido solo, cerrarlo otra vez no se lleva el de abajo.
  const cerrarEste = useCallback(() => {
    if (actual) quitar(actual);
  }, [actual, quitar]);
  const contenido = actual ? dibujar(actual, e, cerrarEste) : null;
  const huerfano = actual !== null && contenido === null && e.cargado;
  useEffect(() => {
    if (huerfano && actual) quitar(actual);
  }, [huerfano, actual, quitar]);
  return actual && contenido ? <Fragment key={claveDe(actual)}>{contenido}</Fragment> : null;
}

// Una clave por diálogo de la pila, por identidad: sin ella, React reutilizaba
// el componente de arriba cuando el siguiente era del mismo tipo. Un
// "Extender" de la Mesa 7 abierto desde un aviso heredaba el paso de cobro y
// el QR ya confirmado del "Extender" de la Mesa 5 (QA del 12-oct).
const claves = new WeakMap<Dialogo, number>();
let ultimaClave = 0;
function claveDe(d: Dialogo): number {
  let k = claves.get(d);
  if (k === undefined) {
    k = ++ultimaClave;
    claves.set(d, k);
  }
  return k;
}

function dibujar(actual: Dialogo, e: EstadoBillar, cerrar: () => void): ReactNode {
  const mesa = "mesaId" in actual ? e.mesas.find((m) => m.id === actual.mesaId) : undefined;
  const enJuego = mesa?.estado === "abierta" && mesa.sesion ? mesa : undefined;
  switch (actual.tipo) {
    case "abrir":
      return mesa && (mesa.estado === "libre" || mesa.estado === "reservada") ? (
        <ModalAbrir mesa={mesa} onClose={cerrar} />
      ) : null;
    case "extender":
      return enJuego?.sesion?.prepago ? <ModalExtender mesa={enJuego} onClose={cerrar} /> : null;
    case "cambiar":
      return enJuego ? <ModalCambiar mesa={enJuego} onClose={cerrar} /> : null;
    case "pausar":
      if (!enJuego) return null;
      // Con "Pausar una mesa" en "Acciones que piden PIN" (el default desde el
      // 17-oct), la pausa la firma un encargado: es tiempo que no se cobra, y
      // el cajero pausaba la mesa de un conocido sin que nadie lo supiera. Sin
      // el campo (backend anterior), como antes.
      if (e.ajustes.pin.pausar !== true) return <ModalMotivo mesa={enJuego} modo="pausar" onClose={cerrar} />;
      return (
        <ModalPin
          accion={`Pausar la Mesa ${enJuego.id}`}
          detalle="El cronómetro se frena hasta que la reanuden: ese tiempo no se cobra. Queda registrado quién pausó, quién autorizó y por qué."
          motivos={MOTIVOS_PAUSA.filter((m) => m !== "Otro")}
          permiso="billar.admin"
          onClose={cerrar}
          onAutorizar={async (motivo, cred) => {
            await billar.pausar(enJuego.id, motivo, cred);
            cerrar();
          }}
        />
      );
    case "fuera":
      return mesa ? <ModalMotivo mesa={mesa} modo="fuera" onClose={cerrar} /> : null;
    case "reservar":
      return mesa ? <ModalReservar mesa={mesa} onClose={cerrar} /> : null;
    case "pago":
      return enJuego ? <ModalPago mesa={enJuego} onClose={cerrar} /> : null;
    case "editarInicio":
      return enJuego ? <ModalEditarInicio mesa={enJuego} onClose={cerrar} /> : null;
    case "historial":
      // Si la mesa salió del tablero (la dejaron inactiva o la renumeraron),
      // el historial se va de la pila: quedaba invisible arriba y Escape dejaba
      // de cerrar el panel (revisión del 16-oct).
      return mesa ? <ModalHistorial mesaId={actual.mesaId} onClose={cerrar} /> : null;
    case "anularConsumo": {
      const it = enJuego?.sesion?.consumos.find((c) => c.id === actual.itemId);
      if (!enJuego || !it || it.anulado) return null;
      return (
        <ModalPin
          accion={`Anular ${it.cant}× ${it.nombre} · ${fmtMoney(it.precio * it.cant)}`}
          detalle={`Mesa ${enJuego.id}. Sale de la cuenta y vuelve a estar disponible para vender.`}
          motivos={["Error de carga", "Cliente devolvió", "Producto en mal estado"]}
          pedirPin={e.ajustes.pin.anularConsumo}
          permiso="billar.admin"
          onClose={cerrar}
          onAutorizar={async (motivo, cred) => {
            await billar.anularConsumo(enJuego.id, it.id, motivo, cred);
            cerrar();
          }}
        />
      );
    }
    case "anularMesa": {
      if (!enJuego?.sesion) return null;
      // Se cumplió el plazo con el diálogo abierto: se va solo. El servidor lo
      // rechazaba con ANULAR_VENCIDO y el rechazo se leía como un PIN mal
      // puesto, con los casilleros vaciándose a cada intento.
      const ahoraAnular = ahoraServidor();
      if (
        !sePuedeAnular(
          cuentaDe(enJuego.sesion, tipoDe(e, enJuego), ahoraAnular),
          segundosDesdeQueSeAbrio(enJuego.sesion, ahoraAnular),
        )
      )
        return null;
      const pagado = pagadoDe(enJuego.sesion.pagos);
      // Cada parte por donde entró: "Devolvé Bs 70" con Bs 30 llegados por QR
      // hacía que el cajero sacara los 70 del cajón (16-oct).
      const pagos = enJuego.sesion.pagos;
      // Con consumos cargados el backend no la anula (ANULAR_CON_CONSUMOS): se
      // perdían sin cobrar ni bajar del stock. Se dice qué hacer antes del PIN.
      const cargado = consumosDe(enJuego.sesion);
      // Con dos cajas: el efectivo que entró en el cajón de otro cajero. Su
      // arqueo deja de esperarlo al anular, así que es él quien lo tiene.
      const enOtraCaja = efectivoEnOtraCaja(pagos, e.caja.id);
      return (
        <ModalPin
          accion={`Anular la Mesa ${enJuego.id}`}
          detalle={
            cargado > 0.005
              ? `Tiene consumos cargados (${fmtMoney(cargado)}) y ya se tomaron: no se puede anular. Pasá la cuenta a la mesa correcta con "Cambiar mesa", o anulá los consumos que se cargaron por error.`
              : `Se abrió por error: no se cobra nada y queda libre.${
                  pagado > 0 ? ` Ya pagó ${fmtMoney(pagado)}: hay que devolverle ${textoDevolucion(devolucionDe(pagos, 0))}.` : ""
                }${enOtraCaja ? ` ${enOtraCaja}: pedíselos, o que los devuelva quien los cobró.` : ""}`
          }
          bloqueado={cargado > 0.005}
          motivos={["Se abrió por error", "Se fueron sin jugar"]}
          // Con plata cobrada el PIN va siempre (el backend lo exige desde el
          // 17-oct): anular la devuelve y el arqueo deja de esperarla.
          pedirPin={e.ajustes.pin.anularMesa || pagado > 0.005}
          permiso="billar.admin"
          onClose={cerrar}
          onAutorizar={async (motivo, cred, clave) => {
            // Con la clave del diálogo: si la respuesta se perdió, el reintento
            // vuelve a decir cuánto devolver en vez de "Esa mesa se anuló".
            const devolver = await billar.anularMesa(enJuego.id, motivo, cred, clave);
            cerrar();
            // El detalle del servidor manda (pudo entrar un pago mientras tanto);
            // sin él, la cuenta con los pagos que se veían.
            const detalle = devolver.detalle ?? devolucionDe(pagos, 0);
            billar.avisar({
              tono: devolver.total > 0 ? "ambar" : "verde",
              titulo: `Mesa ${enJuego.id} anulada`,
              texto: devolver.total > 0 ? `Devolvé ${textoDevolucion(detalle) || fmtMoney(devolver.total)} al cliente.` : "No se cobró nada.",
            });
          }}
        />
      );
    }
    case "venta":
      return e.ventas.some((v) => v.codigo === actual.codigo) ? (
        <ModalVenta codigo={actual.codigo} onClose={cerrar} />
      ) : null;
    case "ticket":
      return e.ventas.some((v) => v.codigo === actual.codigo) ? (
        <ModalTicket codigo={actual.codigo} onClose={cerrar} />
      ) : null;
    case "anularVenta": {
      const v = e.ventas.find((x) => x.codigo === actual.codigo);
      if (!v || v.anulada) return null;
      return (
        <ModalPin
          accion={`Anular venta ${v.codigo} · ${fmtMoney(v.total)}`}
          // Cuánto devolver y por dónde, y de qué cajón sale (Avisos.datos).
          detalle={detalleAnularVenta(v)}
          // Sin "Error de cobro": si fue el medio, se corrige sin anular
          // (17-oct), y anular una mesa pierde el tiempo para siempre.
          motivos={["Cobro duplicado", "Cobró la mesa equivocada", "Cliente devolvió"]}
          permiso="ventas.anular"
          onClose={cerrar}
          onAutorizar={async (motivo, cred) => {
            await billar.anularVenta(v.id, motivo, cred);
            // Vuelve al detalle, que ahora dice "Anulada".
            cerrar();
          }}
        />
      );
    }
    case "corregirPago": {
      const v = e.ventas.find((x) => x.codigo === actual.codigo);
      if (!v || !sePuedeCorregirPago(v)) return null;
      return <ModalCorregirPago venta={v} onClose={cerrar} />;
    }
    case "avisos":
      return <ModalAvisos onClose={cerrar} />;
  }
}
