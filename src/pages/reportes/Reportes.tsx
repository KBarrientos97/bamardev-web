import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, Input, Modal } from "../../components/ui";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { RangoReporte } from "../../types";
import { gruposVisibles, type FichaReporte, type GrupoVisible } from "./catalogo";
import { bajarXlsx, ContextoReporte, type DatosReporte, type Exportacion } from "./contexto";
import {
  comparacionDe,
  NOMBRE_PRESET,
  periodoDe,
  rangoElegido,
  textoRango,
  type Periodo,
  type Preset,
} from "./periodo";
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
 */
export default function Reportes() {
  const { rubro, negocio, usuario, puede, incluye } = useAuth();
  const [periodo, setPeriodo] = usePeriodo();
  const suc = useSucursales();
  const location = useLocation();
  const [exportacion, setExportacion] = useState<Exportacion | null>(null);
  const [enviando, setEnviando] = useState(false);

  const grupos = useMemo(
    () => gruposVisibles({ rubro, features: negocio?.features, permisos: usuario?.permisos, puede, incluye }),
    [rubro, negocio?.features, usuario?.permisos, puede, incluye],
  );
  const fichas = useMemo(() => grupos.flatMap((g) => g.fichas), [grupos]);
  const id = location.pathname.replace(/^\/reportes\/?/, "").split("/")[0];
  const ficha = fichas.find((f) => f.id === id) ?? null;

  const comparacion = useMemo(() => comparacionDe(periodo), [periodo]);
  const conSucursal = suc.elegir && suc.sucursalId != null ? { sucursalId: suc.sucursalId } : {};
  const rango: RangoReporte = useMemo(
    () => ({ desde: periodo.desde, hasta: periodo.hasta, ...conSucursal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodo.desde, periodo.hasta, suc.elegir, suc.sucursalId],
  );
  const rangoAnterior: RangoReporte = useMemo(
    () => ({ desde: comparacion.desde, hasta: comparacion.hasta, ...conSucursal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparacion.desde, comparacion.hasta, suc.elegir, suc.sucursalId],
  );

  const registrarExportacion = useCallback((e: Exportacion | null) => setExportacion(e), []);
  const veReporte = useCallback((idReporte: string) => fichas.some((f) => f.id === idReporte), [fichas]);
  const datos: DatosReporte = useMemo(
    () => ({ periodo, comparacion, rango, rangoAnterior, sucursalNombre: suc.nombre, registrarExportacion, veReporte }),
    [periodo, comparacion, rango, rangoAnterior, suc.nombre, registrarExportacion, veReporte],
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
              <button
                type="button"
                onClick={() => setEnviando(true)}
                className="inline-flex items-center gap-2 rounded-full bg-primary-boton px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-primary-boton-hover"
              >
                <Icon name="arrowUpRight" size={16} />
                Enviar resumen
              </button>
            </div>
          </header>
          <BarraPeriodo periodo={periodo} onCambio={setPeriodo} contra={comparacion.contra} />
        </div>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Reportes" className="hidden w-64 shrink-0 overflow-y-auto border-r border-borde bg-white/70 px-3 py-4 lg:block">
            <MenuReportes grupos={grupos} actual={ficha?.id ?? ""} />
          </nav>
          <div ref={contenido} className="min-w-0 flex-1 lg:overflow-y-auto">
            <div className="mx-auto max-w-[1080px] space-y-4 px-4 py-5 sm:px-6">
              <SelectorMovil grupos={grupos} ficha={ficha} />
              <EncabezadoReporte ficha={ficha} periodo={periodo} exportacion={exportacion} puedeExportar={incluye("exportacion")} />
              <Suspense fallback={<Cargando texto="Abriendo el reporte…" />}>
                <Routes>
                  <Route index element={<Resumen />} />
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

// ── Período ─────────────────────────────────────────────────────────────────

const CLAVE_PERIODO = "bamardev_reportes_periodo";

/**
 * El período elegido, guardado en la pestaña: recargar la página o volver de
 * otra sección no lo pierde (como en la app, 242b57f). Un preset se recalcula
 * al día de hoy —"Semana" guardada ayer es la semana de hoy—; sólo el rango
 * elegido a mano queda con sus fechas. Arranca en el mes en curso: el dueño
 * piensa los números por mes (alquiler, sueldos y luz caen una vez al mes).
 */
function usePeriodo(): [Periodo, (p: Periodo) => void] {
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE_PERIODO) ?? "null") as Periodo | null;
      if (guardado?.preset === "rango" && guardado.desde && guardado.hasta) return rangoElegido(guardado.desde, guardado.hasta);
      if (guardado?.preset && guardado.preset in NOMBRE_PRESET) return periodoDe(guardado.preset as Exclude<Preset, "rango">);
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): arranca en el mes.
    }
    return periodoDe("mes");
  });
  const cambiar = useCallback((p: Periodo) => {
    setPeriodo(p);
    try {
      sessionStorage.setItem(CLAVE_PERIODO, JSON.stringify(p));
    } catch {
      // Ídem: el período se usa igual, sólo no se recuerda.
    }
  }, []);
  return [periodo, cambiar];
}

