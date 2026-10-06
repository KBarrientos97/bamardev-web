import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { apiAgenda, mensajeDe } from "../../lib/agenda/apiAgenda";
import { guardarVistoHasta, haceCuanto, leerVistoHasta, sinVer } from "../../lib/agenda/avisos";
import type { AvisoAgenda, Cita, TipoAviso } from "../../lib/agenda/tiposAgenda";
import { useConsultaPeriodica } from "../../lib/agenda/useConsultaPeriodica";
import { useAuth } from "../../store/AuthContext";

/** Los que piden que alguien haga algo van en ámbar; lo demás es informativo. */
const URGENTE: TipoAviso[] = ["SOLICITUD_ONLINE", "NO_SHOW_SUGERIDO", "COBRO_REVISAR"];

/**
 * La campana de la agenda (§9.1): cuenta lo que pasó desde la última vez que
 * se abrió —citas nuevas, movidas o canceladas por otro, reservas online,
 * no-shows sugeridos y cobros para revisar— y lleva a la cita al tocarlo.
 *
 * Consulta cada 45 s mientras la pantalla está abierta, como el resto de la
 * agenda. El backend ya filtra: lo que uno hizo no se le avisa a uno, y al
 * profesional sólo lo de sus recursos.
 */
export default function CampanaAvisos({ onAbrirCita }: { onAbrirCita: (cita: Cita) => void }) {
  const { usuario } = useAuth();
  const [abierta, setAbierta] = useState(false);
  const [vistoHasta, setVistoHasta] = useState(() => leerVistoHasta(usuario?.id));
  const [error, setError] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  // `Promise.resolve().then` para que un error al armar el pedido sea un
  // rechazo (la campana queda quieta) y no tumbe la pantalla de la agenda.
  const consulta = useConsultaPeriodica(() => Promise.resolve().then(() => apiAgenda.avisos()), []);
  const avisos = consulta.datos?.avisos ?? [];
  const nuevos = sinVer(avisos, vistoHasta);

  // Afuera del panel, o Escape, lo cierra.
  useEffect(() => {
    if (!abierta) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierta(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierta]);

  function alternar() {
    const abrir = !abierta;
    setAbierta(abrir);
    // Abrir la campana es verlos: el contador vuelve a cero, y los que
    // lleguen después vuelven a contar.
    if (abrir && consulta.datos) {
      guardarVistoHasta(usuario?.id, consulta.datos.ahora);
      setVistoHasta(consulta.datos.ahora);
    }
  }

  async function ir(a: AvisoAgenda) {
    setError("");
    try {
      onAbrirCita(await apiAgenda.cita(a.citaId));
      setAbierta(false);
    } catch (e) {
      setError(mensajeDe(e, "No se pudo abrir la cita"));
    }
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        aria-label={nuevos.length ? `Avisos (${nuevos.length} sin ver)` : "Avisos"}
        title="Avisos de la agenda"
        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-borde bg-white text-texto-2 hover:bg-muted"
      >
        <Icon name="bell" size={20} />
        {nuevos.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {nuevos.length > 9 ? "9+" : nuevos.length}
          </span>
        )}
      </button>

      {abierta && (
        <div
          role="dialog"
          aria-label="Avisos de la agenda"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-borde bg-white shadow-xl"
        >
          <p className="border-b border-borde-soft px-4 py-2.5 text-[13px] font-bold text-texto">Avisos</p>
          {error && <p className="px-4 py-2 text-[12px] text-danger-text">{error}</p>}
          {avisos.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-texto-3">Nada nuevo en la agenda.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-borde-soft overflow-y-auto">
              {avisos.map((a) => {
                const nuevo = nuevos.includes(a);
                return (
                  <li key={a.clave}>
                    <button
                      type="button"
                      onClick={() => void ir(a)}
                      className={`flex w-full gap-2.5 px-4 py-2.5 text-left hover:bg-muted ${nuevo ? "bg-primary-50/60" : ""}`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          URGENTE.includes(a.tipo) ? "bg-warning-text" : nuevo ? "bg-primary" : "bg-transparent"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-texto">{a.texto}</span>
                        <span className="block text-[11px] text-texto-3">
                          {haceCuanto(a.en)}
                          {a.usuario ? ` · ${a.usuario}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
