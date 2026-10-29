import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AyudaCalculo } from "../../components/AyudaCalculo";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg, Modal } from "../../components/ui";
import { esBillar } from "../../lib/rubro";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { RangoReporte } from "../../types";
import { apiReportes } from "./api";
import { ayudaDeReporte } from "./ayuda";
import { BarraPeriodo } from "./BarraPeriodo";
import { gruposVisibles, type FichaReporte, type GrupoVisible } from "./catalogo";
import { BotonExportar } from "./BotonExportar";
import { ContextoReporte, type DatosReporte, type Exportacion } from "./contexto";
import { comparacionDe, textoRango, type Periodo } from "./periodo";
import { usePeriodo } from "./usePeriodo";
import { FichaIcono } from "./ui";

const Resumen = lazy(() => import("./vistas/Resumen"));
const EnviarResumen = lazy(() => import("./EnviarResumen"));

/**
 * Reportes: una sola pantalla para todos los rubros (rediseño de oct-2026).
 *
 * Arriba lo que vale para TODO (el período, contra qué se compara, la
 * sucursal); a la izquierda los reportes agrupados; a la derecha el que está
 * abierto, en su propia dirección (`/reportes/top-productos`), así "atrás" y
 * recargar la página funcionan. El período vive acá y no en cada reporte: al
 * pasar de uno a otro se sigue mirando la misma semana.
 *
 * En el celular no hay columna: el reporte ocupa el ancho y se cambia desde
 * un botón que abre la lista (diez y pico de opciones no entran en chips).
 *
 * Es la ÚNICA entrada a los reportes (13-oct-2026): los de la agenda, el
 * billar, la farmacia y el costo por servicio viven acá, cada uno en su grupo.
 * Por eso entra también quien no tiene el permiso general de reportes pero sí
 * alguno suelto (la recepción con los de la agenda): ve sólo sus grupos, sin
 * el Resumen ni "Enviar resumen", que leen las ventas de todo el negocio.
 *
 * En un billar el día es la JORNADA (`lib/jornada.ts`, como el "closeoutHour"
 * de Toast): cierra a las 2 a. m., y "Hoy" a la 1:30 es la noche que corre.
 * La hora del corte la decide el backend y se trae ANTES de armar el período:
 * con el período armado por el calendario y corregido después, cada reporte
 * se pediría dos veces y "Hoy" parpadearía vacío. Los demás rubros no la
 * piden (corte 0, exactamente como antes).
 */
export default function Reportes() {
  const { rubro, puede } = useAuth();
  // Fuera del billar ni se pide: la pantalla es exactamente la de antes.
  return esBillar(rubro) && puede("reportes") ? <ReportesPorJornada /> : <PantallaReportes corteMin={0} />;
}

function ReportesPorJornada() {
  const jornada = useApi(() => apiReportes.jornada(), []);
  if (!jornada.datos) {
    // Si no llega, no se adivina: con el calendario, la noche del billar se
    // partiría en dos días sin que el dueño se entere.
    return jornada.error ? (
      <div className="p-6">
        <ErrorMsg onReintentar={jornada.recargar}>{jornada.error}</ErrorMsg>
      </div>
    ) : (
      <Cargando texto="Abriendo los reportes…" />
    );
  }
  return <PantallaReportes corteMin={jornada.datos.corteMin} />;
}

