import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PanelLateral from "../../components/PanelLateral";
import { Boton, Campo, ErrorMsg, Input, Select } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import { franjasDe, inicioDelMes, mesDe, nombreMes, proximoInicio, sumarMeses } from "../../lib/academia/calendario";
import { diasTexto, horasEntre, SEMANA } from "../../lib/academia/formato";
import { fmtMoney } from "../../lib/format";
import type { Docente, GrupoDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import { NuevoDocenteRapido } from "./NuevoDocenteRapido";
import { BotonFila, ResumenPanel, SeccionPanel } from "./piezas";

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
  /** El curso ya elegido: lo manda «Abrir el primer grupo» al crear un curso nuevo (C2). */
  carreraId?: number;
}

const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const LETRA = ["D", "L", "M", "X", "J", "V", "S"];
/** De lunes a sábado: los domingos no se dicta (y si hace falta, "Otro horario" no lo cambia). */
const DIAS_CLASE = SEMANA.filter((d) => d !== 0);
const OTRO = "otro";
/** El valor de la opción «+ Nuevo docente…» del desplegable: no es un id. */
const NUEVO_DOCENTE = "nuevo-docente";

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
  // Cargar un grupo que ya venía en clases (al empezar a usar el sistema) es
  // cosa de quien configura el instituto (contrato #31); el backend lo vuelve
  // a mirar y dice `puedeConfirmar`.
  const configura = tienePermiso(usuario, "academia.configurar");
  const sedes = useSucursales();
  const carreras = useApi(() => apiAcademia.carreras(), []);
  const ajustes = useApi(() => apiAcademia.ajustes(), []);
  // Sin tragar el error: QA vio una vez la lista vacía (ronda 2, B-07) y con
  // el `.catch(() => [])` no había forma de saber si faltaban o no cargaron.
  const docentes = useApi(() => apiAcademia.docentes(), []);

  const [carreraId, setCarreraId] = useState<number | null>(hueco.carreraId ?? null);
  // La recepción arma grupos en su sede; la dirección elige.
  const [almacenId, setAlmacenId] = useState<number | null>(hueco.sede ?? usuario?.sucursalId ?? null);
  const [franja, setFranja] = useState<string>(
    hueco.inicio && hueco.fin ? (hueco.esFranja === false ? OTRO : `${hueco.inicio}-${hueco.fin}`) : "",
  );
  const [horaInicio, setHoraInicio] = useState(hueco.inicio ?? "19:00");
  const [horaFin, setHoraFin] = useState(hueco.fin ?? "21:00");
  const [dias, setDias] = useState<number[]>([1, 3, 5]);
  const [mesInicio, setMesInicio] = useState<string | null>(hueco.mes ?? null);
  // Un inicio pasado sólo cuenta si se eligió a mano: el hueco de un mes que
  // ya pasó sigue proponiendo el próximo (B-03).
  const [pasadoAMano, setPasadoAMano] = useState(false);
  const [fechaPasada, setFechaPasada] = useState<{ minimo: string | null; puedeConfirmar: boolean } | null>(null);
  const [cupo, setCupo] = useState("");
  const [aula, setAula] = useState("");
  const [docentePor, setDocentePor] = useState<Record<number, number | null>>({});
  // C9: los docentes dados de alta desde acá (la lista del backend ya estaba cargada)
  // y el módulo para el que se está abriendo el formulario de alta.
  const [docentesNuevos, setDocentesNuevos] = useState<Docente[]>([]);
  const [altaDocentePara, setAltaDocentePara] = useState<number | null>(null);
  const [avisoDocente, setAvisoDocente] = useState("");
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
  // Quien configura ve también los doce inicios anteriores, aparte, para
  // cargar un grupo que ya arrancó (QA ronda 2, N-5). Los demás, sólo futuros.
  const anteriores = configura ? Array.from({ length: 12 }, (_, i) => sumarMeses(primero, -(i + 1))) : [];
  const mesValido = mesInicio && (mesInicio >= primero || (configura && pasadoAMano)) ? mesInicio : null;
  if (mesValido && mesValido >= primero && !inicios.includes(mesValido)) inicios.push(mesValido);
  if (mesValido && mesValido < primero && !anteriores.includes(mesValido)) anteriores.push(mesValido);
  const mes = mesValido ?? primero;
  const pasado = mes < primero;
  const yaPaso = !!hueco.mes && hueco.mes < primero && !pasado;

  const nombreSede = sedes.sucursales.find((s) => s.id === almacenId)?.nombre ?? usuario?.sucursal ?? "";
  const pctDocente = carrera?.pctDocente ?? a?.pctDocenteDefecto ?? null;
  // A5: con monto fijo el docente no cobra un % (QA 23-oct).
  const montoDocente = carrera?.pagoDocenteModo === "MONTO" ? (carrera.montoDocente ?? null) : null;
  const horasSemana = horasEntre(horaInicio, horaFin) * dias.length;

  function elegirFranja(v: string) {
    setFranja(v);
    if (v === OTRO) return;
    const [i, f] = v.split("-");
    setHoraInicio(i);
    setHoraFin(f);
  }

  function elegirInicio(m: string) {
    setMesInicio(m);
    setPasadoAMano(m < primero);
    setFechaPasada(null);
  }

  async function crear(confirmarInicioPasado = false) {
    if (!carrera) return setError(`Elegí el ${p.carrera}.`);
    if (almacenId == null) return setError(`Elegí la ${p.sede}.`);
    if (!configura && inicioDelMes(mes, dia) < proximoInicio(dia)) return setError("Esa fecha de inicio ya pasó: elegí otra.");
    if (!dias.length) return setError("Elegí al menos un día.");
    if (horasEntre(horaInicio, horaFin) <= 0) return setError("La hora de fin tiene que ser después de la de inicio.");
    setError("");
    setFechaPasada(null);
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
        ...(confirmarInicioPasado ? { confirmarInicioPasado: true } : {}),
      });
      onCreado(g);
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.FECHA_PASADA) {
        const minimo = typeof e.detalle.minimo === "string" ? e.detalle.minimo : null;
        setFechaPasada({ minimo, puedeConfirmar: e.detalle.puedeConfirmar === true });
        return;
      }
      setError(e instanceof Error ? e.message : "No se pudo abrir el grupo");
    } finally {
      setGuardando(false);
    }
  }

  const alternarDia = (d: number) => setDias((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]));
  const opcionesSede = hueco.sedesPosibles?.length
    ? sedes.sucursales.filter((s) => hueco.sedesPosibles!.includes(s.id))
    : sedes.sucursales;
  const delBackend = docentes.datos ?? [];
  const libres = [...delBackend, ...docentesNuevos.filter((n) => !delBackend.some((d) => d.personalId === n.personalId))].filter(
    (d) => almacenId == null || !d.sedes.length || d.sedes.some((s) => s.id === almacenId),
  );
  // Dar de alta pide lo mismo que Personal (`personal.gestionar`) y la sede del grupo ya elegida.
  const puedeAltaDocente = tienePermiso(usuario, "personal.gestionar") && almacenId != null;
  /** «El mismo docente en todos»: el elegido en un módulo pasa a los demás. */
  const mismoEnTodos = (docenteId: number) =>
    setDocentePor(Object.fromEntries(materias.map((m) => [m.id, docenteId])) as Record<number, number | null>);
  const elegirDocente = (materiaId: number, valor: string) => {
    if (valor === NUEVO_DOCENTE) return setAltaDocentePara(materiaId);
    setDocentePor({ ...docentePor, [materiaId]: valor ? Number(valor) : null });
  };

  return (
    <PanelLateral
      abierto
      titulo="Abrir grupo"
      subtitulo={hueco.inicio && hueco.mes ? `Hueco libre de ${hueco.inicio}–${hueco.fin} desde ${nombreMes(mes)}` : `Los ${p.materias} empiezan el ${dia} de cada mes`}
      onClose={onCerrar}
      acciones={
        <>
          <Boton onClick={() => void crear()} disabled={guardando || !dias.length || !!fechaPasada?.puedeConfirmar}>
            {guardando ? "Abriendo…" : "Abrir grupo"}
          </Boton>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
        </>
      }
    >
      <SeccionPanel titulo="Grupo">
        <div className="space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Cupo" hint={carrera?.cupoDefecto != null ? `Viene del ${p.carrera}` : undefined}>
              <Input type="number" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
            </Campo>
            <Campo label="Aula">
              <Input value={aula} onChange={(e) => setAula(e.target.value)} placeholder="Aula 1" />
            </Campo>
          </div>
        </div>
      </SeccionPanel>

      <SeccionPanel titulo="Horario">
        <div className="space-y-4">
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
            <div role="group" aria-labelledby="et-dias" className="flex flex-wrap gap-1.5">
              {DIAS_CLASE.map((d) => {
                const on = dias.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={NOMBRE_DIA[d]}
                    onClick={() => alternarDia(d)}
                    className={`h-11 w-11 rounded-xl border text-sm font-semibold transition-colors sm:h-10 sm:w-10 ${
                      on ? "border-primary bg-primary-boton text-white" : "border-borde bg-white text-texto-3 hover:border-primary-200 hover:bg-muted"
                    }`}
                  >
                    {LETRA[d]}
                  </button>
                );
              })}
            </div>
            <p className={`mt-1.5 text-xs ${dias.length ? "text-texto-3" : "text-warning-text"}`}>
              {dias.length ? `${diasTexto(dias)} · ${horasSemana.toLocaleString("es-BO")} h por semana` : "Elegí al menos un día"}
            </p>
          </div>

          <div>
            <Campo label="Empieza el">
              <Select value={mes} onChange={(e) => elegirInicio(e.target.value)}>
                {inicios.map((m) => (
                  <option key={m} value={m}>
                    {dia} de {nombreMes(m)} de {m.slice(0, 4)}
                  </option>
                ))}
                {anteriores.length > 0 && (
                  <optgroup label="Ya empezó (un grupo que venía en clases)">
                    {anteriores.map((m) => (
                      <option key={m} value={m}>
                        {dia} de {nombreMes(m)} de {m.slice(0, 4)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Campo>
            {pasado && !fechaPasada && (
              <p className="mt-1 text-xs text-warning-text">
                Esa fecha ya pasó: elegila sólo para cargar un grupo que ya estaba en clases.
              </p>
            )}
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
        </div>
      </SeccionPanel>

      {materias.length > 0 && (
        <SeccionPanel
          titulo={`${p.Docente} por ${p.materia}`}
          acciones={
            montoDocente != null ? (
              <span className="text-xs text-texto-3">Cobra {fmtMoney(montoDocente)} fijo por {p.materia}</span>
            ) : (
              pctDocente != null && <span className="text-xs text-texto-3">Cobra el {pctDocente} %</span>
            )
          }
        >
          <ul className="space-y-2">
            {materias.map((m, i) => (
              <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-xs font-bold text-primary-700">
                    M{i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-texto">{m.nombre}</span>
                    <span className="block text-xs text-texto-3">
                      Empieza el {dia} · {nombreMes(sumarMeses(mes, i * duracion))}
                    </span>
                  </span>
                </span>
                <label>
                  <span className="sr-only">
                    {p.Docente} de M{i + 1}
                  </span>
                  <Select value={docentePor[m.id] ?? ""} onChange={(e) => elegirDocente(m.id, e.target.value)}>
                    <option value="">{docentes.cargando && !docentes.datos ? "Cargando…" : "Elegir después"}</option>
                    {libres.map((d) => (
                      <option key={d.personalId} value={d.personalId}>
                        {d.nombre}
                      </option>
                    ))}
                    {puedeAltaDocente && <option value={NUEVO_DOCENTE}>+ Nuevo {p.docente}…</option>}
                  </Select>
                </label>
                {/* C9: el docente elegido en un módulo, en todos los demás. */}
                {docentePor[m.id] != null && materias.some((x) => (docentePor[x.id] ?? null) !== docentePor[m.id]) && (
                  <div className="col-span-2 flex justify-end">
                    <BotonFila variante="ghost" onClick={() => mismoEnTodos(docentePor[m.id]!)}>
                      El mismo {p.docente} en todos
                    </BotonFila>
                  </div>
                )}
                {altaDocentePara === m.id && almacenId != null && (
                  <div className="col-span-2">
                    <NuevoDocenteRapido
                      modulo={`M${i + 1} ${m.nombre}`}
                      sede={{ id: almacenId, nombre: nombreSede }}
                      onCerrar={() => setAltaDocentePara(null)}
                      onCreado={(nuevo, aviso) => {
                        setDocentesNuevos((xs) => [...xs, nuevo]);
                        setDocentePor((por) => ({ ...por, [m.id]: nuevo.personalId }));
                        setAvisoDocente(aviso ?? "");
                        setAltaDocentePara(null);
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {avisoDocente && (
            <p role="status" className="mt-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
              {avisoDocente}
            </p>
          )}
          {/* Instituto vacío: antes sólo se podía «Elegir después», sin forma de crear uno. */}
          {puedeAltaDocente && libres.length === 0 && !docentes.cargando && altaDocentePara == null && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-texto-3">
              <span>Todavía no hay {p.docente}s en esta {p.sede}.</span>
              <BotonFila variante="soft" icono="plus" onClick={() => setAltaDocentePara(materias[0].id)}>
                Nuevo {p.docente}
              </BotonFila>
            </div>
          )}
          {docentes.error && (
            <p className="mt-2 text-xs text-danger-text">
              No se pudo traer la lista de {p.docente}s.{" "}
              <button type="button" onClick={docentes.recargar} className="font-semibold underline">
                Reintentar
              </button>
            </p>
          )}
        </SeccionPanel>
      )}

      {carrera && materias.length > 0 && (
        <SeccionPanel titulo="Así queda en el calendario">
          <ResumenPanel className="px-3 py-3">
            <section aria-label="Así queda en el calendario" className="flex gap-2 overflow-x-auto">
              <span className="w-10 shrink-0 pt-5 text-xs font-semibold tabular-nums text-texto-2">
                {horaInicio}
                <br />
                <span className="font-normal text-texto-3">{horaFin}</span>
              </span>
              {materias.map((m, i) => {
                const ultimo = i === materias.length - 1;
                const docente = libres.find((d) => d.personalId === docentePor[m.id])?.nombre;
                return (
                  <div key={m.id} className="w-40 shrink-0">
                    <span className="block text-xs font-semibold capitalize text-texto-3">{nombreMes(sumarMeses(mes, i * duracion))}</span>
                    <span
                      className={`mt-1 block rounded-lg border border-borde bg-white p-2 text-xs shadow-[0_1px_2px_rgba(15,23,42,0.05)] border-l-[3px] ${
                        ultimo ? "border-l-primary-200" : "border-l-primary"
                      }`}
                    >
                      <span className="flex justify-between gap-1">
                        <b className="truncate text-texto">{carrera.nombre}</b>
                        <span className="shrink-0 text-texto-3">{diasTexto(dias)}</span>
                      </span>
                      <span className="mt-1 flex min-w-0">
                        <span className="truncate rounded-md bg-primary-50 px-1.5 py-0.5 font-semibold text-primary-700">
                          M{i + 1} de {materias.length} · {m.nombre}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-texto-3">{docente ?? `${p.Docente} por elegir`}</span>
                      <span className="block text-right font-semibold tabular-nums text-texto-2">0/{Number(cupo) || "—"}</span>
                    </span>
                  </div>
                );
              })}
            </section>
            {nombreSede && <p className="mt-2 text-xs text-texto-3">{p.Sede} {nombreSede}</p>}
          </ResumenPanel>
        </SeccionPanel>
      )}

      {(fechaPasada || error) && (
        <div className="space-y-3 pt-1">
          {fechaPasada && (
            <AvisoFechaPasada
              fecha={inicioDelMes(mes, dia)}
              {...fechaPasada}
              guardando={guardando}
              onConfirmar={() => void crear(true)}
              onOtraFecha={() => setFechaPasada(null)}
            />
          )}
          <ErrorMsg>{error}</ErrorMsg>
        </div>
      )}
    </PanelLateral>
  );
}

/**
 * El 400 FECHA_PASADA (contrato #31): el inicio es anterior al del módulo en
 * curso. Quien configura el instituto puede decir que es un grupo que ya
 * venía en clases y se reenvía con `confirmarInicioPasado`; los demás sólo
 * ven desde cuándo se puede.
 */
function AvisoFechaPasada({
  fecha,
  minimo,
  puedeConfirmar,
  guardando,
  onConfirmar,
  onOtraFecha,
}: {
  fecha: string;
  minimo: string | null;
  puedeConfirmar: boolean;
  guardando: boolean;
  onConfirmar: () => void;
  onOtraFecha: () => void;
}) {
  // "10 de agosto" (o "10 de diciembre 2025" si es de otro año).
  const larga = (iso: string) => `${Number(iso.slice(8, 10))} de ${nombreMes(iso.slice(0, 7), mesDe(new Date()))}`;
  const desde = minimo ? ` El primer inicio posible es el ${larga(minimo)}.` : "";
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-warning/40 bg-warning-bg px-3.5 py-3 text-sm text-warning-text">
      {puedeConfirmar ? (
        <>
          <p>
            <b>El {larga(fecha)} ya pasó.</b>
            {desde} ¿Es un grupo que ya estaba en clases? Se carga con esa fecha para seguirlo desde acá.
          </p>
          <div className="flex flex-wrap gap-2">
            <Boton onClick={onConfirmar} disabled={guardando}>
              {guardando ? "Abriendo…" : "El grupo ya venía andando"}
            </Boton>
            <Boton variante="ghost" onClick={onOtraFecha} disabled={guardando}>
              Elegir otra fecha
            </Boton>
          </div>
        </>
      ) : (
        <p>
          <b>El {larga(fecha)} ya pasó.</b>
          {desde} Elegí otra fecha: un grupo que ya estaba en clases lo carga quien configura el instituto.
        </p>
      )}
    </div>
  );
}
