import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Campo, Select } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { RUTA_SEDES } from "../../lib/academia/vista";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";

/** El valor del selector cuando el grupo tiene un aula escrita a mano que no está enlazada a ninguna de la lista. */
export const AULA_TEXTO_ANTERIOR = "texto-anterior" as const;
export type ValorAula = number | null | typeof AULA_TEXTO_ANTERIOR;

/**
 * El aula del grupo, elegida de la lista de aulas de SU sede (BACK-5). Antes
 * era un campo de texto. Lo comparten abrir un grupo (NuevoGrupo) y editarlo
 * (Grupo):
 *
 * - ofrece las aulas ACTIVAS de la sede y "Sin aula";
 * - el aula que el grupo ya tenía se agrega aunque esté de baja («(de baja)»),
 *   para no perderla al editar otra cosa;
 * - un grupo viejo con el texto sin enlazar conserva ese texto mientras no se
 *   toque el selector;
 * - sin aulas cargadas se puede guardar igual, y quien configura ve el enlace
 *   a la sección Aulas (se abre aparte para no perder lo que se está llenando).
 */
export default function SelectorAula({
  sedeId,
  valor,
  onChange,
  actual,
  onNombre,
}: {
  /** La sede del grupo: sin ella no hay lista que ofrecer. */
  sedeId: number | null;
  valor: ValorAula;
  onChange: (v: ValorAula) => void;
  /** El aula que el grupo ya tiene guardada (al editar). */
  actual?: { id: number | null; nombre: string | null };
  /** El nombre del aula elegida (o null), para los avisos que la nombran. */
  onNombre?: (nombre: string | null) => void;
}) {
  const { usuario } = useAuth();
  const configura = tienePermiso(usuario, "academia.configurar");
  const lista = useApi(() => (sedeId == null ? Promise.resolve([]) : apiAcademia.aulas({ sede: sedeId, soloActivas: true })), [sedeId]);
  const aulas = lista.datos ?? [];

  // Sin aulas, el enlace abre la sección en otra pestaña: al volver, la lista se refresca sola.
  const vacia = sedeId != null && !lista.cargando && !lista.error && aulas.length === 0;
  const recargar = lista.recargar;
  useEffect(() => {
    if (!vacia) return;
    window.addEventListener("focus", recargar);
    return () => window.removeEventListener("focus", recargar);
  }, [vacia, recargar]);

  const propia = actual?.id != null ? aulas.find((a) => a.id === actual.id) : undefined;
  const deBaja = actual?.id != null && !propia && actual.nombre ? { id: actual.id, nombre: actual.nombre } : null;
  const textoViejo = actual?.id == null && actual?.nombre ? actual.nombre : null;

  const nombreElegida =
    typeof valor === "number" ? (aulas.find((a) => a.id === valor)?.nombre ?? (actual?.id === valor ? actual.nombre : null)) : null;
  useEffect(() => onNombre?.(nombreElegida), [nombreElegida, onNombre]);

  const seleccion = valor === null ? "" : String(valor);
  function elegir(v: string) {
    onChange(v === "" ? null : v === AULA_TEXTO_ANTERIOR ? AULA_TEXTO_ANTERIOR : Number(v));
  }

  return (
    <Campo label="Aula">
      <Select value={seleccion} onChange={(e) => elegir(e.target.value)} disabled={sedeId == null}>
        <option value="">Sin aula</option>
        {textoViejo && <option value={AULA_TEXTO_ANTERIOR}>{textoViejo} (sin enlazar)</option>}
        {deBaja && <option value={deBaja.id}>{deBaja.nombre} (de baja)</option>}
        {aulas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
            {a.capacidad != null ? ` · ${a.capacidad} lugares` : ""}
          </option>
        ))}
      </Select>
      {sedeId == null ? (
        <span className="mt-1 block text-xs text-texto-4">Elegí primero la sede.</span>
      ) : lista.error ? (
        <span className="mt-1 block text-xs text-danger-text">
          No se pudieron traer las aulas; podés guardar sin aula.{" "}
          <button type="button" onClick={lista.recargar} className="font-semibold underline">
            Reintentar
          </button>
        </span>
      ) : vacia ? (
        <span className="mt-1 block text-xs text-texto-3">
          Esta sede todavía no tiene aulas cargadas.{" "}
          {configura && (
            <Link to={`${RUTA_SEDES}?sede=${sedeId}&ver=aulas`} target="_blank" rel="noreferrer" className="font-semibold text-primary-700 hover:underline">
              Cargar aulas
            </Link>
          )}
        </span>
      ) : null}
    </Campo>
  );
}
