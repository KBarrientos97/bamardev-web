import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import ModalSalida from "../../../components/ModalSalida";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { fechaCorta, nombreDe } from "../../../lib/academia/formato";
import type { EstadoAsistencia, ListaDeClase, SemaforoPago } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { mensajeDelBackend } from "../../../lib/academia/errores";
import { ApiError } from "../../../lib/api";
import { textoSemaforo } from "../../../lib/academia/vista";
import { capitalizar, diaCorto } from "../../../lib/agenda/horaAgenda";
import { fmtHora, isoDia } from "../../../lib/format";
import { soloLoSuyo } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useSalidaConCambios } from "../../../lib/useSalidaConCambios";
import { useAuth } from "../../../store/AuthContext";
import {
  BotonFila,
  Chip,
  claseBotonFila,
  EncabezadoPagina,
  ErrorDeCarga,
  FiltrosConteo,
  PaginaAcademia,
  PagoDelModulo,
  Tarjeta,
} from "../piezas";
import NavDocente from "./NavDocente";
import { useHayNavDocente } from "./useNavDocente";

type Filtro = "todos" | "debe";

/**
 * B8 (UX 6): los cuatro estados que el backend ya acepta, también en el
 * celular. Van en una fila de cuatro botones iguales debajo del nombre, cada
 * uno de alto de pulgar, sin menú que abrir; el elegido, con su color.
 */
const ESTADOS: readonly (readonly [EstadoAsistencia, string, string])[] = [
  ["PRESENTE", "Presente", "bg-primary-boton text-white"],
  ["TARDE", "Tarde", "bg-warning-bg text-warning-text"],
  ["AUSENTE", "Ausente", "bg-danger-bg text-danger-text"],
  ["JUSTIFICADO", "Justificado", "bg-info-bg text-info-text"],
];

/**
 * N6 · Pasar lista (ronda 2, F1b): en el celular, en la clase. Cada
 * estudiante con su estado de pago del módulo (el docente nunca ve montos ni
 * teléfonos, D6; desde B7, el semáforo) y Presente / Tarde / Ausente /
 * Justificado (B8); arranca con todos presentes, que es lo común, y se guarda
 * todo junto. Se corrige hasta el final del día (después
 * sólo la administración: 403 LISTA_CERRADA).
 *
 * Salir con algo marcado y sin guardar pregunta, como en las Notas (revisión
 * del 08-nov: antes se perdía sin avisar): volver, "Notas del módulo", la
 * barra del docente y el navegador. Lo que arranca presente sin que nadie lo
 * toque no cuenta como cambio.
 *
 * El docente entra desde Mis clases (`/academia/lista?grupo=`); la
 * administración y la recepción, desde el grupo (`/academia/grupos/:id/lista`).
 * Sin grupo, se elige entre las clases de hoy.
 */
export default function PasarLista() {
  const p = usePalabras();
  const { usuario } = useAuth();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const grupoId = Number(id ?? params.get("grupo")) || null;
  const fecha = params.get("fecha") ?? undefined;
  const docente = soloLoSuyo(usuario, "asistencia.registrar");

  // Sin grupo en la dirección: las clases de hoy para elegir (y si es una, esa).
  const hoy = useApi(() => (grupoId ? Promise.resolve(null) : apiAcademia.misClases()), [grupoId]);
  useEffect(() => {
    const clases = hoy.datos?.clases ?? [];
    if (!grupoId && clases.length === 1) setParams({ grupo: String(clases[0].grupoId) }, { replace: true });
  }, [hoy.datos, grupoId, setParams]);

  if (!grupoId) {
    const clases = hoy.datos?.clases ?? [];
    return (
      <PaginaAcademia ancho="max-w-xl" conBarraAbajo={docente}>
        <EncabezadoPagina titulo="Pasar lista" />
        <Tarjeta etiqueta="Clases de hoy">
          {hoy.error ? (
            <ErrorMsg onReintentar={hoy.recargar}>{hoy.error}</ErrorMsg>
          ) : !hoy.datos ? (
            <Cargando />
          ) : clases.length === 0 ? (
            <Vacio icono="calendar" titulo="Hoy no tenés clases" texto="La lista se pasa el día de la clase." />
          ) : (
            <Select aria-label="Clase" value="" onChange={(e) => setParams({ grupo: e.target.value })}>
              <option value="">Elegí la clase…</option>
              {clases.map((c) => (
                <option key={c.sesionId} value={c.grupoId}>
                  {c.horaInicio} · {nombreDe(c.carrera)} · {c.nombre}
                </option>
              ))}
            </Select>
          )}
        </Tarjeta>
        {docente && <NavDocente />}
      </PaginaAcademia>
    );
  }
  return <Lista key={`${grupoId}-${fecha ?? ""}`} grupoId={grupoId} fecha={fecha} docente={docente} palabras={p} />;
}

