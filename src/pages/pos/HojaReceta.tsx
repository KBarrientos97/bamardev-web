import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Modal } from "../../components/ui";
import {
  alternarGuarnicion,
  armadoDeMarcas,
  elegirPuro,
  marcasDelArmado,
  mismasPiezas,
  NOMBRE_PIEZA,
  nombrePuro,
  opcionesDePresa,
  pideLaPresa,
  PIEZAS,
  textoDeGuarnicion,
  textoVaCompleta,
  totalDePiezas,
  type MarcasHoja,
} from "../../lib/recetas/armado";
import { fmtMoney } from "../../lib/format";
import type { Armado, PiezaPollo, Producto, RecetaPlatoPos } from "../../types";

/** El espacio que no se parte: «Bs 28,00» queda en un renglón. */
const ESPACIO_DURO = String.fromCharCode(0xa0);

/**
 * La hoja de un plato con receta (CONTRATO-recetas-plato §4.2): la presa del
 * pollo y lo que el cliente quita de la guarnición («sin fideo») o pide «puro»
 * («pura papa»). Se ve y se maneja como la de toppings (`HojaAgregados`).
 *
 * Pensada para marcar rápido: en un alta con presa, tocar la presa agrega el
 * plato y cierra la hoja (dos toques por venta: el plato y la presa). La
 * guarnición sale completa y sólo se marca lo que cambió. Al editar una línea
 * del carrito, tocar la presa sólo la marca y se guarda con «Guardar cambios».
 *
 * Nunca frena una venta: no dice «Agotado» ni apaga nada por el stock de un
 * insumo (puede quedar en negativo).
 */
