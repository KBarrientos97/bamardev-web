import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Badge, Boton, Modal } from "../../../components/ui";
import { api } from "../../../lib/api";
import { esCero, esPositivo } from "../../../lib/dinero";
import { fmtFecha, fmtMoney, fmtNum } from "../../../lib/format";
import { badgeEstado } from "../../../lib/gastos";
import { desgloseGastos, estadoLinea, grupoDe, listaNombres, pareceDeBanco, type EstadoLinea, type GrupoGasto } from "../../../lib/grupoGasto";
import { mesEnCurso, type MesEnCurso } from "../../../lib/mesEnCurso";
import { rangoParaApi } from "../../../lib/rangoApi";
import { estadoResultado, type EstadoResultado as Er } from "../../../lib/resultado";
import { esBelleza, esBillar, termino } from "../../../lib/rubro";
import { tieneFeature } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { Gasto } from "../../../types";
import { apiReportes, fraccion, type CreditosApi, type FinancieroApi, type ResumenApi } from "../api";
import { hoja, useExportar, useReporte } from "../contexto";
import { bsEntero, bsResta, bsSubtotal } from "../formato";
import { ProgresoMeta } from "../graficos";
import { aDia, diasDelMes, esMesEnCurso, mesDe, prosaRango, type Periodo } from "../periodo";
import { Cargador, Chip, Delta, Nota, Tarjeta } from "../ui";

/**
 * Estado de resultado: cuánto ganaste de verdad.
 *
 * Rediseño del 11-oct (el mismo que ya tiene la app, ea9b8ac): una sola
 * cascada, de arriba abajo, donde cada número sale del de arriba. Antes los
 * números que formaban la utilidad operativa estaban en otra tarjeta y el
 * "−1.260" parecía salir de la nada; el gasto financiero de Bs 3.635 se sumaba
 * a los del local y no se sabía si el problema era el negocio o el préstamo.
 *
 *     + Ventas
 *     − Costo de lo vendido
 *     = Ganancia de lo vendido   (utilidad bruta)
 *     − Mermas                   (si hubo)
 *     − Gastos del local
 *     = Resultado del local      (utilidad operativa)
 *     − Banco y deudas           (si hubo)
 *     − Impuestos                (si hubo)
 *     = Ganancia o pérdida
 *
 * Las compras NO restan (lo comprado y no vendido sigue en el stock: el costo
 * entra con cada venta) y el fiado ya está dentro de las ventas: van a la
 * derecha como "solo informativo", separados de la cuenta.
 *
 * Si falla una mitad (el financiero o los gastos) falla el reporte entero: un
 * resultado sin los gastos mostraría una utilidad inflada como si fuera real.
 */
export default function EstadoResultado() {
  const { rango, rangoAnterior, periodo, comparacion, veReporte } = useReporte();
  const { rubro, negocio } = useAuth();

  const mitades = useApi(() => {
    // Los gastos con el MISMO corte que las ventas: medianoche local del
    // primer día a medianoche local del día siguiente al último.
    const { desde, hasta } = rangoParaApi(rango);
    return Promise.all([
      apiReportes.financiero(rango, rangoAnterior),
      api.getGastos({ desde: desde ?? "", hasta: hasta ?? "", sucursalId: rango.sucursalId ?? null }),
    ]);
  }, [rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta]);

  // Lo que deja el tiempo de mesa (o los servicios) contra los productos: sólo
  // donde se vende tiempo. Si no llega, la línea de ventas va sola.
  const conServicios = esBillar(rubro) || esBelleza(rubro);
  const resumen = useApi(
    () => (conServicios ? apiReportes.resumen(rango, rangoAnterior) : Promise.resolve(null)),
    [conServicios, rango.desde, rango.hasta, rango.sucursalId, rangoAnterior.desde, rangoAnterior.hasta],
  );
  const conFiado = tieneFeature(negocio?.features, "fiado") && veReporte("creditos");
  const creditos = useApi(
    () => (conFiado ? apiReportes.creditos(rango) : Promise.resolve(null)),
    [conFiado, rango.desde, rango.hasta, rango.sucursalId],
  );

  const [fin, gastos] = mitades.datos ?? [null, null];
  const er = fin && gastos ? estadoResultado(fin, gastos) : null;

  useExportar(
    "estado-de-resultado",
    er && fin && gastos ? () => hojasExcel(er, fin, gastos) : null,
  );

  return (
    <Cargador
      estado={mitades}
      vacio={([f, g]) => (estadoResultado(f, g).vacio ? { titulo: "Sin movimiento", texto: "No hay ventas ni gastos en este período.", icono: "billetera" } : null)}
    >
      {([f, g]) => (
        <Contenido
          er={estadoResultado(f, g)}
          fin={f}
          gastos={g}
          periodo={periodo}
          contra={comparacion.contra}
          rubro={rubro}
          resumen={resumen.datos}
          creditos={creditos.datos}
          veReporte={veReporte}
        />
      )}
    </Cargador>
  );
}

