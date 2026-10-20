import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { aMinutos } from "../../lib/academia/calendario";
import { nombreDe } from "../../lib/academia/formato";
import type { ClaseDelDia, HoyAcademia } from "../../lib/academia/tipos";
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
import { BotonFila, EncabezadoPagina, KpiTarjeta, LISTA, PaginaAcademia, Tarjeta } from "./piezas";

/**
 * E1 · Hoy (PLAN-ACADEMIAS §5, ronda 2): el tablero de la recepción y de la
 * dirección. Las clases del día de la sede, con la llegada del docente (se
 * marca acá, con la hora del servidor, sin descontar nada: D9) y si ya pasó
 * la lista; al costado, qué hay para cobrar y los avisos (inscripciones
 * online, grupos que empiezan con cupos libres). En el celular, Inscribir y
 * Cobrar quedan abajo, a un toque.
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
  const marcaLlegadas = tienePermiso(usuario, "asistencia.llegadas");
  const [marcando, setMarcando] = useState<number | null>(null);
  const [errorLlegada, setErrorLlegada] = useState("");

  async function marcarLlegada(sesionId: number) {
    setMarcando(sesionId);
    setErrorLlegada("");
    try {
      await apiAcademia.llegada(sesionId);
      hoy.recargar();
    } catch (e) {
      setErrorLlegada(e instanceof Error ? e.message : "No se pudo marcar la llegada");
    } finally {
      setMarcando(null);
    }
  }

  const nombreSede = sede.nombre || usuario?.sucursal || "";
  const d = hoy.datos;

  return (
    <PaginaAcademia conBarraAbajo>
      <EncabezadoPagina
        titulo="Hoy"
        sobre={
          <>
            {d ? capitalizar(fechaLarga(d.fecha)) : "Hoy"}
            {nombreSede ? ` · ${p.Sede} ${nombreSede}` : ""}
          </>
        }
        acciones={
          inscribe && (
            <Boton icono="plus" className="max-md:!hidden" onClick={() => setInscribiendo(true)}>
              Inscribir {p.alumno}
            </Boton>
          )
        }
      >
        {conCaja && !caja.cargando && (
          <p className="flex items-center gap-1.5 pt-1 text-[13px] text-texto-3">
            <span className={`h-2 w-2 rounded-full ${caja.datos?.caja ? "bg-primary" : "bg-slate-300"}`} />
            {caja.datos?.caja ? (
              `Caja abierta · desde ${fmtHora(caja.datos.caja.fechaApertura)}`
            ) : (
              <Link to="/pos" className="font-semibold text-primary-700 hover:underline">
                Caja cerrada
              </Link>
            )}
          </p>
        )}
      </EncabezadoPagina>

      {sede.selector}

      {hoy.error && !d ? (
        <ErrorMsg onReintentar={hoy.recargar}>{hoy.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
          <div className="min-w-0 space-y-3">
            <ErrorMsg>{errorLlegada}</ErrorMsg>
            <ClasesDeHoy
              clases={d.clases ?? []}
              verCalendario={puede("academia_calendario")}
              marcaLlegadas={marcaLlegadas}
              marcando={marcando}
              onMarcar={(id) => void marcarLlegada(id)}
            />
          </div>
          <div className="min-w-0 space-y-5 lg:space-y-6">
            <ParaCobrar datos={d} puedeCobranza={puede("academia_cobranza")} onIr={(tipo) => navigate(`/academia/cobranza?tipo=${tipo}`)} />
            <Avisos datos={d} />
          </div>
        </div>
      )}

      {(inscribe || puede("pos")) && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-borde-soft bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:hidden">
          {inscribe && (
            <Boton className="min-h-11 flex-1" onClick={() => setInscribiendo(true)}>
              Inscribir
            </Boton>
          )}
          {puede("pos") && (
            <Link
              to="/pos"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
            >
              Cobrar
            </Link>
          )}
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
    </PaginaAcademia>
  );
}

/** "terminó", "en curso" o "por empezar", con la hora del equipo. */
function momentoClase(c: ClaseDelDia, ahora: Date): "terminó" | "en curso" | "por empezar" {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  if (min >= aMinutos(c.horaFin)) return "terminó";
  if (min >= aMinutos(c.horaInicio)) return "en curso";
  return "por empezar";
}

/** "Llegó 07:12 · 12 min tarde": la llegada del docente, sin descontar nada (D9). */
function textoLlegada(c: ClaseDelDia): { texto: string; tarde: boolean } {
  if (!c.llegadaEn) return { texto: "Todavía no", tarde: false };
  const tarde = (c.atrasoMin ?? 0) > 0;
  return { texto: `Llegó ${fmtHora(c.llegadaEn)}${tarde ? ` · ${c.atrasoMin} min tarde` : ""}`, tarde };
}

