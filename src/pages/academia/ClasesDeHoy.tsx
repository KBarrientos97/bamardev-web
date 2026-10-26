import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorMsg } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { aMinutos } from "../../lib/academia/calendario";
import { nombreDe } from "../../lib/academia/formato";
import type { ClaseDelDia } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { fmtHora } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { BotonFila, LISTA, Tarjeta } from "./piezas";

/**
 * Las clases de hoy de la sede, arriba del Calendario (26-oct). Antes vivían
 * en la pantalla "Hoy", que salió del menú (dueño: lo más sencillo posible,
 * el Calendario es la pantalla del instituto). Se quedaron porque acá se
 * marca la llegada del docente, con la hora del servidor y sin descontar
 * nada (D9), y eso no existe en otro lado. Lo demás de "Hoy" ya tenía su
 * lugar: lo que hay para cobrar en Cobranza, las inscripciones online con su
 * contador en el menú, Inscribir en Estudiantes.
 *
 * Sin clases hoy no se dibuja: el Calendario queda como siempre.
 */
export default function ClasesDeHoy({ sucursalId }: { sucursalId: number | null | undefined }) {
  const { usuario } = useAuth();
  const p = usePalabras();
  const hoy = useApi(() => apiAcademia.hoy(sucursalId), [sucursalId]);
  const marcaLlegadas = tienePermiso(usuario, "asistencia.llegadas");
  const [marcando, setMarcando] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function marcarLlegada(sesionId: number) {
    setMarcando(sesionId);
    setError("");
    try {
      await apiAcademia.llegada(sesionId);
      hoy.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar la llegada");
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
  return (
    <div className="space-y-2">
      <ErrorMsg>{error}</ErrorMsg>
      <Tarjeta id="t-clases" titulo="Clases de hoy" contador={clases.length} sinRelleno>
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
                    <BotonFila icono="check" disabled={marcando === c.sesionId} onClick={() => void marcarLlegada(c.sesionId)}>
                      {marcando === c.sesionId ? "Marcando…" : "Marcar llegada"}
                    </BotonFila>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </div>
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
