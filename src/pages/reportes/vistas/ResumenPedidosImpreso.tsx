import { fmtFechaHora, fmtMoney } from "../../../lib/format";
import {
  NOMBRE_PLATAFORMA,
  type PedidoPlataforma,
  type ReportePedidosPlataforma,
} from "../../../lib/pedidosPlataforma/tipos";
import { descuentosDelReporte, diaCorto, textoAnulado } from "./PedidosPlataforma.datos";

/**
 * El resumen del período en papel, para cuadrar con lo que paga la app
 * (PLAN-PEDIDOS-PLATAFORMA §5): cuántos pedidos y cuánto por día, y la lista
 * con el N° de cada uno para tildarla contra la liquidación de Yango o
 * PedidosYa. Un pedido anulado va en la lista, marcado, y no suma.
 *
 * Es el mismo truco del libro de controlados (`farmacia/LibroImpreso`): en
 * pantalla no se ve y, al imprimir, se esconde todo menos esto. `@page` va
 * acá y anidada en el `@media print` (ver el comentario de ese archivo: suelta
 * rompe jsdom y, en `index.css`, el navegador la descarta).
 */
const CSS_IMPRESION = `
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  body * { visibility: hidden; }
  .resumen-plataforma, .resumen-plataforma * { visibility: visible; }
  .resumen-plataforma {
    display: block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font: 10pt/1.35 Arial, Helvetica, sans-serif;
  }
  .resumen-plataforma h1 { font-size: 15pt; margin: 0 0 2pt; }
  .resumen-plataforma h2 { font-size: 11pt; margin: 6mm 0 2mm; }
  .resumen-plataforma p { margin: 1pt 0; }
  .resumen-plataforma table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .resumen-plataforma thead { display: table-header-group; }
  .resumen-plataforma tr { break-inside: avoid; page-break-inside: avoid; }
  .resumen-plataforma th, .resumen-plataforma td {
    border: 0.5pt solid #000;
    padding: 2pt 4pt;
    text-align: left;
    vertical-align: top;
  }
  .resumen-plataforma th { font-weight: 700; }
  .resumen-plataforma .num { text-align: right; white-space: nowrap; }
  /* La raya de «tachado» va en cada dato (.tachado) y no en la celda: una raya
     declarada en el padre no se puede cancelar desde el hijo, y el motivo de la
     anulación (.marca) tiene que leerse entero. */
  .resumen-plataforma .anulado td { color: #444; }
  .resumen-plataforma .tachado { text-decoration: line-through; }
  .resumen-plataforma .marca { display: block; font-weight: 700; font-size: 8pt; color: #000; }
  .resumen-plataforma tfoot th { border-top: 1pt solid #000; }
  .resumen-plataforma .nota { margin-top: 3mm; font-size: 8.5pt; font-style: italic; }
}
`;

export default function ResumenPedidosImpreso({
  reporte,
  negocio,
  sucursal,
  impresoPor,
  impresoEn,
}: {
  reporte: ReportePedidosPlataforma;
  negocio: string;
  /** La sucursal del filtro; vacía = todas. */
  sucursal: string;
  impresoPor: string;
  /** Cuándo se imprime: lo fija la pantalla al mandar a imprimir, no al cargar. */
  impresoEn: Date;
}) {
  const { periodo } = reporte;
  const nombre = NOMBRE_PLATAFORMA[reporte.plataforma];
  // La columna de sucursal sólo si el período trae pedidos de más de una.
  const variasSucursales = reporte.porSucursal.length > 1;
  // Lo que descontaron las apps (19-nov). Los días y el total ya son netos:
  // el renglón dice cuánto se restó, para cuadrar con la liquidación.
  const descuentos = descuentosDelReporte(reporte);
  return (
    <section className="resumen-plataforma hidden" aria-hidden="true">
      <style>{CSS_IMPRESION}</style>

      <h1>{negocio}</h1>
      <p>
        <b>Pedidos de {nombre}</b> · {periodo.etiqueta}
      </p>
      <p>Paga el {diaCorto(periodo.pagaEl)}{periodo.enCurso ? " (período en curso)" : ""}</p>
      {sucursal && <p>Sucursal: {sucursal}</p>}
      <p>
        Impreso el {fmtFechaHora(impresoEn)} por {impresoPor}
      </p>

      <h2>Resumen</h2>
      <table>
        <thead>
          <tr>
            <th>Día</th>
            <th className="num">Pedidos</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {reporte.porDia.map((d) => (
            <tr key={d.fecha}>
              <td>{diaCorto(d.fecha)}</td>
              <td className="num">{d.cantidad}</td>
              <td className="num">{fmtMoney(d.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total del período</th>
            <th className="num">{reporte.cantidad}</th>
            <th className="num">{fmtMoney(reporte.total)}</th>
          </tr>
        </tfoot>
      </table>
      {descuentos > 0 && <p className="nota">Descuentos: {fmtMoney(descuentos)} (el total ya los resta).</p>}
      {reporte.anulados.cantidad > 0 && (
        <p className="nota">
          No incluye {reporte.anulados.cantidad} {reporte.anulados.cantidad === 1 ? "pedido anulado" : "pedidos anulados"} (
          {fmtMoney(reporte.anulados.total)}).
        </p>
      )}

      <h2>Pedidos</h2>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>N° de pedido</th>
            {variasSucursales && <th>Sucursal</th>}
            <th>Registró</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {reporte.pedidos.map((p) => (
            <FilaPedido key={p.id} p={p} conSucursal={variasSucursales} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FilaPedido({ p, conSucursal }: { p: PedidoPlataforma; conSucursal: boolean }) {
  // Un anulado va tachado, menos su marca «Anulado: motivo».
  const t = (x: string) => (p.anuladoEn ? <span className="tachado">{x}</span> : x);
  return (
    <tr className={p.anuladoEn ? "anulado" : undefined}>
      <td>{t(fmtFechaHora(p.fecha))}</td>
      <td>
        {t(p.codigoExterno ?? "—")}
        {p.anuladoEn && <span className="marca">{textoAnulado(p)}</span>}
      </td>
      {conSucursal && <td>{t(p.almacen.nombre)}</td>}
      <td>{t(p.usuario?.nombre ?? "—")}</td>
      <td className="num">{t(fmtMoney(p.total))}</td>
    </tr>
  );
}
