import type { ResumenCaja } from "../../types";
import { motivoDeCodigo } from "./motivosMovimiento";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Un movimiento con motivo que quedó en pie, como renglón del cierre. */
export interface FilaEfectivoCierre {
  id: number;
  /** "Gasto · Hielo", "Retiro", "Sencillo". */
  etiqueta: string;
  /** Con signo: lo que entra suma y lo que sale resta, como el resto del cajón. */
  valor: number;
  quien: string | null;
  fecha: string;
}

export interface EfectivoDelCierre {
  /** Lo que entró y salió SIN motivo (ni propina): las filas "Ingresos/Egresos de efectivo" de siempre. */
  otrosIngresos: number;
  otrosEgresos: number;
  /** La cena del personal que quedó en pie (sin las anuladas). */
  cenaNeta: number;
  /** Lo demás que el administrador registró con motivo y sigue en pie: un renglón cada uno. */
  filas: FilaEfectivoCierre[];
}

/**
 * El efectivo que se movió sin una venta, como lo cuenta el cierre del billar.
 *
 * `ingresos` y `egresos` del arqueo son el total de TODOS los movimientos (así
 * los suma el APK). Desde el 25-oct el administrador registra desde
 * Supervisión, con motivo, lo que sale o entra de la caja de la cajera: un
 * gasto, un retiro, el sencillo, además de la cena. Antes el cierre de ella
 * mostraba un "Egresos de efectivo −Bs 300" suelto, sin decir qué fue ni
 * quién: acá cada uno sale en su renglón con quién lo registró, y lo que
 * queda en "otros" es sólo lo que no tiene motivo.
 *
 * Lo anulado no se muestra: el movimiento y su anulación se cancelan (están
 * los dos dentro de ingresos/egresos, uno de cada lado por el mismo monto).
 *
 * Sin `efectivoRegistros` (un backend anterior, o una caja sin motivos) la
 * cuenta es la del 24-oct: la cena aparte y el resto en "otros".
 */
export function efectivoDelCierre(
  r: Pick<
    ResumenCaja,
    "ingresos" | "egresos" | "propinasEfectivo" | "propinasSalidas" | "cenasSalidas" | "cenasDevueltas" | "efectivoRegistros"
  >,
): EfectivoDelCierre {
  const propinasEntran = r.propinasEfectivo ?? 0;
  const propinasSalen = r.propinasSalidas ?? 0;
  const registros = r.efectivoRegistros ?? [];

  if (registros.length === 0) {
    const cenasSalidas = r.cenasSalidas ?? 0;
    const cenasDevueltas = r.cenasDevueltas ?? 0;
    return {
      otrosIngresos: r2(r.ingresos - propinasEntran - cenasDevueltas),
      otrosEgresos: r2(r.egresos - propinasSalen - cenasSalidas),
      cenaNeta: r2(cenasSalidas - cenasDevueltas),
      filas: [],
    };
  }

  // Cada registro está de su lado y, si se anuló, su anulación del otro por el
  // mismo monto. Las cenas ya van acá: no se restan otra vez con cenasSalidas.
  let conMotivoEntra = 0;
  let conMotivoSale = 0;
  for (const x of registros) {
    const deIda = x.monto;
    const deVuelta = x.anulado ? x.monto : 0;
    if (x.tipo === "INGRESO") {
      conMotivoEntra += deIda;
      conMotivoSale += deVuelta;
    } else {
      conMotivoSale += deIda;
      conMotivoEntra += deVuelta;
    }
  }

  const vivos = registros.filter((x) => !x.anulado);
  return {
    otrosIngresos: r2(r.ingresos - propinasEntran - conMotivoEntra),
    otrosEgresos: r2(r.egresos - propinasSalen - conMotivoSale),
    cenaNeta: r2(vivos.filter((x) => x.codigo === "CENA").reduce((t, x) => t + x.monto, 0)),
    filas: vivos
      .filter((x) => x.codigo !== "CENA")
      .map((x) => {
        const etiqueta = motivoDeCodigo(x.codigo)?.etiqueta ?? x.descripcion;
        return {
          id: x.id,
          etiqueta: x.descripcion && x.descripcion !== etiqueta ? `${etiqueta} · ${x.descripcion}` : etiqueta,
          valor: x.tipo === "INGRESO" ? x.monto : -x.monto,
          quien: x.quien,
          fecha: x.fecha,
        };
      }),
  };
}
