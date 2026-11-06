import { useMemo, useRef, useState, type ReactNode } from "react";
import { Boton, Select } from "../../../components/ui";
import { fmtCantidad, fmtMoney, isoDia } from "../../../lib/format";
import { bajarPdf } from "../../../lib/pdf/tablaPdf";
import { textoPollos, textoPollosCorto } from "../../../lib/pollos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { apiReportes, type VendedorApi } from "../api";
import { useExportar, useReporte } from "../contexto";
import { leyendaDe, textoRango } from "../periodo";
import { Cargador, KpiR, Nota } from "../ui";
import {
  armarVentasGanancia,
  avisaSinCosto,
  documentoVentasGanancia,
  enPerdida,
  hojaVentasGanancia,
  sinCosto,
  textoGanancia,
  type CifrasGanancia,
  type VentasGanancia as Datos,
} from "./VentasGanancia.datos";

/**
 * Ventas y ganancia: el cuaderno del dueño (ver `VentasGanancia.datos.ts`),
 * igual que en la app. Una sola tabla con las categorías y sus subtotales:
 * una tarjeta por categoría haría que las columnas dejen de caer una debajo de
 * la otra.
 *
 * Arriba, el cajero (6-nov, Kevin: "así como filtramos por fecha, a su lado
 * otro campo con los cajeros"): quien COBRÓ la venta, el mismo "Cajero" del
 * historial de Ventas. Con los pollos, si algún artículo tiene sus presas
 * cargadas.
 */
export default function VentasGanancia() {
  const { rango, periodo, sucursalNombre } = useReporte();
  const { rubro, negocio } = useAuth();
  const [cajero, setCajero] = useState<VendedorApi | null>(null);
  const estado = useApi(
    () => apiReportes.topProductos(rango, cajero?.id),
    [rango.desde, rango.hasta, rango.sucursalId, cajero?.id],
  );
  const vendedores = useApi(() => apiReportes.vendedores(rango), [rango.desde, rango.hasta]);
  const datos = useMemo(() => (estado.datos ? armarVentasGanancia(estado.datos) : null), [estado.datos]);

  const subtitulo = [leyendaDe(periodo), textoRango(periodo.desde, periodo.hasta), sucursalNombre]
    .filter(Boolean)
    .join(" · ");

  useExportar(
    "ventas-y-ganancia",
    datos && datos.productos > 0 ? () => [hojaVentasGanancia(datos, cajero?.nombre)] : null,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FiltroCajero cajero={cajero} vendedores={vendedores.datos ?? []} onCajero={setCajero} />
        {datos && datos.productos > 0 && (
          <BotonPdf
            armar={() =>
              documentoVentasGanancia(datos, { negocio: negocio?.nombre, subtitulo, cajero: cajero?.nombre })
            }
          />
        )}
      </div>
      <Cargador
        estado={estado}
        vacio={(d) =>
          d.length === 0
            ? {
                titulo: cajero ? `${cajero.nombre} no vendió en este período` : "Sin ventas en este período",
                texto: cajero ? "Probá con otro período o con «Todos los cajeros»." : "Probá con otro período.",
                icono: "chart",
              }
            : null
        }
      >
        {() => (datos ? <Cuaderno datos={datos} avisa={avisaSinCosto(rubro)} /> : null)}
      </Cargador>
    </div>
  );
}

/**
 * El desplegable de cajeros. Con uno solo no hay nada que filtrar y no se
 * dibuja; si ya hay uno elegido se deja, y se suma a la lista aunque en este
 * período no haya vendido (si no, el desplegable diría "Todos" con el filtro
 * puesto). Igual que el de Ventas.
 */
