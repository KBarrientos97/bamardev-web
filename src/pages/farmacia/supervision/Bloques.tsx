import { Icon } from "../../../components/Icon";
import { Badge } from "../../../components/ui";
import { aCentavos } from "../../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../../lib/format";
import { ChipFiltro, Fila } from "../../billar/ui";
import type {
  ControladoSupervision,
  EfectivoSupervision,
  EncargoSupervision,
  InventarioSupervision,
  SupervisionFarmacia,
  VentaSupervision,
} from "./api";
import {
  conDescuento,
  conteoDeBloques,
  cuando,
  estadoDeEncargo,
  llevaControlado,
  mediosDeVenta,
  plural,
  tipoDeInventario,
  unidades,
  unidadesDeVenta,
  ventasOrdenadas,
  type TonoEstado,
} from "./Supervision.datos";

/**
 * Lo que hizo el mostrador en el turno, de a bloques: las ventas, los
 * controlados despachados, los encargos, el efectivo movido a mano y los
 * movimientos de inventario aprobados a mano. Son pestañas y no cinco listas
 * una abajo de la otra porque en el celular las cinco juntas eran dos
 * pantallas de scroll antes de llegar a la actividad.
 *
 * Cada venta se toca y se abre ahí mismo con sus renglones y sus pagos: lo
 * trae la misma respuesta, así que no hace falta otro pedido ni un diálogo.
 */

export type Pestana = "ventas" | "controlados" | "encargos" | "efectivo" | "inventario";

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "controlados", etiqueta: "Controlados" },
  { clave: "encargos", etiqueta: "Encargos" },
  { clave: "efectivo", etiqueta: "Efectivo" },
  { clave: "inventario", etiqueta: "Inventario" },
];

const VACIO: Record<Pestana, string> = {
  ventas: "Todavía no hay ventas en este turno.",
  controlados: "No se despachó ningún controlado con receta en este turno.",
  encargos: "No hay encargos anotados ni pendientes.",
  efectivo: "No se movió efectivo a mano en este turno.",
  inventario: "No se aprobó ningún movimiento de inventario a mano en este turno.",
};

