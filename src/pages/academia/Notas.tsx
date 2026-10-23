import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import { fechaCorta, horarioGrupo, nombreDe, numeroEnLetras } from "../../lib/academia/formato";
import type { NotasDelGrupo } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { traeSemaforo } from "../../lib/academia/vista";
import { ApiError } from "../../lib/api";
import { soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import PedirMotivo from "../agenda/PedirMotivo";
import NavDocente from "./docente/NavDocente";
import {
  BotonFila,
  Chip,
  EncabezadoPagina,
  ErrorDeCarga,
  PagoDelModulo,
  FiltrosConteo,
  GrillaKpi,
  KpiTarjeta,
  PaginaAcademia,
  TABLA,
  Tarjeta,
  type TonoChip,
} from "./piezas";

type Filtro = "todos" | "sin" | "reprobados";

/** Hasta acá se ve todo; más, con "Ver los N restantes" (PLAN-ACADEMIAS §5). */
const LIMITE = 20;

/** La pausa al tipear tras la que la nota se guarda sola. */
const PAUSA_GUARDADO_MS = 1200;

/**
 * E13 · Cargar notas (ronda 2, F1b): las notas del módulo, una por
 * estudiante, con su estado de pago (sin montos: D6), la nota en letras y si
 * aprueba. Cada nota se guarda sola al soltar el campo o tras una pausa al
 * tipear, y cada casilla dice si quedó sin guardar o si el servidor la
 * rechazó: el "Guardado" de arriba sólo se ve cuando de verdad está todo
 * guardado (QA ronda 2, B-18). "Cerrar notas del módulo" pide que estén todas
 * (400 NOTAS_INCOMPLETAS lleva a las que faltan); cerrado, sólo quien tiene
 * `notas.reabrir` lo abre con un motivo. Quien no tiene `notas.registrar`
 * (recepción) las ve en sólo lectura, sin cerrar ni reabrir (B-05). La deuda
 * nunca impide cargar ni cerrar (RM 0008/2016 art. 41).
 *
 * El docente entra desde el menú o Mis clases (`/academia/notas?grupo=`); la
 * administración, desde el grupo (`/academia/grupos/:id/notas`).
 */
export default function Notas() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const docente = soloLoSuyo(usuario, "notas.registrar") || soloLoSuyo(usuario, "academia.ver");
  const grupoId = Number(id ?? params.get("grupo")) || null;
  const materiaId = Number(params.get("modulo")) || undefined;
  // Sin grupo: los del docente (o los de todos) para elegir.
  const grupos = useApi(
    () => (grupoId ? Promise.resolve(null) : apiAcademia.grupos({ pageSize: 100 }).then((r) => r.items)),
    [grupoId],
  );
  useEffect(() => {
    const lista = (grupos.datos ?? []).filter((g) => g.estado !== "TERMINADO");
    if (!grupoId && lista.length === 1) setParams({ grupo: String(lista[0].id) }, { replace: true });
  }, [grupos.datos, grupoId, setParams]);

  if (!grupoId) {
    const lista = (grupos.datos ?? []).filter((g) => g.estado !== "TERMINADO");
    return (
      <PaginaAcademia ancho="max-w-xl" conBarraAbajo={docente}>
        <EncabezadoPagina titulo="Notas" />
        <Tarjeta etiqueta="Grupos">
          {grupos.error ? (
            <ErrorMsg onReintentar={grupos.recargar}>{grupos.error}</ErrorMsg>
          ) : !grupos.datos ? (
            <Cargando />
          ) : lista.length === 0 ? (
            <Vacio icono="edit" titulo="No hay grupos en curso" />
          ) : (
            <Select aria-label="Grupo" value="" onChange={(e) => setParams({ grupo: e.target.value })}>
              <option value="">Elegí el grupo…</option>
              {lista.map((g) => (
                <option key={g.id} value={g.id}>
                  {nombreDe(g.carrera)} · {horarioGrupo(g)}
                </option>
              ))}
            </Select>
          )}
        </Tarjeta>
        {docente && <NavDocente />}
      </PaginaAcademia>
    );
  }
  return (
    <CargaNotas
      key={`${grupoId}-${materiaId ?? ""}`}
      grupoId={grupoId}
      materiaId={materiaId}
      docente={docente}
      onModulo={(m) => setParams(id ? { modulo: String(m) } : { grupo: String(grupoId), modulo: String(m) })}
    />
  );
}

