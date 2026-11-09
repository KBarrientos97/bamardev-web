import { useState } from "react";
import { Link } from "react-router-dom";
import { Confirmar, ErrorMsg } from "../../components/ui";
import { estaSuspendida } from "../../lib/academia/clases";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import { aMinutos, minutosDeAtraso } from "../../lib/academia/calendario";
import { nombreDe } from "../../lib/academia/formato";
import type { ClaseDelDia } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { capitalizar, fechaLarga } from "../../lib/agenda/horaAgenda";
import { ApiError } from "../../lib/api";
import { fmtHora, iniciales } from "../../lib/format";
import { soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { AccionesClase, ChipsDeClase } from "./AccionesClase";
import { BotonFila, Chip, LISTA, Tarjeta, type TonoChip } from "./piezas";

/**
 * Las clases de hoy de la sede, arriba del Calendario (26-oct). Antes vivían
 * en la pantalla "Hoy", que salió del menú (dueño: lo más sencillo posible,
 * el Calendario es la pantalla del instituto). Se quedaron porque acá se
 * marca la llegada del docente, con la hora del servidor y sin descontar
 * nada (D9), y eso no existe en otro lado. Lo demás de "Hoy" ya tenía su
 * lugar: lo que hay para cobrar en Cobranza, las inscripciones online con su
 * contador en el menú, Inscribir en Estudiantes.
 *
 * Rediseño de noviembre: cada clase dice de un vistazo si el docente llegó y
 * cómo (a horario o tarde, pasada la tolerancia). La llegada se marca también
 * después de la hora de fin (el backend acepta la de hoy y la de ayer: el
 * docente que llegó y nadie lo marcó), se deshace si quedó mal, y la lista se
 * pasa desde acá cuando el docente no puede.
 *
 * Tanda 2 del 08-nov: «No vino» (suspender o poner un reemplazo por hoy), las
 * suspendidas siguen en la lista marcadas (para devolverlas si fue un error),
 * el reemplazo se nombra, el atraso se justifica, y marcar la llegada a más
 * de una hora de la clase pide confirmarlo (decisión del dueño).
 *
 * Sin clases hoy no se dibuja: el Calendario queda como siempre.
 */
export default function ClasesDeHoy({ sucursalId }: { sucursalId: number | null | undefined }) {
  const { usuario } = useAuth();
  const p = usePalabras();
  const hoy = useApi(() => apiAcademia.hoy(sucursalId), [sucursalId]);
  const marcaLlegadas = tienePermiso(usuario, "asistencia.llegadas");
  // Deshacer es de quien marca la de todos: al docente (PROPIO) el backend se lo niega.
  const deshaceLlegadas = marcaLlegadas && !soloLoSuyo(usuario, "asistencia.llegadas");
  const pasaLista = tienePermiso(usuario, "asistencia.registrar");
  const [marcando, setMarcando] = useState<number | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<ClaseDelDia | null>(null);
  /** La clase a la que le falta más de una hora: se confirma y se reenvía. */
  const [temprano, setTemprano] = useState<{ c: ClaseDelDia; minutosAntes: number | null } | null>(null);
  const [error, setError] = useState("");

  async function marcarLlegada(c: ClaseDelDia, confirmarTemprano = false) {
    setMarcando(c.sesionId);
    setError("");
    try {
      await (confirmarTemprano ? apiAcademia.llegada(c.sesionId, true) : apiAcademia.llegada(c.sesionId));
      setTemprano(null);
      hoy.recargar();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.LLEGADA_MUY_TEMPRANO) {
        // No se registró nada: se pregunta y, si confirma, se reenvía.
        setTemprano({ c, minutosAntes: typeof e.detalle.minutosAntes === "number" ? e.detalle.minutosAntes : null });
      } else {
        setTemprano(null);
        setError(e instanceof Error ? e.message : "No se pudo marcar la llegada");
      }
    } finally {
      setMarcando(null);
    }
  }

  async function deshacerLlegada(c: ClaseDelDia) {
    setMarcando(c.sesionId);
    setError("");
    try {
      await apiAcademia.borrarLlegada(c.sesionId);
      setDeshaciendo(null);
      hoy.recargar();
    } catch (e) {
      setDeshaciendo(null);
      setError(e instanceof Error ? e.message : "No se pudo deshacer la llegada");
    } finally {
      setMarcando(null);
    }
  }

  // Sin datos (cargando o sin red) tampoco: es un agregado, el Calendario no
  // depende de esto.
  const clases = hoy.datos?.clases ?? [];
  if (clases.length === 0) return null;

  const ahora = new Date();
  const orden = [...clases].sort((a, b) => aMinutos(a.horaInicio) - aMinutos(b.horaInicio));
  // La tolerancia de los ajustes llega en cada clase (revisión del 08-nov); un backend anterior no la manda.
  const tolerancia = clases.find((c) => c.toleranciaMin != null)?.toleranciaMin;
  const sede = hoy.datos?.sede ?? sucursalId ?? null;
  return (
    <div className="space-y-2">
      <ErrorMsg>{error}</ErrorMsg>
      <Tarjeta
        id="t-clases"
        titulo="Clases de hoy"
        contador={clases.length}
        bajada={
          <>
            {hoy.datos?.fecha ? `${capitalizar(fechaLarga(hoy.datos.fecha))} · ` : ""}
            La llegada del {p.docente} la marca la recepción.{tolerancia != null ? ` Tolerancia: ${tolerancia} min` : ""}
          </>
        }
        sinRelleno
      >
        <ul className={LISTA.lista}>
          {orden.map((c) => {
            const suspendida = estaSuspendida(c);
            const momento = suspendida ? "suspendida" : momentoClase(c, ahora);
            const llegada = estadoLlegada(c);
            const docente = typeof c.docente === "string" ? c.docente : c.docente?.nombre;
            return (
              <li
                key={c.sesionId}
                className={`grid gap-x-4 gap-y-2.5 ${LISTA.itemHover} sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:items-center`}
              >
                <span className="flex items-center gap-2 sm:block">
                  <span className={`block text-xl font-bold tabular-nums ${suspendida ? "text-texto-4 line-through" : "text-texto"}`}>{c.horaInicio}</span>
                  <span
                    className={`inline-block whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold sm:mt-0.5 ${
                      momento === "en curso" ? "bg-primary-50 text-primary-700" : momento === "suspendida" ? "bg-danger-bg text-danger-text" : "bg-slate-100 text-texto-3"
                    }`}
                  >
                    {momento}
                  </span>
                </span>
                <span className="min-w-0 space-y-1.5">
                  <span className="block">
                    <Link to={`/academia/grupos/${c.grupoId}`} className="block truncate text-sm font-semibold text-texto hover:text-primary-700 hover:underline">
                      {nombreDe(c.carrera)} · {c.nombre}
                    </Link>
                    <span className="block truncate text-[13px] text-texto-3">
                      M{c.materia.orden} {c.materia.nombre}
                      {c.aula ? ` · ${c.aula}` : ""}
                      {suspendida ? "" : ` · Lista ${c.lista.pasada ? `${c.lista.presentes} de ${c.lista.total}` : "—"}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                    {docente && (
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-texto-2">
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-700"
                        >
                          {iniciales(docente)}
                        </span>
                        <span className="truncate">{docente}</span>
                      </span>
                    )}
                    {!suspendida && (
                      <Chip tono={llegada.tono} className="text-[12px]">
                        {llegada.texto}
                      </Chip>
                    )}
                    <ChipsDeClase c={c} />
                  </span>
                </span>
                <span className="flex flex-wrap gap-2 sm:justify-end">
                  {/* También pasada la hora de fin: el backend acepta la de hoy (y la de ayer). */}
                  {marcaLlegadas && !c.llegadaEn && !suspendida && (
                    <BotonFila icono="check" disabled={marcando === c.sesionId} onClick={() => void marcarLlegada(c)}>
                      {marcando === c.sesionId ? "Marcando…" : "Marcar llegada"}
                    </BotonFila>
                  )}
                  {deshaceLlegadas && c.llegadaEn && (
                    <BotonFila
                      variante="ghost"
                      icono="girar"
                      disabled={marcando === c.sesionId}
                      aria-label={`Deshacer la llegada de las ${c.horaInicio}`}
                      onClick={() => setDeshaciendo(c)}
                    >
                      Deshacer
                    </BotonFila>
                  )}
                  {pasaLista && !suspendida && (
                    <BotonFila variante="ghost" icono="lista" a={`/academia/grupos/${c.grupoId}/lista`} aria-label={`Pasar lista de las ${c.horaInicio}`}>
                      Pasar lista
                    </BotonFila>
                  )}
                  <AccionesClase c={c} sedeId={typeof c.sede === "object" && c.sede ? c.sede.id : sede} onCambio={hoy.recargar} />
                </span>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
      <Confirmar
        abierto={!!deshaciendo}
        titulo="Deshacer la llegada"
        texto={
          deshaciendo?.llegadaEn
            ? `Se borra la llegada de las ${fmtHora(deshaciendo.llegadaEn)}${
                typeof deshaciendo.docente === "object" && deshaciendo.docente ? ` de ${deshaciendo.docente.nombre}` : ""
              }. Si la volvés a marcar, queda con la hora de ese momento.`
            : ""
        }
        etiquetaOk="Deshacer"
        procesando={marcando != null}
        onCancel={() => setDeshaciendo(null)}
        onOk={() => deshaciendo && void deshacerLlegada(deshaciendo)}
      />
      <Confirmar
        abierto={!!temprano}
        titulo="Todavía falta para la clase"
        texto={
          temprano
            ? `${
                temprano.minutosAntes != null ? `Faltan ${duracionTexto(temprano.minutosAntes)} para la clase de las ${temprano.c.horaInicio}` : `La clase es a las ${temprano.c.horaInicio}`
              }. ¿Seguro que es esta clase? Si confirmás, la llegada queda a esta hora.`
            : ""
        }
        etiquetaOk="Sí, marcar la llegada"
        procesando={marcando != null}
        onCancel={() => setTemprano(null)}
        onOk={() => temprano && void marcarLlegada(temprano.c, true)}
      />
    </div>
  );
}

/** «2 h», «1 h 30 min», «45 min». */
function duracionTexto(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** "terminó", "en curso" o "por empezar", con la hora del equipo. */
function momentoClase(c: ClaseDelDia, ahora: Date): "terminó" | "en curso" | "por empezar" {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  if (min >= aMinutos(c.horaFin)) return "terminó";
  if (min >= aMinutos(c.horaInicio)) return "en curso";
  return "por empezar";
}

/**
 * «Llegó 07:55 · a horario», «Llegó 08:14 · 14 min tarde» o «Todavía no
 * llegó»: la llegada del docente, sin descontar nada (D9). Tarde sólo pasada
 * la tolerancia de los ajustes (`minutosDeAtraso`).
 */
function estadoLlegada(c: ClaseDelDia): { texto: string; tono: TonoChip } {
  if (!c.llegadaEn) return { texto: "Todavía no llegó", tono: "gris" };
  const atraso = minutosDeAtraso(c);
  if (atraso > 0) return { texto: `Llegó ${fmtHora(c.llegadaEn)} · ${atraso} min tarde`, tono: c.atrasoJustificado ? "azul" : "ambar" };
  return { texto: `Llegó ${fmtHora(c.llegadaEn)} · a horario`, tono: "verde" };
}