function Lista({
  grupoId,
  fecha,
  docente,
  palabras: p,
}: {
  grupoId: number;
  fecha?: string;
  docente: boolean;
  palabras: ReturnType<typeof usePalabras>;
}) {
  // La barra de "Guardar lista" se apoya en la del docente sólo si esa se dibuja (R13).
  const conNav = useHayNavDocente();
  // Sin clase ese día (404 SIN_CLASE) no es un error: es "hoy no toca". Otro
  // 404 es un grupo que no existe o, para el docente, que no es suyo
  // (GRUPO_NO_EXISTE): eso no es "ese día no hay clase" (QA ronda 2, N-3).
  const lista = useApi(
    () =>
      apiAcademia.lista(grupoId, fecha).catch((e: unknown) => {
        if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.SIN_CLASE) return null;
        throw e;
      }),
    [grupoId, fecha],
  );
  const grupo = useApi(() => apiAcademia.grupo(grupoId).catch(() => null), [grupoId]);
  const [estados, setEstados] = useState<Record<number, EstadoAsistencia>>({});
  /** Lo que está guardado (o arrancó así): contra esto se ve si hay cambios. */
  const [guardados, setGuardados] = useState<Record<number, EstadoAsistencia>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [guardando, setGuardando] = useState(false);
  const [guardadaEn, setGuardadaEn] = useState<string | null>(null);
  const [error, setError] = useState("");

  const d = lista.datos;
  // Lo guardado manda; lo que nunca se marcó arranca presente.
  useEffect(() => {
    if (!d) return;
    const inicial = Object.fromEntries(d.alumnos.map((a) => [a.inscripcionId, a.estado ?? "PRESENTE"])) as Record<number, EstadoAsistencia>;
    setEstados(inicial);
    setGuardados(inicial);
  }, [d]);

  const cambiados = d?.editable ? d.alumnos.filter((a) => (estados[a.inscripcionId] ?? "PRESENTE") !== (guardados[a.inscripcionId] ?? "PRESENTE")).length : 0;
  const salida = useSalidaConCambios(cambiados > 0);

  // Las pastillas de arriba, cada estado por separado («12 presentes · 1
  // tarde · 1 ausente»): así el docente ve de un vistazo a quién tocó.
  const conteo = useMemo(() => {
    const vals = Object.values(estados);
    const de = (e: EstadoAsistencia) => vals.filter((x) => x === e).length;
    return { soloPresentes: de("PRESENTE"), tarde: de("TARDE"), soloAusentes: de("AUSENTE"), justificados: de("JUSTIFICADO") };
  }, [estados]);

  const volver = docente ? "/academia/mis-clases" : `/academia/grupos/${grupoId}`;
  const sinClase = !lista.cargando && !lista.error && d === null;

  /** Guarda la lista entera; true = quedó guardada. */
  async function guardar(datos: ListaDeClase): Promise<boolean> {
    setGuardando(true);
    setError("");
    try {
      await apiAcademia.guardarLista(
        grupoId,
        datos.sesion.fecha,
        datos.alumnos.map((a) => ({ inscripcionId: a.inscripcionId, estado: estados[a.inscripcionId] ?? "PRESENTE" })),
      );
      setGuardadaEn(new Date().toISOString());
      setGuardados(estados);
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.LISTA_CERRADA
          ? "La lista de ese día ya cerró: para corregirla, pedíselo a la administración."
          : e instanceof ApiError && e.codigo === "LISTA_FUTURA"
            ? "Todavía no es el día de esa clase."
            : // CLASE_DE_OTRO_DOCENTE (403) y el resto: el mensaje del backend, tal cual.
              mensajeDelBackend(e, "No se pudo guardar la lista"),
      );
      return false;
    } finally {
      setGuardando(false);
    }
  }

  const g = grupo.datos;
  const curso = g ? nombreDe(g.carrera) : d?.grupo ? nombreDe(d.grupo.carrera) : "";
  // B7: el docente ve sólo el semáforo (rojo o amarillo); "debe la cuota" son
  // los que tienen alguno. El backend ya no le manda `estadoPago` (QA 23-oct).
  // La administración y la recepción, como siempre.
  const conSemaforo = docente;
  const debe = (a: ListaDeClase["alumnos"][number]) =>
    conSemaforo ? a.semaforo != null : !!a.estadoPago && a.estadoPago !== "PAGADO";
  const alumnos = (d?.alumnos ?? []).filter((a) => filtro === "todos" || debe(a));
  const deben = (d?.alumnos ?? []).filter(debe).length;
  const esHoy = d ? d.sesion.fecha === isoDia(new Date()) : true;

  const notasA = docente ? `/academia/notas?grupo=${grupoId}` : `/academia/grupos/${grupoId}/notas`;
  // «Barbería · M2 Degradados · Vie 16-oct, 09:00»: de qué clase es la lista.
  const deQueClase = d
    ? [curso || null, `M${d.sesion.materia.orden} ${d.sesion.materia.nombre}`, `${capitalizar(diaCorto(d.sesion.fecha).toLowerCase())} ${fechaCorta(d.sesion.fecha)}, ${d.sesion.horaInicio}`]
        .filter(Boolean)
        .join(" · ")
    : null;
  const aula = g?.aula ?? d?.grupo?.aula ?? null;

  return (
    // Con cambios, los enlaces de adentro preguntan (el menú lateral queda afuera, como en Notas).
    <PaginaAcademia ancho="max-w-2xl" className="max-md:!pb-44" onClickCapture={salida.alClicEnEnlace}>
      <div className="card p-4 sm:p-5">
        <EncabezadoPagina
          volver={{ a: volver, texto: docente ? "Mis clases" : "Grupo" }}
          titulo="Pasar lista"
          bajada={
            deQueClase && (
              <>
                <span className="block font-semibold text-texto-2">{deQueClase}</span>
                {aula && <span className="block">{aula}</span>}
              </>
            )
          }
          acciones={
            <BotonFila variante="ghost" icono="edit" a={notasA}>
              Notas del {p.materia}
            </BotonFila>
          }
        />
      </div>

      {lista.error && !d ? (
        <Tarjeta etiqueta="Lista">
          <ErrorDeCarga
            falla={lista.falla}
            mensaje={lista.error}
            onReintentar={lista.recargar}
            que="este grupo"
            volver={{ a: volver, texto: docente ? "Ir a mis clases" : "Volver al grupo" }}
          />
        </Tarjeta>
      ) : sinClase ? (
        <Tarjeta etiqueta="Lista">
          <Vacio
            icono="calendar"
            titulo="Ese día no hay clase de este grupo"
            accion={
              <BotonFila variante="ghost" icono="arrowLeft" a={volver}>
                Volver
              </BotonFila>
            }
          />
        </Tarjeta>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          {/* Cómo va quedando la lista, en vivo; y lo que la recepción mira del pago (sin montos para el docente, D6). */}
          <div aria-label="Totales de la lista" className="flex flex-wrap items-center gap-1.5">
            <Chip tono="verde" className="text-[13px]">
              {conteo.soloPresentes} {conteo.soloPresentes === 1 ? "presente" : "presentes"}
            </Chip>
            <Chip tono="ambar" className="text-[13px]">
              {conteo.tarde} tarde
            </Chip>
            <Chip tono="rojo" className="text-[13px]">
              {conteo.soloAusentes} {conteo.soloAusentes === 1 ? "ausente" : "ausentes"}
            </Chip>
            {conteo.justificados > 0 && (
              <Chip tono="azul" className="text-[13px]">
                {conteo.justificados} {conteo.justificados === 1 ? "justificado" : "justificados"}
              </Chip>
            )}
            {!conSemaforo && d.resumen.pagaron != null && (
              <Chip tono="gris" className="text-[13px]">
                Pagaron el M{d.sesion.materia.orden}: {d.resumen.pagaron} de {d.resumen.total}
              </Chip>
            )}
          </div>
          {d.editable && <p className="text-[13px] text-texto-3">Todos arrancan presentes: tocá sólo a quien faltó o llegó tarde.</p>}

          {deben > 0 && (
            <FiltrosConteo<Filtro>
              etiqueta={`Filtrar ${p.alumnos}`}
              opciones={[
                { clave: "todos", label: "Todos", n: d.alumnos.length },
                { clave: "debe", label: conSemaforo ? "Deben la cuota" : "Sin pagar o abonó", n: deben, urgente: true },
              ]}
              valor={filtro}
              onChange={setFiltro}
            />
          )}

          <ul aria-label={p.Alumnos} className="space-y-2.5">
            {alumnos.map((a) => {
              const estado = estados[a.inscripcionId] ?? "PRESENTE";
              const ausente = estado === "AUSENTE" || estado === "JUSTIFICADO";
              return (
                <li key={a.inscripcionId} className="card space-y-2.5 p-3.5 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className={`min-w-0 text-[15px] font-semibold ${ausente ? "text-texto-3" : "text-texto"}`}>{a.nombre}</span>
                    {conSemaforo ? (
                      a.semaforo && <DebeLaCuota semaforo={a.semaforo} />
                    ) : (
                      <PagoDelModulo estado={a.estadoPago} semaforo={a.semaforo} conSemaforo={false} />
                    )}
                  </div>
                  <div role="group" aria-label={`Asistencia de ${a.nombre}`} className="grid grid-cols-4 gap-1.5">
                    {ESTADOS.map(([e, label, colorOn]) => {
                      const on = estado === e;
                      return (
                        <button
                          key={e}
                          type="button"
                          aria-pressed={on}
                          aria-label={label}
                          disabled={!d.editable}
                          onClick={() => {
                            setEstados({ ...estados, [a.inscripcionId]: e });
                            setGuardadaEn(null);
                          }}
                          className={`min-h-11 rounded-xl border px-1 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                            on ? `border-transparent ${colorOn}` : "border-borde bg-white text-texto-3 hover:bg-muted"
                          }`}
                        >
                          {/* "Justificado" no entra en un cuarto de pantalla del celular. */}
                          {e === "JUSTIFICADO" ? "Justif." : label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          {conSemaforo && deben > 0 && (
            <p className="text-[13px] text-texto-3">Si alguien debe la cuota, recordáselo en clase; recepción le manda el QR.</p>
          )}

          {/* En el celular, fija abajo (encima de la barra del docente); en
              escritorio, pegada al pie de la columna. */}
          <div
            className={`fixed inset-x-0 z-20 space-y-1.5 border-t border-borde-soft bg-white p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:sticky md:inset-x-auto md:rounded-2xl md:border md:border-borde md:p-4 md:shadow-lg ${
              docente && conNav ? "bottom-[57px] md:bottom-4" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:bottom-4 md:pb-4"
            }`}
          >
            <ErrorMsg>{error}</ErrorMsg>
            {d.editable ? (
              <Boton icono="check" className="min-h-12 w-full text-base" disabled={guardando} onClick={() => void guardar(d)}>
                {guardando ? "Guardando…" : "Guardar lista"}
              </Boton>
            ) : (
              <p className="text-center text-[13px] text-texto-3">La lista de ese día ya cerró.</p>
            )}
            {(guardadaEn || (d.guardada && !guardadaEn && d.editable)) && (
              <p role="status" className="text-center text-[13px] text-texto-3">
                {/* Que diga lo de ESA lista (QA 23-oct): de un día pasado no es "hasta el final del día". */}
                {guardadaEn
                  ? esHoy
                    ? `Guardada a las ${fmtHora(guardadaEn)} · podés corregirla hasta el final del día`
                    : `Guardada a las ${fmtHora(guardadaEn)} · lista del ${fechaCorta(d.sesion.fecha)}`
                  : `Ya guardada el ${fechaCorta(d.sesion.fecha)} · podés corregirla`}
              </p>
            )}
            {/* Recién guardada, lo que sigue es volver: no queda nada que perder. */}
            {guardadaEn && cambiados === 0 && (
              <Link to={volver} className={`${claseBotonFila("ghost")} !min-h-11 w-full rounded-xl text-sm`}>
                <Icon name="arrowLeft" size={16} />
                {docente ? "Volver a mis clases" : "Volver al grupo"}
              </Link>
            )}
          </div>
        </>
      )}
      {d && (
        <ModalSalida salida={salida} titulo="La lista no se guardó" seguir="Seguir pasando lista" guardando={guardando} onGuardar={() => guardar(d)}>
          Cambiaste la asistencia de {cambiados === 1 ? `1 ${p.alumno}` : `${cambiados} ${p.alumnos}`} y la lista todavía no se guardó. Si salís sin guardar, se pierde.
        </ModalSalida>
      )}
      {docente && <NavDocente />}
    </PaginaAcademia>
  );
}

/**
 * «debe la cuota», lo único que el docente ve del pago (B7, D6): rojo si
 * pasó la semana de espera, ámbar si está en ella. El detalle va en la
 * etiqueta, para quien lee con lector de pantalla y al pasar el mouse.
 */
function DebeLaCuota({ semaforo }: { semaforo: Exclude<SemaforoPago, null> }) {
  const t = textoSemaforo(semaforo);
  return (
    <span title={t.largo} aria-label={t.largo}>
      <Chip tono={t.tono === "rojo" ? "rojo" : "ambar"}>debe la cuota</Chip>
    </span>
  );
}
