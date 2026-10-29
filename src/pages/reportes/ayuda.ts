import type { TextoAyuda } from "../../components/AyudaCalculo";
import { esBillar } from "../../lib/rubro";
import { palabraProductos } from "./vistas/vocabularioProductos";

/**
 * "Cómo se calcula" de cada reporte de Reportes de ventas (L5, 28-oct): qué
 * muestra, de dónde salen los números y qué entra o no. Uno por ficha del
 * catálogo más el Resumen; un test controla que no falte ninguno, así un
 * reporte nuevo no nace sin su explicación.
 *
 * Las palabras cambian con el rubro donde hace falta: la academia cobra
 * cuotas de módulos, el billar tiempo de mesa, la farmacia vende
 * medicamentos. Lo que se dice tiene que ser lo que hace el backend
 * (`reportes.service.ts`): bruto en los rankings, neto (lo cobrado) en el
 * resto; lo anulado nunca suma.
 */

const ANULADAS = "Las ventas anuladas: no son plata que entró.";
const FECHA_COBRO = "Cada venta cuenta el día en que se cobró, en la hora del negocio.";

export function ayudaDeReporte(id: string, rubro: string | undefined): TextoAyuda | null {
  const academia = rubro === "ACADEMIA";
  const billar = esBillar(rubro);
  const p = palabraProductos(rubro);
  const ventaDe = academia ? "Las ventas: los productos y también las cuotas que se cobraron (cada cuota cobrada es una venta)." : null;

  switch (id) {
    case "resumen":
      return {
        queMuestra: "Lo más importante del período: cuánto vendiste, cuánto te quedó después del costo, la tendencia día a día y avisos que salen de los números.",
        deDonde: `Suma las ventas aprobadas del período, ya descontadas las promociones. ${FECHA_COBRO} Las flechas comparan contra el período anterior que dice arriba.`,
        incluye: [academia ? "Las cuotas cobradas y lo vendido en productos." : "Lo vendido, aunque sea fiado: la venta ya se hizo."],
        noIncluye: [ANULADAS, "El envío y la propina: no son de la venta."],
      };
    case "ventas":
      return {
        queMuestra: "El historial de lo vendido: una fila por venta (General), una por línea (Detallado) y los doce meses del año (Mensual).",
        deDonde: `General muestra todas las ventas, también las anuladas para que se vea qué pasó, pero los totales cuentan sólo las aprobadas. Detallado va en bruto, antes de las promociones. ${FECHA_COBRO}`,
        incluye: [ventaDe ?? "Todo lo cobrado en el mostrador, las mesas y los pedidos."],
        noIncluye: ["Mensual no sigue el período de arriba: muestra el año que elijas."],
      };
    case "resultado":
      return academia
        ? {
            queMuestra: "Si el instituto gana o pierde: todo lo que entra (cuotas y productos) menos todo lo que sale (costo de lo vendido, gastos del local y sueldos docentes).",
            deDonde:
              "Cobrado por clases son las cuotas cobradas en el período, por curso y módulo. Ventas de productos es lo demás que se vendió. Los gastos del local salen de Gastos (cuentan aunque no estén pagados). Sueldos docentes es lo que se PAGÓ de la planilla en el período, por la fecha del pago.",
            incluye: [
              "Las cuotas de cualquier módulo, también los abonos y los pagos completos.",
              "Los gastos cargados en Gastos: alquiler, luz, la recepción, materiales.",
              "La planilla docente ya pagada.",
            ],
            noIncluye: [
              "La planilla cerrada o en curso que todavía no se pagó: se muestra aparte, como \"Planilla pendiente de pagar\", y no resta hasta que se paga.",
              "Las compras del período: el costo entra cuando se vende.",
              ANULADAS,
            ],
          }
        : {
            queMuestra: "Cuánto ganaste de verdad: lo vendido, menos lo que costó, menos los gastos del local, el banco y los impuestos.",
            deDonde: `Las ventas y su costo salen de lo vendido (el costo cargado en cada ${palabraProductos(rubro, false)}). Los gastos salen de Gastos, del mismo período, y cuentan aunque todavía no estén pagados.${
              billar ? " En el billar, el tiempo de mesa va aparte de las bebidas, y las cenas y lo pagado de la caja restan en su propia línea." : ""
            }`,
            incluye: ["Lo fiado: ya es una venta, aunque la plata no haya entrado.", "Las mermas (lo vencido o dañado), al costo."],
            noIncluye: ["Las compras del período: comprar para tres meses no hunde este mes, el costo entra cuando se vende.", ANULADAS],
          };
    case "equilibrio":
      return {
        queMuestra: "Cuánto tenés que vender en el período para cubrir los gastos fijos y no perder.",
        deDonde:
          "Se toma lo que deja cada venta (lo vendido menos su costo y menos los gastos que suben con las ventas) y con eso se calcula cuánto hay que vender para pagar los gastos fijos, como el alquiler.",
        incluye: ["Los gastos cargados en Gastos del período, partidos en fijos y variables."],
        noIncluye: ["Los impuestos y el banco: el número responde cuánto vender para cubrir la operación."],
      };
    case "metodos-pago":
      return {
        queMuestra: "Cómo te pagaron: efectivo, QR, tarjeta y lo demás.",
        deDonde: `Suma lo cobrado con cada medio en las ventas del período. Una venta pagada con dos medios se parte entre los dos. ${FECHA_COBRO}`,
        incluye: ["Lo fiado del período, en su propia porción, si tenés fiado."],
        noIncluye: [ANULADAS],
      };
    case "creditos":
      return {
        queMuestra: "Quién te debe, cuánto y hace cuánto (el fiado).",
        deDonde: "Lo que se debe es de HOY, elijas el período que elijas. Lo fiado y lo cobrado sí son del período de arriba.",
        noIncluye: ["Los créditos ya cobrados por completo, en lo que se debe."],
      };
    case "descuentos":
      return {
        queMuestra: "La plata que se regaló con promociones y cupones, y las ventas que se anularon.",
        deDonde: "Las promociones restan lo que bajó cada una en las ventas del período; las anulaciones son las ventas anuladas en el período, con quién las anuló.",
        noIncluye: academia ? ["Las becas y descuentos de la inscripción: bajan la cuota antes de cobrarla, no en la venta."] : ["Precios bajados a mano: el sistema no los permite."],
      };
    case "mesas":
      return {
        queMuestra: "Qué deja cada mesa y cada tipo de mesa, con las horas jugadas y los Bs por hora.",
        deDonde: "Suma lo cobrado al cerrar cada mesa en el período y las horas que estuvo abierta. La jornada del billar termina a la hora del corte, no a la medianoche.",
        noIncluye: ["Las mesas anuladas.", "Las bebidas vendidas sin mesa (venta rápida)."],
      };
    case "ocupacion":
      return {
        queMuestra: "En qué días y horas se juega más: un mapa de calor de las mesas ocupadas.",
        deDonde: "Cuenta, hora por hora, cuántas mesas estaban abiertas en el período, en la jornada del billar.",
      };
    case "tiempo-fijo":
      return {
        queMuestra: "Si los paquetes de tiempo fijo y las promociones están sirviendo.",
        deDonde: "Cuenta los paquetes vendidos en el período, quién siguió jugando después y cuánto se cobró de más, y lo que restó cada promoción.",
      };
    case "pausas-ajustes":
      return {
        queMuestra: "Quién pausó, anuló, corrigió la hora o movió una cuenta, y por qué.",
        deDonde: "Sale del registro de cada mesa en el período: cada cambio queda anotado con quién lo hizo.",
      };
    case "cenas":
      return {
        queMuestra: "Lo que salió de la caja para la cena del personal, noche por noche.",
        deDonde: "Son los movimientos de caja con el motivo Cena que registró el administrador en Supervisión.",
        noIncluye: ["Las cenas anuladas."],
      };
    case "meseros":
      return {
        queMuestra: "Quién atendió el salón, cuánto vendió y qué anuló.",
        deDonde: "Son las ventas del salón del período, por el mesero de cada mesa. Lo anulado va a nombre de quien lo anuló.",
        noIncluye: ["Las ventas de mostrador y los pedidos: no tienen mesero."],
      };
    case "mermas":
      return {
        queMuestra: "Lo que se perdió por vencido, dañado o robado, y lo que está por vencer.",
        deDonde: "Las bajas del período, al costo del lote del que salieron. Lo que está por vencer es de hoy.",
        noIncluye: ["Lo devuelto al proveedor: vuelve, no se pierde."],
      };
    case "sugerencia-compra":
      return {
        queMuestra: `Qué ${p} pedir y cuánto, según lo que se vende.`,
        deDonde: "Es una foto de hoy: el stock de este momento contra lo vendido en los últimos días.",
      };
    case "profesionales":
      return {
        queMuestra: "Lo que cobró cada profesional en servicios.",
        deDonde: "Suma lo cobrado en el período por cada profesional, por la fecha del cobro.",
        noIncluye: [ANULADAS],
      };
    case "servicios":
      return {
        queMuestra: "Qué servicios se piden más y cuánto deja cada uno.",
        deDonde: "Cuenta los servicios cobrados en el período y lo que se cobró por cada uno.",
      };
    case "asistencia":
      return {
        queMuestra: "Cuántos clientes no vinieron o cancelaron su cita.",
        deDonde: "Cuenta las citas del período por su estado, por la fecha de la cita.",
      };
    case "ocupacion-agenda":
      return {
        queMuestra: "Qué parte del horario de trabajo estuvo reservada.",
        deDonde: "Las horas con cita divididas por las horas de horario de cada profesional en el período.",
      };
    case "retencion":
      return {
        queMuestra: "Cuántos clientes vuelven.",
        deDonde: "De los clientes atendidos en el período, cuántos ya habían venido antes y cuántos vinieron por primera vez.",
      };
    case "margen-servicios":
      return {
        queMuestra: "Cuánto deja cada servicio después de los insumos que gasta (el tinte, el oxidante).",
        deDonde: "Lo cobrado por cada servicio en el período menos el costo de los insumos que se usaron, al costo del día en que se usaron.",
      };
    case "top-productos":
      return {
        queMuestra: `Los ${p} que más se vendieron y los que más dejaron.`,
        deDonde: `Suma cada línea vendida en el período, en bruto (antes de las promociones), y le resta el costo cargado en cada ${palabraProductos(rubro, false)}.`,
        noIncluye: [ANULADAS, ...(academia ? ["Las cuotas de los cursos: lo cobrado por clases está en el Estado de resultado."] : [])],
      };
    case "productos-lentos":
      return {
        queMuestra: `Los ${p} que casi no se venden y cuánta plata tienen parada en el estante.`,
        deDonde: "Las ventas son del período elegido; el stock y lo que vale, de hoy.",
      };
    case "categorias":
      return {
        queMuestra: "Cuánto se vendió y cuánto dejó cada categoría.",
        deDonde: "La misma cuenta que Top productos, sumada por categoría: en bruto, menos el costo cargado.",
        noIncluye: [ANULADAS, ...(academia ? ["Las cuotas de los cursos: no son una categoría de productos."] : [])],
      };
    case "horas":
      return {
        queMuestra: "Cuándo vendés más: por hora y por día de la semana.",
        deDonde: `Suma lo cobrado (después de las promociones) en la hora del negocio. Los días de la semana suman todos los lunes, todos los martes… del período: no son un promedio.`,
        incluye: [academia ? "También las cuotas: cada cobro de cuota es una venta." : "Todas las ventas aprobadas."],
        noIncluye: [ANULADAS],
      };
    case "cierres":
      return {
        queMuestra: "Cada turno de caja con lo que tenía que haber, lo que se contó y la diferencia.",
        deDonde: "Sale del arqueo de cada cierre del período. Faltante en rojo, sobrante en azul.",
        noIncluye: ["Las cajas que siguen abiertas."],
      };
    case "cajeros":
      return {
        queMuestra: "Quién atendió, cuánto vendió, qué anuló y cómo le quedó la caja.",
        deDonde: "Junta los cierres de caja (quién cobró y sus turnos) con los descuentos y las anulaciones de cada persona en el período.",
      };
    case "caja":
      return {
        queMuestra: "El efectivo que entró o salió del cajón sin una venta: el sencillo, un retiro, un pago en efectivo.",
        deDonde: "Son los movimientos de caja del período, con quién los registró.",
        noIncluye: ["Las ventas: están en Ventas.", "Los movimientos anulados."],
      };
    case "stock-critico":
      return {
        queMuestra: `Los ${p} que hay que reponer y cuánto pedir.`,
        deDonde: "Es una foto de hoy: el stock de este momento y el ritmo de venta de los últimos 30 días. No cambia con el período de arriba.",
      };
    case "compras":
      return {
        queMuestra: "Qué se compró y cuánto se gastó en el período.",
        deDonde: "Suma las compras cargadas en el período, artículo por artículo, comparadas con el período anterior.",
        noIncluye: ["El costo de lo vendido: comprar no es perder, lo comprado sigue en el stock."],
      };
    case "insumos":
      return {
        queMuestra: "Lo que gastaste en comprar materia prima y cuánto es de lo vendido.",
        deDonde: "Suma las compras de insumos del período y las compara con las ventas del mismo período.",
      };
    default:
      return null;
  }
}
