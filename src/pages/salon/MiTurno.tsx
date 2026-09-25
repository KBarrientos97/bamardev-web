import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFechaHora, fmtHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { esPositivo } from "../../lib/dinero";
import { useAuth } from "../../store/AuthContext";
import type { Mesa } from "../../types/salon";
import ComprobanteMesa from "./ComprobanteMesa";
import { hace } from "./logicaSalon";

/**
 * Cómo le fue al mesero en el turno.
 *
 * El número grande es **sólo lo cobrado**. Lo que está en mesas abiertas va más
 * abajo y aparte: todavía puede cambiar y no entró a ningún cajón. Mezclarlos
 * es exactamente el error que hubo que corregir cuatro veces en el cierre de
 * caja.
 */
/**
 * @param onIrAEntregas abre la pantalla de entregas de efectivo. Opcional
 *   porque sólo tiene sentido si el negocio dejó que el mesero cobre: sin eso
 *   nunca tiene plata encima que entregar.
 */
export default function MiTurno({ onIrAEntregas }: { onIrAEntregas?: () => void }) {
  const { logout } = useAuth();
  const turno = useApi(() => api.turnoMesero(), []);
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState("");
  /** La mesa cobrada cuyo recibo se está mostrando. */
  const [recibo, setRecibo] = useState<Mesa | null>(null);
  const [abriendoRecibo, setAbriendoRecibo] = useState(false);

  const t = turno.datos;
  const sinCerrar = t?.mesasSinCerrar ?? [];
  const sinEntregar = t?.efectivoSinEntregar ?? 0;
  const debePlata = esPositivo(sinEntregar);
  // Dos cosas frenan el cierre y el backend las revisa las dos. Antes la web
  // sólo miraba las mesas: con plata sin entregar dejaba tocar "Cerrar mi
  // turno" y recién ahí el backend lo rechazaba.
  const puedeCerrar = sinCerrar.length === 0 && !debePlata;
  // La franja sólo se muestra si hubo más de una: con una sola, repetir el
  // total del hero con otro título se lee como si fueran dos plata distintas.
  const franjas = t?.franjas ?? [];

  const ticket =
    t && t.mesasCerradas > 0 ? t.vendidoCobrado / t.mesasCerradas : 0;

  /**
   * El recibo de una mesa ya cobrada, para el cliente que vuelve a pedirlo.
   * Antes las filas del historial no hacían nada al tocarlas.
   */
  async function abrirRecibo(sesionId: number) {
    if (abriendoRecibo) return;
    setError("");
    setAbriendoRecibo(true);
    try {
      setRecibo(await api.mesaCerrada(sesionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el recibo");
    } finally {
      setAbriendoRecibo(false);
    }
  }

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

      {/* El efectivo que cobró él y todavía no le aprobaron en caja. Rojo, como
          en la app: es plata del negocio que tiene encima. Sólo aparece si la
          hay; en un negocio donde el mesero no cobra siempre es cero. */}
      {debePlata && (
        <div className="mt-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3.5">
          <p className="text-[13px] text-[#B91C1C]">Efectivo sin entregar</p>
          <p className="text-2xl font-extrabold text-[#B91C1C]">{fmtMoney(sinEntregar)}</p>
          <p className="mt-0.5 text-[13px] text-[#B91C1C]">
            Es plata del negocio que tenés vos. Llevala a caja y que te la aprueben.
          </p>
          {onIrAEntregas && (
            <Boton variante="ghost" onClick={onIrAEntregas} className="mt-2.5 w-full">
              Ver mis entregas
            </Boton>
          )}
        </div>
      )}

      {(t?.mesasPorLiberar ?? 0) > 0 && (
        <p className="mt-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          {t!.mesasPorLiberar === 1
            ? "1 mesa ya cobrada esperando que la liberes"
            : `${t!.mesasPorLiberar} mesas ya cobradas esperando que las liberes`}
        </p>
      )}

      {franjas.length > 1 && (
        <>
          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-texto-3">
            Cómo fue cada turno
          </p>
          {franjas.map((f) => (
            <div
              key={f.franja}
              className="mb-2 flex items-center gap-3 rounded-xl border border-borde bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-texto">{f.nombre}</p>
                <p className="truncate text-xs text-texto-3">
                  {fmtHora(f.desde)} → {fmtHora(f.hasta)} · {f.mesas}{" "}
                  {f.mesas === 1 ? "mesa" : "mesas"} · {f.comensales}{" "}
                  {f.comensales === 1 ? "persona" : "personas"}
                </p>
                {esPositivo(f.propinas) && (
                  <p className="text-xs font-semibold text-primary-700">
                    +{fmtMoney(f.propinas)} de propina
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-bold text-texto">{fmtMoney(f.vendido)}</span>
            </div>
          ))}
        </>
      )}

      {/* "Mesas que cerré hoy" decía mal dos cosas: el turno es el de la caja,
          no el día (un resto bar cierra a las 5), y la lista incluye las que
          cobró la caja, no sólo las que cerró él. */}
      <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-texto-3">
        Mesas cobradas en mi turno
      </p>
      {(t?.historial ?? []).length === 0 ? (
        <div className="rounded-xl border border-borde bg-white py-8 text-center text-[13px] text-texto-3">
          Todavía no se cobró ninguna de tus mesas.
        </div>
      ) : (
        t!.historial.map((h) => {
          const sesionId = h.sesionId;
          const contenido = (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-sm font-extrabold text-[#059669]">
                {h.mesaCodigo ?? h.codigo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-texto">
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
            </>
          );
          const clave = h.comprobante ?? `${h.mesaCodigo}-${h.cerradaEn}`;
          // Sin sesionId (backend anterior) la fila queda quieta en vez de
          // fallar al tocarla.
          return sesionId != null ? (
            <button
              key={clave}
              onClick={() => abrirRecibo(sesionId)}
              disabled={abriendoRecibo}
              title="Ver el recibo"
              className="mb-2 flex w-full items-center gap-3 rounded-xl border border-borde bg-white p-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
            >
              {contenido}
              <Icon name="chevronRight" size={16} />
            </button>
          ) : (
            <div
              key={clave}
              className="mb-2 flex items-center gap-3 rounded-xl border border-borde bg-white p-3"
            >
              {contenido}
            </div>
          );
        })
      )}

      {recibo && <ComprobanteMesa mesa={recibo} onCerrar={() => setRecibo(null)} />}

      {/* Va pegado al botón y no arriba con los otros avisos: es la explicación
          de por qué está apagado, y separarla lo vuelve un dato suelto más.
          Nombra las mesas porque sin los códigos el mesero tiene que recorrer
          el salón adivinando cuáles son suyas. */}
      {sinCerrar.length > 0 && (
        <p className="mt-4 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          Para cerrar tu turno no podés tener mesas a tu nombre. Te quedan:{" "}
          {sinCerrar.join(", ")}. Cerralas (que la caja cobre y
          levantalas) o pasáselas a otro mesero.
        </p>
      )}

      {/* El efectivo que cobró y todavía tiene encima. Va ARRIBA de "cerrar
          turno" a propósito: entregar la plata es lo que corresponde hacer
          antes de irse, y ponerlo después lo dejaría fuera del recorrido.
          Sólo aparece si el negocio dejó que el mesero cobre; si no, nunca
          tiene nada que entregar. */}
      {/* El segundo motivo del botón apagado. Se dicen los dos: resolver uno y
          volver a encontrarse con el botón apagado, sin saber por qué, es la
          peor forma de enterarse del otro. */}
      {debePlata && (
        <p className="mt-4 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#D97706]">
          Para cerrar tu turno tenés que entregar en caja los {fmtMoney(sinEntregar)} que
          cobraste en efectivo.
        </p>
      )}

      {onIrAEntregas && (
        <Boton variante="ghost" onClick={onIrAEntregas} className="mt-4 w-full">
          Efectivo que tengo que entregar
        </Boton>
      )}

      <Boton
        variante="ghost"
        onClick={() => setConfirmando(true)}
        disabled={!puedeCerrar || cerrando}
        className={`mt-4 w-full ${!puedeCerrar ? "opacity-40" : ""}`}
      >
        Cerrar mi turno
      </Boton>

      {/* Salir SIN cerrar el turno.
          En Android no hace falta: el sistema tiene botón atrás y la app se
          cierra sola. En el navegador no hay esa salida, así que un mesero con
          una mesa a su nombre —que es cuando "Cerrar mi turno" está apagado—
          quedaba encerrado en la sesión sin forma de salir.

          Es lo que corresponde cuando presta el celular o termina el día sin
          poder cerrar: el turno sigue abierto y sus mesas siguen siendo suyas.
          Por eso va aparte y en gris: cerrar el turno es lo que hay que hacer,
          esto es la salida de emergencia. */}
      <button
        onClick={() => setSaliendo(true)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-texto-3 hover:text-texto-2"
      >
        <Icon name="logout" size={15} />
        Cerrar sesión
      </button>

      {saliendo && (
        <Modal
          abierto
          titulo="¿Cerrar sesión?"
          onClose={() => setSaliendo(false)}
          ancho="max-w-sm"
          acciones={
            <>
              <Boton variante="ghost" onClick={() => setSaliendo(false)}>
                Cancelar
              </Boton>
              <Boton onClick={logout}>Sí, salir</Boton>
            </>
          }
        >
          <p className="text-[15px] text-texto-2">
            {puedeCerrar
              ? "Tu turno queda abierto. Para cerrarlo y que tus números arranquen de cero, usá “Cerrar mi turno”."
              : `Tu turno queda abierto y ${
                  sinCerrar.length === 1 ? "la mesa" : "las mesas"
                } ${sinCerrar.join(", ")} ${
                  sinCerrar.length === 1 ? "sigue" : "siguen"
                } a tu nombre.`}
          </p>
        </Modal>
      )}

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
