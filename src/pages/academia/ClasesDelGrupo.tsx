import { useState } from "react";
import { ErrorMsg } from "../../components/ui";
import { estaSuspendida } from "../../lib/academia/clases";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { minutosDeAtraso } from "../../lib/academia/calendario";
import { fechaCorta } from "../../lib/academia/formato";
import type { ClaseDelGrupo, GrupoDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { capitalizar, diaCorto } from "../../lib/agenda/horaAgenda";
import { fmtHora } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { AccionesClase, ChipsDeClase } from "./AccionesClase";
import { BotonFila, ChipsFiltro, LISTA, Tarjeta } from "./piezas";

/**
 * Ítem 14 de la revisión del 08-nov: las clases del grupo, una por fila, con
 * quién la da (y si es un reemplazo), la llegada, «Lista 12/14» y su estado.
 * Desde acá la administración abre la lista de otro día y la corrige (el
 * docente lee «pedíselo a la administración»: ahora tiene dónde), y hace lo
 * mismo que en Clases de hoy: «No vino», deshacer y justificar.
 *
 * Se ve un módulo por vez (el que está en curso, o el último que pasó): un
 * grupo de cuatro meses tiene unas cincuenta clases.
 */
export default function ClasesDelGrupo({ g }: { g: GrupoDetalle }) {
  const p = usePalabras();
  const { usuario } = useAuth();
  const datos = useApi(() => apiAcademia.clasesDelGrupo(g.id), [g.id]);
  const clases = datos.datos?.clases ?? [];
  const hoy = datos.datos?.hoy ?? "";
  const modulos = [...new Set(clases.map((c) => c.materia.orden))].sort((a, b) => a - b);
  // El módulo de hoy; si no, el último que ya tuvo clases; si no, el primero.
  const porDefecto =
    clases.find((c) => c.fecha === hoy)?.materia.orden ??
    [...clases].reverse().find((c) => c.fecha < hoy)?.materia.orden ??
    modulos[0] ??
    null;
  const [elegido, setElegido] = useState<number | null>(null);
  const modulo = elegido ?? porDefecto;
  const delModulo = clases.filter((c) => c.materia.orden === modulo);
  const pasaLista = tienePermiso(usuario, "asistencia.registrar") || tienePermiso(usuario, "academia.grupos");

  if (datos.error && !datos.datos) {
    return (
      <Tarjeta id="t-clases-grupo" titulo="Clases">
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      </Tarjeta>
    );
  }
  if (!datos.datos || !clases.length) return null;

  return (
    <Tarjeta
      id="t-clases-grupo"
      titulo="Clases"
      contador={delModulo.length}
      bajada={`Tocá «Lista» para ver o corregir la de cualquier día.`}
      sinRelleno
      barra={
        modulos.length > 1 ? (
          <ChipsFiltro<string>
            etiqueta={`${p.Materia} de las clases`}
            opciones={modulos.map((o) => ({ clave: String(o), label: `M${o}` }))}
            valor={String(modulo)}
            onChange={(v) => setElegido(Number(v))}
          />
        ) : undefined
      }
    >
      <ul aria-label="Clases del grupo" className={LISTA.lista}>
        {delModulo.map((c) => (
          <FilaClase key={c.sesionId} c={c} hoy={hoy} grupoId={g.id} sedeId={g.sede.id} pasaLista={pasaLista} onCambio={datos.recargar} />
        ))}
      </ul>
    </Tarjeta>
  );
}

function FilaClase({
  c,
  hoy,
  grupoId,
  sedeId,
  pasaLista,
  onCambio,
}: {
  c: ClaseDelGrupo;
  hoy: string;
  grupoId: number;
  sedeId: number;
  pasaLista: boolean;
  onCambio: () => void;
}) {
  const suspendida = estaSuspendida(c);
  const futura = c.fecha > hoy;
  const atraso = c.llegadaEn ? minutosDeAtraso(c) : 0;
  const lista = c.lista.pasada ? `Lista ${c.lista.presentes}/${c.lista.total}` : futura ? null : "Sin lista";
  const llegada = c.llegadaEn ? `Llegó ${fmtHora(c.llegadaEn)}${atraso > 0 ? ` · ${atraso} min tarde` : ""}` : futura || suspendida ? null : "Sin llegada";
  return (
    <li className={`grid gap-x-4 gap-y-2 ${LISTA.itemHover} sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center ${c.fecha === hoy ? "bg-primary-50/40" : ""}`}>
      <span className="flex items-baseline gap-2 sm:block">
        <span className={`block text-sm font-bold ${suspendida ? "text-texto-4 line-through" : "text-texto"}`}>
          {capitalizar(diaCorto(c.fecha).toLowerCase())} {fechaCorta(c.fecha)}
        </span>
        <span className="block text-[13px] tabular-nums text-texto-3">
          {c.horaInicio}
          {c.fecha === hoy ? " · hoy" : ""}
        </span>
      </span>
      <span className="min-w-0 space-y-1">
        <span className="block truncate text-[13px] text-texto-2">
          {[c.docente?.nombre ?? "Sin docente", llegada, suspendida ? null : lista].filter(Boolean).join(" · ")}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <ChipsDeClase c={c} />
        </span>
      </span>
      <span className="flex flex-wrap gap-2 sm:justify-end">
        {pasaLista && !suspendida && !futura && (
          <BotonFila
            variante="ghost"
            icono="lista"
            a={`/academia/grupos/${grupoId}/lista?fecha=${c.fecha}`}
            aria-label={`Lista del ${fechaCorta(c.fecha)}`}
          >
            {c.lista.pasada ? "Ver lista" : "Pasar lista"}
          </BotonFila>
        )}
        <AccionesClase c={c} sedeId={sedeId} onCambio={onCambio} />
      </span>
    </li>
  );
}
