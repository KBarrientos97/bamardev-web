import { useMemo } from "react";
import { esPositivo } from "../../../../lib/dinero";
import { fmtNum } from "../../../../lib/format";
import type { BillarReporteApi } from "../../api";
import { hoja, useExportar } from "../../contexto";
import { bsEntero, bsResta, duracion, pct } from "../../formato";
import { BarraFila, BarraPartida, Cargador, Chip, KpiR, Nota, Renglon, Tarjeta } from "../../ui";
import { filasPaquetes, filasPromos, parteFijo, sesionesLibres, textoDescuento, type FilaPaquete, type FilaPromo } from "./datosBillar";
import { NotaSucursal } from "./NotaSucursal";
import { useReporteBillar } from "./useReporteBillar";

/**
 * Tiempo fijo y promos: si los paquetes y los descuentos están sirviendo.
 *
 * Lo del tiempo fijo (cuántos, cuánto, quiénes siguieron jugando y lo que se
 * cobró de más) ya venía del backend; los paquetes por duración, el reparto
 * libre/fijo y las promociones son del rediseño y, si no llegan, esas
 * tarjetas no se dibujan: una promo "usada 0 veces" porque el servidor no
 * manda el dato se lee como una promo que nadie quiere.
 */
export default function TiempoFijo() {
  const estado = useReporteBillar();
  const r = estado.datos;
  const paquetes = useMemo(() => (r?.paquetes ? filasPaquetes(r.paquetes) : null), [r]);
  const promos = useMemo(() => (r?.promos ? filasPromos(r.promos, r.minutosPromedioSinPromo) : null), [r]);

  useExportar(
    "tiempo-fijo-y-promos",
    r && r.porMesa.length
      ? () => [
          hojaResumen(r),
          ...(paquetes?.length
            ? [
                hoja<FilaPaquete>(
                  "Paquetes",
                  [
                    ["Paquete", (p) => p.etiqueta],
                    ["Sesiones", (p) => p.cantidad],
                    ["Monto (Bs)", (p) => Math.round(p.monto * 100) / 100],
                  ],
                  paquetes,
                ),
              ]
            : []),
          ...(promos?.length
            ? [
                hoja<FilaPromo>(
                  "Promociones",
                  [
                    ["Promoción", (p) => p.nombre],
                    ["Descuento (%)", (p) => p.pct],
                    ["Tipo de mesa", (p) => p.tipo],
                    ["Veces usada", (p) => p.usos],
                    ["Descuento dado (Bs)", (p) => p.descuentoBs],
                    ["Minutos promedio con promo", (p) => (p.conPromo == null ? null : Math.round(p.conPromo))],
                    ["Minutos promedio sin promo", (p) => (p.sinPromo == null ? null : Math.round(p.sinPromo))],
                  ],
                  promos,
                ),
              ]
            : []),
        ]
      : null,
  );

  return (
    <Cargador
      estado={estado}
      vacio={(d) =>
        d.porMesa.length === 0
          ? { titulo: "No se cobró ninguna mesa en este período", texto: "Probá con Semana o Mes.", icono: "cronometro" }
          : null
      }
    >
      {(d) => <Contenido r={d} paquetes={paquetes} promos={promos} />}
    </Cargador>
  );
}

function hojaResumen(r: BillarReporteApi) {
  const f = r.fijos;
  const parte = parteFijo(f.vendidos, r.sesiones);
  const libres = sesionesLibres(r);
  const filas: [string, number | null][] = [
    ["Sesiones con tiempo fijo", f.vendidos],
    ["Parte de las sesiones (%)", parte == null ? null : Math.round(parte * 100)],
    ["Monto en tiempo fijo (Bs)", f.monto],
    ["Siguieron jugando (%)", f.vendidos > 0 ? Math.round((f.conExcedente / f.vendidos) * 100) : null],
    ["Cobrado en excedentes (Bs)", f.excedenteBs],
    ["Sesiones de tiempo libre", libres],
    ["Duración promedio de una sesión (min)", r.minutosPromedio != null && r.minutosPromedio > 0 ? Math.round(r.minutosPromedio) : null],
  ];
  return hoja<[string, number | null]>(
    "Resumen",
    [
      ["Concepto", (x) => x[0]],
      ["Valor", (x) => x[1]],
    ],
    filas,
  );
}

