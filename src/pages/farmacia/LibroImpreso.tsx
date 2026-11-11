import { fmtCantidad, fmtFecha, fmtFechaHora, fmtNum } from "../../lib/format";
import type { AsientoControlado, LibroControlados } from "../../types";
import {
  medicamentoImpreso,
  resumenPorMedicamento,
  textoPeriodo,
  tituloLibro,
  totalUnidades,
} from "./impresionLibro";

export interface DatosLibroImpreso {
  /**
   * El negocio que firma el libro. Dirección y teléfono si se conocen; si no,
   * quedan renglones para completar a mano antes de presentarlo.
   */
  negocio: { nombre: string; direccion?: string | null; telefono?: string | null } | null;
  libro: "" | LibroControlados;
  /** La sucursal del libro. Vacía si es el consolidado o el negocio tiene un solo local. */
  sucursal: string;
  desde: string;
  hasta: string;
  impresoPor: string;
  /** Cuándo se imprime: lo fija la página al mandar a imprimir, no al cargar. */
  impresoEn: Date;
  filas: AsientoControlado[];
}

/**
 * Sólo el libro va al papel. Es el mismo truco del ticket (`index.css`): se
 * esconde todo y se muestra sólo el libro, sacado del flujo para que arranque
 * en el borde de la hoja y no arrastre el hueco del armazón invisible de la
 * app. No reutiliza `#area-impresion` porque esa área ancla el papel a los
 * 72 mm del rollo del mostrador, y el libro es una hoja A4 apaisada.
 *
 * `@page` va acá y no en `index.css`: ahí quedaría dentro del `@layer` de
 * Tailwind y el navegador la descartaría (ver el comentario de `index.html`).
 * Al estar en el componente, rige sólo mientras el libro está montado: las
 * demás pantallas siguen imprimiendo en su rollo de 80 mm.
 *
 * Y va ANIDADA en el `@media print`, no suelta: jsdom saltea lo que está bajo
 * un media que no es "screen", pero una `@page` a nivel raíz la trata como
 * regla de selector y revienta al calcular su especificidad, con lo que
 * cualquier `getByRole` de los tests de la pantalla se caía mientras el libro
 * estaba montado. Los navegadores aceptan `@page` dentro de `@media`.
 *
 * Todo en negro y con bordes de medio punto: el gris de pantalla sale lavado
 * en láser, y un libro que se archiva por años tiene que seguir leyéndose.
 */
const CSS_IMPRESION = `
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  body * { visibility: hidden; }
  .libro-impreso, .libro-impreso * { visibility: visible; }
  .libro-impreso {
    display: block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font: 9pt/1.3 Arial, Helvetica, sans-serif;
  }
  .libro-impreso .encabezado {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8mm;
    border-bottom: 1pt solid #000;
    padding-bottom: 3mm;
    margin-bottom: 4mm;
  }
  .libro-impreso .encabezado p { margin: 1pt 0; }
  .libro-impreso .datos { text-align: right; }
  .libro-impreso h1 { font-size: 14pt; margin: 0 0 2pt; text-transform: uppercase; }
  .libro-impreso h2 { font-size: 12pt; margin: 0 0 2pt; }
  .libro-impreso h3 { font-size: 10pt; margin: 5mm 0 2mm; }
  .libro-impreso .renglon {
    display: inline-block;
    min-width: 55mm;
    border-bottom: 0.5pt dotted #000;
    vertical-align: baseline;
  }
  .libro-impreso table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .libro-impreso thead { display: table-header-group; }
  .libro-impreso tr { break-inside: avoid; page-break-inside: avoid; }
  .libro-impreso th, .libro-impreso td {
    border: 0.5pt solid #000;
    padding: 2pt 4pt;
    vertical-align: top;
    text-align: left;
  }
  .libro-impreso th { font-weight: 700; background: #fff; }
  .libro-impreso .num { text-align: right; white-space: nowrap; }
  .libro-impreso .corto { white-space: nowrap; }
  .libro-impreso .chico { display: block; font-size: 7.5pt; }
  .libro-impreso .anulada .medicamento { text-decoration: line-through; }
  .libro-impreso .marca-anulada { display: block; font-weight: 700; font-size: 7.5pt; }
  .libro-impreso tfoot th { border-top: 1pt solid #000; }
  .libro-impreso .resumen { width: auto; min-width: 50%; }
  .libro-impreso .nota { margin: 2mm 0 0; font-size: 8pt; font-style: italic; }
  .libro-impreso .firmas {
    display: flex;
    justify-content: space-around;
    gap: 20mm;
    margin-top: 22mm;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .libro-impreso .firma { width: 70mm; text-align: center; }
  .libro-impreso .firma .linea { border-top: 0.5pt solid #000; margin-bottom: 2pt; }
  .libro-impreso .firma p { margin: 0; }
}
`;

