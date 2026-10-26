import { useState } from "react";
import { Modal } from "../../../components/ui";
import { api } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { MOTIVO_CENA } from "../../pos/motivosMovimiento";
import { bsResta } from "../../reportes/formato";
import type { CajaSupervisionApi, EfectivoSupervisionApi, MovimientoSupervisionApi } from "../api";
import { BotonB, Circulo, ErrorAccion, Nota } from "../ui";
import { tituloDeMovimiento } from "./EfectivoSupervision.datos";
import { cuando } from "./Supervision.datos";

// ── El efectivo de la caja ──────────────────────────────────────────────────

/**
 * Los movimientos de efectivo de la caja del turno (24-oct): el administrador
 * registra acá lo que sale o entra de la caja de la cajera sin ser una venta,
 * como la cena que se le da cada noche. Es el mismo "Movimiento de efectivo"
 * del cierre de caja, pero hecho por el administrador y reflejado en el cierre
 * de ella: la cajera no puede registrarlos.
 *
 * Desde el 25-oct cada uno va con su motivo (cena, gasto, pago a proveedor,
 * retiro, sencillo…), que es lo que le dice al Estado de resultado si resta de
 * la ganancia, y cualquiera se anula con la caja abierta (antes sólo la cena:
 * un retiro de 300 cargado en vez de 30 no tenía arreglo). La cerrada ya tiene
 * su arqueo hecho.
 */
