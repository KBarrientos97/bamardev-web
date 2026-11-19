import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { usePedidosEncolados, type PedidoPlataformaEncolado } from "../offline/cola";
import { PLATAFORMAS, type Plataforma, type PrecioDePlataforma } from "./tipos";

/**
 * El precio de cada producto EN la app de delivery (CONTRATO-PRECIO-PLATAFORMA,
 * 19-nov). En PedidosYa el Brasa económico vale Bs 21 aunque en el local valga
 * 18: si el pedido se registraba al precio del local, el reporte nunca
 * coincidía con lo que la app liquida.
 *
 * No hay pantalla para cargarlos: se aprenden al registrar. El cajero corrige
 * el precio una vez en el diálogo, deja tildado «Recordar» y el próximo pedido
 * de esa app ya sale bien.
 *
 * El POS los pide al entrar (y otra vez cada vez que abre el diálogo de una
 * app: otro equipo pudo haber aprendido un precio) y guarda una copia en este equipo, por negocio
 * (los precios son del negocio, no del cajero), para abrir el diálogo sin
 * señal. Va en localStorage y no en la copia de IndexedDB del modo sin
 * internet: es poca cosa, se lee sin esperar (el diálogo la necesita en su
 * primer dibujo) y sirve también en el navegador común, donde tras
 * «Recordar» el siguiente pedido tiene que salir bien aunque no se hayan
 * vuelto a pedir.
 *
 * Forma guardada, en `bamardev.pedidosPlataforma.precios:{negocioId}`: la misma
 * lista que devuelve el servidor, `[{ productoId, plataforma, precio }]`.
 */

const PREFIJO = "bamardev.pedidosPlataforma.precios:";

/** Dónde vive la copia de un negocio. */
export const clavePreciosPlataforma = (negocioId: number) => `${PREFIJO}${negocioId}`;

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Medio centavo: por debajo de eso dos precios son el mismo. */
const mismoPrecio = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Lo que vino del servidor o de la copia, sin confiar en su forma: una fila
 * rota (un precio en texto que no es número, una plataforma que no existe) se
 * descarta en vez de romper el diálogo.
 */
export function normalizarPrecios(crudo: unknown): PrecioDePlataforma[] {
  if (!Array.isArray(crudo)) return [];
  const salida: PrecioDePlataforma[] = [];
  for (const fila of crudo) {
    if (!fila || typeof fila !== "object") continue;
    const { productoId, plataforma, precio } = fila as Record<string, unknown>;
    const id = Number(productoId);
    const monto = Number(precio);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (!PLATAFORMAS.includes(plataforma as Plataforma)) continue;
    if (precio == null || !Number.isFinite(monto) || monto < 0) continue;
    salida.push({ productoId: id, plataforma: plataforma as Plataforma, precio: centavos(monto) });
  }
  return salida;
}

/** La copia de este equipo. Sin almacenamiento (navegación privada) o rota: vacía. */
export function leerPreciosGuardados(negocioId: number): PrecioDePlataforma[] {
  try {
    const crudo = localStorage.getItem(clavePreciosPlataforma(negocioId));
    return crudo ? normalizarPrecios(JSON.parse(crudo)) : [];
  } catch {
    return [];
  }
}

/** Guardar la copia no puede romper el pedido: si falla, se sigue con lo de memoria. */
export function guardarPrecios(negocioId: number, precios: PrecioDePlataforma[]): void {
  try {
    localStorage.setItem(clavePreciosPlataforma(negocioId), JSON.stringify(precios));
  } catch {
    /* sin almacenamiento: la próxima vez se vuelven a pedir */
  }
}

/** El precio recordado de un producto en una app; `undefined` = vale el del local. */
export function precioRecordado(
  precios: readonly PrecioDePlataforma[],
  plataforma: Plataforma,
  productoId: number,
): number | undefined {
  return precios.find((p) => p.plataforma === plataforma && p.productoId === productoId)?.precio;
}

/** Un renglón del pedido registrado con «Recordar». */
export interface RenglonParaRecordar {
  productoId: number;
  /** El precio de una unidad en la app, el del diálogo. */
  precioApp: number;
  /** El del local: si el de la app es igual, no hace falta recordarlo. */
  precioLocal: number;
}

/**
 * La lista después de registrar con «Recordar», con la MISMA regla que el
 * backend (así la copia de acá dice lo mismo que el servidor sin volver a
 * pedirla): por producto, un precio igual al del local borra el recordado
 * (vuelve a seguir al local) y uno distinto lo pisa. Si el producto vino en
 * dos renglones, vale el último. Las demás plataformas no se tocan.
 */
export function preciosConLoRecordado(
  precios: readonly PrecioDePlataforma[],
  plataforma: Plataforma,
  renglones: readonly RenglonParaRecordar[],
): PrecioDePlataforma[] {
  const ultimo = new Map<number, RenglonParaRecordar>();
  for (const r of renglones) ultimo.set(r.productoId, r);
  const resto = precios.filter((p) => !(p.plataforma === plataforma && ultimo.has(p.productoId)));
  for (const [productoId, r] of ultimo) {
    if (mismoPrecio(r.precioApp, r.precioLocal)) continue;
    resto.push({ productoId, plataforma, precio: centavos(r.precioApp) });
  }
  return resto;
}