export function Bloques({
  datos,
  ahora,
  pestana,
  onPestana,
  ventaAbierta,
  onVenta,
}: {
  datos: SupervisionFarmacia;
  ahora: number;
  pestana: Pestana;
  onPestana: (p: Pestana) => void;
  /** La venta que se está mirando abierta (también la abre la actividad). */
  ventaAbierta: number | null;
  onVenta: (id: number | null) => void;
}) {
  const conteo = conteoDeBloques(datos);
  const vacio = conteo[pestana] === 0;
  return (
    <section aria-label="Lo que hizo el mostrador" className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-borde-soft px-4 py-3">
        {PESTANAS.map((p) => (
          <ChipFiltro key={p.clave} activo={pestana === p.clave} etiqueta={p.etiqueta} cuenta={conteo[p.clave]} onClick={() => onPestana(p.clave)} />
        ))}
      </div>
      {vacio ? (
        <p className="px-5 py-8 text-center text-[13px] text-texto-3">{VACIO[pestana]}</p>
      ) : pestana === "ventas" ? (
        <ul className="divide-y divide-borde-soft">
          {ventasOrdenadas(datos.ventas).map((v) => (
            <FilaVenta key={v.id} v={v} ahora={ahora} abierta={ventaAbierta === v.id} onToggle={() => onVenta(ventaAbierta === v.id ? null : v.id)} />
          ))}
        </ul>
      ) : pestana === "controlados" ? (
        <ul className="divide-y divide-borde-soft">
          {datos.controlados.map((c) => (
            <FilaControlado key={c.id} c={c} ahora={ahora} />
          ))}
        </ul>
      ) : pestana === "encargos" ? (
        <ul className="divide-y divide-borde-soft">
          {datos.encargos.map((e) => (
            <FilaEncargo key={e.id} e={e} ahora={ahora} />
          ))}
        </ul>
      ) : pestana === "efectivo" ? (
        <ul className="divide-y divide-borde-soft">
          {datos.efectivo.map((m) => (
            <FilaEfectivo key={m.id} m={m} ahora={ahora} />
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-borde-soft">
          {datos.inventario.map((m) => (
            <FilaInventario key={`${m.id}-${m.estado}`} m={m} ahora={ahora} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Ventas ──────────────────────────────────────────────────────────────────

/**
 * El chip rojo de "Controlado": una venta con un psicotrópico adentro es lo
 * primero que el administrador quiere ver sin abrirla. Sin receta asentada
 * lo dice, que es lo que después le van a pedir en una inspección.
 */
function ChipControlado({ conReceta }: { conReceta: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-700">
      <Icon name="alert" size={11} strokeWidth={2.5} />
      {conReceta ? "Controlado" : "Controlado sin receta"}
    </span>
  );
}

function FilaVenta({ v, ahora, abierta, onToggle }: { v: VentaSupervision; ahora: number; abierta: boolean; onToggle: () => void }) {
  const anulada = v.anulada != null;
  const controlado = llevaControlado(v);
  const cual = v.comprobante ?? `#${v.id}`;
  const marcas = anulada || v.fiada || conDescuento(v) || controlado;
  return (
    <li id={`venta-${v.id}`} className={abierta ? "bg-primary-50/30" : ""}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        aria-label={`${abierta ? "Cerrar" : "Ver"} el detalle de la venta ${cual}`}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
            <span className="tabular-nums text-texto-3">{cuando(v.hora, ahora)}</span>
            <b className="font-bold text-texto">{v.quien}</b>
            <span className={`rounded bg-slate-100 px-1.5 py-px text-[12px] font-semibold text-texto-2 ${anulada ? "line-through" : ""}`}>{cual}</span>
          </p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            {plural(v.items.length, "renglón", "renglones")} · {unidades(unidadesDeVenta(v))} · {mediosDeVenta(v)}
          </p>
          {marcas && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {anulada && <Badge tono="rojo">Anulada</Badge>}
              {v.fiada && <Badge tono="amarillo">Fiada</Badge>}
              {conDescuento(v) && <Badge tono="azul">Con descuento</Badge>}
              {controlado && <ChipControlado conReceta={v.conReceta} />}
            </p>
          )}
          {v.anulada && (
            <p className="mt-1.5 text-[12px] leading-snug text-rose-700">
              Autorizó la anulación <b className="font-semibold">{v.anulada.por}</b> · {cuando(v.anulada.en, ahora)}
              {v.anulada.motivo && <> · «{v.anulada.motivo}»</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-[15px] font-extrabold tabular-nums ${anulada ? "line-through text-texto-3" : "text-texto"}`}>{fmtMoney(v.total)}</span>
          <span aria-hidden className="text-texto-4">
            <Icon name={abierta ? "chevronDown" : "chevronRight"} size={16} />
          </span>
        </div>
      </button>
      {abierta && <DetalleVenta v={v} />}
    </li>
  );
}

/** Los renglones y los pagos de una venta, con lo que ya trae la respuesta. */
function DetalleVenta({ v }: { v: VentaSupervision }) {
  const pagado = aCentavos(v.pagos.reduce((t, p) => t + p.monto, 0));
  const controlado = llevaControlado(v);
  return (
    <div className="border-t border-borde-soft bg-slate-50/60 px-4 py-3 text-[13px] sm:px-5">
      <ul className="space-y-1.5">
        {v.items.map((i, k) => (
          <li key={`${i.productoId}-${k}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">
              <span className="font-semibold text-texto">
                {fmtCantidad(i.cantidad)}× {i.nombre}
              </span>
              {i.controlado && <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-px text-[11px] font-bold text-rose-700">Controlado</span>}
            </span>
            <span className="shrink-0 tabular-nums text-texto-2">{fmtMoney(i.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1 border-t border-borde-soft pt-2">
        {conDescuento(v) && <Fila etiqueta="Descuento" valor={`− ${fmtMoney(v.descuento)}`} />}
        <Fila etiqueta="Total" valor={fmtMoney(v.total)} fuerte />
        {v.pagos.map((p, k) => (
          <Fila key={`${p.medio}-${k}`} etiqueta={`Pagó con ${p.medio}`} valor={fmtMoney(p.monto)} />
        ))}
        {v.fiada && <Fila etiqueta="Quedó fiado" valor={fmtMoney(Math.max(0, aCentavos(v.total - pagado)))} />}
      </div>
      {controlado && (
        <p className={`mt-2 text-[12px] ${v.conReceta ? "text-texto-3" : "font-semibold text-rose-700"}`}>
          {v.conReceta ? "La receta quedó asentada en el libro de controlados." : "Sin receta asentada en el libro de controlados."}
        </p>
      )}
    </div>
  );
}

// ── Controlados ─────────────────────────────────────────────────────────────

function FilaControlado({ c, ahora }: { c: ControladoSupervision; ahora: number }) {
  return (
    <li className={`px-4 py-3 sm:px-5 ${c.anulada ? "opacity-60" : ""}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
        <span className="tabular-nums text-texto-3">{cuando(c.hora, ahora)}</span>
        <b className="font-bold text-texto">{c.quien}</b>
        {c.anulada && <Badge tono="rojo">Venta anulada</Badge>}
      </p>
      <p className={`mt-0.5 text-[14px] font-semibold text-texto ${c.anulada ? "line-through" : ""}`}>
        {unidades(c.cantidad)} de {c.producto}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] sm:grid-cols-3">
        <DatoChico etiqueta="Paciente" valor={c.paciente} />
        <DatoChico etiqueta="CI" valor={c.documento ?? "—"} />
        <DatoChico etiqueta="Receta" valor={c.receta ?? "sin número"} />
        <DatoChico etiqueta="Médico" valor={c.medico} />
        <DatoChico etiqueta="Matrícula" valor={c.matricula} />
      </dl>
    </li>
  );
}

function DatoChico({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-texto-3">{etiqueta}</dt>
      <dd className="break-words font-semibold text-texto">{valor}</dd>
    </div>
  );
}

// ── Encargos ────────────────────────────────────────────────────────────────

function FilaEncargo({ e, ahora }: { e: EncargoSupervision; ahora: number }) {
  const estado = estadoDeEncargo(e.estado);
  return (
    <li className="px-4 py-3 sm:px-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
        <Badge tono={estado.tono}>{estado.texto}</Badge>
        <span className="min-w-0 break-words font-semibold text-texto">
          {e.cantidad > 1 ? `${fmtCantidad(e.cantidad)}× ` : ""}
          {e.descripcion}
        </span>
      </p>
      <p className="mt-1 text-[12px] text-texto-3">
        Anotó <b className="font-semibold text-texto-2">{e.quien}</b> · {cuando(e.hora, ahora)}
        {e.cliente && <> · para {e.cliente}</>}
        {e.telefono && <> · {e.telefono}</>}
      </p>
      {(e.llegoEn != null || e.entregadoEn != null) && (
        <p className="mt-0.5 text-[12px] text-texto-3">
          {e.llegoEn != null && <>Llegó {cuando(e.llegoEn, ahora)}</>}
          {e.llegoEn != null && e.entregadoEn != null && " · "}
          {e.entregadoEn != null && <>Entregado {cuando(e.entregadoEn, ahora)}</>}
        </p>
      )}
    </li>
  );
}

// ── Efectivo ────────────────────────────────────────────────────────────────

function FilaEfectivo({ m, ahora }: { m: EfectivoSupervision; ahora: number }) {
  const egreso = m.tipo === "EGRESO";
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug text-texto">
          <b className="font-bold">{m.quien}</b> · {m.texto}
        </p>
        <p className="mt-0.5 text-[12px] tabular-nums text-texto-3">{cuando(m.hora, ahora)}</p>
      </div>
      {/* Lo que sale del cajón en rojo, lo que entra en verde: los colores de egreso e ingreso de toda la app. */}
      <span className={`shrink-0 text-[14px] font-bold tabular-nums ${egreso ? "text-rose-700" : "text-primary-700"}`}>
        {egreso ? "−" : "+"} {fmtMoney(m.monto)}
      </span>
    </li>
  );
}

// ── Inventario ──────────────────────────────────────────────────────────────

/** Una entrada suma stock (verde), una salida lo resta (rojo), un ajuste o una transferencia lo mueven (azul). */
const TONO_INVENTARIO: Record<string, TonoEstado> = {
  ENTRADA: "verde",
  SALIDA: "rojo",
  AJUSTE: "azul",
  TRANSFERENCIA: "azul",
};

function FilaInventario({ m, ahora }: { m: InventarioSupervision; ahora: number }) {
  const anulado = m.estado === "ANULADO";
  return (
    <li className={`px-4 py-3 sm:px-5 ${anulado ? "opacity-60" : ""}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
        <Badge tono={TONO_INVENTARIO[m.tipo] ?? "gris"}>{tipoDeInventario(m.tipo)}</Badge>
        {anulado && <Badge tono="rojo">Anulado</Badge>}
        <span className="tabular-nums text-texto-3">{cuando(m.hora, ahora)}</span>
        <b className="font-bold text-texto">{m.quien}</b>
      </p>
      <p className={`mt-1 text-[13px] font-semibold text-texto ${anulado ? "line-through" : ""}`}>
        {plural(m.items, "artículo", "artículos")} · {unidades(m.unidades)}
      </p>
      {m.productos.length > 0 && <p className="mt-0.5 break-words text-[12px] text-texto-2">{m.productos.join(", ")}</p>}
      <p className="mt-0.5 break-words text-[12px] text-texto-3">
        {m.almacen}
        {m.almacenDestino && <> → {m.almacenDestino}</>}
        {m.comprobante && <> · {m.comprobante}</>}
        {m.descripcion?.trim() && <> · «{m.descripcion.trim()}»</>}
      </p>
    </li>
  );
}
