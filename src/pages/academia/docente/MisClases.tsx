import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Cargando, Confirmar, ErrorMsg } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { aMinutos, cuandoEs, minutosDeAtraso, ventanaLlegada } from "../../../lib/academia/calendario";
import { nombreDe } from "../../../lib/academia/formato";
import type { ClaseDelDia, LlegadaRegistrada, ProximaClase } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { capitalizar, diaCorto, fechaLarga } from "../../../lib/agenda/horaAgenda";
import { ApiError } from "../../../lib/api";
import { fmtHora } from "../../../lib/format";
import { soloLoSuyo, tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { BotonFila, Chip, claseBotonFila, EncabezadoPagina, LISTA, PaginaAcademia, Tarjeta } from "../piezas";
import NavDocente from "./NavDocente";

/**
 * E11a · Mis clases (ronda 2, F1b; rediseño de noviembre): la pantalla del
 * docente al entrar, en el celular. Arriba, grande, la clase que está dando o
 * la que sigue, con lo que mira antes de entrar al aula (cuántos son y cuántos
 * deben la cuota, sólo el semáforo: D6) y a un toque Pasar lista y las Notas
 * del módulo. Las otras clases de hoy van más chicas debajo y, al final, las
 * próximas en una lista compacta.
 *
 * La llegada: con `asistencia.llegadas` el docente marca «Llegué» (D7). Sin
 * ese permiso no hay botón, sólo se le dice si la recepción ya lo marcó: en
 * Drick la marca sólo la recepción (el «Llegué» desde la casa era un fraude),
 * pero otros institutos la usan.
 *
 * Al volver a la pestaña se vuelve a pedir: la app queda abierta en el
 * bolsillo y la llegada que marcó la recepción o el «en 25 min» quedaban
 * viejos.
 *
 * Tanda 2 del 08-nov: una clase suya suspendida se ve como suspendida (con el
 * motivo y sin botones), una suya que ese día da otro dice «La da X», y la que
 * él da como reemplazo lo dice. Las cuentas y la clase grande son sólo de las
 * que da él. D9: el dueño que también enseña entra acá; para él la lista y las
 * notas son las del grupo (las rutas del docente piden el alcance PROPIO).
 */
export default function MisClases() {
  const { usuario } = useAuth();
  const datos = useApi(() => apiAcademia.misClases(), []);
  const { recargar } = datos;
  const d = datos.datos;
  const nombre = (usuario?.nombre ?? usuario?.username ?? "").split(" ")[0];

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [recargar]);

  const clases = d ? [...d.clases].sort((a, b) => aMinutos(a.horaInicio) - aMinutos(b.horaInicio)) : [];
  // Las que da él de verdad: ni las suspendidas ni las suyas que da otro.
  const daHoy = clases.filter((c) => c.mia !== false && !c.suspendida);
  // La que se está dando o la que sigue; si ya terminaron todas, ninguna va grande.
  const principal = daHoy.find((c) => cuandoEs(c) !== "terminó") ?? null;
  const otras = clases.filter((c) => c !== principal);

  return (
    <PaginaAcademia ancho="max-w-3xl" conBarraAbajo>
      <EncabezadoPagina
        sobre={d ? capitalizar(fechaLarga(d.fecha)) : "Hoy"}
        titulo={nombre ? `Hola, ${nombre}` : "Mis clases"}
        bajada={d && (daHoy.length === 0 ? "Hoy no tenés clases" : daHoy.length === 1 ? "Hoy das 1 clase" : `Hoy das ${daHoy.length} clases`)}
      />

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          {principal && <Clase key={principal.sesionId} c={principal} grande onLlegada={recargar} />}
          {otras.length > 0 && (
            <section aria-label={principal ? "Más clases de hoy" : "Clases de hoy"} className="space-y-3">
              <h2 className="text-[12px] font-bold uppercase tracking-wide text-texto-3">{principal ? "Más clases de hoy" : "Clases de hoy"}</h2>
              {otras.map((c) => (
                <Clase key={c.sesionId} c={c} onLlegada={recargar} />
              ))}
            </section>
          )}
          {d.proximas.length > 0 && (
            <section aria-labelledby="t-prox" className="space-y-2">
              <h2 id="t-prox" className="text-[12px] font-bold uppercase tracking-wide text-texto-3">
                Próximas clases
              </h2>
              <ul className={`card ${LISTA.lista}`}>
                {d.proximas.map((x, i) => (
                  <Proxima key={`${x.grupoId}-${x.fecha}-${i}`} x={x} />
                ))}
              </ul>
            </section>
          )}
          {d.clases.length === 0 && d.proximas.length === 0 && (
            <Tarjeta etiqueta="Sin clases">
              <p className="text-sm text-texto-3">No hay clases tuyas en el calendario. Si es un error, avisale a la recepción.</p>
            </Tarjeta>
          )}
        </>
      )}
      <NavDocente />
    </PaginaAcademia>
  );
}

