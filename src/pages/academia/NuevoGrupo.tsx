import { useEffect, useMemo, useState } from "react";
import { Chips } from "../../components/filtros";
import { Boton, Campo, Cargando, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import {
  diasTexto,
  fechaCorta,
  fechaFinSugerida,
  horasEntre,
  LETRA_DIA,
  MAX_HORAS_DIA,
  SEMANA,
} from "../../lib/academia/formato";
import type { GrupoDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { fmtMoney, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";

/**
 * E4 · Nuevo grupo (PLAN-ACADEMIAS §5): la carrera trae sus materias, horas
 * y planes; se elige la sede, los días y el horario, el inicio (el fin se
 * sugiere con las horas del curso y se puede corregir), el docente de cada
 * materia, el cupo y los planes que se ofrecen. Las clases las genera el
 * backend al guardar.
 */
export default function NuevoGrupo({
  onCerrar,
  onCreado,
}: {
  onCerrar: () => void;
  onCreado: (g: GrupoDetalle) => void;
}) {
  const p = usePalabras();
  const { usuario } = useAuth();
  const sedes = useSucursales();
  const carreras = useApi(() => apiAcademia.carreras(), []);
  const docentes = useApi(() => apiAcademia.docentes().catch(() => []), []);

  const [carreraId, setCarreraId] = useState<number | null>(null);
  // La secretaría arma grupos en su sede; la dirección elige.
  const [almacenId, setAlmacenId] = useState<number | null>(usuario?.sucursalId ?? null);
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5]);
  const [horaInicio, setHoraInicio] = useState("19:00");
  const [horaFin, setHoraFin] = useState("21:00");
  const [fechaInicio, setFechaInicio] = useState(isoDia(new Date()));
  const [fechaFin, setFechaFin] = useState("");
  const [finTocado, setFinTocado] = useState(false);
  const [docentePor, setDocentePor] = useState<Record<number, number | null>>({});
  const [cupo, setCupo] = useState("");
  const [aula, setAula] = useState("");
  const [planes, setPlanes] = useState<number[] | null>(null);
  const [abierta, setAbierta] = useState(true);
  const [publicar, setPublicar] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (almacenId == null && sedes.sugerida) setAlmacenId(sedes.sugerida.id);
  }, [almacenId, sedes.sugerida]);

  const activas = (carreras.datos ?? []).filter((c) => c.activa);
  const carrera = activas.find((c) => c.id === carreraId) ?? null;
  const materias = (carrera?.materias ?? []).filter((m) => m.activa).sort((a, b) => a.orden - b.orden);
  const planesCarrera = (carrera?.planes ?? []).filter((x) => x.activo);
  const elegidos = planes ?? planesCarrera.map((x) => x.id);

  const horasDia = horasEntre(horaInicio, horaFin);
  const sugerencia = useMemo(
    () => (carrera ? fechaFinSugerida(fechaInicio, dias, horasDia, carrera.horasTotales) : null),
    [carrera, fechaInicio, dias, horasDia],
  );
  // El fin sigue a la sugerencia hasta que alguien lo corrige a mano.
  useEffect(() => {
    if (!finTocado && sugerencia) setFechaFin(sugerencia.fin);
  }, [sugerencia, finTocado]);

  const nombreSede = sedes.sucursales.find((s) => s.id === almacenId)?.nombre ?? usuario?.sucursal ?? "";

  async function crear() {
    if (!carrera) return setError(`Elegí la ${p.carrera}.`);
    if (almacenId == null) return setError(`Elegí la ${p.sede}.`);
    if (!dias.length) return setError("Elegí al menos un día.");
    if (horasDia <= 0) return setError("La hora de fin tiene que ser después de la de inicio.");
    if (!fechaInicio) return setError("Falta la fecha de inicio.");
    if (!elegidos.length) return setError("Ofrecé al menos un plan de pago.");
    setError("");
    setGuardando(true);
    try {
      const g = await apiAcademia.crearGrupo({
        carreraId: carrera.id,
        almacenId,
        ...(aula.trim() ? { aula: aula.trim() } : {}),
        dias,
        horaInicio,
        horaFin,
        fechaInicio,
        ...(fechaFin ? { fechaFin } : {}),
        ...(Number(cupo) > 0 ? { cupo: Number(cupo) } : {}),
        inscripcionAbierta: abierta,
        publicarEnPagina: publicar,
        planesOfrecidos: elegidos,
        materias: materias.map((m) => ({
          materiaId: m.id,
          ...(docentePor[m.id] ? { personalId: docentePor[m.id] } : {}),
        })),
      });
      onCreado(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el grupo");
    } finally {
      setGuardando(false);
    }
  }

  const alternarDia = (d: number) => setDias((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]));

  return (
    <Modal
      abierto
      titulo="Nuevo grupo"
      onClose={onCerrar}
      ancho="max-w-2xl"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void crear()} disabled={guardando}>
            {guardando ? "Creando…" : "Crear grupo"}
          </Boton>
        </>
      }
    >
      {carreras.cargando ? (
        <Cargando />
      ) : activas.length === 0 ? (
        <ErrorMsg>{`Todavía no hay ${p.carreras}: cargá una en Configuración antes de abrir un grupo.`}</ErrorMsg>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-texto">1 · {p.Carrera}</h3>
            <Select
              aria-label={p.Carrera}
              value={carreraId ?? ""}
              onChange={(e) => {
                setCarreraId(e.target.value ? Number(e.target.value) : null);
                setPlanes(null);
                setDocentePor({});
              }}
            >
              <option value="">Elegí…</option>
              {activas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.horasTotales} h · {c.materias.filter((m) => m.activa).length} {p.materias}
                </option>
              ))}
            </Select>
          </section>

          {usuario?.sucursalId == null && sedes.sucursales.length > 1 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-texto">2 · {p.Sede}</h3>
              <Chips
                valor={almacenId == null ? "" : String(almacenId)}
                opciones={sedes.sucursales.map((s) => [String(s.id), s.nombre] as const)}
                onChange={(v) => setAlmacenId(Number(v))}
              />
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-texto">3 · Días y horario</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días">
              {SEMANA.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={dias.includes(d)}
                  aria-label={["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d]}
                  onClick={() => alternarDia(d)}
                  className={`h-10 w-10 rounded-full text-sm font-semibold transition-colors ${
                    dias.includes(d) ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
                  }`}
                >
                  {LETRA_DIA[d]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <Campo label="Desde">
                <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
              </Campo>
              <Campo label="Hasta">
                <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
              </Campo>
            </div>
            {horasDia > MAX_HORAS_DIA && (
              <p className="text-[13px] text-warning-text">
                {horasDia} h por día: el reglamento de CCTP permite hasta {MAX_HORAS_DIA} h (art. 27).
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-texto">4 · Inicio</h3>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <Campo label="Inicio">
                <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </Campo>
              <Campo label="Fin (calculado)">
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => {
                    setFechaFin(e.target.value);
                    setFinTocado(true);
                  }}
                />
              </Campo>
            </div>
          </section>

          {materias.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-texto">
                5 · {p.Docente} por {p.materia}
              </h3>
              <ul className="space-y-2">
                {materias.map((m) => (
                  <li key={m.id} className="grid items-center gap-2 sm:grid-cols-[1fr_16rem]">
                    <span className="text-sm text-texto">
                      M{m.orden} · {m.nombre} <span className="text-texto-3">· {m.horas} h</span>
                    </span>
                    <Select
                      aria-label={`${p.Docente} de M${m.orden}`}
                      value={docentePor[m.id] ?? ""}
                      onChange={(e) => setDocentePor({ ...docentePor, [m.id]: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Sin asignar</option>
                      {(docentes.datos ?? []).map((d) => (
                        <option key={d.personalId} value={d.personalId}>
                          {d.nombre}
                        </option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-bold text-texto">6 · Cupo y aula</h3>
            <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
              <Campo label="Cupo" hint="Vacío = sin tope.">
                <Input type="number" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
              </Campo>
              <Campo label="Aula (opcional)">
                <Input value={aula} onChange={(e) => setAula(e.target.value)} />
              </Campo>
            </div>
          </section>

          {planesCarrera.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-texto">7 · Planes que se ofrecen</h3>
              <ul className="space-y-1.5">
                {planesCarrera.map((pl) => (
                  <li key={pl.id}>
                    <label className="flex items-center gap-2 text-sm text-texto">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--color-primary-boton)]"
                        checked={elegidos.includes(pl.id)}
                        onChange={(e) =>
                          setPlanes(e.target.checked ? [...elegidos, pl.id] : elegidos.filter((x) => x !== pl.id))
                        }
                      />
                      {pl.nombre} · {fmtMoney(pl.total)}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm text-texto">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary-boton)]" checked={abierta} onChange={(e) => setAbierta(e.target.checked)} />
              Inscripción abierta
            </label>
            <label className="flex items-center gap-2 text-sm text-texto">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary-boton)]" checked={publicar} onChange={(e) => setPublicar(e.target.checked)} />
              Mostrar en la página (próximos inicios)
            </label>
          </section>

          {carrera && sugerencia && (
            <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
              Se van a crear unas {sugerencia.clases} clases del {fechaCorta(fechaInicio)} al {fechaCorta(fechaFin)}, {diasTexto(dias)} de{" "}
              {horaInicio} a {horaFin}
              {nombreSede ? `, en ${nombreSede}` : ""}
              {aula.trim() ? ` · ${aula.trim()}` : ""}.
            </p>
          )}
          <ErrorMsg>{error}</ErrorMsg>
        </div>
      )}
    </Modal>
  );
}
