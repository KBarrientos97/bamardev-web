import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Icon } from "../../components/Icon";
import { Input, Select } from "../../components/ui";
import { fechaLarga, sufijoDelDia, vecesDelDia } from "../../lib/nutricion/calculo";
import {
  ANCHO_POR_DEFECTO,
  anchosDeTabla,
  armadoPorAncho,
  AVISO_AL_REVES,
  cambioDesdeElInicial,
  fechasIniciales,
  filasDeComparar,
  lineaDeComparacion,
  opcionesDeFecha,
  parDe,
  resumenDeVista,
  textoSinMedir,
  ultimosDe,
  vistaDe,
  type CambioMedida,
  type Filtro,
} from "../../lib/nutricion/controles";
import { celdaDe, FILAS, MEDIDAS, valorCon, type Medida } from "../../lib/nutricion/planilla";
import type { Catalogo, Control, Rango } from "../../lib/nutricion/tipos";
import { TONO } from "../../lib/nutricion/tonos";
import { useAnchoDe } from "../../lib/useAnchoDe";

/**
 * La tarjeta «Controles» (CONTRATO-nutricion-evaluacion-22nov §8): la planilla
 * del paciente con tres armados según el ANCHO DE LA TARJETA. PC y tablet: la
 * tabla de siempre con el inicial fijo, el filtro «Últimos N» y la columna
 * «Cambio · desde el inicial». Teléfono: «Comparar dos fechas», y la tabla
 * completa si se pide. Sin `onAbrir` (la ficha del paciente) es sólo lectura.
 */
export function Planilla({ controles, catalogo, onAbrir }: { controles: Control[]; catalogo: Catalogo; onAbrir?: (c: Control) => void }) {
  const [ref, ancho] = useAnchoDe(ANCHO_POR_DEFECTO);
  const armado = armadoPorAncho(ancho);
  return (
    <div ref={ref} className="min-w-0">
      {armado === "telefono" ? (
        // Con un control nuevo, «Hasta» vuelve a ser el último.
        <Telefono key={controles.length} ancho={ancho} controles={controles} catalogo={catalogo} onAbrir={onAbrir} />
      ) : (
        <ConFiltro armado={armado} ancho={ancho} controles={controles} catalogo={catalogo} onAbrir={onAbrir} />
      )}
    </div>
  );
}

const SOMBRA_DERECHA = "shadow-[4px_0_8px_-6px_rgba(15,23,42,0.18)]";
const SOMBRA_IZQUIERDA = "shadow-[-4px_0_8px_-6px_rgba(15,23,42,0.18)]";
const COLOR_CAMBIO: Record<CambioMedida["tono"], string> = { bueno: TONO.bien.texto, malo: "text-danger-text", neutro: "text-texto-3" };

/** Una nota que en la columna pasaría de unos 5 renglones. */
const esLarga = (nota: string | null) => !!nota && (nota.length > 140 || nota.split("\n").length > 5);

const Pista = () => <p className="text-[13px] text-texto-3">Tocá una fecha para corregir ese control.</p>;

// ── PC y tablet ─────────────────────────────────────────────────────────────

