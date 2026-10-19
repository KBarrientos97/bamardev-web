import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PanelLateral from "../../components/PanelLateral";
import { Boton, Campo, ErrorMsg, Input, Select } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { franjasDe, inicioDelMes, mesDe, nombreMes, proximoInicio, sumarMeses } from "../../lib/academia/calendario";
import { diasTexto, horasEntre, SEMANA } from "../../lib/academia/formato";
import type { GrupoDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";

/** Lo que el calendario ya sabe del hueco que se tocó. */
export interface HuecoCalendario {
  inicio?: string;
  fin?: string;
  /** `AAAA-MM`: el mes en que arranca el primer módulo. */
  mes?: string;
  sede?: number | null;
  /** `false`: la fila del hueco no es una franja (un horario suelto): se abre con "Otro horario". */
  esFranja?: boolean;
  /**
   * Con "Todas las sedes" no se sabe de qué sede es el hueco (la franja es de
   * varias, o de todas): hay que elegirla, y no se propone la principal.
   */
  elegirSede?: boolean;
  /** Las sedes que tienen esa franja, cuando son algunas y no todas. */
  sedesPosibles?: number[];
}

const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const LETRA = ["D", "L", "M", "X", "J", "V", "S"];
/** De lunes a sábado: los domingos no se dicta (y si hace falta, "Otro horario" no lo cambia). */
const DIAS_CLASE = SEMANA.filter((d) => d !== 0);
const OTRO = "otro";

/**
 * N3 · Abrir grupo (ronda 2): el panel lateral que se abre desde el
 * calendario, con la franja y el mes del hueco ya puestos. Todos los módulos
 * empiezan el mismo día del mes (D5), así que el inicio se elige entre los
 * próximos "10 de …" y el backend arma las fechas de cada módulo por meses.
 * El cupo viene del curso; el docente de cada módulo se puede elegir después.
 * Abajo, cómo va a quedar en el calendario antes de guardar.
 */
export default function NuevoGrupo({
  hueco = {},
  onCerrar,
  onCreado,
}: {
  hueco?: HuecoCalendario;
  onCerrar: () => void;
  onCreado: (g: GrupoDetalle) => void;
}) {
  const p = usePalabras();
  const { usuario } = useAuth();
  const sedes = useSucursales();
  const carreras = useApi(() => apiAcademia.carreras(), []);
  const ajustes = useApi(() => apiAcademia.ajustes(), []);
  const docentes = useApi(() => apiAcademia.docentes().catch(() => []), []);

  const [carreraId, setCarreraId] = useState<number | null>(null);
  // La recepción arma grupos en su sede; la dirección elige.
  const [almacenId, setAlmacenId] = useState<number | null>(hueco.sede ?? usuario?.sucursalId ?? null);
  const [franja, setFranja] = useState<string>(
    hueco.inicio && hueco.fin ? (hueco.esFranja === false ? OTRO : `${hueco.inicio}-${hueco.fin}`) : "",
  );
  const [horaInicio, setHoraInicio] = useState(hueco.inicio ?? "19:00");
  const [horaFin, setHoraFin] = useState(hueco.fin ?? "21:00");
  const [dias, setDias] = useState<number[]>([1, 3, 5]);
  const [mesInicio, setMesInicio] = useState<string | null>(hueco.mes ?? null);
  const [cupo, setCupo] = useState("");
  const [aula, setAula] = useState("");
  const [docentePor, setDocentePor] = useState<Record<number, number | null>>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // Un hueco de "Todas las sedes" que no dice de cuál es: la elige quien abre
    // el grupo. Proponer la principal armaba el grupo en una sede que no tenía
    // esa franja (QA ronda 2, B-07).
    if (almacenId == null && sedes.sugerida && !hueco.elegirSede) setAlmacenId(sedes.sugerida.id);
  }, [almacenId, sedes.sugerida, hueco.elegirSede]);

  const a = ajustes.datos;
  const dia = a?.diaInicioModulo ?? 10;
  const duracion = a?.duracionModuloMeses ?? 1;
  const activas = (carreras.datos ?? []).filter((c) => c.activa);
  const carrera = activas.find((c) => c.id === carreraId) ?? null;
  const materias = (carrera?.materias ?? []).filter((m) => m.activa).sort((x, y) => x.orden - y.orden);

  // Al elegir el curso, su cupo por defecto (si nadie lo tocó).
  useEffect(() => {
    if (carrera?.cupoDefecto != null) setCupo((c) => (c === "" ? String(carrera.cupoDefecto) : c));
  }, [carrera]);

  // Las franjas de la sede, o si no tiene propias, las de todas.
  const franjas = useMemo(() => {
    const propias = franjasDe(a?.franjas, almacenId);
    return propias.length ? propias : franjasDe(a?.franjas, null);
  }, [a?.franjas, almacenId]);
  // Sin franja elegida, o con una que la sede no tiene (se cambió de sede, o el
  // hueco era de otra): la primera de la sede. Las que valen para todas las
  // sedes sirven en cualquiera.
  const deTodas = useMemo(() => franjasDe(a?.franjas, null), [a?.franjas]);
  useEffect(() => {
    if (!franjas.length || franja === OTRO) return;
    const vale = (f: { inicio: string; fin: string }) => `${f.inicio}-${f.fin}` === franja;
    const ajena = !!franja && almacenId != null && !franjas.some(vale) && !deTodas.some(vale);
    if (!franja || ajena) {
      setFranja(`${franjas[0].inicio}-${franjas[0].fin}`);
      setHoraInicio(franjas[0].inicio);
      setHoraFin(franjas[0].fin);
    }
  }, [franja, franjas, deTodas, almacenId]);

  // Los próximos seis días de inicio, desde el más cercano. El mes del hueco
  // vale si su día de inicio no pasó: el 19-oct, el hueco de octubre propone
  // el 10 de noviembre y no el 10 de octubre (QA ronda 2, B-03).
  const primero = mesDe(new Date(`${proximoInicio(dia)}T12:00:00`));
  const inicios = Array.from({ length: 6 }, (_, i) => sumarMeses(primero, i));
  const mesValido = mesInicio && mesInicio >= primero ? mesInicio : null;
  if (mesValido && !inicios.includes(mesValido)) inicios.push(mesValido);
  const mes = mesValido ?? primero;
  const yaPaso = !!hueco.mes && hueco.mes < primero;

  const nombreSede = sedes.sucursales.find((s) => s.id === almacenId)?.nombre ?? usuario?.sucursal ?? "";
  const pctDocente = carrera?.pctDocente ?? a?.pctDocenteDefecto ?? null;
  const horasSemana = horasEntre(horaInicio, horaFin) * dias.length;

  function elegirFranja(v: string) {
    setFranja(v);
    if (v === OTRO) return;
    const [i, f] = v.split("-");
    setHoraInicio(i);
    setHoraFin(f);
  }

  async function crear() {
    if (!carrera) return setError(`Elegí el ${p.carrera}.`);
    if (almacenId == null) return setError(`Elegí la ${p.sede}.`);
    if (inicioDelMes(mes, dia) < proximoInicio(dia)) return setError("Esa fecha de inicio ya pasó: elegí otra.");
    if (!dias.length) return setError("Elegí al menos un día.");
    if (horasEntre(horaInicio, horaFin) <= 0) return setError("La hora de fin tiene que ser después de la de inicio.");
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
        fechaInicio: inicioDelMes(mes, dia),
        ...(Number(cupo) > 0 ? { cupo: Number(cupo) } : {}),
        inscripcionAbierta: true,
        publicarEnPagina: carrera.publicarEnPagina,
        planesOfrecidos: carrera.planes.filter((x) => x.activo).map((x) => x.id),
        materias: materias.map((m) => ({
          materiaId: m.id,
          ...(docentePor[m.id] ? { personalId: docentePor[m.id] } : {}),
        })),
      });
      onCreado(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el grupo");
    } finally {
      setGuardando(false);
    }
  }

  const alternarDia = (d: number) => setDias((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]));
  const opcionesSede = hueco.sedesPosibles?.length
    ? sedes.sucursales.filter((s) => hueco.sedesPosibles!.includes(s.id))
    : sedes.sucursales;
  const libres = (docentes.datos ?? []).filter((d) => almacenId == null || !d.sedes.length || d.sedes.some((s) => s.id === almacenId));

  return (
    <PanelLateral
      abierto
      titulo="Abrir grupo"
      subtitulo={hueco.inicio && hueco.mes ? `Hueco libre de ${hueco.inicio}–${hueco.fin} desde ${nombreMes(mes)}` : `Los ${p.materias} empiezan el ${dia} de cada mes`}
      onClose={onCerrar}
      acciones={
        <>
          <Boton onClick={() => void crear()} disabled={guardando || !dias.length}>
            {guardando ? "Abriendo…" : "Abrir grupo"}
          </Boton>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className={`grid gap-3 ${sedes.elegir ? "grid-cols-2" : ""}`}>
          <Campo label={p.Carrera}>
            <Select value={carreraId ?? ""} onChange={(e) => setCarreraId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Elegí…</option>
              {activas.map((c) => {
                const n = c.materias.filter((m) => m.activa).length;
                return (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {n} {n === 1 ? p.materia : p.materias}
                  </option>
                );
              })}
            </Select>
          </Campo>
          {sedes.elegir && (
            <Campo label={p.Sede}>
              <Select value={almacenId ?? ""} onChange={(e) => setAlmacenId(e.target.value ? Number(e.target.value) : null)}>
                {almacenId == null && <option value="">Elegí…</option>}
                {opcionesSede.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          )}
        </div>

        <Campo label="Franja horaria">
          <Select value={franja} onChange={(e) => elegirFranja(e.target.value)}>
            {franjas.map((f) => (
              <option key={`${f.inicio}-${f.fin}`} value={`${f.inicio}-${f.fin}`}>
                {f.inicio}–{f.fin}
              </option>
            ))}
            {franja && franja !== OTRO && !franjas.some((f) => `${f.inicio}-${f.fin}` === franja) && (
              <option value={franja}>{franja.replace("-", "–")}</option>
            )}
            <option value={OTRO}>Otro horario</option>
          </Select>
        </Campo>
        {franja === OTRO && (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Desde">
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </Campo>
            <Campo label="Hasta">
              <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </Campo>
          </div>
        )}

        <div>
          <span id="et-dias" className="mb-1.5 block text-[13px] font-semibold text-texto-2">
            Días de clase
          </span>
          <div role="group" aria-labelledby="et-dias" className="flex gap-1.5">
            {DIAS_CLASE.map((d) => {
              const on = dias.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={NOMBRE_DIA[d]}
                  onClick={() => alternarDia(d)}
                  className={`h-10 w-10 rounded-xl border text-sm font-semibold transition-colors ${
                    on ? "border-primary bg-primary-50 text-primary-700" : "border-borde bg-white text-texto-3 hover:bg-muted"
                  }`}
                >
                  {LETRA[d]}
                </button>
              );
            })}
          </div>
          <p className={`mt-1 text-xs ${dias.length ? "text-texto-3" : "text-warning-text"}`}>
            {dias.length ? `${diasTexto(dias)} · ${horasSemana.toLocaleString("es-BO")} h por semana` : "Elegí al menos un día"}
          </p>
        </div>

        <div>
          <Campo label="Empieza el">
            <Select value={mes} onChange={(e) => setMesInicio(e.target.value)}>
              {inicios.map((m) => (
                <option key={m} value={m}>
                  {dia} de {nombreMes(m)} de {m.slice(0, 4)}
                </option>
              ))}
            </Select>
          </Campo>
          {yaPaso && (
            <p className="mt-1 text-xs text-texto-3">
              El {dia} de {nombreMes(hueco.mes!)} ya pasó: el primer inicio posible es el {dia} de {nombreMes(primero)}.
            </p>
          )}
          <p className="mt-1 text-xs text-texto-4">
            Los {p.materias} empiezan el {dia} de cada mes. Se cambia en{" "}
            <Link to="/configuracion/academia" className="font-semibold text-primary-700 hover:underline">
              Ajustes
            </Link>
            .
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Cupo" hint={carrera?.cupoDefecto != null ? `Viene del ${p.carrera}` : undefined}>
            <Input type="number" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
          </Campo>
          <Campo label="Aula">
            <Input value={aula} onChange={(e) => setAula(e.target.value)} placeholder="Aula 1" />
          </Campo>
        </div>

        {materias.length > 0 && (
          <div className="border-t border-borde-soft pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-texto-2">{p.Docente} por {p.materia}</span>
              {pctDocente != null && <span className="text-xs text-texto-3">Cobra el {pctDocente} %</span>}
            </div>
            <ul className="mt-2 space-y-2">
              {materias.map((m, i) => (
                <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-texto">
                      M{i + 1} · {m.nombre}
                    </span>
                    <span className="block text-xs text-texto-3">
                      Empieza el {dia} · {nombreMes(sumarMeses(mes, i * duracion))}
                    </span>
                  </span>
                  <label>
                    <span className="sr-only">
                      {p.Docente} de M{i + 1}
                    </span>
                    <Select
                      value={docentePor[m.id] ?? ""}
                      onChange={(e) => setDocentePor({ ...docentePor, [m.id]: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Elegir después</option>
                      {libres.map((d) => (
                        <option key={d.personalId} value={d.personalId}>
                          {d.nombre}
                        </option>
                      ))}
                    </Select>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {carrera && materias.length > 0 && (
          <section aria-label="Así queda en el calendario" className="rounded-xl bg-muted p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-texto-3">Así queda en el calendario</p>
            <div className="flex gap-2 overflow-x-auto">
              <span className="w-10 shrink-0 text-xs tabular-nums text-texto-3">
                {horaInicio}
                <br />
                {horaFin}
              </span>
              {materias.map((m, i) => {
                const ultimo = i === materias.length - 1;
                const docente = libres.find((d) => d.personalId === docentePor[m.id])?.nombre;
                return (
                  <div key={m.id} className="w-36 shrink-0">
                    <span className="block text-xs capitalize text-texto-3">{nombreMes(sumarMeses(mes, i * duracion))}</span>
                    <span className={`mt-1 block rounded-lg border p-2 text-xs ${ultimo ? "border-primary-100 bg-white" : "border-primary-50 bg-primary-50"}`}>
                      <span className="flex justify-between gap-1">
                        <b className="truncate text-texto">{carrera.nombre}</b>
                        <span className="text-texto-3">{diasTexto(dias)}</span>
                      </span>
                      <span className="block truncate text-texto-2">
                        M{i + 1} de {materias.length} · {m.nombre}
                      </span>
                      <span className="block truncate text-texto-3">{docente ?? `${p.Docente} por elegir`}</span>
                      <span className="block text-right tabular-nums text-texto-3">0/{Number(cupo) || "—"}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {nombreSede && <p className="mt-2 text-xs text-texto-3">{p.Sede} {nombreSede}</p>}
          </section>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </PanelLateral>
  );
}