function Contenido({ r, paquetes, promos }: { r: BillarReporteApi; paquetes: FilaPaquete[] | null; promos: FilaPromo[] | null }) {
  const f = r.fijos;
  const parte = parteFijo(f.vendidos, r.sesiones);
  // Sin un tiempo fijo vendido no hay a quién se le cumplió el tiempo: "0 %"
  // se leía como que nadie se quedó a jugar.
  const siguieron = f.vendidos > 0 ? f.conExcedente / f.vendidos : null;
  const libres = sesionesLibres(r);
  const conPaquetes = paquetes != null && paquetes.length > 0;
  const conReparto = libres != null && libres + f.vendidos > 0;

  return (
    <>
      <NotaSucursal />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiR etiqueta="Sesiones con tiempo fijo" valor={fmtNum(f.vendidos)} pie={parte != null ? `${pct(parte)} de las sesiones` : undefined} />
        <KpiR etiqueta="Monto en tiempo fijo" valor={bsEntero(f.monto)} tono="marca" />
        <KpiR etiqueta="Siguieron jugando" valor={pct(siguieron)} pie="después de cumplir el tiempo" />
        <KpiR etiqueta="Cobrado en excedentes" valor={bsEntero(f.excedenteBs)} pie={f.conExcedente > 0 ? `de ${fmtNum(f.conExcedente)} ${f.conExcedente === 1 ? "mesa" : "mesas"}` : undefined} />
      </div>

      {(conPaquetes || conReparto || promos) && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {(conPaquetes || conReparto) && (
            <div className="space-y-4">
              {conPaquetes && <Paquetes filas={paquetes} />}
              {conReparto && <LibreVsFijo libres={libres} fijos={f.vendidos} minutosPromedio={r.minutosPromedio} />}
            </div>
          )}
          {promos && <Promociones filas={promos} />}
        </div>
      )}
    </>
  );
}

function Paquetes({ filas }: { filas: FilaPaquete[] }) {
  const max = Math.max(0, ...filas.map((p) => p.cantidad));
  return (
    <Tarjeta titulo="Paquetes más vendidos" subtitulo="Cuántas veces se vendió cada tiempo fijo">
      <div className="space-y-2.5">
        {filas.map((p) => (
          <BarraFila key={p.etiqueta} etiqueta={p.etiqueta} valor={fmtNum(p.cantidad)} fraccion={max > 0 ? p.cantidad / max : 0} tono="morado" ancho="w-28" />
        ))}
      </div>
    </Tarjeta>
  );
}

function LibreVsFijo({ libres, fijos, minutosPromedio }: { libres: number; fijos: number; minutosPromedio?: number }) {
  return (
    <Tarjeta titulo="Tiempo libre vs. tiempo fijo">
      <BarraPartida a={libres} b={fijos} etiquetaA="Libre" etiquetaB="Fijo" tonoB="morado" />
      {minutosPromedio != null && minutosPromedio > 0 && (
        <p className="mt-3 text-[13px] text-texto-3">
          Duración promedio de una sesión: <b className="text-texto">{duracion(minutosPromedio)}</b>.
        </p>
      )}
    </Tarjeta>
  );
}

function Promociones({ filas }: { filas: FilaPromo[] }) {
  return (
    <Tarjeta titulo="Promociones" cuerpo="">
      {filas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-texto-3 sm:px-5">Ninguna promoción se usó en este período.</p>
      ) : (
        <>
          <ul className="divide-y divide-borde-soft">
            {filas.map((p) => (
              // El backend separa la promo por tipo de mesa, nombre y %: la misma
              // promo con otro % (la cambiaron a mitad de mes) es otra fila.
              <li key={`${p.tipo}|${p.nombre}|${p.pct}`} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-bold text-texto">{p.nombre}</span>
                    <Chip tono="verde">{textoDescuento(p.pct)}</Chip>
                  </div>
                  {p.tipo && <span className="shrink-0 text-[12px] text-texto-3">{p.tipo}</span>}
                </div>
                <div className="mt-1.5">
                  <Renglon etiqueta="Veces usada" valor={fmtNum(p.usos)} />
                  {/* El descuento es plata que no entró: va en rojo. Uno en cero va en gris, no se regaló nada. */}
                  <Renglon etiqueta="Descuento dado" valor={bsResta(p.descuentoBs)} resta apagado={!esPositivo(p.descuentoBs)} />
                  {p.conPromo != null && <Renglon etiqueta="Juegan con promo" valor={duracion(p.conPromo)} />}
                  {p.conPromo != null && p.sinPromo != null && <Renglon etiqueta="Juegan sin promo" valor={duracion(p.sinPromo)} />}
                </div>
              </li>
            ))}
          </ul>
          <div className="px-4 pb-4 sm:px-5">
            {/* Sin la segunda frase, una promo "también en tiempo fijo" con pocos
                usos parecía no funcionar: en el fijo el descuento queda dentro
                del precio del paquete y la sesión no guarda la promo aparte. */}
            <Nota>
              Si los que usan la promo juegan bastante más tiempo, el descuento se paga solo con las horas extra y los
              consumos. Son las promos del tiempo libre: en el tiempo fijo el descuento ya va dentro del precio del paquete.
            </Nota>
          </div>
        </>
      )}
    </Tarjeta>
  );
}
