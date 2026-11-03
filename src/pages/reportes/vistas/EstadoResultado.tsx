import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Badge, Boton, Modal } from "../../../components/ui";
import { horarioGrupo } from "../../../lib/academia/formato";
import { api } from "../../../lib/api";
import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../../../lib/format";
import { badgeEstado } from "../../../lib/gastos";
import { desgloseGastos, estadoLinea, grupoDe, listaNombres, pareceDeBanco, type EstadoLinea, type GrupoGasto } from "../../../lib/grupoGasto";
import { mesEnCurso, type MesEnCurso } from "../../../lib/mesEnCurso";
import { tieneFeature } from "../../../lib/permisos";
import { rangoParaApi, sinJornada } from "../../../lib/rangoApi";
import { estadoResultado, type EstadoResultado as Er } from "../../../lib/resultado";
import { termino } from "../../../lib/rubro";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import type { Gasto } from "../../../types";
import { apiReportes, fraccion, type ClasesAcademiaApi, type CreditosApi, type EfectivoBillarApi, type FinancieroApi, type ResumenApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsConSigno, bsEntero, bsResta, bsSubtotal } from "../formato";
import { ProgresoMeta } from "../graficos";
import { aDia, diasDelMes, esMesEnCurso, mesDe, prosaRango, type Periodo } from "../periodo";
import { Cargador, Chip, Delta, Nota, Tarjeta } from "../ui";
import {
  conceptosDeCaja,
  explicarResultado,
  gananciaPorParte,
  gastosDeCaja,
  horasJugadas,
  listaSinCosto,
  movimientosSinEfecto,
  notaMeta,
  partirClases,
  partirVentas,
  perfilResultado,
  separarSueldosDocentes,
  textoCompras,
  type MovimientoSinEfecto,
  type PerfilResultado,
  type VentasPartidas,
} from "./EstadoResultado.datos";

/**
 * Estado de resultado: cuánto ganaste de verdad.
 *
 * El diseño es el de la app (ea9b8ac, con el .md de Kevin del 11-oct): una sola
 * cascada, de arriba abajo, donde cada número sale del de arriba y cada línea
 * se toca para ver de dónde sale. Antes los números que formaban la utilidad
 * operativa estaban en otra tarjeta y el "−1.260" parecía salir de la nada.
 *
 *     + Ventas                   (en el billar: + Tiempo de mesa + Bebidas = Ventas)
 *     − Costo de lo vendido
 *     = Ganancia de lo vendido   (utilidad bruta, con el nombre del rubro)
 *     − Mermas                   (si hubo)
 *     − Gastos del local
 *     − Sueldos docentes         (academia: lo pagado de la planilla)
 *     − Cenas del personal       (billar, si hubo)
 *     − Gastos pagados de la caja (billar, si hubo)
 *     = Resultado del local      (utilidad operativa)
 *     − Banco y deudas           (si hubo)
 *     − Impuestos                (si hubo)
 *     = Ganancia líquida o pérdida, con la cuenta dicha en palabras
 *
 * Cada rubro la cuenta con sus palabras (`EstadoResultado.datos.ts`): el
 * restaurante habla de platos, la farmacia de medicamentos y el billar parte
 * la venta en tiempo de mesa y productos, porque el tiempo no tiene costo y es
 * lo que el dueño de un billar viene a mirar. La cuenta es la misma para todos.
 *
 * Las compras NO restan (lo comprado y no vendido sigue en el stock: el costo
 * entra con cada venta) y el fiado ya está dentro de las ventas: van a la
 * derecha como "solo informativo", separados de la cuenta. Igual lo que la
 * caja del billar movió sin ser un gasto (pagos a proveedores, retiros, el
 * sencillo): el administrador lo registra en Supervisión con su motivo, y el
 * motivo dice si resta (`motivosMovimiento.ts`).
 *
 * Si falla una mitad (el financiero, los gastos o el efectivo del billar)
 * falla el reporte entero: un resultado sin los gastos mostraría una utilidad
 * inflada como si fuera real.
 */
export default function EstadoResultado() {
  const { rango, rangoAnterior, periodo, comparacion, veReporte, corteMin } = useReporte();
  const { rubro, negocio } = useAuth();
  const perfil = perfilResultado(rubro);
  const suc = useSucursales();
  // Billar: lo que el administrador registró en la caja desde Supervisión, por
  // motivo. Las cenas (24-oct) y los gastos pagados de la caja (25-oct) son
  // gastos que no están entre los cargados. Sólo un billar lo pide: los demás
  // rubros no hacen ninguna consulta más ni ven ninguna línea nueva.
  const pideEfectivo = perfil.partir === "billar";
  // Academia (L5, 28-oct): el detalle de lo cobrado por curso y módulo y qué
  // gastos son la planilla docente. No es una mitad de la cuenta: sin él la
  // cuenta da lo mismo y sólo se pierde el detalle (la planilla queda dentro
  // de los gastos del local, como antes), así que si falla, el reporte sigue.
  const pideClases = perfil.partir === "clases";

  const datos = useApi(() => {
    // Los gastos de los MISMOS días que las ventas: medianoche local del
    // primer día a medianoche local del día siguiente al último. Sin el corte
    // de la jornada de un billar: el gasto lleva fecha, no hora (ver `sinJornada`).
    const { desde, hasta } = rangoParaApi(sinJornada(rango));
    return Promise.all([
      apiReportes.financiero(rango, rangoAnterior),
      api.getGastos({ desde: desde ?? "", hasta: hasta ?? "", sucursalId: rango.sucursalId ?? null }),
      // Cuántas ventas fueron y de dónde vino la plata (tiempo de mesa,
      // servicios). Sólo cuenta y parte la primera línea: no entra a ninguna
      // resta. Si no llega, la línea de ventas va entera, como antes, y el
      // reporte sigue (no es una mitad de la cuenta).
      apiReportes.resumen(rango, rangoAnterior).catch(() => null),
      // Sí es una mitad de la cuenta: sin las cenas y los gastos de la caja la
      // ganancia sale inflada, así que si falla, falla el reporte entero (como
      // los gastos). Una sola llamada, y no la de las cenas: ésa va por local y
      // con "Todas las sucursales" restaba sólo las de la principal contra las
      // ventas de todos los locales.
      pideEfectivo ? apiReportes.efectivoBillar(rango) : Promise.resolve(null),
      pideClases ? apiReportes.clasesAcademia(rango).catch(() => null) : Promise.resolve(null),
    ]);
  }, [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta, pideEfectivo, pideClases]);

  // Las horas jugadas, para el renglón del tiempo de mesa. El reporte del
  // billar no tiene consolidado (ver NotaSucursal): con "Todas las sucursales"
  // serían las horas de la principal al lado de la plata de todos los locales,
  // así que ahí la línea va sin horas. Si falla, también: es un detalle.
  const conHoras = perfil.partir === "billar" && veReporte("mesas") && (!suc.elegir || rango.sucursalId != null);
  const billar = useApi(
    () => (conHoras ? apiReportes.billar(rango, rangoAnterior) : Promise.resolve(null)),
    [conHoras, rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta],
  );

  const conFiado = tieneFeature(negocio?.features, "fiado") && veReporte("creditos");
  const creditos = useApi(
    () => (conFiado ? apiReportes.creditos(rango) : Promise.resolve(null)),
    [conFiado, rango.desde, rango.hasta, rango.sucursalId],
  );

  const [fin, gastos, resumen, efectivo, clases] = datos.datos ?? [null, null, null, null, null];
  const er = fin && gastos ? estadoResultado(fin, gastos, gastosDeCaja(efectivo)) : null;
  const partes = er && fin ? partesDe(perfil, er, fin, resumen) : null;

  useExportar(
    "estado-de-resultado",
    er && fin && gastos ? () => hojasExcel(er, fin, gastos, perfil, partes, efectivo, clases) : null,
  );

  return (
    <Cargador
      estado={datos}
      vacio={([f, g, , e]) =>
        estadoResultado(f, g, gastosDeCaja(e)).vacio ? { titulo: "Sin movimiento", texto: "No hay ventas ni gastos en este período.", icono: "billetera" } : null
      }
    >
      {([f, g, r, e, c]) => (
        <Contenido
          er={estadoResultado(f, g, gastosDeCaja(e))}
          fin={f}
          gastos={g}
          efectivo={e}
          clases={c}
          resumen={r}
          perfil={perfil}
          periodo={periodo}
          contra={comparacion.contra}
          corteMin={corteMin ?? 0}
          horasMesas={horasJugadas(billar.datos)}
          creditos={creditos.datos}
          veReporte={veReporte}
        />
      )}
    </Cargador>
  );
}

/**
 * Cómo se parte la primera línea: el billar y la belleza con la composición
 * del resumen, la academia con lo cobrado en cuotas del financiero. Los demás
 * rubros, entera.
 */