/** «2 h», «1 h 30 min», «45 min»: cuánto falta para la clase, como se lo dice el docente. */
function duracionTexto(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * Una clase de hoy: la grande («Tu próxima clase») o una de las chicas de
 * abajo. Las dos tienen lo mismo (la llegada, Pasar lista, las Notas); la
 * grande lo dice en letra de leer de un vistazo.
 */
function Clase({ c, grande = false, onLlegada }: { c: ClaseDelDia; grande?: boolean; onLlegada: () => void }) {
  const p = usePalabras();
  const { usuario } = useAuth();
  const cuando = cuandoEs(c);
  const modulo = `M${c.materia.orden} ${c.materia.nombre}`;
  const lugar = [c.aula, nombreDe(c.sede)].filter(Boolean).join(" · ");
  // B7: el docente ve sólo el semáforo. Sin él en la respuesta, el cuadrito no va.
  const deben = c.semaforos ? c.semaforos.rojo + c.semaforos.amarillo : null;
  // D9: quien no es docente (el dueño que da clases) usa las rutas del grupo.
  const delGrupo = !soloLoSuyo(usuario, "asistencia.registrar");
  const aLista = delGrupo ? `/academia/grupos/${c.grupoId}/lista` : `/academia/lista?grupo=${c.grupoId}`;
  const aNotas = delGrupo ? `/academia/grupos/${c.grupoId}/notas` : `/academia/notas?grupo=${c.grupoId}`;
  const otro = typeof c.docente === "object" && c.docente ? c.docente.nombre : typeof c.docente === "string" ? c.docente : null;

  // Suspendida o la da otro ese día: se dice y no hay nada que hacer.
  if (c.suspendida || c.mia === false) {
    return (
      <article aria-label={`Clase de las ${c.horaInicio}`} className="card space-y-2 p-4 opacity-90">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-lg font-bold tabular-nums tracking-tight text-texto-3 line-through">
              {c.horaInicio} a {c.horaFin}
            </p>
            <p className="text-[15px] font-semibold text-texto-2">
              {nombreDe(c.carrera)} · {modulo}
            </p>
          </div>
          <Chip tono={c.suspendida ? "rojo" : "azul"} className="shrink-0 text-[13px]">
            {c.suspendida ? "suspendida" : "reemplazo"}
          </Chip>
        </div>
        <p className="text-[13px] text-texto-2">
          {c.suspendida
            ? `Hoy no hay clase${c.motivoSuspension ? `: ${c.motivoSuspension}` : ""}. No se pasa lista.`
            : `Hoy la da ${otro ?? `otro ${p.docente}`}. No tenés que hacer nada.`}
        </p>
      </article>
    );
  }

  return (
    <article
      aria-label={grande ? "Tu próxima clase" : `Clase de las ${c.horaInicio}`}
      className={`card space-y-4 ${grande ? "p-5 ring-2 ring-primary-100 sm:p-6" : `p-4 ${cuando === "terminó" ? "opacity-75" : ""}`}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {grande && <p className="text-[12px] font-bold uppercase tracking-wide text-primary-700">Tu próxima clase</p>}
          {c.reemplazo && (
            <p>
              <Chip tono="azul" className="text-[12px]">
                Reemplazás{c.titular ? ` a ${c.titular.nombre}` : ""}
              </Chip>
            </p>
          )}
          <p className={`font-bold tabular-nums tracking-tight text-texto ${grande ? "text-3xl" : "text-lg"}`}>
            {c.horaInicio} a {c.horaFin}
          </p>
          <p className={`font-semibold text-texto ${grande ? "text-base" : "text-[15px]"}`}>
            {nombreDe(c.carrera)} · {modulo}
          </p>
          {lugar && <p className="text-[13px] text-texto-3">{lugar}</p>}
        </div>
        <Chip tono={cuando === "en curso" ? "marca" : "gris"} className="shrink-0 text-[13px]">
          {cuando}
        </Chip>
      </div>

      {grande && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted px-3.5 py-3">
            <p className="text-2xl font-bold tabular-nums text-texto">{c.inscritos}</p>
            <p className="text-[13px] text-texto-2">{c.inscritos === 1 ? p.alumno : p.alumnos}</p>
          </div>
          {deben != null && c.semaforos && (
            <div className={`rounded-xl px-3.5 py-3 ${deben > 0 ? "bg-warning-bg text-warning-text" : "bg-muted text-texto-2"}`}>
              <p className="text-2xl font-bold tabular-nums">{deben}</p>
              <p className="text-[13px]">{deben === 1 ? "debe la cuota" : "deben la cuota"}</p>
              {/* El detalle del semáforo: el que pasó la semana de espera y el que está en ella. */}
              {deben > 0 && (
                <p className="mt-0.5 text-[12px]">
                  {[
                    c.semaforos.rojo > 0 ? `${c.semaforos.rojo} ${c.semaforos.rojo === 1 ? "pasó" : "pasaron"} la espera` : "",
                    c.semaforos.amarillo > 0 ? `${c.semaforos.amarillo} en semana de espera` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {!grande && (
        <p className="text-[13px] text-texto-3">
          {c.inscritos} {c.inscritos === 1 ? p.alumno : p.alumnos}
          {deben ? ` · ${deben} ${deben === 1 ? "debe" : "deben"} la cuota` : ""}
        </p>
      )}

      <Llegada c={c} onLlegada={onLlegada} />

      <div className={`flex gap-2 ${grande ? "flex-col sm:flex-row" : ""}`}>
        <Link
          to={aLista}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-boton px-4 font-semibold text-white hover:bg-primary-boton-hover ${
            grande ? "min-h-13 text-base" : "min-h-11 text-sm"
          }`}
        >
          <Icon name="lista" size={grande ? 19 : 17} />
          Pasar lista
        </Link>
        <Link to={aNotas} className={`${claseBotonFila("ghost")} !min-h-11 flex-1 rounded-xl text-sm`}>
          <Icon name="edit" size={16} />
          Notas del {p.materia}
        </Link>
      </div>
      {c.lista.pasada && (
        <p className="text-[13px] text-texto-3">
          Lista guardada: {c.lista.presentes} de {c.lista.total} presentes.
        </p>
      )}
    </article>
  );
}

/**
 * La llegada del docente a la clase. Con `asistencia.llegadas`, su «Llegué»
 * (la hora la pone el servidor; acá no se calcula nada). Sin él, sólo se le
 * dice lo que marcó la recepción, en verde, o que la marca ella.
 */
function Llegada({ c, onLlegada }: { c: ClaseDelDia; onLlegada: () => void }) {
  const { usuario } = useAuth();
  const ventana = ventanaLlegada(c);
  const puedeMarcar = tienePermiso(usuario, "asistencia.llegadas");
  const [marcando, setMarcando] = useState(false);
  const [registrada, setRegistrada] = useState<LlegadaRegistrada | null>(null);
  const [temprano, setTemprano] = useState<{ minutosAntes: number | null } | null>(null);
  const [errorLlegada, setErrorLlegada] = useState("");
  const llegadaEn = c.llegadaEn ?? registrada?.llegadaEn ?? null;
  // Sólo pasada la tolerancia (lo dice el servidor): dentro de ella es a horario.
  const atraso = c.llegadaEn ? minutosDeAtraso(c) : registrada ? minutosDeAtraso(registrada) : 0;

  async function marcarLlegada(confirmarTemprano = false) {
    setMarcando(true);
    setErrorLlegada("");
    try {
      setRegistrada(await apiAcademia.llegada(c.sesionId, confirmarTemprano));
      setTemprano(null);
      onLlegada();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.LLEGADA_MUY_TEMPRANO) {
        // No se registró nada: se pregunta y, si confirma, se reenvía.
        setTemprano({ minutosAntes: typeof e.detalle.minutosAntes === "number" ? e.detalle.minutosAntes : null });
      } else if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.LLEGADA_FUERA_DE_HORARIO) {
        // La hora del celular y la del servidor no coinciden, o la clase terminó
        // mientras tanto: el mensaje del servidor ya dice cuándo se puede.
        setTemprano(null);
        setErrorLlegada(e.message || "Todavía no se puede marcar la llegada de esta clase.");
      } else {
        setTemprano(null);
        setErrorLlegada(e instanceof Error ? e.message : "No se pudo marcar la llegada");
      }
    } finally {
      setMarcando(false);
    }
  }

  if (!puedeMarcar) {
    // Sin montos ni descuentos, como siempre: la hora y, pasada la tolerancia, los minutos.
    return llegadaEn ? (
      <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] font-semibold text-emerald-700">
        <Icon name="check" size={15} />
        <span>
          La recepción marcó tu llegada a las {fmtHora(llegadaEn)}
          {atraso > 0 && <span className="font-normal"> · {atraso} min tarde</span>}
        </span>
      </p>
    ) : (
      <p className="flex items-center gap-1.5 rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-3">
        <Icon name="clock" size={15} />
        La recepción marca tu llegada cuando llegás
      </p>
    );
  }

  return (
    <>
      {/* Sin montos ni descuentos: el docente ve sólo la hora y, si hubo, los minutos de atraso. */}
      {llegadaEn ? (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-texto-2">
          <Icon name="check" size={15} />
          Llegaste a las {fmtHora(llegadaEn)}
          {atraso > 0 && <span className="font-normal text-texto-3">· {atraso} min de atraso</span>}
        </p>
      ) : ventana.estado === "dentro" ? (
        <BotonFila icono="check" variante="soft" className="!min-h-11 w-full rounded-xl text-sm" disabled={marcando} onClick={() => void marcarLlegada()}>
          {marcando ? "Marcando…" : "Llegué"}
        </BotonFila>
      ) : ventana.estado === "antes" ? (
        // Antes de la ventana el servidor la rechaza: se dice cuándo se habilita, con texto a la vista.
        <p className="text-[13px] text-texto-3">Tu llegada se marca desde las {ventana.desde}.</p>
      ) : null}
      <ErrorMsg>{errorLlegada}</ErrorMsg>
      <Confirmar
        abierto={!!temprano}
        titulo="Todavía falta para la clase"
        texto={`${
          temprano?.minutosAntes != null ? `Faltan ${duracionTexto(temprano.minutosAntes)} para que empiece la clase` : "Todavía falta para que empiece la clase"
        } (${c.horaInicio}). ¿Marcás tu llegada igual?`}
        etiquetaOk="Sí, marcar mi llegada"
        procesando={marcando}
        onCancel={() => setTemprano(null)}
        onOk={() => void marcarLlegada(true)}
      />
    </>
  );
}

