import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import { fechaCorta, horarioGrupo, nombreDe, numeroEnLetras } from "../../lib/academia/formato";
import type { NotasDelGrupo } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { ApiError } from "../../lib/api";
import { soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import PedirMotivo from "../agenda/PedirMotivo";
import NavDocente from "./docente/NavDocente";
import { EstadoPagoTexto } from "./piezas";

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
      <div className="mx-auto max-w-xl space-y-4 p-4 pb-24 sm:p-6">
        <h1 className="text-xl font-bold text-texto">Notas</h1>
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
        {docente && <NavDocente />}
      </div>
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

  const filas = useMemo(() => {
    if (!d) return [];
    return d.items.map((i) => ({ ...i, valor: notas[i.inscripcionId] ?? "", e: evaluar(notas[i.inscripcionId] ?? "", d) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, notas]);

  if (carga.error && !d) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      </div>
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

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-24 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Link to={docente ? "/academia/mis-clases" : `/academia/grupos/${grupoId}`} className="text-[13px] text-texto-3 hover:underline">
            ← {docente ? "Mis clases" : "Grupo"}
          </Link>
          <h1 className="text-xl font-bold text-texto">
            Notas · M{m.orden} {m.nombre}
          </h1>
          <p className="text-[13px] text-texto-3">
            {[g ? `${nombreDe(g.carrera)} · ${horarioGrupo(g)}` : null, g ? nombreDe(g.sede) : null, `${d.items.length} ${d.items.length === 1 ? p.alumno : p.alumnos}`, `del ${fechaCorta(m.desde)} al ${fechaCorta(m.hasta)}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-[13px] text-texto-3">
            Nota de 1 a {d.escalaMax} · aprueba con {d.notaMinima}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {d.materias.length > 1 && (
            <label className="block text-[12px] text-texto-3">
              {p.Materia}
              <Select value={m.id} onChange={(e) => onModulo(Number(e.target.value))}>
                {d.materias.map((x) => (
                  <option key={x.id} value={x.id}>
                    M{x.orden} {x.nombre} · {estadoModulo(x.estado)}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {registra && (
            <Boton icono="lock" disabled={d.cerrada || cerrando} onClick={() => void cerrar()}>
              {d.cerrada ? "Notas cerradas" : cerrando ? "Cerrando…" : `Cerrar notas del ${p.materia}`}
            </Boton>
          )}
          <MenuMas etiqueta="Más acciones de las notas" acciones={acciones} />
        </div>
      </header>

      {d.cerrada ? (
        <p role="status" className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-texto-2">
          Notas del M{m.orden} cerradas.{reabre ? "" : " Para corregir una, pedíselo al administrador."}
        </p>
      ) : !registra ? (
        <p role="status" className="flex items-center gap-1.5 rounded-xl bg-muted px-3.5 py-2.5 text-sm text-texto-2">
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-borde-soft">
        <div role="tablist" aria-label={`Filtrar ${p.alumnos}`} className="-mb-px flex gap-5">
          {(
            [
              ["todos", "Todos", filas.length],
              ["sin", "Sin nota", sinNota.length],
              ["reprobados", "Reprobados", reprobados.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filtro === k}
              onClick={() => setFiltro(k)}
              className={`border-b-2 pb-2.5 pt-1 text-sm ${filtro === k ? "border-primary font-semibold text-texto" : "border-transparent text-texto-3"}`}
            >
              {label} <span className={`tabular-nums ${k !== "todos" && n > 0 ? "text-warning-text" : "text-texto-4"}`}>{n}</span>
            </button>
          ))}
        </div>
        {!soloLectura && (
          <EstadoGuardado
            invalidas={invalidas}
            fallos={Object.keys(fallos).length}
            sinGuardar={nSinGuardar}
            guardando={enVuelo}
            algoGuardado={algoGuardado}
          />
        )}
      </div>

      <div className="hidden grid-cols-[minmax(180px,2fr)_120px_90px_minmax(120px,1fr)_100px] gap-3 px-3 text-[12px] text-texto-3 md:grid">
        <span>{p.Alumno}</span>
        <span>Pago del M{m.orden}</span>
        <span>Nota</span>
        <span>En letras</span>
        <span>Resultado</span>
      </div>
      <ul className="divide-y divide-borde-soft">
        {visibles.map((f) => {
          const t = f.e.tipo;
          const fallo = fallos[f.inscripcionId];
          const pendiente = !soloLectura && !fallo && sinGuardar(f);
          return (
            <li key={f.inscripcionId} className="grid grid-cols-[minmax(0,1fr)_80px] items-center gap-x-3 gap-y-1 px-3 py-2.5 md:grid-cols-[minmax(180px,2fr)_120px_90px_minmax(120px,1fr)_100px]">
              <span className="min-w-0 truncate text-sm text-texto">{f.nombre}</span>
              <span className="row-start-2 md:row-start-auto">
                <EstadoPagoTexto estado={f.estadoPago} />
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
                className={`row-span-2 w-full rounded-xl border px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted md:row-span-1 ${
                  t === "error" || fallo
                    ? "border-danger bg-danger-bg"
                    : t === "vacia" && !soloLectura
                      ? "border-warning-text/50 bg-warning-bg/40"
                      : "border-borde bg-white"
                }`}
              />
              <span className="hidden text-sm text-texto-3 md:block">{"n" in f.e && f.e.n != null ? numeroEnLetras(f.e.n) : "—"}</span>
              <span
                className={`text-[13px] md:text-sm ${
                  t === "reprueba" || t === "error" ? "font-semibold text-danger-text" : t === "vacia" ? "font-semibold text-warning-text" : "text-texto-2"
                }`}
              >
                {f.e.tipo === "vacia" ? "Sin nota" : f.e.tipo === "error" ? f.e.motivo : f.e.tipo === "aprueba" ? "Aprobado" : "Reprobado"}
                {fallo && <span className="block text-[12px] font-semibold text-danger-text">No se guardó</span>}
                {pendiente && <span className="block text-[12px] font-normal text-texto-4">{guardando[f.inscripcionId] ? "Guardando…" : "Sin guardar"}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {filtro === "todos" && filas.length > LIMITE && (
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="text-sm font-semibold text-primary-700 hover:underline">
          {verTodos ? "Ver menos" : `Ver los ${filas.length - LIMITE} restantes`}
        </button>
      )}
      <div className="flex flex-wrap justify-between gap-2 border-t border-borde-soft pt-3 text-[13px] text-texto-3">
        <span>
          Cargadas {filas.length - sinNota.length} de {filas.length} · aprobados {validas.length - reprobados.length} · reprobados {reprobados.length}
        </span>
        {promedio != null && <span>Promedio del grupo {promedio.toFixed(1).replace(".", ",")}</span>}
      </div>
      <p className="text-[12px] text-texto-4">La deuda no impide cargar la nota ni aprobar el {p.materia} (RM 0008/2016, art. 41).</p>

      {reabriendo && (
        <PedirMotivo
          titulo={`Reabrir las notas del M${m.orden}`}
          texto="Queda registrado quién las reabrió y por qué."
          motivos={["Corregir una nota mal cargada", "Recuperatorio", "Otro"]}
          etiquetaOk="Reabrir"
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
    </div>
  );
}

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
