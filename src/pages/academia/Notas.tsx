import { useEffect, useMemo, useRef, useState, type MouseEvent as EventoMouse } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Boton, Cargando, ErrorMsg, Modal, Select, useAviso, Vacio } from "../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import { fechaCorta, horarioGrupo, nombreDe, numeroEnLetras } from "../../lib/academia/formato";
import type { NotasDelGrupo, PlazoNotas } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { ApiError } from "../../lib/api";
import { soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import PedirMotivo from "../agenda/PedirMotivo";
import NavDocente from "./docente/NavDocente";
import { useHayNavDocente } from "./docente/useNavDocente";
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

/** La nota guardada como texto de la casilla. */
const comoTexto = (n: number | null) => (n == null ? "" : String(n));

/**
 * E13 · Cargar notas (ronda 2, F1b): las notas del módulo, una por
 * estudiante, con su estado de pago (sin montos: D6), la nota en letras y si
 * aprueba.
 *
 * L7 (28-oct): **nada se guarda solo**. Antes cada casilla se guardaba tras
 * una pausa de 1,2 s o al soltarla: el docente escribía "3" pensando en 35 y
 * quedaba guardado un 3 (y reprobado), y en "Sin nota" la fila se iba con la
 * primera tecla. Ahora las casillas cambiadas quedan "Sin guardar" y una barra
 * fija abajo junta todo en UN guardado ("Guardar notas"), que el backend hace
 * en una sola transacción. Las pestañas y los números de arriba son de lo
 * guardado: la fila no se mueve hasta guardar. Salir con cambios pregunta
 * (módulo, volver, "Pasar lista", el menú del docente y el navegador); el
 * menú lateral de la app no se intercepta (BrowserRouter, límite aceptado).
 *
 * Plazo (decisión del dueño, 28-oct): las notas se cargan del inicio del
 * módulo a 5 días después de su fin; fuera de eso, la tabla es de sólo
 * lectura y se dice el plazo. Cerrar sí se puede después del plazo (no cambia
 * notas). "Cerrar notas del módulo" pide que estén todas (400
 * NOTAS_INCOMPLETAS lleva a las que faltan); cerrado, sólo quien tiene
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

/** "Las notas se cargan del 10-nov al 14-dic", según dónde esté hoy el plazo. */
function textoPlazo(plazo: PlazoNotas, materia: string): string {
  const rango = `del ${fechaCorta(plazo.desde)} al ${fechaCorta(plazo.hasta)}`;
  if (plazo.estado === "ANTES") return `El ${materia} todavía no empezó: las notas se cargan ${rango}.`;
  if (plazo.estado === "VENCIDO") return `Pasó el plazo: las notas de este ${materia} se cargaban ${rango}.`;
  return `Las notas se cargan ${rango}.`;
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
  const conNav = useHayNavDocente();
  const reabre = tienePermiso(usuario, "notas.reabrir");
  const registra = tienePermiso(usuario, "notas.registrar");
  const carga = useApi(() => apiAcademia.notas(grupoId, materiaId), [grupoId, materiaId]);
  const grupo = useApi(() => apiAcademia.grupo(grupoId).catch(() => null), [grupoId]);
  /** Lo que dice cada casilla (el borrador); lo guardado es `d.items[].nota`. */
  const [notas, setNotas] = useState<Record<number, string>>({});
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [verTodos, setVerTodos] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [mensaje, setMensaje] = useAviso();
  const [guardando, setGuardando] = useState(false);
  /** Las casillas que el servidor rechazó (NOTA_INVALIDA), con su motivo. */
  const [rechazadas, setRechazadas] = useState<Record<number, string>>({});
  const [cerrando, setCerrando] = useState(false);
  const [reabriendo, setReabriendo] = useState(false);
  /** Adónde iba quien quiso salir con cambios sin guardar (se pregunta antes). */
  const [salida, setSalida] = useState<{ ir: () => void } | null>(null);
  const lista = useRef<HTMLUListElement>(null);

  const d = carga.datos;
  // Cada lectura (la primera, la de después de guardar) deja las casillas
  // como está guardado: el borrador se descarta sólo cuando ya se guardó.
  useEffect(() => {
    if (!d) return;
    setNotas(Object.fromEntries(d.items.map((i) => [i.inscripcionId, comoTexto(i.nota)])));
    setRechazadas({});
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

  // B7: el docente ve sólo el semáforo; el backend ya no le manda `estadoPago`.
  const conSemaforo = docente;
  const filas = useMemo(() => {
    if (!d) return [];
    return d.items.map((i) => {
      const valor = notas[i.inscripcionId] ?? comoTexto(i.nota);
      return { ...i, valor, e: evaluar(valor, d), cambiada: valor.trim() !== comoTexto(i.nota) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, notas]);

  const plazo = d?.plazo;
  const fueraDePlazo = !!plazo && plazo.estado !== "ABIERTO";
  const soloLectura = !d || d.cerrada || !registra || fueraDePlazo;
  const cambiadas = soloLectura ? [] : filas.filter((f) => f.cambiada);
  const hayCambios = cambiadas.length > 0;

  // Con cambios sin guardar, el navegador pregunta antes de cerrar o recargar.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

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

  // Las pestañas y los números, con lo guardado (L7): mientras se tipea la
  // fila se queda donde está.
  const sinNota = filas.filter((f) => f.nota == null);
  const reprobados = filas.filter((f) => f.nota != null && f.nota < d.notaMinima);
  const conNota = filas.filter((f) => f.nota != null);
  const promedio = conNota.length ? conNota.reduce((s, f) => s + (f.nota ?? 0), 0) / conNota.length : null;
  const elegidas = filtro === "sin" ? sinNota : filtro === "reprobados" ? reprobados : filas;
  const visibles = filtro === "todos" && !verTodos ? elegidas.slice(0, LIMITE) : elegidas;
  const g = grupo.datos;
  const m = d.materia;
  const invalidas = cambiadas.filter((f) => f.e.tipo === "error");

  /** Con cambios sin guardar, pregunta antes de ir; sin cambios, va. */
  const salirSi = (ir: () => void) => (hayCambios ? setSalida({ ir }) : ir());

  /**
   * Los enlaces de adentro de la pantalla (volver, la barra del docente):
   * con cambios, el clic se frena y se pregunta. El menú lateral de la app
   * queda afuera de este contenedor (límite aceptado en L7).
   */
  const alClicEnEnlace = (e: EventoMouse) => {
    if (!hayCambios || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest("a[href]");
    const destino = a?.getAttribute("href");
    if (!a || !destino?.startsWith("/") || a.getAttribute("target") === "_blank") return;
    e.preventDefault();
    setSalida({ ir: () => navigate(destino) });
  };

  /** Lleva el foco a la primera casilla con problema (y a su fila, si está oculta). */
  const enfocar = (inscripcionId: number) => {
    setFiltro("todos");
    setVerTodos(true);
    setTimeout(() => lista.current?.querySelector<HTMLInputElement>(`input[data-inscripcion="${inscripcionId}"]`)?.focus(), 0);
  };

  /**
   * Guarda todo lo cambiado en un solo pedido (el backend lo hace todo o
   * nada). Con alguna nota inválida no se manda nada. true = quedó guardado.
   */
  async function guardar(): Promise<boolean> {
    if (!hayCambios) return true;
    if (invalidas.length) {
      setError(
        invalidas.length === 1
          ? "Hay 1 nota que no es válida: corregila para guardar."
          : `Hay ${invalidas.length} notas que no son válidas: corregilas para guardar.`,
      );
      enfocar(invalidas[0].inscripcionId);
      return false;
    }
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const r = await apiAcademia.guardarNotas(
        grupoId,
        m.id,
        cambiadas.map((f) => ({ inscripcionId: f.inscripcionId, nota: "n" in f.e ? (f.e.n ?? null) : null })),
      );
      // El backend devuelve las notas como quedaron: se usan sin pedirlas otra vez.
      if (r) carga.setDatos(r);
      else carga.recargar();
      setMensaje(cambiadas.length === 1 ? "Nota guardada." : `${cambiadas.length} notas guardadas.`);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.NOTA_INVALIDA) {
        const ids = Array.isArray(e.detalle.inscripciones) ? (e.detalle.inscripciones as number[]) : [];
        const max = typeof e.detalle.escalaMax === "number" ? e.detalle.escalaMax : d!.escalaMax;
        setRechazadas(Object.fromEntries(ids.map((id) => [id, `De 1 a ${max}`])));
        setError(e.message);
        if (ids.length) enfocar(ids[0]);
      } else if (e instanceof ApiError && (e.codigo === CODIGOS_ACADEMIA.NOTAS_FUERA_DE_PLAZO || e.codigo === CODIGOS_ACADEMIA.NOTAS_CERRADAS)) {
        // Se cerró el plazo o el módulo con la pantalla abierta: se relee y queda en sólo lectura.
        setError(e.message);
        carga.recargar();
      } else setError(e instanceof Error ? e.message : "No se pudieron guardar las notas");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function cerrar() {
    // Lo que quedaría guardado: lo tipeado en las cambiadas, lo guardado en las demás.
    const faltan = filas.filter((f) => (f.cambiada && !soloLectura ? !("n" in f.e) : f.nota == null));
    if (faltan.length) {
      setFiltro("sin");
      setAviso(faltan.length === 1 ? `Falta 1 nota. Cargala antes de cerrar el ${p.materia}.` : `Faltan ${faltan.length} notas. Cargalas antes de cerrar el ${p.materia}.`);
      return;
    }
    setAviso("");
    // "Guardar y cerrar": primero lo que está sin guardar.
    if (hayCambios && !(await guardar())) return;
    setCerrando(true);
    setError("");
    try {
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
      onClick: () => salirSi(() => navigate(docente ? `/academia/lista?grupo=${grupoId}` : `/academia/grupos/${grupoId}/lista`)),
    },
    ...(d.cerrada && reabre
      ? [{ clave: "reabrir", etiqueta: `Reabrir las notas del M${m.orden}`, icono: "lock" as const, separar: true, onClick: () => setReabriendo(true) }]
      : []),
  ];

  const estadoModulo = (e: string) => (e === "CERRADA" ? "cerrado" : e === "ACTUAL" ? "abierto" : "por venir");
  // L6: columnas fijas (cada fila es su propia grilla: con `auto` no se alinearían con los
  // títulos). Cuotas con lugar para "Debe, pasó la espera" entero y la nota centrada. Se
  // arman según el ancho de la tarjeta (@container), no de la pantalla: con el menú
  // lateral abierto una compu de 1024 deja ~700 px.
  //  · angosta (celular, tablet en vertical): nombre arriba, pastillas abajo, nota a la derecha;
  //  · @2xl (≥ 672 px): tabla sin "En letras";
  //  · @4xl (≥ 896 px): tabla completa.
  const columnas =
    "@2xl:grid-cols-[minmax(140px,1fr)_184px_104px_140px] @2xl:gap-x-5 @4xl:grid-cols-[minmax(180px,1.6fr)_184px_104px_minmax(130px,1fr)_148px] @4xl:gap-x-6";
  const cerrarDeshabilitado = d.cerrada || cerrando || guardando || plazo?.estado === "ANTES";

  return (
    <div className="contents" onClickCapture={alClicEnEnlace}>
      <PaginaAcademia ancho="max-w-7xl" conBarraAbajo={docente || hayCambios}>
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
                {plazo && plazo.estado === "ABIERTO" && !d.cerrada ? ` · ${textoPlazo(plazo, p.materia)}` : ""}
              </span>
            </>
          }
          acciones={
            <>
              {registra && (
                <Boton
                  icono="lock"
                  disabled={cerrarDeshabilitado}
                  title={plazo?.estado === "ANTES" ? `El ${p.materia} todavía no empezó` : undefined}
                  onClick={() => void cerrar()}
                >
                  {d.cerrada ? "Notas cerradas" : cerrando ? "Cerrando…" : hayCambios ? "Guardar y cerrar" : `Cerrar notas del ${p.materia}`}
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
        ) : fueraDePlazo && plazo ? (
          <p role="status" className="flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto-2">
            <Icon name="lock" size={14} /> {textoPlazo(plazo, p.materia)}
            {plazo.estado === "VENCIDO" && registra ? ` Todavía podés cerrar las notas del ${p.materia}.` : ""}
          </p>
        ) : !registra ? (
          <p role="status" className="flex items-center gap-1.5 rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto-2">
            <Icon name="lock" size={14} /> Sólo lectura: las notas las carga el {p.docente} del {p.materia}.
          </p>
        ) : null}
        {mensaje && (
          <p role="status" className="flex items-center gap-1.5 text-[13px] text-texto-3">
            <Icon name="check" size={14} /> {mensaje}
          </p>
        )}
        {aviso && (
          <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm font-semibold text-warning-text">
            {aviso}
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>

        {/* El resumen del módulo, con lo guardado. */}
        <GrillaKpi>
          <KpiTarjeta
            etiqueta="Cargadas"
            icono="edit"
            valor={`${conNota.length} de ${filas.length}`}
            tono={filas.length > 0 && sinNota.length === 0 ? "ok" : "normal"}
            pie={sinNota.length ? `${sinNota.length} sin nota` : "están todas"}
          />
          <KpiTarjeta etiqueta="Aprobados" icono="checkCirculo" valor={conNota.length - reprobados.length} pie={`con ${d.notaMinima} o más`} />
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
                <Select value={m.id} onChange={(e) => {
                  const nuevo = Number(e.target.value);
                  salirSi(() => onModulo(nuevo));
                }}>
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
            />
          }
          pie={<p className="text-[12px] text-texto-3">La deuda no impide cargar la nota ni aprobar el {p.materia} (RM 0008/2016, art. 41).</p>}
        >
          <div className="@container">
            <div className={`hidden px-5 py-2.5 @2xl:grid ${columnas} ${TABLA.encabezado}`}>
              <span>{p.Alumno}</span>
              <span>{conSemaforo ? "Cuotas" : `Pago del M${m.orden}`}</span>
              <span className="text-center">Nota</span>
              <span className="hidden @4xl:block">En letras</span>
              <span>Resultado</span>
            </div>
            {visibles.length === 0 ? (
              <p className="border-t border-borde-soft p-5 text-sm text-texto-3">
                {filtro === "sin" ? "Todas las notas están cargadas." : "Nadie en esta lista."}
              </p>
            ) : (
              <ul ref={lista}>
                {visibles.map((f) => {
                  const t = f.e.tipo;
                  const rechazo = rechazadas[f.inscripcionId];
                  const malo = t === "error" || !!rechazo;
                  const pendiente = !soloLectura && f.cambiada;
                  return (
                    <li
                      key={f.inscripcionId}
                      className={`grid grid-cols-[minmax(0,1fr)_96px] items-center gap-x-4 gap-y-2 border-t border-borde-soft px-4 py-3.5 transition-colors hover:bg-muted sm:px-5 ${columnas} ${
                        pendiente ? "bg-warning-bg/30" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-texto @2xl:col-start-1 @2xl:row-start-1">{f.nombre}</span>
                      {/* Angosta: el pago y el resultado van juntos debajo del nombre;
                          como tabla (`contents`), cada uno en su columna. */}
                      <span className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 @2xl:contents">
                        <span className="min-w-0 @2xl:col-start-2 @2xl:row-start-1">
                          <PagoDelModulo estado={f.estadoPago} semaforo={f.semaforo} conSemaforo={conSemaforo} />
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 @2xl:col-start-4 @2xl:row-start-1 @2xl:block @4xl:col-start-5">
                          <Chip tono={TONO_RESULTADO[t]}>{t === "vacia" ? "Sin nota" : t === "error" ? f.e.motivo : t === "aprueba" ? "Aprobado" : "Reprobado"}</Chip>
                          {rechazo && <span className="block text-[12px] font-semibold text-danger-text @2xl:mt-0.5">No se guardó: {rechazo}</span>}
                          {pendiente && !rechazo && <span className="block text-[12px] font-semibold text-warning-text @2xl:mt-0.5">Sin guardar</span>}
                        </span>
                      </span>
                      <input
                        inputMode="numeric"
                        enterKeyHint="next"
                        data-inscripcion={f.inscripcionId}
                        aria-label={`Nota de ${f.nombre}`}
                        value={f.valor}
                        disabled={soloLectura}
                        readOnly={guardando}
                        aria-invalid={malo || undefined}
                        onChange={(e) => {
                          const valor = e.target.value.replace(/[^0-9.,]/g, "");
                          setNotas((x) => ({ ...x, [f.inscripcionId]: valor }));
                          if (rechazo) setRechazadas((x) => sinClave(x, f.inscripcionId));
                          setAviso("");
                          setMensaje("");
                        }}
                        onKeyDown={(e) => {
                          // Enter pasa a la casilla siguiente (no guarda: eso es "Guardar notas").
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          const casillas = Array.from(lista.current?.querySelectorAll<HTMLInputElement>("input:not(:disabled)") ?? []);
                          casillas[casillas.indexOf(e.currentTarget) + 1]?.focus();
                        }}
                        className={`col-start-2 row-span-2 row-start-1 min-h-11 w-full rounded-xl border px-3 py-2 text-center text-base font-semibold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted @2xl:col-start-3 @2xl:row-span-1 @2xl:min-h-10 @2xl:text-sm ${
                          malo ? "border-danger bg-danger-bg" : pendiente ? "border-warning-text/60 bg-white" : t === "vacia" && !soloLectura ? "border-warning-text/50 bg-warning-bg/40" : "border-borde bg-white"
                        }`}
                      />
                      <span className="hidden text-sm text-texto-3 @4xl:col-start-4 @4xl:row-start-1 @4xl:block">
                        {"n" in f.e && f.e.n != null ? numeroEnLetras(f.e.n) : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {filtro === "todos" && filas.length > LIMITE && (
            <div className="flex justify-center border-t border-borde-soft p-3">
              <BotonFila variante="ghost" icono={verTodos ? "arrowUp" : "chevronDown"} onClick={() => setVerTodos((v) => !v)}>
                {verTodos ? "Ver menos" : `Ver los ${filas.length - LIMITE} restantes`}
              </BotonFila>
            </div>
          )}
        </Tarjeta>

        {/* L7: un solo guardado con todo. En el celular, fija abajo (encima de la barra del
            docente); en la compu, pegada al pie de la pantalla dentro de la columna. */}
        {hayCambios && (
          <div
            role="region"
            aria-label="Notas sin guardar"
            className={`fixed inset-x-0 z-20 border-t border-borde-soft bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:sticky md:inset-x-auto md:bottom-4 md:rounded-2xl md:border md:border-borde md:px-5 md:shadow-lg ${
              docente && conNav ? "bottom-[57px]" : "bottom-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="text-sm text-texto-2">
                <span className="font-semibold text-texto">
                  {cambiadas.length === 1 ? "1 cambio sin guardar" : `${cambiadas.length} cambios sin guardar`}
                </span>
                {invalidas.length > 0 && (
                  <span className="font-semibold text-danger-text">
                    {" · "}
                    {invalidas.length === 1 ? "1 no es válida" : `${invalidas.length} no son válidas`}
                  </span>
                )}
              </p>
              <Boton icono="check" className="min-h-11 flex-1 sm:flex-none" disabled={guardando} onClick={() => void guardar()}>
                {guardando ? "Guardando…" : "Guardar notas"}
              </Boton>
            </div>
          </div>
        )}

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

        <Modal
          abierto={!!salida}
          titulo="Hay notas sin guardar"
          onClose={() => setSalida(null)}
          ancho="max-w-sm"
          acciones={
            <>
              <Boton variante="ghost" onClick={() => setSalida(null)} disabled={guardando}>
                Seguir cargando
              </Boton>
              <Boton
                variante="ghost"
                disabled={guardando}
                onClick={() => {
                  const ir = salida?.ir;
                  setSalida(null);
                  ir?.();
                }}
              >
                Salir sin guardar
              </Boton>
              <Boton
                disabled={guardando}
                onClick={async () => {
                  const ir = salida?.ir;
                  const ok = await guardar();
                  setSalida(null);
                  if (ok) ir?.();
                }}
              >
                {guardando ? "Guardando…" : "Guardar y salir"}
              </Boton>
            </>
          }
        >
          <p className="text-sm text-texto-2">
            {cambiadas.length === 1 ? "Cambiaste 1 nota" : `Cambiaste ${cambiadas.length} notas`} y todavía no se guardaron. Si salís sin guardar, se pierden.
          </p>
        </Modal>
        {docente && <NavDocente />}
      </PaginaAcademia>
    </div>
  );
}

/** El color del resultado: aprobado en verde, lo que falta en ámbar, lo que reprueba o no vale en rojo. */
const TONO_RESULTADO: Record<"vacia" | "error" | "aprueba" | "reprueba", TonoChip> = {
  vacia: "ambar",
  error: "rojo",
  aprueba: "verde",
  reprueba: "rojo",
};

/** El mismo registro sin esa clave (para sacar una casilla de "rechazada"). */
function sinClave<T>(x: Record<number, T>, clave: number): Record<number, T> {
  const resto = { ...x };
  delete resto[clave];
  return resto;
}