export function TarjetaEfectivo({
  efectivo,
  caja,
  puedeRegistrar,
  esMia,
  vaA,
  variasAbiertas,
  ahora,
  onRegistrar,
  onAnular,
}: {
  efectivo: EfectivoSupervisionApi;
  caja: CajaSupervisionApi;
  puedeRegistrar: boolean;
  /** La caja es de quien mira: entonces no se le dice "sólo vos" sobre su propio cierre. */
  esMia: boolean;
  /**
   * De quién es la caja adonde el cuadro manda el movimiento si no es ésta
   * (`destinoDelMovimiento`): con la caja del administrador a la vista, la
   * tarjeta decía "aparece en el cierre de tu caja" y el cuadro lo mandaba a
   * la de la cajera.
   */
  vaA: string | null;
  /** Hay más de una caja abierta: en el cuadro se elige a cuál va. */
  variasAbiertas: boolean;
  ahora: number;
  onRegistrar: (motivo?: string) => void;
  onAnular: (m: MovimientoSupervisionApi) => void;
}) {
  const puedeTocar = puedeRegistrar && efectivo.abierta;
  // La anulación no es un movimiento más: es la otra mitad del anulado, que ya
  // sale tachado con quién lo anuló. Antes salían las dos filas y la segunda
  // ("Cena anulada +Bs 20,00 · entra plata a la caja") se leía como plata que
  // entró de verdad.
  const visibles = efectivo.movimientos.filter((m) => m.anulaA == null);
  return (
    <section aria-label="Movimientos de efectivo" className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde-soft px-4 py-3.5 sm:px-5">
        <Circulo icono="swap" tono="gris" size={36} />
        <h2 className="min-w-[11rem] flex-1 text-[15px] font-bold text-texto">Movimientos de efectivo</h2>
        <span className="text-[12px] text-texto-3">
          Caja de {caja.cajero} · {efectivo.abierta ? "abierta" : "cerrada"}
        </span>
      </header>

      <div className="space-y-3.5 px-4 py-4 sm:px-5">
        {puedeTocar ? (
          <>
            <p className="text-[13px] leading-relaxed text-texto-2">
              {vaA
                ? `Lo que registrés va a la caja de ${vaA} y aparece en su cierre, no en esta lista (en el cuadro podés elegir otra).`
                : esMia
                  ? "Lo que registrés acá aparece en el cierre de tu caja."
                  : `Lo que registrés acá aparece en el cierre de caja de ${caja.cajero}, que no puede registrar movimientos: sólo vos.`}{" "}
              {!vaA && variasAbiertas && "Hay más de una caja abierta: en el cuadro podés elegir otra. "}
              Cada motivo dice si resta de la ganancia del mes.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <BotonB icono="swap" onClick={() => onRegistrar()}>
                Registrar movimiento de efectivo
              </BotonB>
              <BotonB variante="violeta" icono="cubiertos" onClick={() => onRegistrar(MOTIVO_CENA.etiqueta)}>
                Cena
              </BotonB>
            </div>
          </>
        ) : !efectivo.abierta ? (
          <Nota tono="gris" icono="lock">
            La caja está cerrada: ya no se pueden registrar ni anular movimientos.
          </Nota>
        ) : null}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3">Registrados en este turno</p>
          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-borde px-4 py-5 text-center text-[13px] text-texto-3">
              Todavía no se registró ningún movimiento en este turno.
            </p>
          ) : (
            <ul className="divide-y divide-borde-soft border-t border-borde-soft">
              {visibles.map((m) => (
                <FilaMovimiento key={m.id} m={m} ahora={ahora} puedeAnular={puedeTocar} onAnular={() => onAnular(m)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {efectivo.esperado != null && (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-borde-soft bg-slate-50/80 px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-[13px] font-bold text-texto">Efectivo que debería haber en la caja</p>
            <p className="text-[12px] text-texto-3">
              {esMia ? "Es lo que tenés que tener al cerrar." : `Es lo que ${caja.cajero} te tiene que entregar al cerrar.`}
            </p>
          </div>
          <span className="text-[22px] font-extrabold tabular-nums text-texto">{fmtMoney(efectivo.esperado)}</span>
        </footer>
      )}
    </section>
  );
}

function FilaMovimiento({
  m,
  ahora,
  puedeAnular,
  onAnular,
}: {
  m: MovimientoSupervisionApi;
  ahora: number;
  puedeAnular: boolean;
  onAnular: () => void;
}) {
  const esCena = m.cena || m.codigo === "CENA";
  const titulo = tituloDeMovimiento(m);
  // Se anula lo que tiene motivo (lo de un backend anterior, sólo la cena).
  const anulable = (m.codigo != null || m.cena) && !m.anulada;
  const anulada = esCena || m.codigo === "OTRA_SALIDA" || m.codigo === "OTRA_ENTRADA";
  return (
    <li className="flex items-start gap-3 py-3">
      <Circulo icono={esCena ? "cubiertos" : "swap"} tono={esCena ? "violeta" : "gris"} size={36} />
      <div className="min-w-0 flex-1">
        {/* El monto en el renglón del título y "Anular" abajo, a la derecha: con
            los dos al costado, en el celular "Pago a proveedor · Distribuidora
            Paceña" quedaba partido en cuatro renglones. */}
        <div className="flex items-baseline justify-between gap-3">
          <p className={`min-w-0 break-words text-[14px] font-bold text-texto ${m.anulada ? "text-texto-3 line-through" : ""}`}>
            {titulo}
            {m.anulada && (
              <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-bold uppercase text-texto-2 no-underline">
                {anulada ? "Anulada" : "Anulado"}
              </span>
            )}
          </p>
          <span
            className={`shrink-0 text-[15px] font-extrabold tabular-nums ${m.anulada ? "text-texto-3 line-through" : m.tipo === "INGRESO" ? "text-emerald-700" : "text-rose-700"}`}
          >
            {m.tipo === "INGRESO" ? `+${fmtMoney(m.monto)}` : bsResta(m.monto)}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="text-[12px] text-texto-3">
              Registró {m.quien} · {cuando(m.hora, ahora)} · {m.tipo === "INGRESO" ? "entra plata a la caja" : "sale plata de la caja"}
            </p>
            {m.anulada && m.anuladoPor && (
              <p className="text-[12px] text-texto-3">
                Lo anuló {m.anuladoPor}
                {m.anuladoHora != null ? ` · ${cuando(m.anuladoHora, ahora)}` : ""}
              </p>
            )}
          </div>
          {anulable && puedeAnular && (
            <BotonB className="ml-auto" aria-label={`Anular ${esCena ? "la cena" : `«${titulo}»`} de ${fmtMoney(m.monto)}`} onClick={onAnular}>
              Anular
            </BotonB>
          )}
        </div>
      </div>
    </li>
  );
}

/** Anular un movimiento: pide confirmar, porque el efectivo esperado de la cajera cambia otra vez. */
export function AnularMovimiento({
  cajaId,
  cajera,
  movimiento,
  onClose,
  onHecho,
}: {
  cajaId: number;
  cajera: string;
  movimiento: MovimientoSupervisionApi;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const titulo = tituloDeMovimiento(movimiento);
  const esCena = movimiento.cena || movimiento.codigo === "CENA";

  const anular = async () => {
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      await api.anularMovimientoCaja(cajaId, movimiento.id);
      onHecho();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo anular. Probá de nuevo.");
      setEnviando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={esCena ? "Anular la cena" : "Anular el movimiento"}
      subtitulo={`${titulo} · ${fmtMoney(movimiento.monto)} de la caja de ${cajera}`}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB onClick={onClose}>No anular</BotonB>
          <BotonB variante="rosa" disabled={enviando} onClick={() => void anular()}>
            {enviando ? "Anulando…" : esCena ? "Anular la cena" : "Anular"}
          </BotonB>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-texto-2">
        El efectivo que debería haber en la caja de {cajera} vuelve a {movimiento.tipo === "INGRESO" ? "bajar" : "subir"}{" "}
        {fmtMoney(movimiento.monto)}. No se borra: queda anulado y a tu nombre en la actividad.
      </p>
      <ErrorAccion texto={error} />
    </Modal>
  );
}