function CargaNotas({
  grupoId,
  materiaId,
  docente,
  onModulo,
}: {
  grupoId: number;
  materiaId?: number;
  docente: boolean;
  onModulo: (materiaId: number) => void;
}) {
  const p = usePalabras();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const reabre = tienePermiso(usuario, "notas.reabrir");
  const registra = tienePermiso(usuario, "notas.registrar");
  const carga = useApi(() => apiAcademia.notas(grupoId, materiaId), [grupoId, materiaId]);
  const grupo = useApi(() => apiAcademia.grupo(grupoId).catch(() => null), [grupoId]);
  const [notas, setNotas] = useState<Record<number, string>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [verTodos, setVerTodos] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [mensaje, setMensaje] = useState("");
  /** Alguna nota se guardó en esta visita: recién ahí tiene sentido decir "Guardado". */
  const [algoGuardado, setAlgoGuardado] = useState(false);
  const [guardando, setGuardando] = useState<Record<number, boolean>>({});
  /** La casilla que el servidor rechazó, con su motivo. */
  const [fallos, setFallos] = useState<Record<number, string>>({});
  const [cerrando, setCerrando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  const guardadas = useRef<Record<number, number | null>>({});
  const pausas = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const t = pausas.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const d = carga.datos;
  useEffect(() => {
    if (!d) return;
    setNotas(Object.fromEntries(d.items.map((i) => [i.inscripcionId, i.nota == null ? "" : String(i.nota)])));
    guardadas.current = Object.fromEntries(d.items.map((i) => [i.inscripcionId, i.nota]));
  }, [d]);

  /** Cómo se lee una nota: vacía, fuera de escala, aprueba o reprueba. */
  const evaluar = (v: string, n: NotasDelGrupo) => {
    const t = v.trim();
    if (t === "") return { tipo: "vacia" as const };
    const num = Number(t);
    // "75,5" o "75.5" se ve tal cual y en rojo. Antes el punto se borraba al
    // tipear y quedaba 755.
    if (/[.,]/.test(t)) return { tipo: "error" as const, motivo: "Sin decimales" };
    if (!/^\d+$/.test(t) || num < 1 || num > n.escalaMax) return { tipo: "error" as const, motivo: `De 1 a ${n.escalaMax}` };
    return { tipo: num >= n.notaMinima ? ("aprueba" as const) : ("reprueba" as const), n: num };
  };

  // B7: el docente ve el semáforo en vez de "Pagado / Abonó / Sin pagar".
  const conSemaforo = docente && traeSemaforo(d?.items ?? []);
  const filas = useMemo(() => {
    if (!d) return [];
    return d.items.map((i) => ({ ...i, valor: notas[i.inscripcionId] ?? "", e: evaluar(notas[i.inscripcionId] ?? "", d) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, notas]);

  if (carga.error && !d) {
    return (
      <PaginaAcademia>
        <EncabezadoPagina titulo="Notas" />
        <Tarjeta etiqueta="Notas">
          <ErrorDeCarga
            falla={carga.falla}
            mensaje={carga.error}
            onReintentar={carga.recargar}
            que="este grupo"
            volver={docente ? { a: "/academia/mis-clases", texto: "Ir a mis clases" } : { a: "/academia/calendario", texto: "Volver al calendario" }}
          />
        </Tarjeta>
      </PaginaAcademia>
    );
  }
  if (!d) return <Cargando />;

  const sinNota = filas.filter((f) => f.e.tipo === "vacia" || f.e.tipo === "error");
  const reprobados = filas.filter((f) => f.e.tipo === "reprueba");
  const validas = filas.filter((f) => "n" in f.e);
  const promedio = validas.length ? validas.reduce((s, f) => s + ("n" in f.e ? (f.e.n ?? 0) : 0), 0) / validas.length : null;
  const elegidas = filtro === "sin" ? sinNota : filtro === "reprobados" ? reprobados : filas;
  const visibles = filtro === "todos" && !verTodos ? elegidas.slice(0, LIMITE) : elegidas;
  const g = grupo.datos;
  const m = d.materia;
  const soloLectura = d.cerrada || !registra;

  /** Lo de la casilla es válido y no es lo que está guardado. */
  const sinGuardar = (f: (typeof filas)[number]) => {
    if (f.e.tipo === "error") return false;
    const nota = "n" in f.e ? (f.e.n ?? null) : null;
    return guardadas.current[f.inscripcionId] !== nota;
  };
  const invalidas = filas.filter((f) => f.e.tipo === "error").length;
  const nSinGuardar = filas.filter((f) => sinGuardar(f) && !fallos[f.inscripcionId]).length;
  const enVuelo = Object.values(guardando).some(Boolean);

  /**
   * Guarda una nota (al soltar el campo o tras la pausa), si cambió y está en
   * la escala. Recibe el valor: el temporizador no puede leer el estado de su
   * propio render.
   */
  async function guardarUna(inscripcionId: number, valor: string) {
    clearTimeout(pausas.current[inscripcionId]);
    const v = valor.trim();
    const nota = v === "" ? null : Number(v);
    if (nota != null && (!/^\d+$/.test(v) || nota < 1 || nota > d!.escalaMax)) return;
    if (guardadas.current[inscripcionId] === nota && !fallos[inscripcionId]) return;
    setError("");
    setGuardando((x) => ({ ...x, [inscripcionId]: true }));
    try {
      await apiAcademia.guardarNotas(grupoId, m.id, [{ inscripcionId, nota }]);
      guardadas.current[inscripcionId] = nota;
      setFallos((x) => sinClave(x, inscripcionId));
      setAlgoGuardado(true);
    } catch (e) {
      const texto =
        e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.NOTAS_CERRADAS
          ? `Las notas del M${m.orden} ya están cerradas.`
          : e instanceof Error
            ? e.message
            : "No se pudo guardar la nota";
      setFallos((x) => ({ ...x, [inscripcionId]: texto }));
      setError(texto);
    } finally {
      setGuardando((x) => sinClave(x, inscripcionId));
    }
  }

  async function cerrar() {
    if (sinNota.length) {
      setFiltro("sin");
      setAviso(sinNota.length === 1 ? `Falta 1 nota. Cargala antes de cerrar el ${p.materia}.` : `Faltan ${sinNota.length} notas. Cargalas antes de cerrar el ${p.materia}.`);
      return;
    }
    Object.values(pausas.current).forEach(clearTimeout);
    setCerrando(true);
    setError("");
    setAviso("");
    try {
      // Lo tipeado y todavía sin guardar (el último campo no se soltó) va antes de cerrar.
      const pendientes = filas
        .filter((f) => "n" in f.e && f.e.n != null && guardadas.current[f.inscripcionId] !== f.e.n)
        .map((f) => ({ inscripcionId: f.inscripcionId, nota: "n" in f.e ? (f.e.n ?? null) : null }));
      if (pendientes.length) await apiAcademia.guardarNotas(grupoId, m.id, pendientes);
      await apiAcademia.cerrarNotas(grupoId, m.id);
      carga.recargar();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.NOTAS_INCOMPLETAS) {
        setFiltro("sin");
        setAviso(`Faltan notas. Cargalas antes de cerrar el ${p.materia}.`);
      } else setError(e instanceof Error ? e.message : "No se pudieron cerrar las notas");
    } finally {
      setCerrando(false);
    }
  }

  const acciones: AccionMenu[] = [
    {
      clave: "lista",
      etiqueta: "Pasar lista de hoy",
      icono: "lista",
      onClick: () => navigate(docente ? `/academia/lista?grupo=${grupoId}` : `/academia/grupos/${grupoId}/lista`),
    },
    { clave: "boletin", etiqueta: `Descargar boletín del ${p.materia}`, icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
    ...(d.cerrada && reabre
      ? [{ clave: "reabrir", etiqueta: `Reabrir las notas del M${m.orden}`, icono: "lock" as const, separar: true, onClick: () => setReabriendo(true) }]
      : []),
  ];

  const estadoModulo = (e: string) => (e === "CERRADA" ? "cerrado" : e === "ACTUAL" ? "abierto" : "por venir");
  const columnas = "md:grid-cols-[minmax(180px,2fr)_120px_96px_minmax(120px,1fr)_120px]";

  return (
    <PaginaAcademia conBarraAbajo={docente}>
      <EncabezadoPagina
        volver={docente ? { a: "/academia/mis-clases", texto: "Mis clases" } : { a: `/academia/grupos/${grupoId}`, texto: "Grupo" }}
        titulo={
          <>
            Notas · M{m.orden} {m.nombre}
          </>
        }
        bajada={
          <>
            <span className="block">
              {[g ? `${nombreDe(g.carrera)} · ${horarioGrupo(g)}` : null, g ? nombreDe(g.sede) : null, `${d.items.length} ${d.items.length === 1 ? p.alumno : p.alumnos}`, `del ${fechaCorta(m.desde)} al ${fechaCorta(m.hasta)}`]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="block">
              Nota de 1 a {d.escalaMax} · aprueba con {d.notaMinima}
            </span>
          </>
        }
        acciones={
          <>
            {registra && (
              <Boton icono="lock" disabled={d.cerrada || cerrando} onClick={() => void cerrar()}>
                {d.cerrada ? "Notas cerradas" : cerrando ? "Cerrando…" : `Cerrar notas del ${p.materia}`}
              </Boton>
            )}
            <MenuMas etiqueta="Más acciones de las notas" acciones={acciones} />
          </>
        }
      />

      {d.cerrada ? (
        <p role="status" className="flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto-2">
          <Icon name="lock" size={14} /> Notas del M{m.orden} cerradas.{reabre ? "" : " Para corregir una, pedíselo al administrador."}
        </p>
      ) : !registra ? (
        <p role="status" className="flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto-2">
          <Icon name="lock" size={14} /> Sólo lectura: las notas las carga el {p.docente} del {p.materia}.
        </p>
      ) : null}
      {mensaje && (
        <p role="status" className="text-[13px] text-texto-3">
          {mensaje}
        </p>
      )}
      {aviso && (
        <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm font-semibold text-warning-text">
          {aviso}
        </p>
      )}
      <ErrorMsg>{error}</ErrorMsg>

      {/* El resumen del módulo: lo que antes era la línea de abajo. */}
      <GrillaKpi>
        <KpiTarjeta
          etiqueta="Cargadas"
          icono="edit"
          valor={`${filas.length - sinNota.length} de ${filas.length}`}
          tono={filas.length > 0 && sinNota.length === 0 ? "ok" : "normal"}
          pie={sinNota.length ? `${sinNota.length} sin nota` : "están todas"}
        />
        <KpiTarjeta etiqueta="Aprobados" icono="checkCirculo" valor={validas.length - reprobados.length} pie={`con ${d.notaMinima} o más`} />
        <KpiTarjeta
          etiqueta="Reprobados"
          icono="alert"
          valor={reprobados.length}
          tono={reprobados.length > 0 ? "urgente" : "normal"}
          pie={`menos de ${d.notaMinima}`}
        />
        <KpiTarjeta
          etiqueta="Promedio"
          icono="chart"
          valor={promedio != null ? promedio.toFixed(1).replace(".", ",") : "—"}
          pie={`de 1 a ${d.escalaMax}`}
        />
      </GrillaKpi>

      <Tarjeta
        id="t-notas"
        titulo={p.Alumnos}
        sinRelleno
        acciones={
          d.materias.length > 1 && (
            <label className="flex items-center gap-2 text-[13px] text-texto-3">
              {p.Materia}
              <Select value={m.id} onChange={(e) => onModulo(Number(e.target.value))}>
                {d.materias.map((x) => (
                  <option key={x.id} value={x.id}>
                    M{x.orden} {x.nombre} · {estadoModulo(x.estado)}
                  </option>
                ))}
              </Select>
            </label>
          )
        }
        barra={
          <FiltrosConteo<Filtro>
            enTarjeta
            etiqueta={`Filtrar ${p.alumnos}`}
            opciones={[
              { clave: "todos", label: "Todos", n: filas.length },
              { clave: "sin", label: "Sin nota", n: sinNota.length, urgente: true },
              { clave: "reprobados", label: "Reprobados", n: reprobados.length, urgente: true },
            ]}
            valor={filtro}
            onChange={setFiltro}
            derecha={
              !soloLectura && (
                <EstadoGuardado
                  invalidas={invalidas}
                  fallos={Object.keys(fallos).length}
                  sinGuardar={nSinGuardar}
                  guardando={enVuelo}
                  algoGuardado={algoGuardado}
                />
              )
            }
          />
        }
        pie={<p className="text-[12px] text-texto-3">La deuda no impide cargar la nota ni aprobar el {p.materia} (RM 0008/2016, art. 41).</p>}
      >
        <div className={`hidden gap-3 px-5 py-2.5 md:grid ${columnas} ${TABLA.encabezado}`}>
          <span>{p.Alumno}</span>
          <span>Pago del M{m.orden}</span>
          <span className="text-right">Nota</span>
          <span>En letras</span>
          <span>Resultado</span>
        </div>
        {visibles.length === 0 ? (
          <p className="border-t border-borde-soft p-5 text-sm text-texto-3">
            {filtro === "sin" ? "Todas las notas están cargadas." : "Nadie en esta lista."}
          </p>
        ) : (
          <ul>
            {visibles.map((f) => {
              const t = f.e.tipo;
              const fallo = fallos[f.inscripcionId];
              const pendiente = !soloLectura && !fallo && sinGuardar(f);
              return (
                <li
                  key={f.inscripcionId}
                  className={`grid grid-cols-[minmax(0,1fr)_88px] items-center gap-x-3 gap-y-1.5 border-t border-borde-soft px-4 py-3 transition-colors hover:bg-muted sm:px-5 ${columnas}`}
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-texto md:col-start-1 md:row-start-1">{f.nombre}</span>
                  {/* En el celular el pago y el resultado van juntos debajo del
                      nombre; en escritorio (`contents`) cada uno en su columna. */}
                  <span className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 md:contents">
                    <span className="md:col-start-2 md:row-start-1">
                      <PagoDelModulo estado={f.estadoPago} semaforo={f.semaforo} conSemaforo={conSemaforo} />
                    </span>
                    <span className="md:col-start-5 md:row-start-1">
                      <Chip tono={TONO_RESULTADO[t]}>{t === "vacia" ? "Sin nota" : t === "error" ? f.e.motivo : t === "aprueba" ? "Aprobado" : "Reprobado"}</Chip>
                      {fallo && <span className="mt-0.5 block text-[12px] font-semibold text-danger-text">No se guardó</span>}
                      {pendiente && <span className="mt-0.5 block text-[12px] font-normal text-texto-4">{guardando[f.inscripcionId] ? "Guardando…" : "Sin guardar"}</span>}
                    </span>
                  </span>
                  <input
                    inputMode="numeric"
                    aria-label={`Nota de ${f.nombre}`}
                    value={f.valor}
                    disabled={soloLectura}
                    aria-invalid={t === "error" || !!fallo || undefined}
                    onChange={(e) => {
                      const valor = e.target.value.replace(/[^0-9.,]/g, "");
                      setNotas({ ...notas, [f.inscripcionId]: valor });
                      setAviso("");
                      setMensaje("");
                      clearTimeout(pausas.current[f.inscripcionId]);
                      pausas.current[f.inscripcionId] = setTimeout(() => void guardarUna(f.inscripcionId, valor), PAUSA_GUARDADO_MS);
                    }}
                    onBlur={() => void guardarUna(f.inscripcionId, f.valor)}
                    className={`col-start-2 row-span-2 row-start-1 min-h-11 w-full rounded-xl border px-3 py-2 text-right text-base font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted md:col-start-3 md:row-span-1 md:min-h-10 md:text-sm ${
                      t === "error" || fallo
                        ? "border-danger bg-danger-bg"
                        : t === "vacia" && !soloLectura
                          ? "border-warning-text/50 bg-warning-bg/40"
                          : "border-borde bg-white"
                    }`}
                  />
                  <span className="hidden text-sm text-texto-3 md:col-start-4 md:row-start-1 md:block">
                    {"n" in f.e && f.e.n != null ? numeroEnLetras(f.e.n) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {filtro === "todos" && filas.length > LIMITE && (
          <div className="flex justify-center border-t border-borde-soft p-3">
            <BotonFila variante="ghost" icono={verTodos ? "arrowUp" : "chevronDown"} onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? "Ver menos" : `Ver los ${filas.length - LIMITE} restantes`}
            </BotonFila>
          </div>
        )}
      </Tarjeta>

      {reabriendo && (
        <PedirMotivo
          titulo={`Reabrir las notas del M${m.orden}`}
          texto="Queda registrado quién las reabrió y por qué."
          motivos={["Corregir una nota mal cargada", "Recuperatorio", "Otro"]}
          etiquetaOk="Reabrir"
          faltaMotivo="Elegí el motivo: queda anotado en la ficha."
          onCancelar={() => setReabriendo(false)}
          onConfirmar={async (motivo) => {
            setReabriendo(false);
            try {
              await apiAcademia.reabrirNotas(grupoId, m.id, motivo);
              carga.recargar();
              setMensaje("Notas reabiertas.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudieron reabrir");
            }
          }}
        />
      )}
      {docente && <NavDocente />}
    </PaginaAcademia>
  );
}

/** El color del resultado: aprobado en verde, lo que falta en ámbar, lo que reprueba o no vale en rojo. */
const TONO_RESULTADO: Record<"vacia" | "error" | "aprueba" | "reprueba", TonoChip> = {
  vacia: "ambar",
  error: "rojo",
  aprueba: "verde",
  reprueba: "rojo",
};

/** El mismo registro sin esa clave (para sacar una casilla de "guardando" o de "falló"). */
function sinClave<T>(x: Record<number, T>, clave: number): Record<number, T> {
  const resto = { ...x };
  delete resto[clave];
  return resto;
}

/**
 * Lo que dice el encabezado de la tabla: primero lo que falla, después lo
 * que falta guardar, y "Guardado" sólo con todo guardado (QA ronda 2, B-18).
 */
function EstadoGuardado({
  invalidas,
  fallos,
  sinGuardar,
  guardando,
  algoGuardado,
}: {
  invalidas: number;
  fallos: number;
  sinGuardar: number;
  guardando: boolean;
  algoGuardado: boolean;
}) {
  const clase = "flex items-center gap-1 pb-2 text-[13px]";
  if (invalidas || fallos) {
    const texto = invalidas
      ? `Sin guardar: ${invalidas === 1 ? "1 nota no es válida" : `${invalidas} notas no son válidas`}`
      : fallos === 1
        ? "1 nota no se guardó"
        : `${fallos} notas no se guardaron`;
    return (
      <span role="status" className={`${clase} font-semibold text-danger-text`}>
        <Icon name="alert" size={14} /> {texto}
      </span>
    );
  }
  if (guardando || sinGuardar)
    return (
      <span role="status" className={`${clase} ${guardando ? "text-texto-3" : "text-warning-text"}`}>
        {guardando ? "Guardando…" : "Sin guardar"}
      </span>
    );
  if (!algoGuardado) return null;
  return (
    <span role="status" className={`${clase} text-texto-3`}>
      <Icon name="check" size={14} /> Guardado
    </span>
  );
}