/**
 * Lo del servidor más lo que todavía espera en la cola sin señal. Un pedido
 * con «Recordar» que no subió, el servidor todavía no lo conoce: si la lista
 * que llega pisara la copia tal cual, el precio recién aprendido se perdería
 * hasta que el pedido suba. Se le vuelve a aplicar encima, en el orden en que
 * se tomaron, con la misma regla de siempre (`precio` de la cola es el del
 * local). Los rechazados no cuentan: nunca van a llegar al servidor.
 */
export function preciosConLaCola(
  delServidor: readonly PrecioDePlataforma[],
  cola: readonly PedidoPlataformaEncolado[],
): PrecioDePlataforma[] {
  let precios = [...delServidor];
  for (const p of cola) {
    if (p.estado === "RECHAZADA" || p.cuerpo.recordarPrecios !== true) continue;
    const renglones = p.cuerpo.detalles.flatMap((d) =>
      d.precioApp != null && Number.isFinite(d.precioApp)
        ? [{ productoId: d.productoId, precioApp: d.precioApp, precioLocal: d.precio ?? Number.NaN }]
        : [],
    );
    precios = preciosConLoRecordado(precios, p.cuerpo.plataforma, renglones);
  }
  return precios;
}

export interface PreciosDePlataforma {
  /** El precio recordado de ese producto en esa app; `undefined` = el del local. */
  de: (plataforma: Plataforma, productoId: number) => number | undefined;
  /** Tras registrar con «Recordar»: la copia cambia en el momento, sin esperar al servidor. */
  recordar: (plataforma: Plataforma, renglones: readonly RenglonParaRecordar[]) => void;
  /**
   * Volver a pedirlos (al abrir el diálogo de una app): un POS abierto todo el
   * día seguiría con la copia de la mañana si otro equipo aprendió un precio
   * después. No hace falta esperarlo: el diálogo se abre con la copia y se
   * pone al día cuando llega. Si ya hay un pedido en vuelo, no sale otro.
   */
  refrescar: () => Promise<void>;
}

/**
 * Los precios de la app para el POS. Arranca con la copia de este equipo (está
 * al toque, aun sin señal) y, si `activo` (hay alguna plataforma que este
 * usuario puede registrar), los pide al servidor y pisa la copia con lo que
 * llegue (más lo de la cola, ver `preciosConLaCola`). Si el pedido falla (un
 * backend viejo responde 404, sin señal) queda la copia; sin copia, cada
 * producto vale en la app lo del local.
 */
export function usePreciosPlataforma(negocioId: number | null | undefined, activo: boolean): PreciosDePlataforma {
  const id = negocioId ?? null;
  const [estado, setEstado] = useState(() => ({ id, precios: id != null ? leerPreciosGuardados(id) : [] }));
  // Otro negocio en la misma pestaña: se arranca de su copia, nunca de la del anterior.
  let actual = estado;
  if (estado.id !== id) {
    actual = { id, precios: id != null ? leerPreciosGuardados(id) : [] };
    setEstado(actual);
  }
  const precios = actual.precios;

  // Lo que se lee al llegar la respuesta, sin que un cambio en la cola vuelva a
  // disparar el pedido (por eso va en refs y no en las dependencias).
  const cola = usePedidosEncolados();
  const colaRef = useRef(cola);
  const idRef = useRef(id);
  useEffect(() => {
    colaRef.current = cola;
    idRef.current = id;
  });
  /** El pedido que está en camino, y de qué negocio es. */
  const enVuelo = useRef<{ id: number; pedido: Promise<void> } | null>(null);
  /**
   * Cuántas veces se recordó algo acá. Una respuesta que salió ANTES de un
   * «Recordar» no lo trae (el GET se fue antes que el pedido): pisar la copia
   * con ella borraría el precio recién aprendido. Se descarta y la próxima
   * vuelta trae lo nuevo.
   */
  const recordados = useRef(0);

  const refrescar = useCallback((): Promise<void> => {
    if (id == null || !activo) return Promise.resolve();
    if (enVuelo.current?.id === id) return enVuelo.current.pedido;
    const desde = recordados.current;
    // Dentro de la promesa: un fallo, por raro que sea, nunca rompe el POS.
    const pedido = Promise.resolve()
      .then(() => api.preciosPlataforma())
      .then((r) => {
        if (idRef.current !== id || recordados.current !== desde) return;
        const lista = preciosConLaCola(normalizarPrecios(r?.precios), colaRef.current);
        guardarPrecios(id, lista);
        setEstado({ id, precios: lista });
      })
      .catch(() => {
        /* backend viejo o sin señal: sigue la copia (o el precio del local) */
      })
      .finally(() => {
        if (enVuelo.current?.pedido === pedido) enVuelo.current = null;
      });
    enVuelo.current = { id, pedido };
    return pedido;
  }, [id, activo]);

  // Al entrar al POS (y si cambia el negocio o aparece una plataforma).
  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  const recordar = useCallback(
    (plataforma: Plataforma, renglones: readonly RenglonParaRecordar[]) => {
      if (id == null || renglones.length === 0) return;
      recordados.current += 1;
      const nuevos = preciosConLoRecordado(precios, plataforma, renglones);
      guardarPrecios(id, nuevos);
      setEstado({ id, precios: nuevos });
    },
    [id, precios],
  );

  return useMemo(
    () => ({ de: (plataforma, productoId) => precioRecordado(precios, plataforma, productoId), recordar, refrescar }),
    [precios, recordar, refrescar],
  );
}