/** "plato" en un restaurante, "servicio" en belleza, "producto" en el resto. */
function cosaVendida(rubro: string | undefined): string {
  if (rubro === "RESTAURANTE") return "plato";
  if (esBelleza(rubro)) return "servicio";
  return termino(rubro, "articulo") === "medicamento" ? "medicamento" : "producto";
}

type Detalle =
  | { tipo: "costo" }
  | { tipo: "mermas" }
  | { tipo: "grupo"; grupo: GrupoGasto }
  | { tipo: "categoria"; codigo: string; nombre: string };

function Contenido({
  er,
  fin,
  gastos,
  periodo,
  contra,
  rubro,
  resumen,
  creditos,
  veReporte,
}: {
  er: Er;
  fin: FinancieroApi;
  gastos: Gasto[];
  periodo: Periodo;
  contra: string;
  rubro: string | undefined;
  resumen: ResumenApi | null;
  creditos: CreditosApi | null;
  veReporte: (id: string) => boolean;
}) {
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const desglose = desgloseGastos(gastos);
  const enCurso = esMesEnCurso(periodo);
  const hoy = aDia(periodo.hasta);
  // La meta cubre también las mermas: son plata que se fue, igual que un gasto.
  const mes = enCurso
    ? mesEnCurso({
        diaActual: hoy.getDate(),
        diasDelMes: diasDelMes(periodo),
        ventas: er.ventas,
        utilidadBruta: er.utilidadBruta,
        gastosDelMes: desglose.total + er.mermas,
      })
    : null;
  const sospechosos = gastos.filter(pareceDeBanco);
  const local = gastos.filter((g) => grupoDe(g.categoria) === "LOCAL");
  const pctVentas = (monto: number) => (esPositivo(er.ventas) ? monto / er.ventas : null);
  const comida = rubro === "RESTAURANTE";
  const servicios = resumen?.composicion?.servicios ?? 0;
  const productos = resumen?.composicion?.productos ?? 0;
  const partirVentas = esPositivo(servicios) && esPositivo(productos);
  const nombres = er.lineas.map((l) => l.nombre);

  return (
    <>
      {mes && <TarjetaMes mes={mes} nombreMes={mesDe(periodo)} rubro={rubro} gastos={desglose.total + er.mermas} />}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Tarjeta titulo="Cómo se llega al resultado" subtitulo="Tocá una línea para ver de dónde sale" cuerpo="px-2 py-2 sm:px-3">
            <Paso
              signo="+"
              titulo="Ventas"
              detalle={prosaRango(periodo.desde, periodo.hasta)}
              valor={fmtMoney(er.ventas)}
              onClick={veReporte("ventas") ? () => navigate("/reportes/ventas") : undefined}
            />
            {partirVentas && (
              <div className="mb-1 ml-9 mr-3 space-y-0.5 border-l-2 border-borde-soft pl-3 text-[12.5px] text-texto-3">
                <p className="flex justify-between gap-3">
                  <span>{esBillar(rubro) ? "Tiempo de mesa" : "Servicios"}</span>
                  <span className="tabular-nums">{fmtMoney(servicios)}</span>
                </p>
                <p className="flex justify-between gap-3">
                  <span>{esBillar(rubro) ? "Productos (en mesa y venta rápida)" : "Productos"}</span>
                  <span className="tabular-nums">{fmtMoney(productos)}</span>
                </p>
              </div>
            )}
            <Paso
              signo="−"
              titulo="Costo de lo vendido"
              detalle={esBillar(rubro) ? "El costo cargado en cada producto; el tiempo de mesa no tiene costo" : `Costo cargado en cada ${cosaVendida(rubro)}`}
              valor={bsResta(er.costoVentas)}
              resta
              cero={esCero(er.costoVentas)}
              onClick={() => setDetalle({ tipo: "costo" })}
            />
            {esPositivo(er.ventasSinCosto) && (
              <p className="mx-3 my-1 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                Ojo: {fmtMoney(er.ventasSinCosto)} de estas ventas son de artículos sin costo cargado. Esa parte figura con 100 % de
                ganancia.
              </p>
            )}
            <Paso
              signo="="
              titulo={comida ? "Ganancia de la comida" : "Ganancia de lo vendido"}
              detalle={er.margenBrutoPct != null ? `Utilidad bruta · ${fmtNum(er.margenBrutoPct * 100, 1)} % de las ventas` : "Utilidad bruta"}
              valor={bsSubtotal(er.utilidadBruta)}
              subtotal={er.utilidadBruta}
              extra={
                fraccion(fin.utilidadBrutaDeltaPct) != null ? (
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-texto-3">
                    <Delta fraccion={fraccion(fin.utilidadBrutaDeltaPct)} />
                    vs. {contra}
                  </span>
                ) : null
              }
            />
            {esPositivo(er.mermas) && (
              <Paso
                signo="−"
                titulo="Mermas"
                detalle="Lo vencido, dañado o robado que se dio de baja, al costo"
                valor={bsResta(er.mermas)}
                resta
                onClick={() => setDetalle({ tipo: "mermas" })}
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
            <CajaResultado er={er} periodo={periodo} mes={mes} />
          </Tarjeta>
          {er.sinBajoLaLinea && (
            <p className="px-1 text-[12.5px] text-texto-3">
              Da igual que la operativa porque no cargaste impuestos ni gastos financieros en este período.
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
                            <span className="truncate text-[14px] font-semibold text-texto">{l.nombre}</span>
                            <ChipEstado estado={estado} />
                          </p>
                          {pctVentas(l.monto) != null && (
                            <p className="text-[12px] text-texto-3">{fmtNum(pctVentas(l.monto)! * 100, 1)} % de las ventas</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[14px] font-bold tabular-nums text-texto">{fmtMoney(l.monto)}</span>
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
              a="/reportes/creditos"
              accion="Ver créditos"
            >
              {esPositivo(creditos.resumen.totalVencido) && (
                <p className="text-[13px] font-semibold text-rose-700">{fmtMoney(creditos.resumen.totalVencido)} vencido</p>
              )}
              <p className="text-[12.5px] text-texto-3">
                {creditos.resumen.creditosAbiertos} {creditos.resumen.creditosAbiertos === 1 ? "crédito" : "créditos"} ·{" "}
                {creditos.resumen.clientesConSaldo} {creditos.resumen.clientesConSaldo === 1 ? "cliente" : "clientes"}
              </p>
            </Informativo>
          )}
          {esPositivo(fin.compras.total) && (
            <Informativo
              titulo={`${periodo.preset === "mes" || periodo.preset === "mesPasado" ? "Compras del mes" : "Compras del período"} · ${fmtMoney(fin.compras.total)}`}
              texto={`${esPositivo(fin.compras.insumos) ? `Insumos ${fmtMoney(fin.compras.insumos)} y productos de reventa ${fmtMoney(fin.compras.productos)}. ` : ""}No se restan acá: el costo ya entra con cada venta.`}
              a={veReporte("compras") ? "/reportes/compras" : undefined}
              accion="Ver compras"
            >
              <ul className="mt-1 space-y-1.5">
                {fin.desglose.slice(0, 5).map((c) => (
                  <li key={`${c.tipo}-${c.nombre}`} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-texto-2">{c.nombre}</span>
                      <Chip tono={c.tipo === "INSUMO" ? "verde" : "azul"}>{c.tipo === "INSUMO" ? "Insumo" : "Producto"}</Chip>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-texto">{fmtMoney(c.total)}</span>
                  </li>
                ))}
              </ul>
            </Informativo>
          )}
          <Nota>
            El costo de lo vendido sale del costo cargado en cada artículo, no de las compras del período: comprar stock para tres meses
            no hunde el resultado de este mes. Los gastos cuentan por lo gastado, no por lo pagado.
          </Nota>
        </div>
      </div>

      {detalle && (
        <DetalleLinea
          detalle={detalle}
          er={er}
          gastos={gastos}
          periodo={periodo}
          rubro={rubro}
          sospechosos={sospechosos}
          onCerrar={() => setDetalle(null)}
        />
      )}
    </>
  );
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
 * Un paso de la cascada. Lo que resta va en rojo con su "−" adelante, salvo si
 * es cero: entonces no se restó nada y va en gris. Un subtotal negativo va en
 * rojo y uno en cero en gris: un "= Bs 0,00" en verde se leía como ganancia.
 */
function Paso({
  signo,
  titulo,
  detalle,
  valor,
  resta = false,
  cero = false,
  subtotal,
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
            : "text-primary-700"
        : "text-texto";
  const contenido = (
    <>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px] font-extrabold ${
          signo === "=" ? "bg-slate-800 text-white" : signo === "−" ? "bg-rose-50 text-rose-700" : "bg-primary-50 text-primary-700"
        }`}
      >
        {signo}
      </span>
      <div className="min-w-0 flex-1">
        <p className={esSubtotal ? "text-[15px] font-bold text-texto" : "text-[14px] font-semibold text-texto"}>{titulo}</p>
        {detalle && <p className="text-[12px] text-texto-3">{detalle}</p>}
        {extra}
      </div>
      <span className={`shrink-0 text-right tabular-nums ${esSubtotal ? "text-[16px] font-extrabold" : "text-[14px] font-bold"} ${color}`}>{valor}</span>
      <span className="w-4 shrink-0">{onClick && <Icon name="chevronRight" size={15} color="#94A3B8" />}</span>
    </>
  );
  const clases = `flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left ${esSubtotal ? "border-t border-borde-soft" : ""}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clases} transition-colors hover:bg-muted`}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

/**
 * El resultado, con su nombre según el signo: una pérdida no se llama
 * "utilidad" ni va en verde. En el mes en curso dice "al 12 de octubre" y
 * aclara que el mes no terminó.
 */
function CajaResultado({ er, periodo, mes }: { er: Er; periodo: Periodo; mes: MesEnCurso | null }) {
  const cero = esCero(er.utilidadNeta);
  const hasta = aDia(periodo.hasta);
  const cuando =
    periodo.preset === "mes"
      ? ` al ${hasta.getDate()} de ${mesDe(periodo)}`
      : periodo.preset === "mesPasado"
        ? ` de ${mesDe(periodo)}`
        : " del período";
  const nombre = cero ? `Resultado${cuando}` : `${er.enPerdida ? "Pérdida" : "Ganancia"}${cuando}`;
  const tono = cero ? "bg-slate-50 text-texto-2" : er.enPerdida ? "bg-rose-50 text-rose-700" : "bg-primary-50 text-primary-700";
  return (
    <div className={`mx-1 mb-1 mt-2 rounded-2xl px-4 py-3.5 ${tono}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[12px] font-bold uppercase tracking-wider">= {nombre}</p>
        <p className="text-[26px] font-extrabold tabular-nums">{er.enPerdida ? `−${fmtMoney(-er.utilidadNeta)}` : fmtMoney(er.utilidadNeta)}</p>
      </div>
      {er.margenNetoPct != null && <p className="text-[12.5px]">{fmtNum(er.margenNetoPct * 100, 1).replace("-", "−")} % de las ventas</p>}
      {mes && mes.diasRestantes > 0 && (
        <p className="mt-2 text-[12.5px] text-texto-2">
          {mes.diaActual === 1 ? "Va 1 día" : `Van ${mes.diaActual} días`} de ventas contra gastos que se cargan una vez al mes, como el
          alquiler o la cuota del banco. El resultado real se ve al cerrar {mesDe(periodo)}.
        </p>
      )}
    </div>
  );
}

/** La tarjeta del mes que corre: cuánto falta vender para cubrir los gastos. */
function TarjetaMes({ mes, nombreMes, rubro, gastos }: { mes: MesEnCurso; nombreMes: string; rubro: string | undefined; gastos: number }) {
  const margenTxt = `${fmtNum(mes.margen * 100, 1)} %`;
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wider text-texto-3">Mes en curso</p>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-bold text-texto-2">
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
            Te faltan <span className="text-primary-700">{bsEntero(mes.faltaVender ?? 0)}</span> en ventas para cubrir los gastos de{" "}
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
      <div
        className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] ${
          mes.sinMargen || (!mes.vaBien && !mes.cubierto) ? "bg-amber-50 text-amber-900" : "bg-primary-50 text-primary-700"
        }`}
      >
        <Icon name={mes.sinMargen || (!mes.vaBien && !mes.cubierto) ? "alert" : "check"} size={16} />
        <span>
          {mes.sinMargen
            ? `Cada venta cuesta más de lo que deja. Revisá el costo cargado en tus ${cosaVendida(rubro)}s más vendidos.`
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
              <b className={mes.proyeccion < 0 ? "text-rose-700" : "text-primary-700"}>
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
      <p className="mt-0.5 text-[12.5px] text-texto-3">{texto}</p>
      {children && <div className="mt-2 space-y-1">{children}</div>}
      {a && (
        <Link to={a} className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-primary-700 hover:underline">
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
  costo:
    "Lo que costó lo que vendiste, según el costo que cargaste en cada artículo. No son tus compras del período: comprar stock para tres meses no hunde el resultado de este mes.",
  mermas:
    "Lo que se dio de baja por vencido, dañado o robado, al costo de compra. Lo devuelto al proveedor no se resta: vuelve.",
  LOCAL:
    "Lo que cuesta tener el local abierto: alquiler, sueldos, luz, agua, gas, limpieza. Cuenta lo gastado aunque todavía no esté pagado. La mercadería no va acá: entra por el costo de lo vendido.",
  BANCO:
    "Cuotas de préstamos, intereses y comisiones del banco. Si es una cuota de préstamo, sólo el interés es gasto: el capital que devolvés baja tu deuda.",
  IMPUESTOS: "Lo que se paga al fisco en el período. Va al final porque depende de cuánto ganaste, no de cómo trabajó el local.",
  categoria: "Cuenta lo gastado en el período aunque todavía no esté pagado: por eso puede figurar acá un gasto que vence más adelante.",
};

/** La hoja que se abre al tocar una línea: de dónde sale ese número. */
function DetalleLinea({
  detalle,
  er,
  gastos,
  periodo,
  rubro,
  sospechosos,
  onCerrar,
}: {
  detalle: Detalle;
  er: Er;
  gastos: Gasto[];
  periodo: Periodo;
  rubro: string | undefined;
  sospechosos: Gasto[];
  onCerrar: () => void;
}) {
  const { puede } = useAuth();
  const lista =
    detalle.tipo === "grupo"
      ? gastos.filter((g) => grupoDe(g.categoria) === detalle.grupo)
      : detalle.tipo === "categoria"
        ? gastos.filter((g) => g.categoria === detalle.codigo)
        : [];
  const titulo =
    detalle.tipo === "costo"
      ? "Costo de lo vendido"
      : detalle.tipo === "mermas"
        ? "Mermas"
        : detalle.tipo === "categoria"
          ? detalle.nombre
          : { LOCAL: "Gastos del local", BANCO: "Banco y deudas", IMPUESTOS: "Impuestos" }[detalle.grupo];
  const monto =
    detalle.tipo === "costo" ? er.costoVentas : detalle.tipo === "mermas" ? er.mermas : lista.reduce((a, g) => a + g.monto, 0);
  const pctVentas = esPositivo(er.ventas) ? monto / er.ventas : null;
  const texto =
    detalle.tipo === "grupo" ? QUE_VA[detalle.grupo] : detalle.tipo === "categoria" ? QUE_VA.categoria : QUE_VA[detalle.tipo];
  const avisar =
    sospechosos.length > 0 &&
    (detalle.tipo === "grupo" ? detalle.grupo !== "IMPUESTOS" : detalle.tipo === "categoria" && sospechosos.some((g) => g.categoria === detalle.codigo));
  void rubro;

  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo={`${prosaRango(periodo.desde, periodo.hasta)}${lista.length ? ` · ${lista.length} ${lista.length === 1 ? "gasto" : "gastos"}` : ""}`}
      onClose={onCerrar}
      acciones={
        <>
          {lista.length > 0 && puede("gastos") && (
            <Link to="/gastos" className="inline-flex items-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted">
              Ver en Gastos
            </Link>
          )}
          <Boton onClick={onCerrar}>Cerrar</Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[28px] font-extrabold tabular-nums text-rose-700">{bsResta(monto)}</p>
          {pctVentas != null && (
            <p className="text-[13px] text-texto-3">
              {fmtNum(pctVentas * 100, 1)} % de lo vendido {prosaRango(periodo.desde, periodo.hasta).replace(/^D/, "d").replace(/^E/, "e")}
            </p>
          )}
        </div>
        {detalle.tipo === "costo" && esPositivo(er.ventasSinCosto) && (
          <Nota tono="ambar">
            {fmtMoney(er.ventasSinCosto)} de lo vendido salió de artículos sin costo cargado: cuentan como si no costaran nada y la ganancia
            se ve más alta de lo que es.
          </Nota>
        )}
        {lista.length > 0 && (
          <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
            {lista.map((g) => {
              const b = badgeEstado(g);
              return (
                <li key={g.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-texto">{g.concepto}</p>
                    <p className="text-[12px] text-texto-3">
                      {fmtFecha(g.fecha)}
                      {g.categoriaNombre && detalle.tipo === "grupo" ? ` · ${g.categoriaNombre}` : ""}
                    </p>
                  </div>
                  <Badge tono={b.tono}>{b.texto}</Badge>
                  <span className="w-24 shrink-0 text-right font-bold tabular-nums text-texto">{fmtMoney(g.monto)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="rounded-xl bg-muted px-3.5 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-texto-4">Qué va acá</p>
          <p className="mt-1 text-[13px] text-texto-2">{texto}</p>
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

function hojasExcel(er: Er, fin: FinancieroApi, gastos: Gasto[]) {
  const pv = (m: number) => (esPositivo(er.ventas) ? Math.round((m / er.ventas) * 1000) / 10 : null);
  const filas: [string, number][] = [
    ["Ventas", er.ventas],
    ["Costo de lo vendido", -er.costoVentas],
    ["Utilidad bruta", er.utilidadBruta],
    ...(esPositivo(er.mermas) ? ([["Mermas", -er.mermas]] as [string, number][]) : []),
    ["Gastos del local", -er.gastosOperativos],
    ["Resultado del local (utilidad operativa)", er.utilidadOperativa],
    ...(esPositivo(er.gastosFinancieros) ? ([["Banco y deudas", -er.gastosFinancieros]] as [string, number][]) : []),
    ...(esPositivo(er.impuestos) ? ([["Impuestos", -er.impuestos]] as [string, number][]) : []),
    [er.enPerdida ? "Pérdida del período" : "Ganancia del período", er.utilidadNeta],
  ];
  return [
    hoja("Estado de resultado", [["Concepto", (f: [string, number]) => f[0]], ["Monto (Bs)", (f) => f[1]], ["% de las ventas", (f) => pv(Math.abs(f[1]))]], filas),
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