/**
 * El libro de controlados en papel: el que firma el regente farmacéutico y la
 * farmacia presenta al SEDES. En pantalla no se ve (`hidden`); al imprimir es
 * lo único que se ve.
 *
 * Encabezado con la farmacia, el libro, el período y quién lo imprimió; el
 * detalle, un asiento por renglón y la venta anulada marcada; el resumen por
 * medicamento (lo que el inspector cruza con el stock); y las firmas.
 *
 * `aria-hidden` porque es papel, no pantalla: así tampoco se cuela en el
 * árbol de accesibilidad junto con la tabla que sí se ve.
 */
export default function LibroImpreso({
  negocio,
  libro,
  sucursal,
  desde,
  hasta,
  impresoPor,
  impresoEn,
  filas,
}: DatosLibroImpreso) {
  const resumen = resumenPorMedicamento(filas);
  const anuladas = filas.filter((a) => a.anuladaEn).length;
  // Igual que en pantalla: la sucursal de cada asiento sólo cuando hay más de
  // una en el período (el consolidado). Con una sola ya está en el encabezado.
  const variasSucursales = new Set(filas.map((a) => a.almacen.id)).size > 1;

  return (
    <section className="libro-impreso hidden" aria-hidden="true">
      <style>{CSS_IMPRESION}</style>

      <header className="encabezado">
        <div>
          <h1>{negocio?.nombre ?? ""}</h1>
          <p>Dirección: {negocio?.direccion || <span className="renglon" />}</p>
          <p>Teléfono: {negocio?.telefono || <span className="renglon" />}</p>
        </div>
        <div className="datos">
          <h2>{tituloLibro(libro)}</h2>
          {sucursal && (
            <p>
              Sucursal: <b>{sucursal}</b>
            </p>
          )}
          <p>
            Período: <b>{textoPeriodo(desde, hasta)}</b>
          </p>
          <p>
            Impreso el {fmtFechaHora(impresoEn)} por {impresoPor}
          </p>
        </div>
      </header>

      <table>
        <thead>
          <tr>
            <th className="num">N°</th>
            <th className="corto">Fecha</th>
            <th className="corto">Receta N°</th>
            <th className="corto">Fecha receta</th>
            <th>Paciente</th>
            <th className="corto">CI</th>
            <th>Médico</th>
            <th className="corto">Matrícula</th>
            <th>Medicamento</th>
            <th className="num">Cantidad</th>
            <th>Despachó</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a, i) => (
            <tr key={a.id} className={a.anuladaEn ? "anulada" : undefined}>
              <td className="num">{i + 1}</td>
              <td className="corto">{fmtFechaHora(a.fecha)}</td>
              <td className="corto">{a.recetaNumero ?? "—"}</td>
              <td className="corto">{fmtFecha(a.recetaFecha.slice(0, 10))}</td>
              <td>{a.pacienteNombre}</td>
              <td className="corto">{a.pacienteDocumento ?? "—"}</td>
              <td>{a.medicoNombre}</td>
              <td className="corto">{a.medicoMatricula}</td>
              <td>
                <span className="medicamento">{medicamentoImpreso(a.producto)}</span>
                {a.anuladaEn && (
                  <span className="marca-anulada">ANULADA el {fmtFecha(a.anuladaEn)}</span>
                )}
              </td>
              <td className="num">{fmtCantidad(a.cantidad)}</td>
              <td>
                {a.despachadoPor.nombre}
                <span className="chico">
                  {a.comprobante ?? `Venta ${a.ventaId}`}
                  {variasSucursales && ` · ${a.almacen.nombre}`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Resumen del período por medicamento</h3>
      <table className="resumen">
        <thead>
          <tr>
            <th>Medicamento</th>
            <th className="num">Asientos</th>
            <th className="num">Unidades despachadas</th>
          </tr>
        </thead>
        <tbody>
          {resumen.map((r) => (
            <tr key={r.medicamento}>
              <td>{r.medicamento}</td>
              <td className="num">{fmtNum(r.asientos)}</td>
              <td className="num">{fmtCantidad(r.unidades)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th className="num">{fmtNum(resumen.reduce((t, r) => t + r.asientos, 0))}</th>
            <th className="num">{fmtCantidad(totalUnidades(resumen))}</th>
          </tr>
        </tfoot>
      </table>
      {anuladas > 0 && (
        <p className="nota">
          Sin {anuladas === 1 ? "la venta anulada" : `las ${fmtNum(anuladas)} ventas anuladas`},
          que {anuladas === 1 ? "figura marcada" : "figuran marcadas"} en el detalle.
        </p>
      )}

      <footer className="firmas">
        <div className="firma">
          <div className="linea" />
          <p>
            <b>Regente farmacéutico</b>
          </p>
          <p>Nombre y sello</p>
        </div>
        <div className="firma">
          <div className="linea" />
          <p>
            <b>Propietario / Administrador</b>
          </p>
          <p>Nombre y sello</p>
        </div>
      </footer>
    </section>
  );
}