function ClasesDeHoy({
  clases,
  verCalendario,
  marcaLlegadas,
  marcando,
  onMarcar,
}: {
  clases: ClaseDelDia[];
  verCalendario: boolean;
  marcaLlegadas: boolean;
  marcando: number | null;
  onMarcar: (sesionId: number) => void;
}) {
  const p = usePalabras();
  const ahora = new Date();
  const orden = [...clases].sort((a, b) => aMinutos(a.horaInicio) - aMinutos(b.horaInicio));
  return (
    <Tarjeta
      id="t-clases"
      titulo="Clases de hoy"
      contador={clases.length}
      sinRelleno
      acciones={
        verCalendario && (
          <BotonFila variante="ghost" icono="calendar" a="/academia/calendario">
            Ver calendario
          </BotonFila>
        )
      }
    >
      {orden.length === 0 ? (
        <p className="p-5 text-sm text-texto-3">Hoy no hay clases en esta {p.sede}.</p>
      ) : (
        <ul className={LISTA.lista}>
          {orden.map((c) => {
            const momento = momentoClase(c, ahora);
            const llegada = textoLlegada(c);
            const docente = typeof c.docente === "string" ? c.docente : c.docente?.nombre;
            return (
              <li
                key={c.sesionId}
                className={`grid gap-x-4 gap-y-2 ${LISTA.itemHover} sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:items-center ${momento === "terminó" ? "opacity-65" : ""}`}
              >
                <span className="flex items-center gap-2 sm:block">
                  <span className="block text-base font-bold tabular-nums text-texto">{c.horaInicio}</span>
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold sm:mt-0.5 ${
                      momento === "en curso" ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-texto-3"
                    }`}
                  >
                    {momento}
                  </span>
                </span>
                <span className="min-w-0">
                  <Link to={`/academia/grupos/${c.grupoId}`} className="block truncate text-sm font-semibold text-texto hover:text-primary-700 hover:underline">
                    {nombreDe(c.carrera)} · {c.nombre}
                  </Link>
                  <span className="block truncate text-[13px] text-texto-3">
                    M{c.materia.orden} {c.materia.nombre}
                    {c.aula ? ` · ${c.aula}` : ""} · {c.inscritos} {c.inscritos === 1 ? p.alumno : p.alumnos}
                  </span>
                  <span className="block truncate text-[13px] text-texto-3">
                    {docente ? `Prof. ${docente} · ` : ""}
                    <span className={llegada.tarde ? "font-semibold text-warning-text" : c.llegadaEn ? "text-texto-2" : "text-texto-4"}>
                      {llegada.texto}
                    </span>
                    {" · Lista "}
                    {c.lista.pasada ? `${c.lista.presentes} de ${c.lista.total}` : "—"}
                  </span>
                </span>
                <span className="sm:text-right">
                  {marcaLlegadas && !c.llegadaEn && momento !== "terminó" && (
                    <BotonFila icono="check" disabled={marcando === c.sesionId} onClick={() => onMarcar(c.sesionId)}>
                      {marcando === c.sesionId ? "Marcando…" : "Marcar llegada"}
                    </BotonFila>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
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
    <Tarjeta
      id="t-cobrar"
      titulo="Para cobrar"
      sinRelleno
      acciones={
        puedeCobranza && (
          <BotonFila variante="ghost" a="/academia/cobranza">
            Ir a Cobranza
            <Icon name="chevronRight" size={15} />
          </BotonFila>
        )
      }
    >
      {nada ? (
        <p className="p-5 text-sm text-texto-3">No vence nada hoy y no hay cuotas vencidas.</p>
      ) : (
        <>
          {/* Los dos totales son filtros: llevan a Cobranza con esa pestaña. */}
          <div className="grid grid-cols-2 gap-3 bg-muted/60 p-4 sm:p-5">
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
            <ul className={`${LISTA.lista} border-t border-borde-soft`}>
              {c.items.map((it, i) => (
                <li key={`${it.alumno.id}-${i}`} className={`flex items-center justify-between gap-3 ${LISTA.itemHover}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-texto">{it.alumno.nombre}</span>
                    <span className="block truncate text-xs text-texto-3">{it.detalle}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-texto">{fmtMoney(it.monto)}</span>
                    {puedeCobranza && (
                      <BotonFila icono="qr" a="/academia/cobranza">
                        Enviar QR
                      </BotonFila>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Tarjeta>
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
  return (
    <KpiTarjeta
      etiqueta={etiqueta}
      valor={fmtMoney(monto)}
      tono={urgente && cuotas > 0 ? "urgente" : "normal"}
      pie={`${cuotas} ${cuotas === 1 ? "cuota" : "cuotas"}`}
      onClick={onClick}
    />
  );
}

const PUNTO: Record<string, string> = {
  PREINSCRIPCIONES: "bg-primary",
  INSCRIPCIONES_ONLINE: "bg-primary",
  EMPIEZA: "bg-slate-300",
  CUPO: "bg-slate-400",
  NOTAS: "bg-slate-400",
};

function Avisos({ datos }: { datos: HoyAcademia }) {
  const avisos = datos.avisos;
  return (
    <Tarjeta id="t-avisos" titulo="Avisos" sinRelleno>
      {avisos.length === 0 ? (
        <p className="p-5 text-sm text-texto-3">Nada que revisar por ahora.</p>
      ) : (
        <ul className={LISTA.lista}>
          {/* El SIE salió de la lista en la ronda 2: si un backend viejo lo manda, no se muestra. */}
          {avisos.filter((a) => a.tipo !== "SIE").map((a, i) => {
            const destino =
              a.tipo === "PREINSCRIPCIONES" || a.tipo === "INSCRIPCIONES_ONLINE"
                ? "/academia/preinscripciones"
                : a.grupoId != null
                  ? `/academia/grupos/${a.grupoId}`
                  : a.tipo === "EMPIEZA"
                    ? "/academia/calendario"
                    : null;
            const cuerpo = (
              <>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[a.tipo] ?? "bg-slate-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-texto">{a.titulo}</span>
                  <span className="block text-[13px] text-texto-3">{a.texto}</span>
                </span>
                {destino && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-borde bg-white text-texto-3">
                    <Icon name="chevronRight" size={16} />
                  </span>
                )}
              </>
            );
            return (
              <li key={i}>
                {destino ? (
                  <Link to={destino} className={`flex items-center gap-3 text-texto-3 ${LISTA.itemHover}`}>
                    {cuerpo}
                  </Link>
                ) : (
                  <div className={`flex items-center gap-3 ${LISTA.item}`}>{cuerpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}