const CHIPS: Exclude<Preset, "rango" | "mesPasado" | "dias30">[] = ["hoy", "ayer", "semana", "mes", "anio"];

function BarraPeriodo({ periodo, onCambio, contra }: { periodo: Periodo; onCambio: (p: Periodo) => void; contra: string }) {
  const [eligiendo, setEligiendo] = useState(false);
  const otro = !(CHIPS as Preset[]).includes(periodo.preset);
  const chip = (activo: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
      activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[13px] font-semibold text-texto-3 sm:flex">
          <Icon name="calendar" size={15} />
          Período
        </span>
        {CHIPS.map((p) => (
          <button key={p} type="button" onClick={() => onCambio(periodoDe(p))} className={chip(periodo.preset === p)}>
            {NOMBRE_PRESET[p]}
          </button>
        ))}
        <button type="button" onClick={() => setEligiendo(true)} className={chip(otro)}>
          <Icon name="calendar" size={14} />
          {otro ? (periodo.preset === "rango" ? textoRango(periodo.desde, periodo.hasta) : NOMBRE_PRESET[periodo.preset]) : "Personalizado"}
        </button>
      </div>
      <p className="ml-auto text-[12px] text-texto-3">
        <span className="font-semibold text-texto-2">{textoRango(periodo.desde, periodo.hasta)}</span> · flechas comparadas con {contra}
      </p>
      {eligiendo && (
        <DialogoPeriodo
          periodo={periodo}
          onElegir={(p) => {
            onCambio(p);
            setEligiendo(false);
          }}
          onCerrar={() => setEligiendo(false)}
        />
      )}
    </div>
  );
}

const PRESETS_DIALOGO: [Exclude<Preset, "rango">, string][] = [
  ["hoy", "Hoy"],
  ["ayer", "Ayer"],
  ["semana", "Semana"],
  ["mes", "Este mes"],
  ["mesPasado", "Mes pasado"],
  ["dias30", "Últimos 30 días"],
  ["anio", "Año"],
];

function DialogoPeriodo({ periodo, onElegir, onCerrar }: { periodo: Periodo; onElegir: (p: Periodo) => void; onCerrar: () => void }) {
  const [desde, setDesde] = useState(periodo.preset === "rango" ? periodo.desde : "");
  const [hasta, setHasta] = useState(periodo.preset === "rango" ? periodo.hasta : "");
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta);
  return (
    <Modal
      abierto
      titulo="Elegir período"
      subtitulo="Filtrá todos los reportes por fecha"
      onClose={onCerrar}
      ancho="max-w-lg"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton icono="check" disabled={!valido} onClick={() => onElegir(rangoElegido(desde, hasta))}>
            Aplicar rango
          </Boton>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {PRESETS_DIALOGO.map(([p, nombre]) => (
          <button
            key={p}
            type="button"
            onClick={() => onElegir(periodoDe(p))}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              periodo.preset === p ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {nombre}
          </button>
        ))}
      </div>
      <div className="mt-5 border-t border-borde-soft pt-4">
        <p className="mb-2 text-[13px] font-bold text-texto">Rango personalizado</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-texto-2">Desde</span>
            <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-texto-2">Hasta</span>
            <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
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

function MenuReportes({ grupos, actual, onElegir }: { grupos: GrupoVisible[]; actual: string; onElegir?: () => void }) {
  return (
    <div className="space-y-4">
      <ItemMenu a="/reportes" icono="chart" tono="verde" titulo="Resumen" activo={actual === ""} onClick={onElegir} />
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
function SelectorMovil({ grupos, ficha }: { grupos: GrupoVisible[]; ficha: FichaReporte | null }) {
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
          <MenuReportes grupos={grupos} actual={ficha?.id ?? ""} onElegir={() => setAbierto(false)} />
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
}: {
  ficha: FichaReporte | null;
  periodo: Periodo;
  exportacion: Exportacion | null;
  puedeExportar: boolean;
}) {
  const navigate = useNavigate();
  const titulo = ficha?.titulo ?? "Resumen";
  const descripcion = ficha?.descripcion ?? "Lo más importante del período";
  return (
    <header className="flex flex-wrap items-center gap-3">
      {ficha && (
        <button
          type="button"
          onClick={() => navigate("/reportes")}
          aria-label="Volver al resumen"
          title="Volver al resumen"
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
      {/* Sólo Excel: imprimir va en lo que se le da a un cliente (el ticket),
          no en los reportes; si alguien necesita papel, lo imprime desde Excel. */}
      {puedeExportar && exportacion && (
        <button
          type="button"
          onClick={() => bajarXlsx(exportacion.nombre, exportacion.hojas())}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary-boton px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-primary-boton-hover"
        >
          <Icon name="download" size={16} />
          Exportar a Excel
        </button>
      )}
    </header>
  );
}