function partesDe(perfil: PerfilResultado, er: Er, fin: FinancieroApi, resumen: ResumenApi | null): VentasPartidas | null {
  if (perfil.partir === "clases") return partirClases(er.ventas, fin.cobradoCuotas);
  return perfil.partir ? partirVentas(er.ventas, resumen?.composicion) : null;
}

/**
 * Lo que viaja al saltar a otro reporte: con esto la flecha de aquel vuelve
 * acá y no al resumen (ver `EncabezadoReporte`). Como en la app, que al volver
 * de Ventas dejaba al dueño en el resultado que estaba mirando.
 */
const DESDE_RESULTADO = { volverA: "Estado de resultado" };

/** Las líneas que se explican con los gastos cargados (o con el costo y las mermas). */
type DetalleGasto =
  | { tipo: "costo" }
  | { tipo: "mermas" }
  | { tipo: "grupo"; grupo: GrupoGasto }
  | { tipo: "categoria"; codigo: string; nombre: string };

type Detalle = DetalleGasto | { tipo: "gastosCaja" } | { tipo: "clases" } | { tipo: "sueldos" };

function Contenido({
  er,
  fin,
  gastos,
  efectivo,
  clases,
  resumen,
  perfil,
  periodo,
  contra,
  corteMin,
  horasMesas,
  creditos,
  veReporte,
}: {
  er: Er;
  fin: FinancieroApi;
  gastos: Gasto[];
  /** Billar: lo que se registró en la caja por motivo. Null en los demás rubros. */
  efectivo: EfectivoBillarApi | null;
  /** Academia: lo cobrado por curso y módulo y la planilla. Null en los demás rubros (o si no llegó). */
  clases: ClasesAcademiaApi | null;
  resumen: ResumenApi | null;
  perfil: PerfilResultado;
  periodo: Periodo;
  contra: string;
  corteMin: number;
  horasMesas: string | null;
  creditos: CreditosApi | null;
  veReporte: (id: string) => boolean;
}) {
  const navigate = useNavigate();
  const { puede } = useAuth();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  /** El salto a otro reporte, con el mismo período (vive en la pestaña). Sin permiso, la línea no se toca. */
  const ir = (id: string) => (veReporte(id) ? () => navigate(`/reportes/${id}`, { state: DESDE_RESULTADO }) : undefined);

  const desglose = desgloseGastos(gastos);
  // "Este mes" de un billar a la 1 a. m. del día 1 todavía es el mes que se
  // está cerrando: el de la jornada que corre.
  const enCurso = esMesEnCurso(periodo, new Date(), corteMin);
  const hoy = aDia(periodo.hasta);
  // La meta cubre también las mermas: son plata que se fue, igual que un gasto.
  // Del billar, las cenas salen cada noche y la meta las lleva al mes entero;
  // lo pagado de la caja (un arreglo, hielo) cuenta una vez (ver `mesEnCurso`).
  const mes = enCurso
    ? mesEnCurso({
        diaActual: hoy.getDate(),
        diasDelMes: diasDelMes(periodo),
        ventas: er.ventas,
        utilidadBruta: er.utilidadBruta,
        gastosDelMes: desglose.total + er.mermas,
        gastosDiarios: er.cenasPersonal,
        gastosDeCaja: er.gastosCaja,
      })
    : null;
  // Once días de ventas contra el alquiler del mes entero: se dice, para que la
  // pérdida de mitad de mes no se lea como la del mes. Con o sin la tarjeta de
  // arriba (que no sale sin gastos o sin ventas).
  const parcial = enCurso && hoy.getDate() < diasDelMes(periodo) && !er.vacio ? hoy.getDate() : null;
  const sospechosos = gastos.filter(pareceDeBanco);
  // Academia: la planilla docente pagada sale de los gastos del local y va en
  // su propia línea. La cuenta es la misma (`er` tiene todos los gastos): sólo
  // se nombra aparte. En los demás rubros no se separa nada.
  const academia = perfil.partir === "clases";
  const separados = academia ? separarSueldosDocentes(gastos, clases?.sueldos.gastoIds) : null;
  const sueldosDocentes = separados?.sueldosDocentes ?? 0;
  const gastosVista = separados?.gastosLocal ?? gastos;
  const erLocal = esPositivo(sueldosDocentes) ? estadoResultado(fin, gastosVista, gastosDeCaja(efectivo)) : er;
  const gastosLocal = aCentavos(er.gastosOperativos - sueldosDocentes);
  const pendiente = academia ? (clases?.sueldos.pendiente ?? null) : null;
  const local = gastosVista.filter((g) => grupoDe(g.categoria) === "LOCAL");
  const pctVentas = (monto: number) => (esPositivo(er.ventas) ? monto / er.ventas : null);
  const partes = partesDe(perfil, er, fin, resumen);
  const billar = perfil.partir === "billar";
  const ganancia = (billar || academia) && partes ? gananciaPorParte(partes, er.costoVentas) : null;
  const numVentas = resumen?.tickets?.valor ?? 0;
  const rangoTexto = prosaRango(periodo.desde, periodo.hasta);
  const ventasDetalle = numVentas > 0 ? `${rangoTexto} · ${fmtNum(numVentas)} ${numVentas === 1 ? "venta" : "ventas"}` : rangoTexto;
  const nombres = erLocal.lineas.map((l) => l.nombre);
  const deltaBruta = fraccion(fin.utilidadBrutaDeltaPct);
  const gastosDeLaCaja = efectivo?.gastos ?? [];
  const conceptosCaja = conceptosDeCaja(gastosDeLaCaja);
  const sinEfecto = movimientosSinEfecto(efectivo?.porMotivo);
  // Qué se vendió sin costo, con nombre: sólo en el restaurante (ver
  // `nombraSinCosto`). En los demás rubros el aviso queda con el total, como
  // siempre, aunque el backend mande la lista.
  const productosSinCosto = perfil.nombraSinCosto ? fin.productosSinCosto : null;
  // Los tres que más pesan, en el renglón de la cascada; la lista entera va en
  // el detalle del costo, con el enlace para cargarles el costo.
  const sinCostoCorta = listaSinCosto(productosSinCosto, er.ventasSinCosto, 3);

  return (
    <>
      {mes && (
        <TarjetaMes
          mes={mes}
          nombreMes={mesDe(periodo)}
          cosas={perfil.cosas}
          nota={notaMeta({ cargados: desglose.total, mermas: er.mermas, cenas: er.cenasPersonal, gastosCaja: er.gastosCaja, mes })}
        />
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Tarjeta titulo="Cómo se llega al resultado" subtitulo="Tocá una línea para ver de dónde sale" cuerpo="px-2 py-2 sm:px-3">
            {partes && academia ? (
              <>
                <Paso
                  signo="+"
                  titulo="Cobrado por clases"
                  detalle={detalleClases(clases)}
                  valor={fmtMoney(partes.servicios)}
                  cero={esCero(partes.servicios)}
                  onClick={clases?.cursos.length ? () => setDetalle({ tipo: "clases" }) : undefined}
                />
                <Paso
                  signo="+"
                  titulo="Ventas de productos"
                  detalle="Poleras, kits y material"
                  valor={fmtMoney(partes.productos)}
                  cero={esCero(partes.productos)}
                  onClick={ir("top-productos")}
                />
                <Paso signo="=" total titulo="Ventas" detalle={ventasDetalle} valor={fmtMoney(er.ventas)} onClick={ir("ventas")} />
              </>
            ) : partes ? (
              <>
                <Paso
                  signo="+"
                  titulo={billar ? "Tiempo de mesa" : "Servicios"}
                  detalle={billar ? (horasMesas ?? "Lo que cobraste por las mesas") : "Lo que cobraste por los servicios"}
                  valor={fmtMoney(partes.servicios)}
                  onClick={ir(billar ? "mesas" : "servicios")}
                />
                <Paso
                  signo="+"
                  titulo={billar ? "Bebidas y productos" : "Productos"}
                  detalle={billar ? "En mesa y en venta rápida" : "Lo que vendiste en productos"}
                  valor={fmtMoney(partes.productos)}
                  onClick={ir("top-productos")}
                />
                <Paso signo="=" total titulo="Ventas" detalle={ventasDetalle} valor={fmtMoney(er.ventas)} onClick={ir("ventas")} />
              </>
            ) : (
              <Paso signo="+" titulo="Ventas" detalle={ventasDetalle} valor={fmtMoney(er.ventas)} onClick={ir("ventas")} />
            )}
            <Paso
              signo="−"
              titulo={perfil.costoTitulo}
              detalle={perfil.costoDetalle}
              valor={bsResta(er.costoVentas)}
              resta
              cero={esCero(er.costoVentas)}
              onClick={() => setDetalle({ tipo: "costo" })}
            />
            {esPositivo(er.ventasSinCosto) && (
              <p className="mx-2 my-1 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
                Ojo: {fmtMoney(er.ventasSinCosto)} de estas ventas son de {perfil.cosas} sin costo cargado. Esa parte figura con 100 % de
                ganancia.
                {sinCostoCorta && <span className="mt-1 block">Sin costo cargado: {sinCostoCorta}.</span>}
              </p>
            )}
            <Paso
              signo="="
              titulo={perfil.gananciaTitulo}
              detalle={er.margenBrutoPct != null ? `Utilidad bruta · ${porcentaje(er.margenBrutoPct)} de las ventas` : "Utilidad bruta"}
              valor={bsSubtotal(er.utilidadBruta)}
              subtotal={er.utilidadBruta}
              extra={
                <>
                  {ganancia && (
                    <p className="mt-0.5 text-[12.5px] text-texto-2">
                      {academia ? "Clases" : "Mesas"} <b className="tabular-nums">{fmtMoney(ganancia.mesas)}</b> · productos{" "}
                      <b className="tabular-nums">{bsSubtotal(ganancia.productos)}</b>
                    </p>
                  )}
                  {deltaBruta != null && (
                    <span className="mt-1 flex items-center gap-1.5 text-[12px] text-texto-3">
                      <Delta fraccion={deltaBruta} />
                      vs. {contra}
                    </span>
                  )}
                </>
              }
            />
            {esPositivo(er.mermas) && (
              <Paso
                signo="−"
                titulo="Mermas"
                detalle="Lo vencido, dañado o robado que se dio de baja, al costo"
                valor={bsResta(er.mermas)}
                resta
                onClick={ir("mermas") ?? (() => setDetalle({ tipo: "mermas" }))}
              />
            )}
            <Paso
              signo="−"
              titulo="Gastos del local"
              detalle={nombres.length ? resumirNombres(nombres) : "No cargaste gastos en este período"}
              valor={bsResta(gastosLocal)}
              resta
              cero={esCero(gastosLocal)}
              onClick={() => setDetalle({ tipo: "grupo", grupo: "LOCAL" })}
            />
            {/* Academia (L5, 28-oct): lo PAGADO de la planilla docente en el
                período, por la fecha del pago. La planilla cerrada o en curso
                sin pagar no resta: va al costado, como informativo. */}
            {academia && (
              <Paso
                signo="−"
                titulo="Sueldos docentes"
                detalle={esPositivo(sueldosDocentes) ? "Lo pagado de la planilla en el período" : "No se pagó planilla en este período"}
                valor={bsResta(sueldosDocentes)}
                resta
                cero={esCero(sueldosDocentes)}
                onClick={clases ? () => setDetalle({ tipo: "sueldos" }) : undefined}
              />
            )}
            {/* Billar (24-oct): sólo si en el período se dio al menos una cena;
                sin cenas la línea no se dibuja (un "Bs 0,00" sobra). Toca y va al
                reporte, si lo ve. */}
            {esPositivo(er.cenasPersonal) && (
              <Paso
                signo="−"
                titulo="Cenas del personal"
                detalle="Efectivo que salió de la caja para la cena"
                valor={bsResta(er.cenasPersonal)}
                resta
                onClick={ir("cenas")}
              />
            )}
            {/* Billar (25-oct): lo que el administrador pagó de la caja como
                gasto del local (motivo Gasto en Supervisión). Como las cenas,
                sólo si hubo. Toca y abre el detalle de cada uno: no hay un
                reporte propio, y en Movimientos de caja están mezclados con
                todo lo demás. */}
            {esPositivo(er.gastosCaja) && (
              <Paso
                signo="−"
                titulo="Gastos pagados de la caja"
                detalle={conceptosCaja.length ? resumirNombres(conceptosCaja) : "Efectivo que salió de la caja para el local"}
                valor={bsResta(er.gastosCaja)}
                resta
                onClick={() => setDetalle({ tipo: "gastosCaja" })}
              />
            )}
            <Paso
              signo="="
              titulo="Resultado del local"
              detalle={desglose.separado ? "Utilidad operativa · sin contar el banco" : "Utilidad operativa"}
              valor={bsSubtotal(er.utilidadOperativa)}
              subtotal={er.utilidadOperativa}
            />
            {esPositivo(er.gastosFinancieros) && (
              <Paso
                signo="−"
                titulo="Banco y deudas"
                detalle="Cuotas, intereses, comisiones"
                valor={bsResta(er.gastosFinancieros)}
                resta
                onClick={() => setDetalle({ tipo: "grupo", grupo: "BANCO" })}
              />
            )}
            {esPositivo(er.gastosFinancieros) && esPositivo(er.impuestos) && (
              <Paso signo="=" titulo="Antes de impuestos" valor={bsSubtotal(er.utilidadAntesImpuestos)} subtotal={er.utilidadAntesImpuestos} />
            )}
            {esPositivo(er.impuestos) && (
              <Paso
                signo="−"
                titulo="Impuestos"
                detalle="Lo que se paga al fisco"
                valor={bsResta(er.impuestos)}
                resta
                onClick={() => setDetalle({ tipo: "grupo", grupo: "IMPUESTOS" })}
              />
            )}
            <CajaResultado er={er} periodo={periodo} parcial={parcial} explicacion={explicarResultado(er, perfil, partes, sueldosDocentes)} />
          </Tarjeta>
          {er.sinBajoLaLinea && esPositivo(er.gastosOperativos) && (
            <p className="px-1 text-[12.5px] text-texto-3">
              Es el mismo número que el resultado del local, porque no cargaste impuestos ni gastos del banco en este período.
            </p>
          )}

          <Tarjeta
            titulo="Gastos del local"
            subtitulo="Cuentan aunque todavía no los pagués"
            extra={<span className={`text-[15px] font-extrabold tabular-nums ${esCero(gastosLocal) ? "text-texto-4" : "text-rose-700"}`}>{bsResta(gastosLocal)}</span>}
            cuerpo=""
          >
            {sospechosos.length > 0 && (
              <div className="border-b border-borde-soft px-4 py-3 sm:px-5">
                <Nota tono="ambar">
                  {listaNombres(sospechosos.map((g) => g.concepto))} {sospechosos.length === 1 ? "está" : "están"}{" "}
                  {lugarSospechosos(sospechosos)}. ¿{sospechosos.length === 1 ? "Es un pago" : "Son pagos"} al banco? Si lo{" "}
                  {sospechosos.length === 1 ? "es, abrilo" : "son, abrilos"} en Gastos y cambiales la categoría a Gastos financieros: así el
                  resultado del local no carga con el préstamo.
                </Nota>
              </div>
            )}
            {erLocal.lineas.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-texto-3 sm:px-5">
                No cargaste gastos operativos en este período. Sin ellos, el resultado de arriba está de más.
              </p>
            ) : (
              <ul className="divide-y divide-borde-soft">
                {erLocal.lineas.map((l) => {
                  const estado = estadoLinea(local.filter((g) => g.categoria === l.codigo));
                  return (
                    <li key={l.codigo}>
                      <button
                        type="button"
                        onClick={() => setDetalle({ tipo: "categoria", codigo: l.codigo, nombre: l.nombre })}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14.5px] font-semibold text-texto">{l.nombre}</span>
                            <ChipEstado estado={estado} />
                          </p>
                          <p className="text-[12.5px] text-texto-3">
                            {l.cantidad} {l.cantidad === 1 ? "gasto" : "gastos"}
                            {pctVentas(l.monto) != null ? ` · ${porcentaje(pctVentas(l.monto)!)} de las ventas` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-[14.5px] font-bold tabular-nums text-texto">{fmtMoney(l.monto)}</span>
                        <Icon name="chevronRight" size={15} color="#94A3B8" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0 space-y-4">
          {creditos && esPositivo(creditos.resumen.totalPorCobrar) && (
            <Informativo
              titulo={`Fiado sin cobrar · ${fmtMoney(creditos.resumen.totalPorCobrar)}`}
              texto="Ya está contado en tus ventas, pero esa plata todavía no entró a la caja."
              a={veReporte("creditos") ? "/reportes/creditos" : undefined}
              accion="Ver créditos"
            >
              <div className="flex flex-wrap gap-1.5">
                {esPositivo(creditos.resumen.totalVencido) && (
                  <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[12px] font-bold text-rose-700">
                    {fmtMoney(creditos.resumen.totalVencido)} vencido
                  </span>
                )}
                {creditos.resumen.creditosAbiertos > 0 && (
                  <span className="rounded-full border border-borde px-2.5 py-0.5 text-[12px] text-texto-2">
                    {creditos.resumen.creditosAbiertos} {creditos.resumen.creditosAbiertos === 1 ? "crédito" : "créditos"} ·{" "}
                    {creditos.resumen.clientesConSaldo} {creditos.resumen.clientesConSaldo === 1 ? "cliente" : "clientes"}
                  </span>
                )}
              </div>
            </Informativo>
          )}
          {pendiente && esPositivo(pendiente.total) && (
            <Informativo
              titulo={`Planilla pendiente de pagar · ${fmtMoney(pendiente.total)}`}
              texto="Lo que se les debe a los docentes por los meses de este período y todavía no se pagó. No resta del resultado: entra en Sueldos docentes el día que se paga."
              a={puede("academia_planilla") ? "/academia/planilla" : undefined}
              accion="Ver la planilla"
            >
              <div className="flex flex-wrap gap-1.5">
                {esPositivo(pendiente.cerrada) && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-bold text-amber-800">{fmtMoney(pendiente.cerrada)} cerrada sin pagar</span>
                )}
                {esPositivo(pendiente.enCurso) && (
                  <span className="rounded-full border border-borde px-2.5 py-0.5 text-[12px] text-texto-2">{fmtMoney(pendiente.enCurso)} del mes en curso</span>
                )}
              </div>
            </Informativo>
          )}
          {esPositivo(fin.compras.total) && (
            <Informativo
              titulo={`${periodo.preset === "mes" || periodo.preset === "mesPasado" ? "Compras del mes" : "Compras del período"} · ${fmtMoney(fin.compras.total)}`}
              texto={textoCompras(fin.compras, perfil)}
              a={veReporte("compras") ? "/reportes/compras" : undefined}
              accion="Ver compras"
            />
          )}
          {sinEfecto.length > 0 && <CajaSinEfecto movimientos={sinEfecto} a={veReporte("caja") ? "/reportes/caja" : undefined} />}
          <Nota>
            {perfil.partir === "billar"
              ? "El costo sale del costo cargado en cada producto, no de las compras del período: comprar bebidas para tres meses no hunde el resultado de este mes. El tiempo de mesa no tiene costo. Los gastos cuentan por lo gastado, no por lo pagado."
              : academia
                ? "Cobrado por clases son las cuotas cobradas en el período. Las cuotas no tienen costo: el costo es el de los productos vendidos. Los gastos del local cuentan por lo gastado; los sueldos docentes, por lo pagado de la planilla."
                : "El costo de lo vendido sale del costo cargado en cada artículo, no de las compras del período: comprar stock para tres meses no hunde el resultado de este mes. Los gastos cuentan por lo gastado, no por lo pagado."}
          </Nota>
        </div>
      </div>

      {detalle?.tipo === "clases" || detalle?.tipo === "sueldos" ? (
        clases &&
        (detalle.tipo === "clases" ? (
          <DetalleClases clases={clases} periodo={periodo} onCerrar={() => setDetalle(null)} />
        ) : (
          <DetalleSueldos sueldos={clases.sueldos} total={sueldosDocentes} periodo={periodo} onCerrar={() => setDetalle(null)} />
        ))
      ) : detalle?.tipo === "gastosCaja" ? (
        <DetalleGastosCaja
          gastos={gastosDeLaCaja}
          total={er.gastosCaja}
          ventas={er.ventas}
          periodo={periodo}
          veReporte={veReporte}
          onCerrar={() => setDetalle(null)}
        />
      ) : (
        detalle && (
          <DetalleLinea
            detalle={detalle}
            er={er}
            gastos={gastosVista}
            periodo={periodo}
            perfil={perfil}
            partes={partes}
            productosSinCosto={productosSinCosto}
            sospechosos={sospechosos}
            veReporte={veReporte}
            onCerrar={() => setDetalle(null)}
          />
        )
      )}
    </>
  );
}

/**
 * La bajada de "Cobrado por clases": cuántos cursos y cuántos estudiantes
 * pagaron. Sin el detalle (un backend anterior, o si no llegó), qué es.
 */
function detalleClases(clases: ClasesAcademiaApi | null): string {
  const cursos = clases?.cursos.filter((c) => esPositivo(c.cobrado)) ?? [];
  if (!cursos.length) return "Las cuotas de los módulos cobradas en el período";
  const pagaron = cursos.reduce((t, c) => t + c.pagaron, 0);
  return `${cursos.length} ${cursos.length === 1 ? "curso" : "cursos"} · ${pagaron} ${pagaron === 1 ? "estudiante pagó" : "estudiantes pagaron"}`;
}

/**
 * Academia (L5, 28-oct): de dónde sale "Cobrado por clases". Por curso y
 * módulo, el precio del módulo, cuántos están inscritos en los grupos que lo
 * dictan en el período, cuántos pagaron y los Bs cobrados, con los horarios
 * abiertos. De sólo mirar, como el resto de los detalles.
 */
function DetalleClases({ clases, periodo, onCerrar }: { clases: ClasesAcademiaApi; periodo: Periodo; onCerrar: () => void }) {
  return (
    <Modal
      abierto
      titulo="Cobrado por clases"
      subtitulo={prosaRango(periodo.desde, periodo.hasta)}
      onClose={onCerrar}
      ancho="max-w-2xl"
      acciones={<Boton onClick={onCerrar}>Cerrar</Boton>}
    >
      <div className="space-y-4">
        <p className="text-[28px] font-extrabold tabular-nums text-texto">{fmtMoney(clases.cobradoCuotas)}</p>
        {clases.cursos.map((c) => (
          <section key={c.curso.id} className="overflow-hidden rounded-xl border border-borde">
            <header className="flex items-center gap-2 bg-muted px-3.5 py-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate font-bold text-texto">{c.curso.nombre}</span>
              {c.precioModulo != null && <span className="shrink-0 text-texto-3">{fmtMoney(c.precioModulo)} por módulo</span>}
              <span className="w-24 shrink-0 text-right font-extrabold tabular-nums text-texto">{fmtMoney(c.cobrado)}</span>
            </header>
            <ul className="divide-y divide-borde-soft">
              {c.modulos.map((m) => (
                <li key={m.materia.id} className="flex items-start gap-3 px-3.5 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-texto">
                      Módulo {m.materia.orden} · {m.materia.nombre}
                    </p>
                    <p className="text-[12px] text-texto-3">
                      {m.grupos.length
                        ? `${m.alumnos} ${m.alumnos === 1 ? "inscrito" : "inscritos"} · ${m.pagaron} ${m.pagaron === 1 ? "pagó" : "pagaron"}`
                        : `No se dicta en el período · ${m.pagaron} ${m.pagaron === 1 ? "pagó" : "pagaron"}`}
                    </p>
                    {m.grupos.map((g) => (
                      <p key={g.id} className="text-[12px] text-texto-3">
                        {g.nombre} · {horarioGrupo(g)} · {g.sede.nombre}
                      </p>
                    ))}
                  </div>
                  <span className={`shrink-0 text-right font-bold tabular-nums ${esPositivo(m.cobrado) ? "text-texto" : "text-texto-4"}`}>{fmtMoney(m.cobrado)}</span>
                </li>
              ))}
              {esPositivo(c.sinModulo) && (
                <li className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 text-texto-2">Cuotas que no son de un módulo</span>
                  <span className="shrink-0 font-bold tabular-nums text-texto">{fmtMoney(c.sinModulo)}</span>
                </li>
              )}
            </ul>
          </section>
        ))}
        <div className="rounded-xl bg-muted px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">Qué va acá</p>
          <p className="mt-1 text-[13px] leading-relaxed text-texto-2">
            Las cuotas cobradas en el período, netas de descuento: los módulos mes a mes, los pagos completos y los abonos. Un pago completo se
            reparte por partes iguales entre los módulos que cubre. Las poleras y los kits van en Ventas de productos.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Academia (L5): lo pagado de la planilla en el período —cada pago, a qué
 * docente y de qué sede— y, aparte, lo que falta pagar de esos meses, que no
 * resta.
 */
function DetalleSueldos({
  sueldos,
  total,
  periodo,
  onCerrar,
}: {
  sueldos: ClasesAcademiaApi["sueldos"];
  total: number;
  periodo: Periodo;
  onCerrar: () => void;
}) {
  const { puede } = useAuth();
  const pendiente = sueldos.pendiente;
  return (
    <Modal
      abierto
      titulo="Sueldos docentes"
      subtitulo={prosaRango(periodo.desde, periodo.hasta)}
      onClose={onCerrar}
      acciones={
        <>
          {puede("academia_planilla") && (
            <Link to="/academia/planilla" className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted">
              Ver la planilla
            </Link>
          )}
          <Boton onClick={onCerrar}>Cerrar</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <p className={`text-[28px] font-extrabold tabular-nums ${esCero(total) ? "text-texto-4" : "text-rose-700"}`}>{bsResta(total)}</p>
        {sueldos.pagos.length > 0 && (
          <ul className="divide-y divide-borde-soft overflow-hidden rounded-xl border border-borde">
            {sueldos.pagos.map((g) => (
              <li key={g.gastoId} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-texto">{g.concepto}</p>
                  <p className="text-[12px] text-texto-3">{[`Pagado el ${fmtFecha(g.fecha)}`, g.sede?.nombre].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="shrink-0 text-right font-bold tabular-nums text-texto">{fmtMoney(g.monto)}</span>
              </li>
            ))}
          </ul>
        )}
        {pendiente && esPositivo(pendiente.total) && (
          <Nota tono="ambar">
            Falta pagar {fmtMoney(pendiente.total)} de la planilla de estos meses
            {esPositivo(pendiente.cerrada) ? ` (${fmtMoney(pendiente.cerrada)} ya cerrada)` : ""}. No resta del resultado hasta que se paga.
          </Nota>
        )}
        <div className="rounded-xl bg-muted px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">Qué va acá</p>
          <p className="mt-1 text-[13px] leading-relaxed text-texto-2">
            Lo que se les pagó a los docentes desde la planilla, el día en que se pagó: un mes dictado en octubre y pagado el 3 de noviembre
            cuenta en noviembre. Un sueldo cargado a mano en Gastos (la recepción, por ejemplo) va en los gastos del local.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** "37,7 %", con el menos tipográfico cuando es negativo. */
function porcentaje(fraccionVentas: number): string {
  return `${fmtNum(fraccionVentas * 100, 1).replace("-", "−")} %`;
}

/** "Alquiler, luz, agua, limpieza y otros": las cinco primeras; con más, cuatro y "y N más". */
function resumirNombres(nombres: string[]): string {
  const minus = nombres.map((n, i) => (i === 0 ? n : n === n.toUpperCase() ? n : n.toLowerCase()));
  if (minus.length <= 5) return minus.length === 1 ? minus[0] : `${minus.slice(0, -1).join(", ")} y ${minus[minus.length - 1]}`;
  return `${minus.slice(0, 4).join(", ")} y ${minus.length - 4} más`;
}

function lugarSospechosos(gastos: Gasto[]): string {
  const categorias = new Set(gastos.map((g) => g.categoria));
  if (categorias.size === 1) return `en ${gastos[0].categoriaNombre ?? gastos[0].categoria}`;
  return "en otras categorías";
}

/**
 * Un paso de la cascada, como en la app: el signo a la izquierda, el nombre
 * simple con el término contable abajo y el monto a la derecha.
 *
 * Lo que resta va en rojo con su "−" adelante, salvo si es cero: entonces no
 * se restó nada y va en gris. Un subtotal ("=") va sobre fondo gris, en verde
 * si es positivo y en rojo si es negativo: un "= Bs 0,00" o una pérdida en
 * verde se leían como ganancia. La ganancia va en verde en TODOS los rubros,
 * no en el color del negocio: en el negro del billar no se distinguía de nada.
 * `total` es una suma sin juicio (las ventas del billar): ni verde ni fondo.
 */
function Paso({
  signo,
  titulo,
  detalle,
  valor,
  resta = false,
  cero = false,
  subtotal,
  total = false,
  extra,
  onClick,
}: {
  signo: "+" | "−" | "=";
  titulo: string;
  detalle?: string;
  valor: string;
  resta?: boolean;
  cero?: boolean;
  subtotal?: number;
  total?: boolean;
  extra?: ReactNode;
  onClick?: () => void;
}) {
  const esSubtotal = subtotal != null;
  const color = cero
    ? "text-texto-4"
    : resta
      ? "text-rose-700"
      : esSubtotal
        ? esCero(subtotal)
          ? "text-texto-4"
          : subtotal < 0
            ? "text-rose-700"
            : "text-emerald-700"
        : "text-texto";
  const contenido = (
    <>
      <span aria-hidden className={`w-5 shrink-0 text-center text-[18px] font-bold leading-6 ${signo === "=" ? "text-texto" : "text-texto-4"}`}>
        {signo}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`leading-6 text-texto ${esSubtotal || total ? "text-[15.5px] font-bold" : "text-[15px] font-semibold"}`}>{titulo}</p>
        {detalle && <p className="text-[12.5px] leading-snug text-texto-3">{detalle}</p>}
        {extra}
      </div>
      <span className={`shrink-0 text-right leading-6 tabular-nums ${esSubtotal ? "text-[16.5px] font-extrabold" : "text-[15px] font-bold"} ${color}`}>{valor}</span>
      <span className="flex h-6 w-4 shrink-0 items-center justify-end">{onClick && <Icon name="chevronRight" size={16} color="#94A3B8" />}</span>
    </>
  );
  const clases = `flex w-full items-start gap-2.5 rounded-xl px-2.5 py-3 text-left ${esSubtotal ? "my-1 bg-slate-50" : ""} ${
    total ? "rounded-t-none border-t border-borde-soft" : ""
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clases} transition-colors hover:bg-slate-100`}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/**
 * El resultado, con su nombre según el signo: una pérdida no se llama
 * "ganancia" ni va en verde. Dice hasta cuándo ("al 14 de octubre", "de
 * septiembre"): a mitad de mes, "del período" se leía como el resultado del
 * mes. Abajo, la cuenta dicha en palabras y, en el mes que corre, por qué la
 * pérdida de mitad de mes no es la del mes.
 */
function CajaResultado({
  er,
  periodo,
  parcial,
  explicacion,
}: {
  er: Er;
  periodo: Periodo;
  /** El día del mes en curso, si todavía no terminó. */
  parcial: number | null;
  explicacion: string | null;
}) {
  const cero = esCero(er.utilidadNeta);
  const hasta = aDia(periodo.hasta);
  const cuando =
    periodo.preset === "mes"
      ? ` al ${hasta.getDate()} de ${mesDe(periodo)}`
      : periodo.preset === "mesPasado"
        ? ` de ${mesDe(periodo)}`
        : periodo.preset === "hoy"
          ? " de hoy"
          : periodo.preset === "ayer"
            ? " de ayer"
            : " del período";
  const nombre = cero ? `Resultado${cuando}` : er.enPerdida ? `Pérdida${cuando}` : `Ganancia líquida${cuando}`;
  const tono = cero ? "bg-slate-50 text-texto-2" : er.enPerdida ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800";
  return (
    <div className={`mx-1 mb-1 mt-3 rounded-2xl px-4 py-4 ${tono}`}>
      <p className="text-[12.5px] font-extrabold uppercase tracking-wider">= {nombre}</p>
      <p className="mt-1 text-[30px] font-extrabold leading-tight tabular-nums">{bsSubtotal(er.utilidadNeta)}</p>
      {er.margenNetoPct != null && <p className="text-[13px] font-semibold">{porcentaje(er.margenNetoPct)} de las ventas</p>}
      {explicacion && <p className="mt-2.5 text-[13.5px] leading-relaxed text-texto-2">{explicacion}</p>}
      {parcial != null && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-texto-3">
          {parcial === 1 ? "Va 1 día" : `Van ${parcial} días`} de ventas contra gastos que se cargan una vez al mes, como el alquiler o la cuota
          del banco. El resultado real se ve al cerrar {mesDe(periodo)}.
        </p>
      )}
    </div>
  );
}

/** La tarjeta del mes que corre: cuánto falta vender para cubrir los gastos. `nota` es la fórmula de la meta (`notaMeta`). */
function TarjetaMes({ mes, nombreMes, cosas, nota }: { mes: MesEnCurso; nombreMes: string; cosas: string; nota: string }) {
  const alerta = mes.sinMargen || (!mes.vaBien && !mes.cubierto);
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wider text-texto-3">Mes en curso</p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-bold text-emerald-800">
          Día {mes.diaActual} de {mes.diasDelMes}
        </span>
      </div>
      <h3 className="mt-1.5 text-[19px] font-extrabold leading-snug text-texto">
        {mes.sinMargen ? (
          "Con el costo actual, ninguna venta cubre los gastos"
        ) : mes.cubierto ? (
          `Ya cubriste los gastos de ${nombreMes}`
        ) : (
          <>
            Te faltan <span className="tabular-nums">{bsEntero(mes.faltaVender ?? 0)}</span> en ventas para cubrir los gastos de{" "}
            {nombreMes}
          </>
        )}
      </h3>
      {!mes.sinMargen && mes.meta != null && (
        <>
          <ProgresoMeta
            valor={mes.vendido}
            meta={mes.meta}
            etiquetaMeta="Meta"
            valorMeta={bsEntero(mes.meta)}
            marcaExtra={{ fraccion: Math.min(0.99, mes.avanceMes), etiqueta: `hoy, día ${mes.diaActual}` }}
          />
          <div className="mt-7 flex flex-wrap justify-between gap-2 text-[13px] text-texto-2">
            <span>
              Vendido <b className="tabular-nums text-texto">{bsEntero(mes.vendido)}</b>
            </span>
            <span>
              Meta del mes <b className="tabular-nums text-texto">{bsEntero(mes.meta)}</b>
            </span>
          </div>
        </>
      )}
      <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] ${alerta ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
        <Icon name={alerta ? "alert" : "check"} size={16} />
        <span>
          {mes.sinMargen
            ? `Cada venta cuesta más de lo que deja. Revisá el costo cargado en tus ${cosas} más vendidos.`
            : mes.cubierto
              ? `Llevás ${bsEntero(mes.gananciaALaFecha)} a favor a la fecha.`
              : mes.vaBien
                ? `Vas bien: llevás el ${Math.round((mes.avanceMeta ?? 0) * 100)} % de la meta y el mes va en ${Math.round(mes.avanceMes * 100)} % (la marca de hoy).`
                : `Vas atrasado: llevás el ${Math.round((mes.avanceMeta ?? 0) * 100)} % de la meta y el mes ya va en ${Math.round(mes.avanceMes * 100)} % (la marca de hoy).`}
        </span>
      </div>
      {!mes.sinMargen && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">Vendés por día</p>
              <p className="text-[17px] font-extrabold tabular-nums text-texto">{bsEntero(mes.vendesPorDia)}</p>
            </div>
            {mes.necesitasPorDia != null && (
              <div className="rounded-xl bg-muted px-3 py-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">Necesitás por día</p>
                <p className="text-[17px] font-extrabold tabular-nums text-texto">{bsEntero(mes.necesitasPorDia)}</p>
              </div>
            )}
          </div>
          {mes.proyeccion != null && (
            <p className="mt-3 text-[13px] text-texto-2">
              Si mantenés el ritmo, cerrás {nombreMes} con unos{" "}
              <b className={mes.proyeccion < 0 ? "text-rose-700" : "text-emerald-700"}>
                {mes.proyeccion < 0 ? `−${bsEntero(-mes.proyeccion).replace("−", "")}` : `+${bsEntero(mes.proyeccion)}`}
              </b>{" "}
              {mes.proyeccion < 0 ? "en contra" : "a favor"}. <span className="text-texto-4">(estimado)</span>
            </p>
          )}
          <p className="mt-2 text-[12px] text-texto-3">{nota}</p>
        </>
      )}
    </section>
  );
}

/** Lo que está al costado de la cuenta, sin restar: el fiado, las compras. */
function Informativo({
  titulo,
  texto,
  a,
  accion,
  children,
}: {
  titulo: string;
  texto: string;
  a?: string;
  accion: string;
  children?: ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-texto-4">Solo informativo</p>
      <h3 className="mt-1 text-[15px] font-bold text-texto">{titulo}</h3>
      <p className="mt-0.5 text-[13px] leading-snug text-texto-3">{texto}</p>
      {children && <div className="mt-2.5">{children}</div>}
      {a && (
        <Link to={a} state={DESDE_RESULTADO} className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-primary-700 hover:underline">
          {accion}
          <Icon name="chevronRight" size={14} />
        </Link>
      )}
    </section>
  );
}

/**
 * Billar (25-oct): lo que la caja movió sin cambiar la ganancia —pagos a
 * proveedores, retiros, el sencillo—, al costado de la cuenta como las compras
 * y con el porqué de cada uno. Sólo lo que hubo; sin nada, no se dibuja. Los
 * montos van sin color: rojo y verde son de lo que resta y suma en la cuenta, y
 * esto no la toca.
 */
function CajaSinEfecto({ movimientos, a }: { movimientos: MovimientoSinEfecto[]; a?: string }) {
  return (
    <Informativo
      titulo="Lo que movió la caja sin cambiar tu ganancia"
      texto="Lo registró el administrador en Supervisión. No es un gasto ni una venta: no resta ni suma en la cuenta."
      a={a}
      accion="Ver movimientos de caja"
    >
      <ul className="divide-y divide-borde-soft border-t border-borde-soft">
        {movimientos.map((m) => (
          <li key={m.codigo} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-texto">{m.titulo}</p>
              <p className="text-[12px] leading-snug text-texto-3">{m.porQue}</p>
            </div>
            <span className="shrink-0 text-[13.5px] font-bold tabular-nums text-texto-2">{bsConSigno(m.monto)}</span>
          </li>
        ))}
      </ul>
    </Informativo>
  );
}

const ESTADO_CHIP: Record<EstadoLinea, { tono: "rojo" | "verde" | "azul" | "ambar"; texto: string }> = {
  VENCIDO: { tono: "rojo", texto: "Vencido" },
  PAGADO: { tono: "verde", texto: "Pagado" },
  PARCIAL: { tono: "azul", texto: "Parcial" },
  PENDIENTE: { tono: "ambar", texto: "Pendiente" },
};

function ChipEstado({ estado }: { estado: EstadoLinea }) {
  const e = ESTADO_CHIP[estado];
  return <Chip tono={e.tono}>{e.texto}</Chip>;
}

const QUE_VA: Record<string, string> = {
  mermas:
    "Lo que se dio de baja por vencido, dañado o robado, al costo de compra. Lo devuelto al proveedor no se resta: vuelve.",
  BANCO:
    "Cuotas de préstamos, intereses y comisiones del banco. Si es una cuota de préstamo, sólo el interés es gasto: el capital que devolvés baja tu deuda.",
  IMPUESTOS: "Lo que se paga al fisco en el período. Va al final porque depende de cuánto ganaste, no de cómo trabajó el local.",
  categoria: "Cuenta lo gastado en el período aunque todavía no esté pagado: por eso puede figurar acá un gasto que vence más adelante.",
};

/** Lo pagado de una lista de gastos: cada uno hasta su monto (un pago de más no tapa otro pendiente). */
function pagadoDe(lista: Gasto[]): number {
  return aCentavos(lista.reduce((a, g) => a + Math.min(Math.max(g.pagado ?? 0, 0), g.monto), 0));
}

/**
 * La hoja que se abre al tocar una línea: de dónde sale ese número, qué va
 * ahí y qué no. Es de sólo mirar, como en la app (`LineaResultadoSheet`): los
 * gastos se corrigen en Gastos, a un toque desde acá.
 *
 * Los gastos del local van agrupados por categoría, con lo pagado y lo que
 * falta: el reporte cuenta lo GASTADO, y sin decir cuánto falta pagar el dueño
 * cree que el alquiler pendiente ya salió de la caja.
 */
function DetalleLinea({
  detalle,
  er,
  gastos,
  periodo,
  perfil,
  partes,
  productosSinCosto,
  sospechosos,
  veReporte,
  onCerrar,
}: {
  detalle: DetalleGasto;
  er: Er;
  gastos: Gasto[];
  periodo: Periodo;
  perfil: PerfilResultado;
  partes: VentasPartidas | null;
  /**
   * Qué se vendió sin costo. Null fuera del restaurante y undefined con un
   * backend anterior: en los dos el aviso va con el total solo.
   */
  productosSinCosto: FinancieroApi["productosSinCosto"] | null;
  sospechosos: Gasto[];
  veReporte: (id: string) => boolean;
  onCerrar: () => void;
}) {
  const { puede, rubro, vocabulario } = useAuth();
  const sinCosto = detalle.tipo === "costo" ? listaSinCosto(productosSinCosto, er.ventasSinCosto) : null;
  // "Artículos" en el restaurante, "Medicamentos" en la farmacia: donde se carga el costo.
  const articulos = termino(rubro, "articulos", vocabulario);
  const lista =
    detalle.tipo === "grupo"
      ? gastos.filter((g) => grupoDe(g.categoria) === detalle.grupo)
      : detalle.tipo === "categoria"
        ? gastos.filter((g) => g.categoria === detalle.codigo)
        : [];
  const local = detalle.tipo === "grupo" && detalle.grupo === "LOCAL";
  const titulo =
    detalle.tipo === "costo"
      ? perfil.costoTitulo
      : detalle.tipo === "mermas"
        ? "Mermas"
        : detalle.tipo === "categoria"
          ? detalle.nombre
          : { LOCAL: "Gastos del local", BANCO: "Banco y deudas", IMPUESTOS: "Impuestos" }[detalle.grupo];
  const monto =
    detalle.tipo === "costo" ? er.costoVentas : detalle.tipo === "mermas" ? er.mermas : aCentavos(lista.reduce((a, g) => a + g.monto, 0));
  const pctVentas = esPositivo(er.ventas) ? monto / er.ventas : null;
  const pagado = pagadoDe(lista);
  const falta = aCentavos(Math.max(0, monto - pagado));
  const texto =
    detalle.tipo === "costo"
      ? perfil.queVaCosto
      : detalle.tipo === "mermas"
        ? QUE_VA.mermas
        : detalle.tipo === "categoria"
          ? QUE_VA.categoria
          : local
            ? perfil.queVaLocal
            : QUE_VA[detalle.grupo];
  const avisar =
    sospechosos.length > 0 &&
    (detalle.tipo === "grupo" ? detalle.grupo !== "IMPUESTOS" : detalle.tipo === "categoria" && sospechosos.some((g) => g.categoria === detalle.codigo));
  const ganancia = detalle.tipo === "costo" && perfil.partir === "billar" && partes ? gananciaPorParte(partes, er.costoVentas) : null;
  // Agrupados por categoría cuando alguna junta varios gastos: una lista suelta
  // de quince no deja ver que el alquiler es la mitad. Con un gasto por
  // categoría, el grupo repetiría cada renglón dos veces: va la lista sola,
  // con la categoría debajo del nombre.
  const grupos = local ? agrupar(lista) : null;
  const porCategoria = grupos && grupos.length > 1 && grupos.some((c) => c.gastos.length > 1) ? grupos : null;
  const subtitulo = [
    local ? "Gastos operativos" : null,
    prosaRango(periodo.desde, periodo.hasta),
    lista.length ? `${lista.length} ${lista.length === 1 ? "gasto" : "gastos"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={subtitulo}
      onClose={onCerrar}
      acciones={
        <>
          {lista.length > 0 && puede("gastos") && (
            <Link to="/gastos" className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted">
              Ver en Gastos
            </Link>
          )}
          {detalle.tipo === "costo" && veReporte("top-productos") && (
            <Link
              to="/reportes/top-productos"
              state={DESDE_RESULTADO}
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
            >
              Qué deja cada {perfil.cosa}
            </Link>
          )}
          <Boton onClick={onCerrar}>Cerrar</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className={`text-[28px] font-extrabold tabular-nums ${esCero(monto) ? "text-texto-4" : "text-rose-700"}`}>{bsResta(monto)}</p>
          {pctVentas != null && (
            <p className="text-[13px] text-texto-3">
              {porcentaje(pctVentas)} de lo vendido {prosaRango(periodo.desde, periodo.hasta).replace(/^D/, "d").replace(/^E/, "e")}
            </p>
          )}
          {lista.length > 0 && esPositivo(monto) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-800">Pagado {fmtMoney(pagado)}</span>
              {esPositivo(falta) && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-bold text-amber-800">Falta pagar {fmtMoney(falta)}</span>}
            </div>
          )}
        </div>

        {ganancia && partes && (
          <div className="overflow-hidden rounded-xl border border-borde text-[13px]">
            <FilaCuenta etiqueta="Bebidas y productos vendidos" valor={fmtMoney(partes.productos)} />
            <FilaCuenta etiqueta="Lo que te costaron" valor={bsResta(er.costoVentas)} rojo={esPositivo(er.costoVentas)} />
            <FilaCuenta
              etiqueta={`Te dejaron${ganancia.margenProductos != null ? ` (${porcentaje(ganancia.margenProductos)} de lo vendido)` : ""}`}
              valor={bsSubtotal(ganancia.productos)}
              fuerte
            />
            <FilaCuenta etiqueta="Tiempo de mesa (no tiene costo)" valor={fmtMoney(ganancia.mesas)} />
          </div>
        )}

        {detalle.tipo === "costo" && esPositivo(er.ventasSinCosto) && (
          <Nota tono="ambar">
            {fmtMoney(er.ventasSinCosto)} de lo vendido salió de {perfil.cosas} sin costo cargado: cuentan como si no costaran nada y la ganancia
            se ve más alta de lo que es.
            {sinCosto && (
              <>
                <span className="mt-1.5 block">Sin costo cargado: {sinCosto}.</span>
                {/* El arreglo está en otra pantalla: decir cuáles sin decir
                    dónde se cargan dejaba al dueño buscando. Sin permiso para
                    editar el catálogo, sólo se dice dónde. */}
                {puede("productos") ? (
                  <Link to="/inventario/productos" className="mt-1.5 inline-flex items-center gap-1 font-bold underline">
                    Cargales el costo en {articulos}
                    <Icon name="chevronRight" size={14} />
                  </Link>
                ) : (
                  <span className="mt-1.5 block">El costo se carga en {articulos}.</span>
                )}
              </>
            )}
          </Nota>
        )}

        {porCategoria ? (
          <div className="space-y-3">
            {porCategoria.map((c) => (
              <section key={c.codigo} className="overflow-hidden rounded-xl border border-borde">
                <header className="flex items-center gap-2 bg-muted px-3.5 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate font-bold text-texto">{c.nombre}</span>
                  <ChipEstado estado={estadoLinea(c.gastos)} />
                  <span className="w-24 shrink-0 text-right font-extrabold tabular-nums text-texto">{fmtMoney(c.monto)}</span>
                </header>
                <ListaGastos gastos={c.gastos} conCategoria={false} />
              </section>
            ))}
          </div>
        ) : (
          lista.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-borde">
              <ListaGastos gastos={lista} conCategoria={detalle.tipo === "grupo"} />
            </div>
          )
        )}

        <div className="rounded-xl bg-muted px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">{local ? "Qué son los gastos del local" : "Qué va acá"}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-texto-2">{texto}</p>
          {local && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-texto-2">
              Lo del banco (cuotas, intereses) va aparte, en Banco y deudas, con la categoría Gastos financieros.
            </p>
          )}
        </div>
        {avisar && (
          <Nota tono="ambar">
            {sospechosos.length === 1 ? "Hay un gasto que parece del banco" : `Hay ${sospechosos.length} gastos que parecen del banco`} guardado
            {sospechosos.length === 1 ? "" : "s"} {lugarSospechosos(sospechosos)}:{" "}
            {sospechosos.map((g) => `${g.concepto} ${fmtMoney(g.monto)}`).join(", ")}. Si{" "}
            {sospechosos.length === 1 ? "es un pago al banco, abrilo" : "son pagos al banco, abrilos"} en Gastos y cambiales la categoría a
            Gastos financieros.
          </Nota>
        )}
      </div>
    </Modal>
  );
}

/**
 * El detalle de "Gastos pagados de la caja" (billar, 25-oct): cada gasto que el
 * administrador pagó del cajón, quién lo registró y de qué caja salió. De sólo
 * mirar, como el resto: un gasto mal cargado se anula en Supervisión mientras
 * la caja siga abierta. La lista suma lo mismo que la línea: las dos salen del
 * mismo pedido.
 */
function DetalleGastosCaja({
  gastos,
  total,
  ventas,
  periodo,
  veReporte,
  onCerrar,
}: {
  gastos: EfectivoBillarApi["gastos"];
  total: number;
  ventas: number;
  periodo: Periodo;
  veReporte: (id: string) => boolean;
  onCerrar: () => void;
}) {
  const rango = prosaRango(periodo.desde, periodo.hasta);
  const pctVentas = esPositivo(ventas) ? total / ventas : null;
  return (
    <Modal
      abierto
      titulo="Gastos pagados de la caja"
      subtitulo={[rango, gastos.length ? `${gastos.length} ${gastos.length === 1 ? "gasto" : "gastos"}` : null].filter(Boolean).join(" · ")}
      onClose={onCerrar}
      acciones={
        <>
          {veReporte("caja") && (
            <Link
              to="/reportes/caja"
              state={DESDE_RESULTADO}
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
            >
              Ver movimientos de caja
            </Link>
          )}
          <Boton onClick={onCerrar}>Cerrar</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[28px] font-extrabold tabular-nums text-rose-700">{bsResta(total)}</p>
          {pctVentas != null && (
            <p className="text-[13px] text-texto-3">
              {porcentaje(pctVentas)} de lo vendido {rango.replace(/^D/, "d").replace(/^E/, "e")}
            </p>
          )}
        </div>
        {gastos.length > 0 && (
          <ul className="divide-y divide-borde-soft overflow-hidden rounded-xl border border-borde">
            {gastos.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-texto">{g.descripcion}</p>
                  <p className="text-[12px] text-texto-3">
                    {[fmtFechaHora(g.fecha), g.quien ? `Registró ${g.quien}` : null, g.cajera ? `caja de ${g.cajera}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-right font-bold tabular-nums text-texto">{fmtMoney(g.monto)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-xl bg-muted px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">Qué va acá</p>
          <p className="mt-1 text-[13px] leading-relaxed text-texto-2">
            Lo que el administrador pagó de la caja para el local (el hielo, la tiza, un arreglo), registrado en Supervisión con el motivo «Gasto».
            Resta como cualquier gasto del local. No lo cargues también en Gastos operativos: se restaría dos veces.
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-texto-2">
            Los pagos a proveedores, los retiros y el sencillo no van acá: no cambian tu ganancia.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function FilaCuenta({ etiqueta, valor, rojo = false, fuerte = false }: { etiqueta: string; valor: string; rojo?: boolean; fuerte?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3.5 py-2 ${fuerte ? "bg-muted font-bold" : ""} border-b border-borde-soft last:border-b-0`}>
      <span className="text-texto-2">{etiqueta}</span>
      <span className={`shrink-0 tabular-nums ${rojo ? "text-rose-700" : "text-texto"} ${fuerte ? "font-extrabold" : "font-semibold"}`}>{valor}</span>
    </div>
  );
}

function ListaGastos({ gastos, conCategoria }: { gastos: Gasto[]; conCategoria: boolean }) {
  return (
    <ul className="divide-y divide-borde-soft">
      {gastos.map((g) => {
        const b = badgeEstado(g);
        return (
          <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-texto">{g.concepto}</p>
              <p className="text-[12px] text-texto-3">
                {fmtFecha(g.fecha)}
                {conCategoria && g.categoriaNombre ? ` · ${g.categoriaNombre}` : ""}
              </p>
            </div>
            <Badge tono={b.tono}>{b.texto}</Badge>
            <span className="w-24 shrink-0 text-right font-bold tabular-nums text-texto">{fmtMoney(g.monto)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Los gastos por categoría (por código, no por nombre), de la que más pesa a la que menos. */
function agrupar(lista: Gasto[]): { codigo: string; nombre: string; monto: number; gastos: Gasto[] }[] {
  const porCodigo = new Map<string, Gasto[]>();
  for (const g of lista) porCodigo.set(g.categoria, [...(porCodigo.get(g.categoria) ?? []), g]);
  return [...porCodigo.entries()]
    .map(([codigo, gs]) => ({ codigo, nombre: gs[0].categoriaNombre || codigo, monto: aCentavos(gs.reduce((a, g) => a + g.monto, 0)), gastos: gs }))
    .sort((a, b) => b.monto - a.monto);
}

interface FilaClase {
  curso: string;
  modulo: string;
  precio: number | null;
  alumnos: number;
  pagaron: number;
  grupos: string;
  cobrado: number;
}

function filasClases(clases: ClasesAcademiaApi): FilaClase[] {
  return clases.cursos.flatMap((c) => [
    ...c.modulos.map((m) => ({
      curso: c.curso.nombre,
      modulo: `${m.materia.orden}. ${m.materia.nombre}`,
      precio: m.precio,
      alumnos: m.alumnos,
      pagaron: m.pagaron,
      grupos: m.grupos.map((g) => `${g.nombre} (${horarioGrupo(g)})`).join("; "),
      cobrado: m.cobrado,
    })),
    ...(esPositivo(c.sinModulo)
      ? [{ curso: c.curso.nombre, modulo: "Sin módulo", precio: null, alumnos: 0, pagaron: 0, grupos: "", cobrado: c.sinModulo }]
      : []),
  ]);
}

function hojasExcel(
  er: Er,
  fin: FinancieroApi,
  gastos: Gasto[],
  perfil: PerfilResultado,
  partes: VentasPartidas | null,
  efectivo: EfectivoBillarApi | null,
  clases: ClasesAcademiaApi | null,
) {
  const pv = (m: number) => (esPositivo(er.ventas) ? Math.round((m / er.ventas) * 1000) / 10 : null);
  const billar = perfil.partir === "billar";
  const academia = perfil.partir === "clases";
  const sueldos = academia ? separarSueldosDocentes(gastos, clases?.sueldos.gastoIds).sueldosDocentes : 0;
  const filas: [string, number][] = [
    ...(partes
      ? ([
          [academia ? "Cobrado por clases" : billar ? "Tiempo de mesa" : "Servicios", partes.servicios],
          [academia ? "Ventas de productos" : billar ? "Bebidas y productos" : "Productos", partes.productos],
        ] as [string, number][])
      : []),
    ["Ventas", er.ventas],
    [perfil.costoTitulo, -er.costoVentas],
    [`${perfil.gananciaTitulo} (utilidad bruta)`, er.utilidadBruta],
    ...(esPositivo(er.mermas) ? ([["Mermas", -er.mermas]] as [string, number][]) : []),
    ["Gastos del local", -aCentavos(er.gastosOperativos - sueldos)],
    ...(academia ? ([["Sueldos docentes (pagados)", -sueldos]] as [string, number][]) : []),
    ...(esPositivo(er.cenasPersonal) ? ([["Cenas del personal", -er.cenasPersonal]] as [string, number][]) : []),
    ...(esPositivo(er.gastosCaja) ? ([["Gastos pagados de la caja", -er.gastosCaja]] as [string, number][]) : []),
    ["Resultado del local (utilidad operativa)", er.utilidadOperativa],
    ...(esPositivo(er.gastosFinancieros) ? ([["Banco y deudas", -er.gastosFinancieros]] as [string, number][]) : []),
    ...(esPositivo(er.impuestos) ? ([["Impuestos", -er.impuestos]] as [string, number][]) : []),
    [er.enPerdida ? "Pérdida del período" : "Ganancia líquida del período (utilidad neta)", er.utilidadNeta],
  ];
  // Las filas que restan (costo, mermas, gastos) van en negativo y su % es lo
  // que se llevaron de las ventas: sin signo. Los subtotales van CON signo: un
  // resultado del local de −Bs 1.260 salía "12,6 %", como si hubiera ganado
  // (revisión del 16-oct).
  const subtotales = new Set(["Ventas", `${perfil.gananciaTitulo} (utilidad bruta)`, "Resultado del local (utilidad operativa)"]);
  const esSubtotal = (f: [string, number]) => subtotales.has(f[0]) || f === filas[filas.length - 1];
  return [
    hoja(
      "Estado de resultado",
      [
        ["Concepto", (f: [string, number]) => f[0]],
        ["Monto (Bs)", (f) => f[1]],
        ["% de las ventas", (f) => pv(esSubtotal(f) ? f[1] : Math.abs(f[1]))],
      ],
      filas,
    ),
    hoja(
      "Gastos",
      [
        ["Fecha", (g: Gasto) => g.fecha],
        ["Concepto", (g) => g.concepto],
        ["Categoría", (g) => g.categoriaNombre ?? g.categoria],
        ["Va en", (g) => ({ LOCAL: "Del local", BANCO: "Banco y deudas", IMPUESTOS: "Impuestos" })[grupoDe(g.categoria)]],
        ["Estado", (g) => badgeEstado(g).texto],
        ["Monto (Bs)", (g) => g.monto],
        ["Pagado (Bs)", (g) => g.pagado],
      ],
      gastos,
    ),
    // Billar: el detalle de la línea "Gastos pagados de la caja", que no está
    // en la hoja de Gastos (no son gastos cargados). Sin ninguno, no va.
    ...(esPositivo(er.gastosCaja) && efectivo?.gastos?.length
      ? [
          hoja(
            "Gastos de la caja",
            [
              ["Fecha", (g: EfectivoBillarApi["gastos"][number]) => fmtFechaHora(g.fecha)],
              ["Concepto", (g) => g.descripcion],
              ["Registró", (g) => g.quien],
              ["Caja de", (g) => g.cajera],
              ["Monto (Bs)", (g) => g.monto],
            ],
            efectivo.gastos,
          ),
        ]
      : []),
    // Academia: el detalle de "Cobrado por clases", módulo por módulo.
    ...(academia && clases?.cursos.length
      ? [
          hoja(
            "Cobrado por clases",
            [
              ["Curso", (f: FilaClase) => f.curso],
              ["Módulo", (f) => f.modulo],
              ["Precio del módulo (Bs)", (f) => f.precio],
              ["Inscritos", (f) => f.alumnos],
              ["Pagaron", (f) => f.pagaron],
              ["Grupos", (f) => f.grupos],
              ["Cobrado (Bs)", (f) => f.cobrado],
            ],
            filasClases(clases),
          ),
        ]
      : []),
    ...(academia && clases?.sueldos.pendiente && esPositivo(clases.sueldos.pendiente.total)
      ? [
          hoja(
            "Planilla pendiente sin pagar",
            [
              ["Mes", (m: { mes: string; cerrada: number; enCurso: number }) => m.mes],
              ["Cerrada sin pagar (Bs)", (m) => m.cerrada],
              ["En curso (Bs)", (m) => m.enCurso],
            ],
            clases.sueldos.pendiente.meses,
          ),
        ]
      : []),
    hoja(
      "Compras (informativo)",
      [
        ["Artículo", (c: FinancieroApi["desglose"][number]) => c.nombre],
        ["Tipo", (c) => (c.tipo === "INSUMO" ? "Insumo" : "Producto")],
        ["Cantidad", (c) => c.cantidad],
        ["Unidad", (c) => c.unidad],
        ["Total (Bs)", (c) => c.total],
      ],
      fin.desglose,
    ),
  ];
}