export default function HojaReceta({
  producto,
  receta,
  elegirPresa,
  puroDoble,
  inicial,
  onConfirmar,
  onClose,
}: {
  producto: Producto;
  receta: RecetaPlatoPos;
  /** El local pidió que el punto de venta pregunte la presa (Configuración). */
  elegirPresa: boolean;
  /** «Pura papa» descuenta doble porción: el botón lo dice («Papa × 2»). */
  puroDoble: boolean;
  /** El armado de la línea que se edita (vacío si no tenía); sin esto, un alta. */
  inicial?: Armado;
  /** Lo marcado; `undefined` = el plato de siempre. */
  onConfirmar: (armado: Armado | undefined) => void;
  onClose: () => void;
}) {
  const editando = inicial !== undefined;
  const conPresa = pideLaPresa(receta, { elegirPresa });
  const opciones = conPresa ? opcionesDePresa(receta.presas) : [];
  const [marcas, setMarcas] = useState<MarcasHoja>(() => {
    const m = marcasDelArmado(inicial, receta);
    // Con la presa a la vista, sólo una que calce con el plato. Sin ella (el
    // local dejó de preguntarla), la de la línea se conserva tal cual.
    return conPresa && m.piezas && totalDePiezas(m.piezas) !== receta.presas ? { ...m, piezas: null } : m;
  });
  // «Otra combinación» abierta de entrada al editar una que no es ninguna de
  // las de siempre («contra y ala»).
  const [otra, setOtra] = useState(
    () => conPresa && receta.presas === 2 && !!marcas.piezas && !opciones.some((o) => mismasPiezas(o.piezas, marcas.piezas)),
  );

  const armado = armadoDeMarcas(marcas, receta);
  const cambioGuarnicion = textoDeGuarnicion(armado, receta);
  const fuera = new Set(marcas.fuera);
  const puros = receta.guarnicion.filter((g) => g.puro);
  const armadas = otra ? totalDePiezas(marcas.piezas) : 0;
  const listo = !conPresa || (otra ? armadas === receta.presas : !!marcas.piezas);
  // En un alta con presa no hay botón: tocar la presa ya agrega. Al editar, con
  // otra combinación o sin presa que elegir, sí.
  const conBoton = editando || !conPresa || otra;
  // El monto nunca se parte en dos renglones («Bs» arriba y «28,00» abajo).
  const precio = fmtMoney(producto.precio).replace(" ", ESPACIO_DURO);

  const tocarPresa = (piezas: Partial<Record<PiezaPollo, number>>) => {
    if (editando) {
      setMarcas((m) => ({ ...m, piezas }));
      setOtra(false);
    } else {
      onConfirmar(armadoDeMarcas({ ...marcas, piezas }, receta));
    }
  };
  const abrirOtra = () => {
    setOtra(true);
    setMarcas((m) => ({ ...m, piezas: null }));
  };
  const cambiarPieza = (k: PiezaPollo, d: number) =>
    setMarcas((m) => {
      const piezas = { ...(m.piezas ?? {}) };
      const n = Math.max(0, (piezas[k] ?? 0) + d);
      if (n > 0) piezas[k] = n;
      else delete piezas[k];
      return { ...m, piezas: totalDePiezas(piezas) > 0 ? piezas : null };
    });

  return (
    <Modal
      abierto
      titulo={producto.nombre}
      subtitulo={`${precio} · ${conPresa && !editando ? "tocá la presa y se agrega" : "marcá lo que cambió"}`}
      onClose={onClose}
      ancho="max-w-lg"
      cerrarAlClicAfuera={false}
      acciones={
        // Como en la hoja de toppings: en el celular, si no entran en una fila,
        // los botones bajan juntos y el total no se aprieta.
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <div className="mr-auto">
            <p className="text-[11px] font-bold uppercase tracking-wide text-texto-4">Total</p>
            <p className="whitespace-nowrap text-xl font-extrabold text-texto" data-testid="total-hoja">
              {fmtMoney(producto.precio)}
            </p>
          </div>
          <div className="flex gap-3">
            <Boton variante="ghost" onClick={onClose} className="min-h-12">
              Cancelar
            </Boton>
            {conBoton && (
              <Boton
                icono="check"
                onClick={() => {
                  if (listo) onConfirmar(armado);
                }}
                disabled={!listo}
                className="min-h-12"
              >
                {editando ? "Guardar cambios" : "Agregar al pedido"}
              </Boton>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {receta.guarnicion.length > 0 && (
          <section aria-label="Guarnición">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-[13px] font-bold text-texto">Guarnición</h3>
              <p className="text-[12px] text-texto-3">Sólo si el cliente quita algo</p>
            </div>
            <p
              aria-live="polite"
              data-testid="estado-guarnicion"
              className={`mb-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${
                cambioGuarnicion ? "bg-warning-bg text-warning-text" : "bg-primary-50 text-primary-700"
              }`}
            >
              {cambioGuarnicion ?? textoVaCompleta(receta)}
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
              {receta.guarnicion.map((g) => {
                const puesta = !fuera.has(g.insumoId);
                return (
                  <button
                    key={g.insumoId}
                    type="button"
                    aria-pressed={puesta}
                    onClick={() => setMarcas((m) => alternarGuarnicion(m, g))}
                    className={`min-h-12 min-w-0 break-words rounded-xl border-2 px-2 py-1.5 text-sm font-semibold transition-colors ${
                      puesta ? "border-primary bg-primary-50 text-texto" : "border-borde bg-white text-texto-4 line-through"
                    }`}
                  >
                    {g.nombre}
                    {puroDoble && marcas.puro === g.insumoId ? " × 2" : ""}
                  </button>
                );
              })}
            </div>
            {/* Los atajos sólo tienen sentido con dos o más que pueden ir puro. */}
            {puros.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {puros.map((g) => {
                  const activo = marcas.puro === g.insumoId;
                  return (
                    <button
                      key={g.insumoId}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => setMarcas((m) => elegirPuro(m, g, receta))}
                      className={`min-h-12 min-w-0 flex-1 basis-24 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
                        activo ? "border-primary-boton bg-primary-boton text-white" : "border-borde bg-white text-texto-2 hover:bg-muted"
                      }`}
                    >
                      {nombrePuro(g.nombre)}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {conPresa && (
          <section aria-label="Presa">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-[13px] font-bold text-texto">Presa</h3>
              <p className="text-[12px] text-texto-3">
                {editando ? "Tocá otra para cambiarla" : "Tocá una y se agrega al pedido"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {opciones.map((o) => {
                const elegida = !otra && !!marcas.piezas && mismasPiezas(o.piezas, marcas.piezas);
                return (
                  <button
                    key={o.nombre}
                    type="button"
                    aria-pressed={elegida}
                    aria-label={o.detalle ? `${o.nombre} (${o.detalle})` : o.nombre}
                    onClick={() => tocarPresa(o.piezas)}
                    className={`flex min-h-16 min-w-0 flex-col justify-center rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                      elegida ? "border-primary bg-primary-50" : "border-borde bg-white hover:bg-muted"
                    }`}
                  >
                    <span className="text-base font-bold text-texto">{o.nombre}</span>
                    {o.detalle && <span className="text-xs text-texto-2">{o.detalle}</span>}
                  </button>
                );
              })}
            </div>
            {receta.presas === 2 &&
              (otra ? (
                <div className="mt-2 overflow-hidden rounded-xl border border-borde">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted px-3 py-2">
                    <span className="text-[13px] font-semibold text-texto">Armá las presas una por una</span>
                    <span
                      aria-live="polite"
                      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        armadas === receta.presas ? "bg-primary-50 text-primary-700" : "bg-warning-bg text-warning-text"
                      }`}
                    >
                      {armadas} de {receta.presas} presas
                    </span>
                  </div>
                  <ul className="divide-y divide-borde-soft">
                    {PIEZAS.map((k) => {
                      const n = marcas.piezas?.[k] ?? 0;
                      const nombre = NOMBRE_PIEZA[k].una;
                      return (
                        <li key={k} className="flex items-center gap-2 py-1 pl-3 pr-1.5">
                          <span className="min-w-0 flex-1 text-sm font-semibold text-texto">
                            {nombre.charAt(0).toUpperCase() + nombre.slice(1)}
                          </span>
                          <div className="flex items-center gap-1 rounded-lg border border-borde">
                            <button
                              type="button"
                              onClick={() => cambiarPieza(k, -1)}
                              disabled={n === 0}
                              aria-label={`Menos ${nombre}`}
                              className="flex h-12 w-12 items-center justify-center text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <Icon name="minus" size={16} />
                            </button>
                            <span className="min-w-6 text-center text-sm font-bold" aria-label={`${nombre}: ${n}`}>
                              {n}
                            </span>
                            <button
                              type="button"
                              onClick={() => cambiarPieza(k, 1)}
                              disabled={armadas >= receta.presas}
                              aria-label={`Más ${nombre}`}
                              className="flex h-12 w-12 items-center justify-center text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <Icon name="plus" size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={abrirOtra}
                  className="mt-2 min-h-12 w-full rounded-xl border border-dashed border-borde bg-white px-3 text-[13px] font-semibold text-texto-2 hover:bg-muted"
                >
                  Otra combinación (ej. contra y ala)
                </button>
              ))}
          </section>
        )}
      </div>
    </Modal>
  );
}