function FiltroCajero({
  cajero,
  vendedores,
  onCajero,
}: {
  cajero: VendedorApi | null;
  vendedores: VendedorApi[];
  onCajero: (c: VendedorApi | null) => void;
}) {
  if (vendedores.length <= 1 && !cajero) return null;
  const opciones = cajero && !vendedores.some((v) => v.id === cajero.id) ? [...vendedores, cajero] : vendedores;
  return (
    <div className="w-full sm:w-64">
      <Select
        aria-label="Cajero"
        value={cajero ? String(cajero.id) : ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          onCajero(e.target.value ? (opciones.find((v) => v.id === id) ?? null) : null);
        }}
      >
        <option value="">Todos los cajeros</option>
        {opciones.map((v) => (
          <option key={v.id} value={v.id}>
            {v.nombre}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** "Exportar PDF": el mismo papel que manda la app. Un toque a la vez: armarlo tarda un instante. */
function BotonPdf({ armar }: { armar: () => Parameters<typeof bajarPdf>[1] }) {
  const [armando, setArmando] = useState(false);
  const [error, setError] = useState(false);
  const enCurso = useRef(false);
  async function exportar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setArmando(true);
    setError(false);
    try {
      await bajarPdf(`ventas-y-ganancia-${isoDia(new Date())}.pdf`, armar());
    } catch {
      setError(true);
    } finally {
      enCurso.current = false;
      setArmando(false);
    }
  }
  return (
    <>
      <Boton variante="soft" icono="download" onClick={exportar} disabled={armando}>
        {armando ? "Armando el PDF…" : "Exportar PDF"}
      </Boton>
      {error && <p className="basis-full text-[12px] font-bold text-rose-700">No se pudo armar el PDF. Probá de nuevo.</p>}
    </>
  );
}

function Cuaderno({ datos, avisa }: { datos: Datos; avisa: boolean }) {
  const perdida = enPerdida(datos);
  const pollos = textoPollos(datos.presas);
  return (
    <>
      <div className={`grid gap-3 ${pollos ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
        <KpiR etiqueta="Vendido" valor={fmtMoney(datos.total)} />
        <KpiR etiqueta="Costo" valor={fmtMoney(datos.costo)} />
        <KpiR
          etiqueta={perdida ? "Pérdida" : "Ganancia"}
          valor={textoGanancia(datos)}
          tono={perdida ? "alerta" : "marca"}
        />
        {pollos && <KpiR etiqueta="Pollos" valor={pollos} pie={`${fmtCantidad(datos.presas)} presas`} />}
      </div>

      {avisa && datos.ventasSinCosto > 0 && (
        <Nota tono="ambar">
          {fmtMoney(datos.ventasSinCosto)} de lo vendido es de productos sin costo cargado: su ganancia es el precio
          entero. Cargales el costo en Artículos para que la ganancia sea real.
        </Nota>
      )}

      <Tabla datos={datos} />

      <Nota>
        <p>
          Los montos son antes de promos y cupones: es lo vendido a precio de lista, así que puede dar más que lo
          cobrado. La ganancia es antes de gastos: el alquiler y los sueldos se restan en Finanzas.
        </p>
        {datos.conPollos && (
          <p className="mt-1.5">
            Los pollos salen de las presas de cada artículo (un pollo son 8 presas). Se cargan en Artículos, en
            «Presas de pollo».
          </p>
        )}
      </Nota>
    </>
  );
}

/**
 * La tabla. Si no entra se desliza a los costados con la columna de los
 * nombres fija: si no, al llegar a la ganancia ya no se ve de qué producto es.
 */
function Tabla({ datos }: { datos: Datos }) {
  const conPollos = datos.conPollos;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wider text-texto-3">
            <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left">Producto</th>
            <th className="px-3 py-3 text-right">Cant.</th>
            {conPollos && <th className="px-3 py-3 text-right">Pollos</th>}
            <th className="px-3 py-3 text-right">Total</th>
            <th className="px-3 py-3 text-right">Costo</th>
            <th className="px-4 py-3 text-right">Ganancia</th>
          </tr>
        </thead>
        <tbody>
          {datos.categorias.map((c) => (
            <Grupo key={c.nombre} nombre={c.nombre} cifras={c} conPollos={conPollos}>
              {c.productos.map((p, i) => (
                <tr key={`${p.nombre}-${i}`}>
                  <td className="sticky left-0 z-10 bg-card px-4 py-2 text-texto">{p.nombre}</td>
                  <Celdas c={p} conPollos={conPollos} esProducto />
                </tr>
              ))}
            </Grupo>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-extrabold">
            <td className="sticky left-0 z-10 border-t border-borde bg-card px-4 py-3 text-texto">TOTAL</td>
            <Celdas c={datos} conPollos={conPollos} fuerte borde />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Grupo({ nombre, cifras, conPollos, children }: { nombre: string; cifras: CifrasGanancia; conPollos: boolean; children: ReactNode }) {
  return (
    <>
      <tr className="font-bold text-primary-700">
        <td className="sticky left-0 z-10 border-b border-borde bg-card px-4 pb-1.5 pt-3 text-[12px] uppercase tracking-wider">
          {nombre}
        </td>
        <Celdas c={cifras} conPollos={conPollos} grupo />
      </tr>
      {children}
    </>
  );
}

/** Las cifras de un renglón. Un producto sin costo dice "Sin costo" y su ganancia va en gris, no en verde. */
function Celdas({
  c,
  conPollos,
  esProducto = false,
  grupo = false,
  fuerte = false,
  borde = false,
}: {
  c: CifrasGanancia;
  conPollos: boolean;
  esProducto?: boolean;
  grupo?: boolean;
  fuerte?: boolean;
  borde?: boolean;
}) {
  const sc = esProducto && sinCosto(c);
  const perdida = enPerdida(c);
  const base = `px-3 text-right ${grupo ? "border-b border-borde pb-1.5 pt-3" : fuerte ? "py-3" : "py-2"} ${borde ? "border-t border-borde" : ""}`;
  const cifra = grupo ? "" : fuerte ? "text-primary-700" : "font-bold text-texto";
  return (
    <>
      <td className={`${base} ${grupo ? "" : cifra}`}>{fmtCantidad(c.unidades)}</td>
      {conPollos && (
        <td className={`${base} ${c.presas > 0 ? (grupo ? "" : cifra) : "text-texto-3"}`} title={textoPollos(c.presas) ?? undefined}>
          {textoPollosCorto(c.presas)}
        </td>
      )}
      <td className={`${base} ${cifra}`}>{fmtMoney(c.total)}</td>
      <td className={`${base} ${sc ? "font-normal text-texto-3" : cifra}`}>{sc ? "Sin costo" : fmtMoney(c.costo)}</td>
      <td className={`${base} px-4 ${perdida ? "text-rose-700" : sc ? "font-normal text-texto-3" : cifra}`}>
        {perdida ? `−${textoGanancia(c)}` : textoGanancia(c)}
      </td>
    </>
  );
}
