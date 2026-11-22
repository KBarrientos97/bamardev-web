import { Icon } from "../../components/Icon";
import { rangoDe, tablaQueToca, textoFaltaTabla } from "../../lib/nutricion/calculo";
import type { Rango, Sexo, TablaGrados as Tabla } from "../../lib/nutricion/tipos";
import { TONO } from "../../lib/nutricion/tonos";

/**
 * La tabla de grados, UNA para las cuatro medidas (IMC, % grasa, % músculo y
 * grasa visceral; CONTRATO-nutricion-evaluacion-22nov §4.2): los renglones son
 * los grados de la tabla que le toca por sexo y edad, cada uno con su rango y
 * su color. Al escribir el valor se enciende sola la fila que corresponde; un
 * clic en otra la elige a mano (queda marcada «elegido a mano») y un clic de
 * nuevo en ésa vuelve a la de la tabla. También se elige sin escribir el valor.
 *
 * Los rangos llegan del backend (`GET /nutricion/catalogo`): acá no hay ni uno.
 */
export default function TablaGrados({
  tablas,
  sexo,
  edad,
  valor,
  elegido,
  onElegir,
  etiqueta,
  compacto = false,
  onCompletarFicha,
  textoCompletar = "Completar en la ficha",
}: {
  /** Las tablas de la medida (`catalogo.tablas.grasa`); sin catálogo todavía, undefined. */
  tablas: Tabla[] | undefined;
  sexo: Sexo | null;
  edad: number | null;
  valor: number | null;
  /** El grado elegido a mano; null = el de la tabla. */
  elegido: string | null;
  /** Sin esto, la tabla es de sólo lectura. */
  onElegir?: (grado: string | null) => void;
  /** El nombre del grupo para el lector de pantalla: «Grados del IMC». */
  etiqueta: string;
  /** La versión chica de la hoja de control: los grados en fila. */
  compacto?: boolean;
  /** Lleva a donde se completa el sexo o la edad (la etapa 1, o «Editar ficha»). */
  onCompletarFicha?: () => void;
  textoCompletar?: string;
}) {
  if (!tablas) return null;
  const { tabla, faltaSexo, faltaEdad } = tablaQueToca(tablas, sexo, edad);

  if (!tabla) {
    const falta = faltaSexo || faltaEdad;
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed border-borde bg-muted px-3.5 py-3 text-[13px] text-texto-3">
        <Icon name="info" size={15} className="shrink-0 text-texto-4" />
        <span>{falta ? textoFaltaTabla(faltaSexo, faltaEdad) : "No hay una tabla para esa edad"}</span>
        {falta && onCompletarFicha && (
          <button type="button" onClick={onCompletarFicha} className="font-semibold text-primary-700 underline-offset-2 hover:underline">
            {textoCompletar}
          </button>
        )}
      </div>
    );
  }

  const deTabla = rangoDe(tabla, valor)?.grado ?? null;
  // Un grado elegido a mano que esta tabla no tiene (no debería pasar: las
  // tablas de una medida usan los mismos grados) no enciende nada.
  const activo = elegido ?? deTabla;
  const aMano = elegido != null;

  const tocar = (r: Rango) => {
    if (!onElegir) return;
    // Otra vez la elegida a mano, o la que ya pone la tabla: vuelve a la de la tabla.
    if (r.grado === elegido || (elegido == null && r.grado === deTabla)) onElegir(null);
    else onElegir(r.grado === deTabla ? null : r.grado);
  };

  if (compacto) {
    return (
      <div role={onElegir ? "radiogroup" : "list"} aria-label={etiqueta} className="flex flex-wrap gap-1.5">
        {tabla.rangos.map((r) => {
          const on = r.grado === activo;
          const t = TONO[r.tono];
          const clase = `flex min-h-11 min-w-0 flex-col justify-center rounded-lg border px-2.5 py-1 text-left transition-colors sm:min-h-0 ${
            on ? `border-transparent ${t.suave} ring-2 ring-inset ${t.anillo}` : "border-borde bg-white hover:bg-muted"
          }`;
          const cuerpo = (
            <>
              <span className={`flex items-center gap-1.5 text-[12px] font-semibold leading-tight ${on ? t.texto : "text-texto-2"}`}>
                <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.barra}`} />
                {r.nombre}
                {on && aMano && <span className="font-medium text-texto-3">· a mano</span>}
              </span>
              <span className="text-[11px] leading-tight tabular-nums text-texto-3">{r.texto}</span>
            </>
          );
          return onElegir ? (
            <button key={r.grado} type="button" role="radio" aria-checked={on} onClick={() => tocar(r)} className={clase}>
              {cuerpo}
            </button>
          ) : (
            <span key={r.grado} role="listitem" aria-current={on || undefined} className={clase}>
              {cuerpo}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div
        role={onElegir ? "radiogroup" : "list"}
        aria-label={etiqueta}
        className="overflow-hidden rounded-xl border border-borde bg-white"
      >
        {tabla.rangos.map((r) => {
          const on = r.grado === activo;
          const t = TONO[r.tono];
          const clase = `flex w-full items-center gap-3 border-t border-borde-soft px-3 py-2 text-left transition-colors first:border-t-0 ${
            on ? `${t.suave} ring-2 ring-inset ${t.anillo}` : onElegir ? "hover:bg-muted" : ""
          }`;
          const cuerpo = (
            <>
              <span aria-hidden="true" className={`h-7 w-1 shrink-0 rounded-full ${t.barra} ${on ? "" : "opacity-60"}`} />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                <span className={`text-sm font-semibold ${on ? t.texto : "text-texto"}`}>{r.nombre}</span>
                {on && aMano && <span className="text-[11px] font-semibold text-texto-3">elegido a mano</span>}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[13px] tabular-nums text-texto-3">{r.texto}</span>
              <span aria-hidden="true" className={`flex w-4 shrink-0 justify-center ${on ? t.texto : "text-transparent"}`}>
                <Icon name="check" size={15} strokeWidth={2.5} />
              </span>
            </>
          );
          return onElegir ? (
            <button key={r.grado} type="button" role="radio" aria-checked={on} onClick={() => tocar(r)} className={clase}>
              {cuerpo}
            </button>
          ) : (
            <div key={r.grado} role="listitem" aria-current={on || undefined} className={clase}>
              {cuerpo}
            </div>
          );
        })}
      </div>
      {onElegir && aMano && (
        <p className="text-[12px] text-texto-3">Tocá de nuevo el elegido para volver al de la tabla.</p>
      )}
    </div>
  );
}
