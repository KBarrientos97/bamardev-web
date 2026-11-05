import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PanelLateral from "../../components/PanelLateral";
import { Boton, Campo, ErrorMsg, Input, Select } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { diaAnterior, esDeFinDeSemana, franjasDe, hoyIso, inicioDelMes, nombreMes, proximoInicio, sumarMeses, sumarMesesFecha } from "../../lib/academia/calendario";
import { useChoques } from "../../lib/academia/choques";
import { diasTexto, horasEntre, SEMANA } from "../../lib/academia/formato";
import { fmtMoney } from "../../lib/format";
import type { ConsultaChoques, Docente, Franja, GrupoDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import { AvisoChoques } from "./AvisoChoques";
import { NuevoDocenteRapido } from "./NuevoDocenteRapido";
import { BotonFila, ResumenPanel, SeccionPanel } from "./piezas";
import SelectorAula, { type ValorAula } from "./SelectorAula";

/** Lo que el calendario ya sabe del hueco que se tocó. */
export interface HuecoCalendario {
  inicio?: string;
  fin?: string;
  /** `AAAA-MM`: el mes en que arranca el primer módulo. */
  mes?: string;
  sede?: number | null;
  /** `false`: la fila del hueco no es una franja (un horario suelto): se abre con "Otro horario". */
  esFranja?: boolean;
  /** El hueco es del bloque de sábado y domingo: el grupo arranca con el sábado. */
  finDeSemana?: boolean;
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
/**
 * De lunes a domingo: el sábado y el domingo son los días de los intensivos
 * (observación de Derick, 04-nov), con sus propias franjas.
 */
const DIAS_CLASE = SEMANA;
const OTRO = "otro";
/** El valor de la opción «+ Nuevo docente…» del desplegable: no es un id. */
const NUEVO_DOCENTE = "nuevo-docente";

/**
 * N3 · Abrir grupo (ronda 2): el panel lateral que se abre desde el
 * calendario, con la franja y el mes del hueco ya puestos. El inicio es
 * cualquier fecha de hoy en adelante (Derick, 04-nov): el día de Ajustes es
 * sólo el que se propone. El backend arma las fechas de cada módulo por meses
 * desde ese día.
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
  const [dias, setDias] = useState<number[]>(hueco.finDeSemana ? [6] : [1, 3, 5]);
  // null = la que se propone (sale de los ajustes, que llegan después).
  const [fechaElegida, setFechaElegida] = useState<string | null>(null);
  const [cupo, setCupo] = useState("");
  // El aula se elige de la lista de la sede (BACK-5); null = sin aula.
  const [aulaId, setAulaId] = useState<ValorAula>(null);
  // Su nombre, para decir «el aula X ya está ocupada» (lo informa el selector, que tiene la lista).
  const [nombreAula, setNombreAula] = useState<string | null>(null);
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

  // Al elegir el curso, su cupo por defecto (si nadie lo tocó). Al cambiar de curso,
  // el que sigue valiendo es el del curso nuevo mientras el actual sea el que
  // trajo el anterior: «Viene del curso» no puede mentir (ronda 1, W10).
  const cupoDelCurso = useRef<string | null>(null);
  useEffect(() => {
    const nuevoCupo = carrera?.cupoDefecto != null ? String(carrera.cupoDefecto) : null;
    // Se lee antes: el actualizador corre después, cuando la ref ya cambió.
    const anterior = cupoDelCurso.current;
    setCupo((c) => (c === "" || c === anterior ? (nuevoCupo ?? "") : c));
    cupoDelCurso.current = nuevoCupo;
  }, [carrera]);

  // Las franjas de la sede, o si no tiene propias, las de todas. Sólo las del
  // lado de la semana de los días elegidos: con sábado y domingo, las de los
  // intensivos (04-nov); con algún día de semana, las de siempre.
  const finDeSemana = esDeFinDeSemana(dias);
  const franjas = useMemo(() => {
    const lado = (fs: Franja[]) => fs.filter((f) => !!f.finDeSemana === finDeSemana);
    const propias = lado(franjasDe(a?.franjas, almacenId));
    return propias.length ? propias : lado(franjasDe(a?.franjas, null));
  }, [a?.franjas, almacenId, finDeSemana]);
  // Sin franja elegida, o con una que la sede no tiene (se cambió de sede, o el
  // hueco era de otra): la primera de la sede. Las que valen para todas las
  // sedes sirven en cualquiera.
  const deTodas = useMemo(() => franjasDe(a?.franjas, null).filter((f) => !!f.finDeSemana === finDeSemana), [a?.franjas, finDeSemana]);
  useEffect(() => {
    // Ni la sede ni "todas" tienen franjas: el selector sólo tendría «Otro
    // horario», que el navegador muestra elegido sin estarlo y no deja ver
    // Desde/Hasta. Se pasa a «Otro horario» de verdad (ronda 2, R1).
    if (a && !franjas.length && !franja) {
      setFranja(OTRO);
      return;
    }
    if (!franjas.length || franja === OTRO) return;
    const vale = (f: { inicio: string; fin: string }) => `${f.inicio}-${f.fin}` === franja;
    const ajena = !!franja && almacenId != null && !franjas.some(vale) && !deTodas.some(vale);
    if (!franja || ajena) {
      setFranja(`${franjas[0].inicio}-${franjas[0].fin}`);
      setHoraInicio(franjas[0].inicio);
      setHoraFin(franjas[0].fin);
    }
  }, [a, franja, franjas, deTodas, almacenId]);

  // Se propone el día de Ajustes: el próximo, o el del mes del hueco si no
  // pasó. El 19-oct, el hueco de octubre propone el 10 de noviembre y no el
  // 10 de octubre (QA ronda 2, B-03).
  const hoy = hoyIso();
  const proximo = proximoInicio(dia);
  const delHueco = hueco.mes ? inicioDelMes(hueco.mes, dia) : null;
  const sugerida = delHueco && delHueco >= proximo ? delHueco : proximo;
  const fecha = fechaElegida ?? sugerida;
  const mes = fecha.slice(0, 7);
  const yaPaso = !!delHueco && delHueco < proximo && fechaElegida == null;
  // Nadie abre un grupo para dentro de año y medio: el tope ataja un año mal
  // tipeado (2062) antes de que el backend arme módulos en otra década.
  const maximo = sumarMesesFecha(hoy, 18);

  const nombreSede = sedes.sucursales.find((s) => s.id === almacenId)?.nombre ?? usuario?.sucursal ?? "";
  const pctDocente = carrera?.pctDocente ?? a?.pctDocenteDefecto ?? null;
  // A5: con monto fijo el docente no cobra un % (QA 23-oct).
  const montoDocente = carrera?.pagoDocenteModo === "MONTO" ? (carrera.montoDocente ?? null) : null;
  const horasSemana = horasEntre(horaInicio, horaFin) * dias.length;

  // C10: el aviso se pide sólo si ya hay algo que chocar (aula o docente) y el horario es válido.
  const docentesElegidos = [...new Set(Object.values(docentePor).filter((x): x is number => x != null))];
  const consulta: ConsultaChoques | null =
    almacenId != null && dias.length > 0 && horasEntre(horaInicio, horaFin) > 0 && (typeof aulaId === "number" || docentesElegidos.length > 0)
      ? {
          almacenId,
          dias: [...dias].sort((x, y) => x - y),
          horaInicio,
          horaFin,
          fechaInicio: fecha,
          // El último módulo termina el día antes de que empiece el siguiente.
          ...(materias.length ? { fechaFin: diaAnterior(sumarMesesFecha(fecha, materias.length * duracion)) } : {}),
          ...(typeof aulaId === "number" ? { aulaId } : {}),
          ...(docentesElegidos.length ? { docentes: docentesElegidos } : {}),
        }
      : null;
  const avisoChoques = useChoques(consulta);

  function elegirFranja(v: string) {
    setFranja(v);
    if (v === OTRO) return;
    const [i, f] = v.split("-");
    setHoraInicio(i);
    setHoraFin(f);
  }

  // Las aulas son de cada sede: al cambiarla, la elegida ya no vale.
  // Los docentes también: el de otra sede ya no está en la lista (`libres`) y
  // quedaba elegido sin verse, y se mandaba igual (ronda 1, W3).
  function cambiarSede(id: number | null) {
    setAlmacenId(id);
    setAulaId(null);
    const conocidos = [...(docentes.datos ?? []), ...docentesNuevos];
    setDocentePor((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([materiaId, personalId]) => {
          const d = conocidos.find((x) => x.personalId === personalId);
          const ajeno = !!d && id != null && d.sedes.length > 0 && !d.sedes.some((x) => x.id === id);
          return [materiaId, ajeno ? null : personalId];
        }),
      ),
    );
  }

  async function crear() {
    if (!carrera) return setError(`Elegí el ${p.carrera}.`);
    if (almacenId == null) return setError(`Elegí la ${p.sede}.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError("Elegí la fecha de inicio.");
    if (fecha < hoy) return setError("La fecha de inicio tiene que ser de hoy en adelante.");
    if (fecha > maximo) return setError("La fecha de inicio está muy lejos: revisá el año.");
    if (!dias.length) return setError("Elegí al menos un día.");
    if (horasEntre(horaInicio, horaFin) <= 0) return setError("La hora de fin tiene que ser después de la de inicio.");
    setError("");
    setGuardando(true);
    try {
      const g = await apiAcademia.crearGrupo({
        carreraId: carrera.id,
        almacenId,
        // «Sin aula» se manda a propósito (null): si se omite, el backend da
        // la única aula de la sede (Lista 2 #6).
        aulaId: typeof aulaId === "number" ? aulaId : null,
        dias,
        horaInicio,
        horaFin,
        fechaInicio: fecha,
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
      // Un toque fuera borraría el formulario entero (docentes por módulo, cupo, aula).
      cerrarAlClicAfuera={false}
      subtitulo={hueco.inicio && hueco.mes ? `Hueco libre de ${hueco.inicio}–${hueco.fin} desde ${nombreMes(mes)}` : `Cada ${p.materia} dura ${duracion === 1 ? "un mes" : `${duracion} meses`}`}
      onClose={onCerrar}
      acciones={
        <>
          <AvisoChoques estado={avisoChoques} aula={nombreAula} />
          <Boton onClick={() => void crear()} disabled={guardando || !dias.length}>
            {guardando ? "Abriendo…" : avisoChoques.choques ? "Guardar igual" : "Abrir grupo"}
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
                <Select value={almacenId ?? ""} onChange={(e) => cambiarSede(e.target.value ? Number(e.target.value) : null)}>
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
            <Campo label="Cupo" hint={carrera?.cupoDefecto != null && cupo === String(carrera.cupoDefecto) ? `Viene del ${p.carrera}` : undefined}>
              <Input type="number" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
            </Campo>
            <SelectorAula sedeId={almacenId} valor={aulaId} onChange={setAulaId} onNombre={setNombreAula} />
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
              <Input type="date" className="sm:max-w-[200px]" value={fecha} min={hoy} max={maximo} onChange={(e) => setFechaElegida(e.target.value)} />
            </Campo>
            {yaPaso && (
              <p className="mt-1 text-xs text-texto-3">
                El {dia} de {nombreMes(hueco.mes!)} ya pasó: se propone el {dia} de {nombreMes(proximo.slice(0, 7))}.
              </p>
            )}
            <p className="mt-1 text-xs text-texto-4">
              Cualquier día de hoy en adelante: cada {p.materia} empieza ese mismo día del mes. El {dia}, que se propone, se cambia en{" "}
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

      {error && (
        <div className="pt-1">
          <ErrorMsg>{error}</ErrorMsg>
        </div>
      )}
    </PanelLateral>
  );
}
