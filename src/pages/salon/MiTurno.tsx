import { useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFechaHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { hace } from "./logicaSalon";

/**
 * Cómo le fue al mesero en el turno.
 *
 * El número grande es **sólo lo cobrado**. Lo que está en mesas abiertas va más
 * abajo y aparte: todavía puede cambiar y no entró a ningún cajón. Mezclarlos
 * es exactamente el error que hubo que corregir cuatro veces en el cierre de
 * caja.
 */
export default function MiTurno() {
  const { logout } = useAuth();
  const turno = useApi(() => api.turnoMesero(), []);
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState("");

  const t = turno.datos;
  const sinCerrar = t?.mesasSinCerrar ?? [];
  const puedeCerrar = sinCerrar.length === 0;

  const ticket =
    t && t.mesasCerradas > 0 ? t.vendidoCobrado / t.mesasCerradas : 0;

  async function cerrarTurno() {
    if (cerrando) return;
    setError("");
    setCerrando(true);
    try {
      await api.cerrarTurnoMesero();
      // El resumen que quedó en pantalla es el que el mesero le muestra al
      // encargado: se avisa y se sale.
      logout();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cerrar el turno");
      setCerrando(false);
      setConfirmando(false);
    }
  }

  if (turno.cargando && !t)
    return (
      <div className="p-4">
        <Cargando />
      </div>
    );

  return (
    <div className="h-full overflow-y-auto bg-fondo p-4 pb-8">
      {turno.error && <ErrorMsg>{turno.error}</ErrorMsg>}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="rounded-2xl bg-slate-800 p-4 text-white">
        <p className="truncate text-lg font-extrabold">{t?.meseroNombre}</p>
        <p className="truncate text-xs text-white/90">
          {/* El turno arranca cuando abrió la caja, no a medianoche: un resto
              bar abre a las 20:00 y cierra a las 5:00. */}
          {t?.turno}
          {t?.desde ? ` · desde ${fmtFechaHora(t.desde)}` : ""}
        </p>
        <p className="mt-3 text-3xl font-extrabold">{fmtMoney(t?.vendidoCobrado ?? 0)}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/80">
          Cobrado en mi turno
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Kpi valor={t?.mesasCerradas ?? 0} etiqueta="Mesas cerradas" color="text-[#059669]" />
        <Kpi valor={t?.mesasAbiertas ?? 0} etiqueta="Abiertas ahora" color="text-[#D97706]" />
        <Kpi valor={t?.comensales ?? 0} etiqueta="Comensales" color="text-primary" />
      </div>

      <p className="mt-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm text-primary-700">
        {fmtMoney(ticket)} · Ticket promedio
      </p>

      {/* Las propinas sólo aparecen si las hubo: una tarjeta grande en Bs 0 le
          recuerda al mesero lo que no ganó cada vez que abre la pantalla. */}
      {(t?.propinas ?? 0) > 0 && (
        <div className="mt-2 rounded-2xl bg-slate-800 p-3.5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
            Propinas del turno
          </p>
          <p className="mt-0.5 text-2xl font-extrabold">{fmtMoney(t!.propinas)}</p>
        </div>
      )}

      {/* Lo que está en mesas abiertas todavía NO es plata cobrada: va separado
          del hero a propósito. */}
      {(t?.enMesasAbiertas ?? 0) > 0 && (
        <div className="mt-2 rounded-xl border border-borde bg-white p-3.5">
          <p className="text-sm font-bold text-texto">
            {fmtMoney(t!.enMesasAbiertas)} en mesas abiertas
          </p>
          <p className="text-xs text-texto-3">Todavía sin cobrar en caja</p>
        </div>
      )}

      {(t?.mesasPorLiberar ?? 0) > 0 && (
        <p className="mt-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          {t!.mesasPorLiberar === 1
            ? "1 mesa ya cobrada esperando que la liberes"
            : `${t!.mesasPorLiberar} mesas ya cobradas esperando que las liberes`}
        </p>
      )}

      <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-texto-3">
        Mesas que cerré hoy
      </p>
      {(t?.historial ?? []).length === 0 ? (
        <div className="rounded-xl border border-borde bg-white py-8 text-center text-[13px] text-texto-3">
          Todavía no cerraste ninguna mesa.
        </div>
      ) : (
        t!.historial.map((h) => (
          <div
            key={h.comprobante ?? `${h.mesaCodigo}-${h.cerradaEn}`}
            className="mb-2 flex items-center gap-3 rounded-xl border border-borde bg-white p-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-sm font-extrabold text-[#059669]">
              {h.mesaCodigo ?? h.codigo}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-texto">
                {h.comensales} {h.comensales === 1 ? "persona" : "personas"}
                {h.comprobante ? ` · ${h.comprobante}` : ""} · hace {hace(h.cerradaEn)}
              </p>
              {/* La propina va en su propia línea y en verde: es del mesero. */}
              {(h.propina ?? 0) > 0 && (
                <p className="text-xs font-semibold text-primary-700">
                  +{fmtMoney(h.propina!)} propina
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold text-texto">
              {fmtMoney(h.total)}
            </span>
          </div>
        ))
      )}

      {/* Va pegado al botón y no arriba con los otros avisos: es la explicación
          de por qué está apagado, y separarla lo vuelve un dato suelto más.
          Nombra las mesas porque sin los códigos el mesero tiene que recorrer
          el salón adivinando cuáles son suyas. */}
      {!puedeCerrar && (
        <p className="mt-4 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          Para cerrar tu turno no podés tener mesas a tu nombre. Te quedan:{" "}
          {sinCerrar.join(", ")}. Cerralas (que la caja cobre y
          levantalas) o pasáselas a otro mesero.
        </p>
      )}

      <Boton
        variante="ghost"
        onClick={() => setConfirmando(true)}
        disabled={!puedeCerrar || cerrando}
        className={`mt-4 w-full ${!puedeCerrar ? "opacity-40" : ""}`}
      >
        Cerrar mi turno
      </Boton>

      {confirmando && (
        <Modal
          abierto
          titulo="¿Cerrás tu turno?"
          onClose={() => setConfirmando(false)}
          ancho="max-w-sm"
          acciones={
            <>
              <Boton variante="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Boton>
              <Boton onClick={cerrarTurno} disabled={cerrando}>
                {cerrando ? "Cerrando…" : "Sí, cerrar mi turno"}
              </Boton>
            </>
          }
        >
          {/* Cerrar un turno limpio no es una acción peligrosa: no hay nada que
              dramatizar en rojo. */}
          <p className="text-[15px] text-texto-2">
            Cerrás con {fmtMoney(t?.vendidoCobrado ?? 0)} cobrados en{" "}
            {t?.mesasCerradas ?? 0} mesas. A partir de ahora tu turno arranca de cero.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Kpi({
  valor,
  etiqueta,
  color,
}: {
  valor: number;
  etiqueta: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-borde bg-white px-2 py-2.5 text-center">
      <p className={`text-xl font-extrabold ${color}`}>{valor}</p>
      <p className="truncate text-[10px] text-texto-3">{etiqueta}</p>
    </div>
  );
}