function PantallaReportes({ corteMin }: { corteMin: number }) {
  const { rubro, negocio, usuario, puede, incluye } = useAuth();
  const [periodo, setPeriodo] = usePeriodo(corteMin);
  const suc = useSucursales();
  const location = useLocation();
  const [exportacion, setExportacion] = useState<Exportacion | null>(null);
  const [enviando, setEnviando] = useState(false);

  const grupos = useMemo(
    () => gruposVisibles({ rubro, features: negocio?.features, permisos: usuario?.permisos, puede, incluye }),
    [rubro, negocio?.features, usuario?.permisos, puede, incluye],
  );
  const fichas = useMemo(() => grupos.flatMap((g) => g.fichas), [grupos]);
  // El Resumen y "Enviar resumen" son del permiso general: leen las ventas.
  const conResumen = puede("reportes");
  const id = location.pathname.replace(/^\/reportes\/?/, "").split("/")[0];
  const ficha = fichas.find((f) => f.id === id) ?? null;

  const comparacion = useMemo(() => comparacionDe(periodo), [periodo]);
  const conSucursal = suc.elegir && suc.sucursalId != null ? { sucursalId: suc.sucursalId } : {};
  // El corte va con el rango: `rangoParaApi` arma cada día de jornada. Sin
  // corte (todo lo que no es billar) el rango es el de siempre, sin el campo.
  const conCorte = corteMin > 0 ? { corteMin } : {};
  const rango: RangoReporte = useMemo(
    () => ({ desde: periodo.desde, hasta: periodo.hasta, ...conCorte, ...conSucursal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodo.desde, periodo.hasta, corteMin, suc.elegir, suc.sucursalId],
  );
  const rangoAnterior: RangoReporte = useMemo(
    () => ({ desde: comparacion.desde, hasta: comparacion.hasta, ...conCorte, ...conSucursal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparacion.desde, comparacion.hasta, corteMin, suc.elegir, suc.sucursalId],
  );

  const registrarExportacion = useCallback((e: Exportacion | null) => setExportacion(e), []);
  const veReporte = useCallback((idReporte: string) => fichas.some((f) => f.id === idReporte), [fichas]);
  const datos: DatosReporte = useMemo(
    () => ({ periodo, comparacion, rango, rangoAnterior, sucursalNombre: suc.nombre, corteMin, registrarExportacion, veReporte }),
    [periodo, comparacion, rango, rangoAnterior, suc.nombre, corteMin, registrarExportacion, veReporte],
  );

  const contenido = useRef<HTMLDivElement>(null);
  // Al abrir otro reporte se vuelve arriba: si no, el nuevo arrancaba a la
  // altura en la que estaba el anterior.
  useEffect(() => {
    contenido.current?.scrollTo?.({ top: 0 });
    // En el celular la que se mueve es la página entera (el <main> del Layout).
    contenido.current?.closest("main")?.scrollTo?.({ top: 0 });
  }, [id]);

  return (
    <ContextoReporte.Provider value={datos}>
      <div className="flex flex-col lg:h-full">
        <div className="shrink-0 border-b border-borde bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
            <div className="min-w-0">
              <h1 className="text-[22px] font-extrabold text-texto">Reportes</h1>
              <p className="text-[13px] text-texto-3">
                Análisis del negocio{suc.elegir ? ` · ${suc.nombre || "Todas las sucursales"}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {suc.elegir && <SelectorSucursal suc={suc} />}
              {conResumen && (
                <button
                  type="button"
                  onClick={() => setEnviando(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-primary-boton px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-primary-boton-hover"
                >
                  <Icon name="arrowUpRight" size={16} />
                  Enviar resumen
                </button>
              )}
            </div>
          </header>
          <BarraPeriodo periodo={periodo} onCambio={setPeriodo} contra={comparacion.contra} corteMin={corteMin} />
        </div>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Reportes" className="hidden w-64 shrink-0 overflow-y-auto border-r border-borde bg-white/70 px-3 py-4 lg:block">
            <MenuReportes grupos={grupos} actual={ficha?.id ?? ""} conResumen={conResumen} />
          </nav>
          <div ref={contenido} className="min-w-0 flex-1 lg:overflow-y-auto">
            <div className="mx-auto max-w-[1080px] space-y-4 px-4 py-5 sm:px-6">
              <SelectorMovil grupos={grupos} ficha={ficha} conResumen={conResumen} />
              {(ficha || conResumen) && (
                <EncabezadoReporte ficha={ficha} periodo={periodo} exportacion={exportacion} puedeExportar={incluye("exportacion")} conResumen={conResumen} />
              )}
              <Suspense fallback={<Cargando texto="Abriendo el reporte…" />}>
                <Routes>
                  {/* Sin el Resumen, la portada es el primer reporte que ve. */}
                  <Route
                    index
                    element={conResumen ? <Resumen /> : fichas[0] ? <Navigate to={`/reportes/${fichas[0].id}`} replace /> : <SinReportes />}
                  />
                  {fichas.map((f) => (
                    <Route key={f.id} path={f.id} element={<f.vista />} />
                  ))}
                  {/* Un reporte que no existe o que este usuario no ve (un link
                      viejo, otro rol): al resumen, no a una pantalla en blanco. */}
                  <Route path="*" element={<Navigate to="/reportes" replace />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </div>
      </div>
      {enviando && (
        <Suspense fallback={null}>
          <EnviarResumen onCerrar={() => setEnviando(false)} />
        </Suspense>
      )}
    </ContextoReporte.Provider>
  );
}

/** Sin un solo reporte visible (no debería pasar: el menú no lleva acá). */
function SinReportes() {
  return (
    <div className="card p-6 text-center text-[14px] text-texto-3">No tenés reportes habilitados. Pedile acceso al dueño del negocio.</div>
  );
}

// ── Sucursal ────────────────────────────────────────────────────────────────

function SelectorSucursal({ suc }: { suc: ReturnType<typeof useSucursales> }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  const opciones: [number | null, string][] = [[null, "Todas las sucursales"], ...suc.sucursales.map((s): [number, string] => [s.id, s.nombre])];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-2 rounded-full border border-borde bg-white px-4 py-2.5 text-[13px] font-bold text-texto hover:bg-muted"
      >
        <Icon name="home" size={15} />
        <span className="max-w-40 truncate">{suc.nombre || "Todas"}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {abierto && (
        <ul className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-borde bg-white py-1.5 shadow-xl">
          {opciones.map(([idSuc, nombre]) => {
            const activo = suc.sucursalId === idSuc;
            return (
              <li key={idSuc ?? "todas"}>
                <button
                  type="button"
                  onClick={() => {
                    suc.setSucursalId(idSuc);
                    setAbierto(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] ${
                    activo ? "bg-primary-50 font-bold text-primary-700" : "text-texto-2 hover:bg-muted"
                  }`}
                >
                  {nombre}
                  {activo && <Icon name="check" size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Menú de reportes ────────────────────────────────────────────────────────

function ItemMenu({ a, icono, tono, titulo, activo, onClick }: { a: string; icono: FichaReporte["icono"]; tono: FichaReporte["tono"]; titulo: string; activo: boolean; onClick?: () => void }) {
  return (
    <Link
      to={a}
      onClick={onClick}
      aria-current={activo ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-[14px] transition-colors ${
        activo ? "bg-primary-50 font-bold text-primary-700" : "font-semibold text-texto-2 hover:bg-muted"
      }`}
    >
      <FichaIcono icono={icono} tono={tono} size={30} />
      <span className="min-w-0 leading-tight">{titulo}</span>
    </Link>
  );
}

function MenuReportes({
  grupos,
  actual,
  conResumen,
  onElegir,
}: {
  grupos: GrupoVisible[];
  actual: string;
  conResumen: boolean;
  onElegir?: () => void;
}) {
  return (
    <div className="space-y-4">
      {conResumen && <ItemMenu a="/reportes" icono="chart" tono="verde" titulo="Resumen" activo={actual === ""} onClick={onElegir} />}
      {grupos.map((g) => (
        <section key={g.id}>
          <h3 className="mb-1.5 flex items-center gap-2 px-2.5 text-[11px] font-bold uppercase tracking-wider text-texto-4">
            {g.titulo}
            {g.nuevo && <span className="rounded-full bg-primary-boton px-1.5 py-px text-[9.5px] font-extrabold tracking-wide text-white">Nuevo</span>}
          </h3>
          <div className="space-y-0.5">
            {g.fichas.map((f) => (
              <ItemMenu key={f.id} a={`/reportes/${f.id}`} icono={f.icono} tono={f.tono} titulo={f.titulo} activo={actual === f.id} onClick={onElegir} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** En el celular: el reporte abierto y, al tocarlo, la lista entera en una hoja. */
function SelectorMovil({ grupos, ficha, conResumen }: { grupos: GrupoVisible[]; ficha: FichaReporte | null; conResumen: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="card flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
      >
        <FichaIcono icono={ficha?.icono ?? "chart"} tono={ficha?.tono ?? "verde"} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-texto-4">Reporte</span>
          <span className="block truncate text-[15px] font-bold text-texto">{ficha?.titulo ?? "Resumen"}</span>
        </span>
        <span className="text-[13px] font-semibold text-primary-700">Cambiar</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {abierto && (
        <Modal abierto titulo="Reportes" subtitulo="Elegí qué querés mirar" onClose={() => setAbierto(false)}>
          <MenuReportes grupos={grupos} actual={ficha?.id ?? ""} conResumen={conResumen} onElegir={() => setAbierto(false)} />
        </Modal>
      )}
    </div>
  );
}

// ── Encabezado del reporte ──────────────────────────────────────────────────

function EncabezadoReporte({
  ficha,
  periodo,
  exportacion,
  puedeExportar,
  conResumen,
}: {
  ficha: FichaReporte | null;
  periodo: Periodo;
  exportacion: Exportacion | null;
  puedeExportar: boolean;
  conResumen: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { rubro } = useAuth();
  const titulo = ficha?.titulo ?? "Resumen";
  // "Cómo se calcula" (L5, 28-oct): cada reporte dice qué muestra y de dónde
  // salen sus números, con las palabras del rubro.
  const ayuda = ayudaDeReporte(ficha?.id ?? "resumen", rubro);
  const descripcion = ficha?.descripcion ?? "Lo más importante del período";
  // Abierto desde otro reporte (el Estado de resultado lleva a Ventas, a
  // Compras…): la flecha vuelve a ése, como en la app. Antes volvía siempre al
  // resumen y el dueño tenía que buscar de nuevo el resultado que miraba.
  const volverA = (location.state as { volverA?: string } | null)?.volverA;
  const etiquetaVolver = volverA ? `Volver a ${volverA}` : "Volver al resumen";
  return (
    <header className="flex flex-wrap items-center gap-3">
      {ficha && (conResumen || volverA) && (
        <button
          type="button"
          onClick={() => (volverA ? navigate(-1) : navigate("/reportes"))}
          aria-label={etiquetaVolver}
          title={etiquetaVolver}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-borde bg-white text-texto-2 transition-colors hover:bg-muted"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
      )}
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="truncate text-[22px] font-extrabold leading-tight text-texto">{titulo}</h2>
        <p className="text-[13px] text-texto-3">
          {descripcion} · {ficha?.fotoDeHoy ? "al día de hoy" : textoRango(periodo.desde, periodo.hasta)}
        </p>
      </div>
      {ayuda && <AyudaCalculo titulo={titulo} ayuda={ayuda} />}
      {/* Sólo Excel: imprimir va en lo que se le da a un cliente (el ticket),
          no en los reportes; si alguien necesita papel, lo imprime desde Excel.
          Con clave: el aviso de una exportación ("vino recortada") es de ese
          reporte y ese período; al cambiar cualquiera de los dos se va. */}
      {puedeExportar && exportacion && (
        <BotonExportar key={`${ficha?.id ?? ""}|${periodo.desde}|${periodo.hasta}`} exportacion={exportacion} />
      )}
    </header>
  );
}
