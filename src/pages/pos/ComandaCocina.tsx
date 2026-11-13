import { fmtCantidad, fmtHora } from "../../lib/format";
import { numeroTicket } from "../../lib/tickets/llamado";
import type { Venta } from "../../types";
import type { TamanoLetra } from "../../types/menuDigital";
import { estiloLetra } from "../../lib/menuDigital/letraRecibo";

/**
 * La comanda de cocina de un pedido con número (extra `tickets_pedido`): el
 * papel que la caja imprime junto con el recibo y se pasa a la cocina.
 *
 * Sin precios ni pagos (en la cocina no sirven y en un papel que anda de
 * mano en mano tampoco), y con lo que importa grande: el número, cuántos de
 * cada cosa y las notas en un recuadro, separados en "EN MESA" y "PARA
 * LLEVAR" (el que arma la bandeja no puede confundir lo que va en caja).
 *
 * Sale en una hoja aparte del recibo (`comanda-impresa`, index.css): en una
 * térmica de rollo la impresora corta entre los dos papeles. También sola,
 * con el botón de su rótulo, para mandarla a la impresora de la cocina.
 *
 * La hora y no la fecha: en la cocina lo que importa es cuánto lleva esperando.
 */
export default function ComandaCocina({
  venta,
  numero,
  negocio,
  sede,
  minutos = 0,
  tamano,
}: {
  venta: Venta;
  numero: number;
  negocio: string;
  /**
   * El local, sólo con 2+ sucursales: la cocina de un local no arma lo del
   * otro, y el papel que anda de mano en mano tiene que decir de cuál es.
   */
  sede?: string | null;
  /** El tiempo estimado de Configuración del recibo: la cocina sabe para cuándo. 0, no sale. */
  minutos?: number;
  /**
   * La letra de la comanda (Configuración del recibo), aparte de la del
   * recibo: la cocina lee de lejos y puede querer la grande aunque la caja
   * ahorre rollo con la chica. Sin diseño del recibo, la de siempre.
   */
  tamano?: TamanoLetra | null;
}) {
  const detalles = venta.detalles ?? [];
  const grupos = [
    { titulo: "EN MESA", lineas: detalles.filter((d) => d.consumo === "MESA") },
    { titulo: "PARA LLEVAR", lineas: detalles.filter((d) => d.consumo !== "MESA") },
  ].filter((g) => g.lineas.length > 0);
  const unidades = detalles.reduce((s, d) => s + d.cantidad, 0);

  return (
    <article
      className="papel-letra comanda-impresa card mx-auto max-w-[320px] p-5 print:max-w-none print:border-0 print:p-0 print:shadow-none"
      style={estiloLetra(tamano)}
    >
      <header className="text-center">
        <p className="text-[10px] font-bold tracking-[0.3em] text-texto-3">COMANDA · COCINA</p>
        {negocio && <p className="text-sm font-bold text-texto">{negocio}</p>}
        {sede && <p className="text-[12px] font-bold text-texto-2">{sede}</p>}
        <p className="mt-3 text-[10px] font-bold tracking-[0.3em] text-texto-3">TICKET N°</p>
        <p className="font-mono text-[64px] font-black leading-none tracking-tight text-texto">{numeroTicket(numero)}</p>
      </header>
      <div className="mt-3 flex justify-between border-b border-dashed border-borde pb-2 font-mono text-[11px] text-texto-2">
        <span>{fmtHora(venta.fecha)}</span>
        <span>{venta.comprobante ?? `#${venta.id}`}</span>
      </div>
      {grupos.map((g) => (
        <section key={g.titulo} className="mt-3">
          <p className="border-b-2 border-texto pb-0.5 text-[12px] font-extrabold tracking-[0.16em] text-texto">{g.titulo}</p>
          <ul className="mt-1.5 space-y-2">
            {g.lineas.map((d, i) => (
              <li key={i}>
                <p className="flex gap-2 text-[19px] font-bold leading-snug text-texto">
                  <span className="shrink-0 font-mono">{fmtCantidad(d.cantidad)}×</span>
                  <span className="min-w-0">{d.producto}</span>
                </p>
                {d.nota && (
                  <p className="mt-1 rounded border-2 border-texto px-2 py-0.5 text-[15px] font-bold text-texto">
                    {d.nota}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="mt-3 border-t border-dashed border-borde pt-2 text-center text-[12px] font-semibold text-texto-2">
        {fmtCantidad(unidades)} {unidades === 1 ? "producto" : "productos"}
        {minutos > 0 && ` · Entrega en ${minutos}–${minutos + 5} min`}
      </p>
    </article>
  );
}