/** Una próxima clase en una fila: el cuadrito del día (20 / VIE), la hora, el curso y el módulo · aula. */
function Proxima({ x }: { x: ProximaClase }) {
  const materia = typeof x.materia === "string" ? x.materia : `M${x.materia.orden} ${x.materia.nombre}`;
  const dia = Number(x.fecha.slice(8, 10));
  // Tanda 2 del 08-nov: lo que cambió, para que no llegue a una clase que no va.
  const cambio = x.suspendida
    ? { texto: "suspendida", tono: "rojo" as const }
    : x.mia === false
      ? { texto: `la da ${x.docente?.nombre ?? "otro"}`, tono: "azul" as const }
      : x.reemplazo
        ? { texto: "reemplazo", tono: "azul" as const }
        : null;
  return (
    <li className={`flex items-center gap-3 ${LISTA.item}`}>
      <span
        aria-label={capitalizar(fechaLarga(x.fecha))}
        className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-50 text-primary-700"
      >
        <span aria-hidden="true" className="text-base font-bold leading-none tabular-nums">
          {dia}
        </span>
        <span aria-hidden="true" className="mt-0.5 text-[11px] font-semibold leading-none">
          {diaCorto(x.fecha)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-texto">
          <span className="tabular-nums">{x.horaInicio}</span> · {x.carrera ? nombreDe(x.carrera) : x.nombre}
        </span>
        <span className="block truncate text-[13px] text-texto-3">
          {materia}
          {x.aula ? ` · ${x.aula}` : ""}
        </span>
      </span>
      {cambio && (
        <Chip tono={cambio.tono} className="shrink-0 text-[12px]">
          {cambio.texto}
        </Chip>
      )}
    </li>
  );
}
