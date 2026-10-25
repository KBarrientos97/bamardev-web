import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Badge, Boton, Modal } from "../../../components/ui";
import { api } from "../../../lib/api";
import { aCentavos, esCero, esPositivo } from "../../../lib/dinero";
import { fmtFecha, fmtMoney, fmtNum } from "../../../lib/format";
import { badgeEstado } from "../../../lib/gastos";
import { desgloseGastos, estadoLinea, grupoDe, listaNombres, pareceDeBanco, type EstadoLinea, type GrupoGasto } from "../../../lib/grupoGasto";
import { mesEnCurso, type MesEnCurso } from "../../../lib/mesEnCurso";
import { tieneFeature } from "../../../lib/permisos";
import { rangoParaApi, sinJornada } from "../../../lib/rangoApi";
import { estadoResultado, type EstadoResultado as Er } from "../../../lib/resultado";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { useAuth } from "../../../store/AuthContext";
import type { Gasto } from "../../../types";
import { apiReportes, fraccion, type CreditosApi, type FinancieroApi, type ResumenApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsEntero, bsResta, bsSubtotal } from "../formato";
import { ProgresoMeta } from "../graficos";
import { aDia, diasDelMes, esMesEnCurso, mesDe, prosaRango, type Periodo } from "../periodo";
import { Cargador, Chip, Delta, Nota, Tarjeta } from "../ui";
import {
  explicarResultado,
  gananciaPorParte,
  horasJugadas,
  partirVentas,
  perfilResultado,
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
 * derecha como "solo informativo", separados de la cuenta.
 *
 * Si falla una mitad (el financiero o los gastos) falla el reporte entero: un
 * resultado sin los gastos mostraría una utilidad inflada como si fuera real.
 */
export default function EstadoResultado() {
  const { rango, rangoAnterior, periodo, comparacion, veReporte, corteMin } = useReporte();
  const { rubro, negocio } = useAuth();
  const perfil = perfilResultado(rubro);
  const suc = useSucursales();
  // Billar (24-oct): las cenas del personal son un gasto que sale de la caja y
  // no está entre los gastos cargados. Sólo un billar las pide: los demás
  // rubros no hacen ninguna consulta más ni ven ninguna línea nueva.
  const pideCenas = perfil.partir === "billar";

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
      // Sí es una mitad de la cuenta: sin las cenas la ganancia sale inflada, así
      // que si falla, falla el reporte entero (como los gastos).
      pideCenas ? apiReportes.cenas(rango).then((c) => c?.total ?? 0) : Promise.resolve(0),
    ]);
  }, [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta, pideCenas]);

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

  const [fin, gastos, resumen, cenas] = datos.datos ?? [null, null, null, 0];
  const er = fin && gastos ? estadoResultado(fin, gastos, cenas) : null;
  const partes = er && perfil.partir ? partirVentas(er.ventas, resumen?.composicion) : null;

  useExportar(
    "estado-de-resultado",
    er && fin && gastos ? () => hojasExcel(er, fin, gastos, perfil, partes) : null,
  );

  return (
    <Cargador
      estado={datos}
      vacio={([f, g, , c]) => (estadoResultado(f, g, c).vacio ? { titulo: "Sin movimiento", texto: "No hay ventas ni gastos en este período.", icono: "billetera" } : null)}
    >
      {([f, g, r, c]) => (
        <Contenido
          er={estadoResultado(f, g, c)}
          fin={f}
          gastos={g}
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
 * Lo que viaja al saltar a otro reporte: con esto la flecha de aquel vuelve
 * acá y no al resumen (ver `EncabezadoReporte`). Como en la app, que al volver
 * de Ventas dejaba al dueño en el resultado que estaba mirando.
 */
const DESDE_RESULTADO = { volverA: "Estado de resultado" };

type Detalle =
  | { tipo: "costo" }
  | { tipo: "mermas" }
  | { tipo: "grupo"; grupo: GrupoGasto }
  | { tipo: "categoria"; codigo: string; nombre: string };

function Contenido({
  er,
  fin,
  gastos,
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
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  /** El salto a otro reporte, con el mismo período (vive en la pestaña). Sin permiso, la línea no se toca. */
  const ir = (id: string) => (veReporte(id) ? () => navigate(`/reportes/${id}`, { state: DESDE_RESULTADO }) : undefined);

  const desglose = desgloseGastos(gastos);
  // "Este mes" de un billar a la 1 a. m. del día 1 todavía es el mes que se
  // está cerrando: el de la jornada que corre.
  const enCurso = esMesEnCurso(periodo, new Date(), corteMin);
  const hoy = aDia(periodo.hasta);
  // La meta cubre también las mermas: son plata que se fue, igual que un gasto.
  const mes = enCurso
    ? mesEnCurso({
        diaActual: hoy.getDate(),
        diasDelMes: diasDelMes(periodo),
        ventas: er.ventas,
        utilidadBruta: er.utilidadBruta,
        gastosDelMes: desglose.total + er.mermas + er.cenasPersonal,
      })
    : null;
  // Once días de ventas contra el alquiler del mes entero: se dice, para que la
  // pérdida de mitad de mes no se lea como la del mes. Con o sin la tarjeta de
  // arriba (que no sale sin gastos o sin ventas).
  const parcial = enCurso && hoy.getDate() < diasDelMes(periodo) && !er.vacio ? hoy.getDate() : null;
  const sospechosos = gastos.filter(pareceDeBanco);
  const local = gastos.filter((g) => grupoDe(g.categoria) === "LOCAL");
  const pctVentas = (monto: number) => (esPositivo(er.ventas) ? monto / er.ventas : null);
  const partes = perfil.partir ? partirVentas(er.ventas, resumen?.composicion) : null;
  const billar = perfil.partir === "billar";
  const ganancia = billar && partes ? gananciaPorParte(partes, er.costoVentas) : null;
  const numVentas = resumen?.tickets?.valor ?? 0;
  const rangoTexto = prosaRango(periodo.desde, periodo.hasta);
  const ventasDetalle = numVentas > 0 ? `${rangoTexto} · ${fmtNum(numVentas)} ${numVentas === 1 ? "venta" : "ventas"}` : rangoTexto;
  const nombres = er.lineas.map((l) => l.nombre);
  const deltaBruta = fraccion(fin.utilidadBrutaDeltaPct);

  return (
    <>
      {mes && <TarjetaMes mes={mes} nombreMes={mesDe(periodo)} cosas={perfil.cosas} gastos={desglose.total + er.mermas + er.cenasPersonal} />}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Tarjeta titulo="Cómo se llega al resultado" subtitulo="Tocá una línea para ver de dónde sale" cuerpo="px-2 py-2 sm:px-3">
            {partes ? (
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
                      Mesas <b className="tabular-nums">{fmtMoney(ganancia.mesas)}</b> · productos{" "}
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
              valor={bsResta(er.gastosOperativos)}
              resta
              cero={esCero(er.gastosOperativos)}
              onClick={() => setDetalle({ tipo: "grupo", grupo: "LOCAL" })}
            />
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
            <CajaResultado er={er} periodo={periodo} parcial={parcial} explicacion={explicarResultado(er, perfil, partes)} />
          </Tarjeta>
          {er.sinBajoLaLinea && esPositivo(er.gastosOperativos) && (
            <p className="px-1 text-[12.5px] text-texto-3">
              Da igual que el resultado del local porque no cargaste impuestos ni gastos del banco en este período.
            </p>
          )}

          <Tarjeta
            titulo="Gastos del local"
            subtitulo="Cuentan aunque todavía no los pagués"
            extra={<span className={`text-[15px] font-extrabold tabular-nums ${esCero(er.gastosOperativos) ? "text-texto-4" : "text-rose-700"}`}>{bsResta(er.gastosOperativos)}</span>}
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
            {er.lineas.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-texto-3 sm:px-5">
                No cargaste gastos operativos en este período. Sin ellos, el resultado de arriba está de más.
              </p>
            ) : (
              <ul className="divide-y divide-borde-soft">
                {er.lineas.map((l) => {
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
          {esPositivo(fin.compras.total) && (
            <Informativo
              titulo={`${periodo.preset === "mes" || periodo.preset === "mesPasado" ? "Compras del mes" : "Compras del período"} · ${fmtMoney(fin.compras.total)}`}
              texto={textoCompras(fin, perfil)}
              a={veReporte("compras") ? "/reportes/compras" : undefined}
              accion="Ver compras"
            />
          )}
          <Nota>
            {perfil.partir === "billar"
              ? "El costo sale del costo cargado en cada producto, no de las compras del período: comprar bebidas para tres meses no hunde el resultado de este mes. El tiempo de mesa no tiene costo. Los gastos cuentan por lo gastado, no por lo pagado."
              : "El costo de lo vendido sale del costo cargado en cada artículo, no de las compras del período: comprar stock para tres meses no hunde el resultado de este mes. Los gastos cuentan por lo gastado, no por lo pagado."}
          </Nota>
        </div>
      </div>

      {detalle && (
        <DetalleLinea
          detalle={detalle}
          er={er}
          gastos={gastos}
          periodo={periodo}
          perfil={perfil}
          partes={partes}
          sospechosos={sospechosos}
          veReporte={veReporte}
          onCerrar={() => setDetalle(null)}
        />
      )}
    </>
  );
}

/** "37,7 %", con el menos tipográfico cuando es negativo. */
function porcentaje(fraccionVentas: number): string {
  return `${fmtNum(fraccionVentas * 100, 1).replace("-", "−")} %`;
}

/**
 * Las compras del período, sin restar. Al billar no se le habla de insumos:
 * vende bebidas, no cocina. Con insumos cargados (un restaurante) van las dos
 * mitades, como en la app.
 */
function textoCompras(fin: FinancieroApi, perfil: PerfilResultado): string {
  const noSeRestan = "No se restan acá: el costo ya entra con cada venta.";
  if (esPositivo(fin.compras.insumos)) {
    return `Insumos ${fmtMoney(fin.compras.insumos)} y productos de reventa ${fmtMoney(fin.compras.productos)}. ${noSeRestan}`;
  }
  if (perfil.partir === "billar") return `Lo que compraste para vender: bebidas, snacks. ${noSeRestan}`;
  return noSeRestan;
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

/** La tarjeta del mes que corre: cuánto falta vender para cubrir los gastos. */
function TarjetaMes({ mes, nombreMes, cosas, gastos }: { mes: MesEnCurso; nombreMes: string; cosas: string; gastos: number }) {
  const margenTxt = `${fmtNum(mes.margen * 100, 1)} %`;
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
          <p className="mt-2 text-[12px] text-texto-3">
            Meta = gastos cargados del mes ({bsEntero(gastos)}) ÷ lo que te deja cada venta ({margenTxt}).
          </p>
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
  sospechosos,
  veReporte,
  onCerrar,
}: {
  detalle: Detalle;
  er: Er;
  gastos: Gasto[];
  periodo: Periodo;
  perfil: PerfilResultado;
  partes: VentasPartidas | null;
  sospechosos: Gasto[];
  veReporte: (id: string) => boolean;
  onCerrar: () => void;
}) {
  const { puede } = useAuth();
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

function hojasExcel(er: Er, fin: FinancieroApi, gastos: Gasto[], perfil: PerfilResultado, partes: VentasPartidas | null) {
  const pv = (m: number) => (esPositivo(er.ventas) ? Math.round((m / er.ventas) * 1000) / 10 : null);
  const billar = perfil.partir === "billar";
  const filas: [string, number][] = [
    ...(partes
      ? ([
          [billar ? "Tiempo de mesa" : "Servicios", partes.servicios],
          [billar ? "Bebidas y productos" : "Productos", partes.productos],
        ] as [string, number][])
      : []),
    ["Ventas", er.ventas],
    [perfil.costoTitulo, -er.costoVentas],
    [`${perfil.gananciaTitulo} (utilidad bruta)`, er.utilidadBruta],
    ...(esPositivo(er.mermas) ? ([["Mermas", -er.mermas]] as [string, number][]) : []),
    ["Gastos del local", -er.gastosOperativos],
    ...(esPositivo(er.cenasPersonal) ? ([["Cenas del personal", -er.cenasPersonal]] as [string, number][]) : []),
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