function ConFiltro({
  armado,
  ancho,
  controles,
  catalogo,
  onAbrir,
}: {
  armado: "pc" | "tablet";
  ancho: number;
  controles: Control[];
  catalogo: Catalogo;
  onAbrir?: (c: Control) => void;
}) {
  const n = ultimosDe(armado);
  const [filtro, setFiltro] = useState<Filtro>({ tipo: "ultimos" });
  const vista = vistaDe(controles, filtro, n);
  const f = vista.filtro;
  const alto = armado === "tablet" ? "min-h-11" : "";
  const cols = vista.visibles;
  const hayCambio = cols.length > 0;
  const layout = anchosDeTabla(armado, ancho, { anteriores: vista.anteriores > 0, cambio: hayCambio, controles: cols.length });

  const opciones: { clave: string; texto: string; activo: boolean; elegir: () => void; icono?: boolean }[] = [
    { clave: "ultimos", texto: `Últimos ${n}`, activo: f.tipo === "ultimos", elegir: () => setFiltro({ tipo: "ultimos" }) },
    ...(vista.conSeis ? [{ clave: "seis", texto: "Últimos 6", activo: f.tipo === "seis", elegir: () => setFiltro({ tipo: "seis" }) }] : []),
    { clave: "todos", texto: `Todos (${controles.length})`, activo: f.tipo === "todos", elegir: () => setFiltro({ tipo: "todos" }) },
    {
      clave: "fechas",
      texto: "Elegir fechas",
      activo: f.tipo === "fechas",
      icono: true,
      elegir: () => setFiltro((actual) => (actual.tipo === "fechas" ? actual : { tipo: "fechas", ...fechasIniciales(controles, vista) })),
    },
  ];

  return (
    <div>
      <div className="space-y-3 px-4 py-3 sm:px-5">
        {onAbrir && <Pista />}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {vista.hayFiltro && (
            <div role="group" aria-label="Ver" className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-texto-3">Ver</span>
              {opciones.map((o) => (
                <button
                  key={o.clave}
                  type="button"
                  onClick={o.elegir}
                  aria-pressed={o.activo}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${alto} ${
                    o.activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
                  }`}
                >
                  {o.icono && <Icon name="calendar" size={14} />}
                  {o.texto}
                </button>
              ))}
            </div>
          )}
          {controles.length > 1 && (
            <p className="min-w-0 text-[13px] text-texto-3" aria-live="polite">
              {resumenDeVista(controles, vista, layout.total > ancho)}
            </p>
          )}
        </div>
        {f.tipo === "fechas" && (
          <RangoDeFechas
            desde={f.desde}
            hasta={f.hasta}
            alto={alto}
            onChange={(desde, hasta) => setFiltro({ tipo: "fechas", desde, hasta })}
          />
        )}
      </div>
      <Tabla
        controles={controles}
        catalogo={catalogo}
        onAbrir={onAbrir}
        cols={cols}
        inicialFijo
        anteriores={vista.anteriores}
        onAnteriores={() => setFiltro({ tipo: "todos" })}
        conCambio={hayCambio}
        ancho={layout}
        claveDeScroll={`${armado}|${JSON.stringify(f)}|${cols.join(",")}|${ancho}`}
        alto={alto}
      />
    </div>
  );
}

function RangoDeFechas({ desde, hasta, alto, onChange }: { desde: string; hasta: string; alto: string; onChange: (desde: string, hasta: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <label htmlFor={`${id}-desde`} className="mb-1 block text-[13px] font-semibold text-texto-2">
          Desde
        </label>
        <Input id={`${id}-desde`} type="date" value={desde} max={hasta || undefined} onChange={(e) => onChange(e.target.value, hasta)} className={alto} />
      </div>
      <div className="w-44">
        <label htmlFor={`${id}-hasta`} className="mb-1 block text-[13px] font-semibold text-texto-2">
          Hasta
        </label>
        <Input id={`${id}-hasta`} type="date" value={hasta} min={desde || undefined} onChange={(e) => onChange(desde, e.target.value)} className={alto} />
      </div>
    </div>
  );
}

// ── La tabla (PC, tablet y la tabla completa del teléfono) ──────────────────

interface Anchos {
  medida: number;
  inicial: number;
  anteriores: number;
  cambio: number;
  control: number;
  total: number;
}

function Tabla({
  controles,
  catalogo,
  onAbrir,
  cols,
  inicialFijo,
  anteriores = 0,
  onAnteriores,
  conCambio,
  ancho,
  claveDeScroll,
  alto,
}: {
  controles: Control[];
  catalogo: Catalogo;
  onAbrir?: (c: Control) => void;
  /** Las posiciones de las columnas comunes, en orden. */
  cols: number[];
  /** El inicial va aparte, pegado a la izquierda (si no, es una columna más de `cols`). */
  inicialFijo: boolean;
  anteriores?: number;
  onAnteriores?: () => void;
  conCambio: boolean;
  ancho: Anchos;
  claveDeScroll: string;
  alto: string;
}) {
  const carril = useRef<HTMLDivElement>(null);
  const [notasEnteras, setNotasEnteras] = useState(false);
  // Al abrir y al cambiar el filtro, arranca mostrando el último control.
  useEffect(() => {
    const el = carril.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [claveDeScroll]);

  const veces = vecesDelDia(controles.map((c) => c.fecha));
  const ultima = controles.length - 1;
  const hasta = cols.length ? cols[cols.length - 1] : 0;
  const compacta = !inicialFijo;
  const celdaMedida = `sticky left-0 z-20 border-r border-borde-soft bg-white px-3 py-2.5 text-left ${inicialFijo ? "" : SOMBRA_DERECHA}`;
  const ordenadas = inicialFijo ? [0, ...cols] : cols;
  const abrir = (c: Control) => (onAbrir ? () => onAbrir(c) : undefined);
  // Una nota larga estiraba toda la tabla para abajo: se pliega en 5 renglones y se abre con un botón.
  const hayLargas = ordenadas.some((i) => esLarga(controles[i].nota));

  return (
    <div>
      {compacta && onAbrir && (
        <div className="px-4 pb-2">
          <Pista />
        </div>
      )}
      {/* scroll-lateral-ok: la planilla de controles se lee como la hoja, con la medida (y el inicial) quietos (contrato §8.2). */}
      {/* El carril encaja de a una columna (las de control miden lo que entra entero entre las pegadas: `anchosDeTabla`). */}
      <div ref={carril} className="snap-x snap-mandatory overflow-x-auto" style={{ scrollPaddingLeft: ancho.medida + (inicialFijo ? ancho.inicial : 0) }}>
        <table className="min-w-full table-fixed border-separate border-spacing-0 text-sm" style={{ width: ancho.total } as CSSProperties}>
          <colgroup>
            <col style={{ width: ancho.medida }} />
            {inicialFijo && <col style={{ width: ancho.inicial }} />}
            {anteriores > 0 && <col style={{ width: ancho.anteriores }} />}
            {cols.map((i) => (
              <col key={controles[i].id} style={{ width: ancho.control }} />
            ))}
            {conCambio && <col style={{ width: ancho.cambio }} />}
          </colgroup>
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-texto-3">
              <th scope="col" className={`${celdaMedida} border-b border-borde-soft bg-muted`}>
                Medida
              </th>
              {inicialFijo && (
                <th scope="col" className={`sticky z-20 border-b border-r border-borde-soft bg-primary-50 px-1.5 py-1.5 text-center align-bottom ${SOMBRA_DERECHA}`} style={{ left: ancho.medida }}>
                  <EncabezadoDeControl c={controles[0]} vez={veces[0]} etiqueta="inicial" onAbrir={onAbrir} alto={alto} />
                </th>
              )}
              {anteriores > 0 && (
                <th scope="col" className="snap-start border-b border-borde-soft bg-muted px-1.5 py-1.5 text-center align-bottom">
                  <button
                    type="button"
                    onClick={onAnteriores}
                    aria-label={`Ver los ${anteriores} controles anteriores`}
                    className={`flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-texto-3 px-1 py-1 normal-case tracking-normal text-texto-2 hover:bg-white ${alto || "min-h-10"}`}
                  >
                    <span className="text-[13px] font-bold tabular-nums">‹ {anteriores}</span>
                    <span className="text-[11px] font-semibold">anteriores</span>
                  </button>
                </th>
              )}
              {cols.map((i) => (
                <th key={controles[i].id} scope="col" className="snap-start border-b border-borde-soft bg-muted px-1.5 py-1.5 text-center align-bottom">
                  <EncabezadoDeControl c={controles[i]} vez={veces[i]} etiqueta={i === 0 ? "inicial" : i === ultima ? "ultimo" : "control"} onAbrir={onAbrir} alto={alto} />
                </th>
              ))}
              {conCambio && (
                <th scope="col" className={`sticky right-0 z-20 border-b border-l border-borde-soft bg-muted px-2 py-1.5 text-left align-bottom ${SOMBRA_IZQUIERDA}`}>
                  <span className="block text-[12px] font-bold normal-case tracking-normal text-texto">Cambio</span>
                  <span className="block normal-case tracking-normal">desde el inicial</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {FILAS.map((campo) => {
              const m = MEDIDAS[campo];
              const cambio = conCambio ? cambioDesdeElInicial(controles, m, catalogo, hasta) : null;
              return (
                <tr key={campo}>
                  <th scope="row" className={`${celdaMedida} border-t font-semibold text-texto-2`}>
                    {m.nombre}
                    {/* «% de grasa» ya dice su unidad: «(%)» al lado sería repetirla. */}
                    {m.unidad && m.unidad !== "%" && <span className="block text-[12px] font-normal text-texto-3">({m.unidad})</span>}
                  </th>
                  {inicialFijo && (
                    <td
                      onClick={abrir(controles[0])}
                      className={`sticky z-10 border-t border-r border-borde-soft bg-primary-50 h-11 px-1.5 py-1.5 text-center align-middle ${SOMBRA_DERECHA} ${onAbrir ? "cursor-pointer" : ""}`}
                      style={{ left: ancho.medida }}
                    >
                      <Valor control={controles[0]} medida={m} catalogo={catalogo} />
                    </td>
                  )}
                  {anteriores > 0 && <td className="border-t border-borde-soft" />}
                  {cols.map((i) => (
                    <td key={controles[i].id} onClick={abrir(controles[i])} className={`h-11 border-t border-borde-soft px-1.5 py-1.5 text-center align-middle ${onAbrir ? "cursor-pointer" : ""}`}>
                      <Valor control={controles[i]} medida={m} catalogo={catalogo} />
                    </td>
                  ))}
                  {cambio && (
                    <td className={`sticky right-0 z-10 border-t border-l border-borde-soft bg-white px-2 py-1.5 text-left align-middle ${SOMBRA_IZQUIERDA}`}>
                      <TextoDeCambio cambio={cambio} />
                    </td>
                  )}
                </tr>
              );
            })}
            <tr>
              <th scope="row" className={`${celdaMedida} border-t align-top font-semibold text-texto-2`}>
                Nota
                {hayLargas && (
                  <button
                    type="button"
                    onClick={() => setNotasEnteras((v) => !v)}
                    aria-expanded={notasEnteras}
                    className={`mt-1 flex items-center rounded-lg text-left text-[12px] font-semibold text-primary-700 hover:underline ${alto || "min-h-8"}`}
                  >
                    {notasEnteras ? "Plegar las notas" : "Ver las notas enteras"}
                  </button>
                )}
              </th>
              {ordenadas.flatMap((i, k) => {
                const c = controles[i];
                const pegada = inicialFijo && k === 0;
                const celda = (
                  <td
                    key={c.id}
                    onClick={abrir(c)}
                    className={`border-t border-borde-soft px-2 py-2 align-top text-[13px] text-texto-2 ${onAbrir ? "cursor-pointer" : ""} ${
                      pegada ? `sticky z-10 border-r bg-primary-50 ${SOMBRA_DERECHA}` : ""
                    }`}
                    style={pegada ? { left: ancho.medida } : undefined}
                  >
                    {/* Plegada, sin `block`: el `display` de `block` le ganaba al de `line-clamp` y no se plegaba. */}
                    {c.nota ? <span className={`whitespace-pre-line break-words ${!notasEnteras && esLarga(c.nota) ? "line-clamp-5" : "block"}`}>{c.nota}</span> : <span className="block text-center text-texto-3">—</span>}
                  </td>
                );
                // Después del inicial va el hueco de «anteriores».
                return pegada && anteriores > 0 ? [celda, <td key="anteriores" className="border-t border-borde-soft" />] : [celda];
              })}
              {conCambio && <td className={`sticky right-0 z-10 border-t border-l border-borde-soft bg-white ${SOMBRA_IZQUIERDA}`} />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EncabezadoDeControl({
  c,
  vez,
  etiqueta,
  onAbrir,
  alto,
}: {
  c: Control;
  vez: number;
  etiqueta: "inicial" | "ultimo" | "control";
  onAbrir?: (c: Control) => void;
  alto: string;
}) {
  const contenido = (
    <>
      <span className="block text-center text-[13px] font-bold normal-case tracking-normal text-texto tabular-nums">
        <span className="whitespace-nowrap">{fechaLarga(c.fecha)}</span>
        {vez > 1 && <span> ({vez})</span>}
      </span>
      {etiqueta === "inicial" ? (
        <span className="rounded-full bg-primary-100 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-primary-700">Inicial</span>
      ) : etiqueta === "ultimo" ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-primary-700">Último</span>
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-texto-3">Control</span>
      )}
    </>
  );
  if (!onAbrir) return <span className="inline-flex w-full flex-col items-center gap-0.5 px-1 py-1">{contenido}</span>;
  return (
    <button
      type="button"
      onClick={() => onAbrir(c)}
      aria-label={`Corregir el control del ${fechaLarga(c.fecha)}${sufijoDelDia(vez)}`}
      className={`inline-flex w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors hover:bg-white hover:text-primary-700 focus-visible:bg-white ${alto || "min-h-10"}`}
    >
      {contenido}
    </button>
  );
}

/** El valor de una celda con su grado: el grado baja a otro renglón si no entra (sin alto fijo, nada cortado). */
function Valor({ control, medida, catalogo }: { control: Control; medida: Medida; catalogo: Catalogo }) {
  const { valor, grado } = celdaDe(control, medida, catalogo);
  if (valor == null && !grado) return <span className="text-texto-3">—</span>;
  return <Chip medida={medida} valor={valor} grado={grado} />;
}

function Chip({ medida, valor, grado, minimo = false }: { medida: Medida; valor: number | null; grado: Rango | null; minimo?: boolean }) {
  const t = grado ? TONO[grado.tono] : null;
  return (
    <span
      className={`inline-flex w-full max-w-[7.5rem] flex-col items-center justify-center rounded-lg px-1.5 py-1 text-center ${minimo ? "min-h-11" : ""} ${t ? `${t.suave} ${t.texto}` : "text-texto"}`}
    >
      {valor != null ? (
        <span className="font-semibold tabular-nums">{valorCon({ ...medida, unidad: "" }, valor)}</span>
      ) : (
        // El grado se eligió sin escribir el valor: «—» parecía un dato que falta.
        <span className="text-[12px] font-medium">sin medir</span>
      )}
      {grado && <span className="text-[11px] font-medium leading-tight">{grado.nombre}</span>}
    </span>
  );
}

function TextoDeCambio({ cambio }: { cambio: CambioMedida }) {
  return (
    <>
      <span className={`block text-[13px] font-bold tabular-nums ${COLOR_CAMBIO[cambio.tono]}`}>{cambio.texto}</span>
      {cambio.grado && <span className="block text-[11px] leading-tight text-texto-3">{cambio.grado}</span>}
      {cambio.del && <span className="block text-[11px] leading-tight text-texto-3">{cambio.del}</span>}
    </>
  );
}

// ── Teléfono ────────────────────────────────────────────────────────────────

function Telefono({ ancho, controles, catalogo, onAbrir }: { ancho: number; controles: Control[]; catalogo: Catalogo; onAbrir?: (c: Control) => void }) {
  const [tabla, setTabla] = useState(false);
  const ultima = controles.length - 1;
  const [elegidos, setElegidos] = useState<{ desde: number; hasta: number }>({ desde: 0, hasta: ultima });
  const comparar = controles.length > 1 && !tabla;

  if (!comparar) {
    const todas = controles.map((_, i) => i);
    return (
      <div className="space-y-2 pt-3">
        {controles.length > 1 && (
          <div className="px-4">
            <button
              type="button"
              onClick={() => setTabla(false)}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-primary-700 hover:underline"
            >
              <Icon name="chevronLeft" size={16} />
              Comparar dos fechas
            </button>
          </div>
        )}
        <Tabla
          controles={controles}
          catalogo={catalogo}
          onAbrir={onAbrir}
          cols={todas}
          inicialFijo={false}
          conCambio={false}
          ancho={anchosDeTabla("telefono", ancho, { anteriores: false, cambio: false, controles: todas.length })}
          claveDeScroll={`telefono|${todas.length}`}
          alto="min-h-11"
        />
      </div>
    );
  }

  const clamp = (i: number) => Math.min(Math.max(i, 0), ultima);
  const desde = clamp(elegidos.desde);
  const hasta = clamp(elegidos.hasta);
  const par = parDe(desde, hasta);
  const { filas, sinMedir } = filasDeComparar(controles, par, catalogo);
  const sinMedirTexto = textoSinMedir(sinMedir);
  const notas = (par.misma ? [par.desde] : [par.desde, par.hasta]).filter((i) => controles[i].nota?.trim());
  const veces = vecesDelDia(controles.map((c) => c.fecha));
  const fecha = (i: number) => `${fechaLarga(controles[i].fecha)}${sufijoDelDia(veces[i])}`;

  return (
    <div className="space-y-4 px-4 py-4">
      <p className="text-sm text-texto-2">Elegí dos fechas y mirá cuánto cambió.</p>
      <div className="space-y-3">
        <ElegirFecha rotulo="Desde" valor={desde} controles={controles} onChange={(i) => setElegidos({ desde: i, hasta })} onAbrir={onAbrir} />
        <ElegirFecha rotulo="Hasta" valor={hasta} controles={controles} onChange={(i) => setElegidos({ desde, hasta: i })} onAbrir={onAbrir} />
      </div>
      <div className="space-y-1" aria-live="polite">
        <p className="text-sm font-semibold text-texto">{lineaDeComparacion(controles, par)}</p>
        {par.alReves && <p className="text-[13px] text-texto-3">{AVISO_AL_REVES}</p>}
      </div>

      {!par.misma && (
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_minmax(4.5rem,auto)] items-end gap-x-1.5 border-b border-borde-soft pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-texto-3">
            <span>
              Desde
              <span className="block normal-case tracking-normal text-texto-2">{fecha(par.desde)}</span>
            </span>
            <span />
            <span>
              Hasta
              <span className="block normal-case tracking-normal text-texto-2">{fecha(par.hasta)}</span>
            </span>
            <span className="text-right">Cambio</span>
          </div>
          <ul>
            {filas.map((f) => (
              <li key={f.medida.campo} className="border-b border-borde-soft py-2.5">
                <p className="mb-1 text-sm font-semibold text-texto-2">
                  {f.medida.nombre}
                  {f.medida.unidad && f.medida.unidad !== "%" && <span className="font-normal text-texto-3"> ({f.medida.unidad})</span>}
                </p>
                <div className="grid grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)_minmax(4.5rem,auto)] items-center gap-x-1.5">
                  <Lado lado={f.desde} medida={f.medida} />
                  <span aria-hidden="true" className="text-center text-texto-3">
                    →
                  </span>
                  <Lado lado={f.hasta} medida={f.medida} />
                  <span className={`text-right text-[13px] font-bold tabular-nums ${COLOR_CAMBIO[f.cambio.tono]}`}>{f.cambio.texto}</span>
                </div>
                {f.cambio.grado && <p className="mt-1 text-[12px] leading-tight text-texto-3">{f.cambio.grado}</p>}
              </li>
            ))}
          </ul>
          {sinMedirTexto && <p className="mt-2 text-[13px] text-texto-3">{sinMedirTexto}</p>}
        </div>
      )}

      {notas.length > 0 && (
        <div className="space-y-2">
          {notas.map((i) => (
            <p key={controles[i].id} className="whitespace-pre-line break-words text-[13px] text-texto-2">
              <span className="font-bold">Nota del {fecha(i)}:</span> {controles[i].nota}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setTabla(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-borde bg-white px-4 text-sm font-semibold text-texto-2 hover:bg-muted"
      >
        Ver la tabla completa
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}

function Lado({ lado, medida }: { lado: { valor: number | null; grado: Rango | null }; medida: Medida }) {
  if (lado.valor == null && !lado.grado) {
    return <span className="flex min-h-11 items-center justify-center text-texto-3">—</span>;
  }
  return <Chip medida={medida} valor={lado.valor} grado={lado.grado} minimo />;
}

function ElegirFecha({
  rotulo,
  valor,
  controles,
  onChange,
  onAbrir,
}: {
  rotulo: string;
  valor: number;
  controles: Control[];
  onChange: (i: number) => void;
  onAbrir?: (c: Control) => void;
}) {
  const id = useId();
  const veces = vecesDelDia(controles.map((c) => c.fecha));
  const c = controles[valor];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-texto-2">
        {rotulo}
      </label>
      <Select id={id} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="h-12">
        {opcionesDeFecha(controles).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </Select>
      {onAbrir && (
        <button
          type="button"
          onClick={() => onAbrir(c)}
          aria-label={`Corregir el control del ${fechaLarga(c.fecha)}${sufijoDelDia(veces[valor])}`}
          className="mt-1 inline-flex min-h-11 items-center rounded-lg px-1 text-[13px] font-semibold text-primary-700 hover:underline"
        >
          Corregir este control
        </button>
      )}
    </div>
  );
}
