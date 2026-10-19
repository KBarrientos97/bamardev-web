import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import type { HoyAcademia } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { rutaCobroInscripcion } from "../../lib/academia/vista";
import { api } from "../../lib/api";
import { capitalizar, fechaLarga } from "../../lib/agenda/horaAgenda";
import { fmtHora, fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import Inscribir from "./Inscribir";

/**
 * E1 · Hoy (PLAN-ACADEMIAS §5): el tablero de la secretaría y de la
 * dirección. Qué hay para cobrar hoy en la sede y los avisos (preinscripciones
 * nuevas, el SIE, cupos libres, notas por cerrar). Las clases del día y las
 * llegadas de los docentes llegan con la asistencia (F1b).
 */
export default function Hoy() {
  const { usuario, puede } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const sede = useFiltroSede();
  const [inscribiendo, setInscribiendo] = useState(false);
  const hoy = useApi(() => apiAcademia.hoy(sede.sucursalId), [sede.sucursalId]);
  // La caja del que entró: abierta o cerrada se dice arriba, como en el lienzo.
  const conCaja = puede("caja");
  const caja = useApi(() => (conCaja ? api.cajaActual().catch(() => null) : Promise.resolve(null)), [conCaja]);
  const inscribe = tienePermiso(usuario, "academia.inscribir");

  const nombreSede = sede.nombre || usuario?.sucursal || "";
  const d = hoy.datos;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] text-texto-3">
            {d ? capitalizar(fechaLarga(d.fecha)) : "Hoy"}
            {nombreSede ? ` · ${p.Sede} ${nombreSede}` : ""}
          </p>
          <h1 className="text-2xl font-bold text-texto">Hoy</h1>
          {conCaja && !caja.cargando && (
            <p className="flex items-center gap-1.5 text-[13px] text-texto-3">
              <span className={`h-1.5 w-1.5 rounded-full ${caja.datos?.caja ? "bg-primary" : "bg-slate-300"}`} />
              {caja.datos?.caja ? (
                `Caja abierta · desde ${fmtHora(caja.datos.caja.fechaApertura)}`
              ) : (
                <Link to="/pos" className="underline">
                  Caja cerrada
                </Link>
              )}
            </p>
          )}
        </div>
        {inscribe && (
          <Boton icono="plus" onClick={() => setInscribiendo(true)}>
            Inscribir {p.alumno}
          </Boton>
        )}
      </header>

      {sede.selector}

      {hoy.error && !d ? (
        <ErrorMsg onReintentar={hoy.recargar}>{hoy.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-8">
            <ParaCobrar datos={d} puedeCobranza={puede("academia_cobranza")} onIr={(tipo) => navigate(`/academia/cobranza?tipo=${tipo}`)} />
            <section aria-label="Clases de hoy" className="space-y-2">
              <h2 className="text-base font-bold text-texto">Clases de hoy</h2>
              <p className="text-sm text-texto-3">Próximamente: las clases del día, las llegadas y las listas.</p>
            </section>
          </div>
          <Avisos datos={d} />
        </div>
      )}

      {inscribiendo && (
        <Inscribir
          onCerrar={() => setInscribiendo(false)}
          onInscrito={(r) => {
            setInscribiendo(false);
            hoy.recargar();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede, r.montoHoy));
          }}
        />
      )}
    </div>
  );
}

function ParaCobrar({
  datos,
  puedeCobranza,
  onIr,
}: {
  datos: HoyAcademia;
  puedeCobranza: boolean;
  onIr: (tipo: "vencidas" | "por-vencer") => void;
}) {
  const c = datos.cobrar;
  const nada = c.venceHoyCuotas === 0 && c.vencidoCuotas === 0;
  return (
    <section aria-label="Para cobrar hoy" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-texto">Para cobrar hoy</h2>
        {puedeCobranza && (
          <Link to="/academia/cobranza" className="text-sm font-semibold text-primary-700 hover:underline">
            Ir a Cobranza
          </Link>
        )}
      </div>
      {nada ? (
        <p className="text-sm text-texto-3">No vence nada hoy y no hay cuotas vencidas.</p>
      ) : (
        <>
          {/* Los dos totales son filtros: llevan a Cobranza con esa pestaña. */}
          <div className="grid grid-cols-2 gap-3">
            <Indicador
              etiqueta="Vencen hoy"
              monto={c.venceHoy}
              cuotas={c.venceHoyCuotas}
              onClick={puedeCobranza ? () => onIr("por-vencer") : undefined}
            />
            <Indicador
              etiqueta="Vencidas"
              monto={c.vencido}
              cuotas={c.vencidoCuotas}
              urgente
              onClick={puedeCobranza ? () => onIr("vencidas") : undefined}
            />
          </div>
          {c.items.length > 0 && (
            <ul className="divide-y divide-borde-soft border-y border-borde-soft">
              {c.items.map((it, i) => (
                <li key={`${it.alumno.id}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-texto">{it.alumno.nombre}</span>
                    <span className="block truncate text-xs text-texto-3">{it.detalle}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-texto">{fmtMoney(it.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Indicador({
  etiqueta,
  monto,
  cuotas,
  urgente,
  onClick,
}: {
  etiqueta: string;
  monto: number;
  cuotas: number;
  urgente?: boolean;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span className="block text-[12px] text-texto-3">{etiqueta}</span>
      <span className={`block text-lg font-bold tabular-nums ${urgente && cuotas > 0 ? "text-danger-text" : "text-texto"}`}>
        {fmtMoney(monto)}
      </span>
      <span className="block text-xs text-texto-3">
        {cuotas} {cuotas === 1 ? "cuota" : "cuotas"}
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-xl border border-borde px-4 py-3 text-left hover:bg-muted">
      {contenido}
    </button>
  ) : (
    <div className="rounded-xl border border-borde px-4 py-3">{contenido}</div>
  );
}

const PUNTO: Record<string, string> = {
  PREINSCRIPCIONES: "bg-primary",
  SIE: "bg-warning",
  CUPO: "bg-slate-400",
  NOTAS: "bg-slate-400",
};

function Avisos({ datos }: { datos: HoyAcademia }) {
  const avisos = datos.avisos;
  return (
    <section aria-label="Avisos" className="space-y-3">
      <h2 className="text-base font-bold text-texto">Avisos</h2>
      {avisos.length === 0 ? (
        <p className="text-sm text-texto-3">Nada que revisar por ahora.</p>
      ) : (
        <ul className="space-y-1">
          {avisos.map((a, i) => {
            const destino =
              a.tipo === "PREINSCRIPCIONES"
                ? "/academia/preinscripciones"
                : a.grupoId != null
                  ? `/academia/grupos/${a.grupoId}`
                  : null;
            const cuerpo = (
              <>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[a.tipo] ?? "bg-slate-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-texto">{a.titulo}</span>
                  <span className="block text-[13px] text-texto-3">{a.texto}</span>
                </span>
                {destino && <Icon name="chevronRight" size={16} />}
              </>
            );
            return (
              <li key={i}>
                {destino ? (
                  <Link to={destino} className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-texto-3 hover:bg-muted">
                    {cuerpo}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-3 py-2.5">{cuerpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
