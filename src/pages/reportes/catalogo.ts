import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { NombreIcono } from "../../components/Icon";
import { tieneFeature, type Capacidad, type Seccion } from "../../lib/permisos";
import { esBelleza, esBillar, esFarmacia, RUBROS_BELLEZA, type Rubro } from "../../lib/rubro";
import type { Feature } from "../../types";
import type { TonoR } from "./ui";
import { conMayuscula as capital, palabraProductos as productos } from "./vistas/vocabularioProductos";

/**
 * Qué reportes hay y quién ve cada uno.
 *
 * El diseño es uno solo para todos los rubros —Resumen, Plata, el grupo del
 * rubro, Productos, Operación e Inventario— y lo que cambia es el contenido:
 * el billar trae sus mesas, la farmacia sus vencimientos, la peluquería su
 * agenda. Como el menú de la izquierda (`menu.ts`), el orden y los grupos son
 * los mismos para todos; qué se ve lo deciden el rubro, el plan y el permiso.
 *
 * Cada ficha pide lo MISMO que su endpoint en el backend (el permiso del rol y
 * la feature del plan): antes la web ofrecía "Productos más vendidos" a un
 * plan básico y el backend le contestaba 403 al abrirlo.
 */

export type IdGrupo = "plata" | "rubro" | "productos" | "operacion" | "inventario";

export interface FichaReporte {
  /** El tramo de la dirección: `/reportes/<id>`. */
  id: string;
  titulo: string;
  /** La bajada del título, antes de las fechas: "Más vendidos y más rentables · 02/10 – 08/10/2026". */
  descripcion: string;
  icono: NombreIcono;
  tono: TonoR;
  grupo: IdGrupo;
  /** El nivel de reportes que compró el negocio (feature del plan). */
  capacidad?: Capacidad;
  /** El permiso del rol que pide el endpoint (`reportes.operacion`…). */
  permiso?: string;
  /** Una feature que además pide el endpoint (`fiado`). */
  feature?: Feature;
  /** Una sección que hace falta poder ver (el resultado lee los gastos). */
  seccion?: Seccion;
  /** Rubros donde nace: fuera de ellos no existe (ante la duda, no se ve). */
  soloEnRubro?: (rubro: string | undefined) => boolean;
  /** Rubros donde no existe, pase lo que pase con el plan. */
  fueraDeRubro?: Rubro[];
  /**
   * Es una foto de HOY y no cambia con el período (lo que queda en stock, lo
   * que hay que pedir): el encabezado no muestra las fechas elegidas arriba,
   * que harían creer que filtra por ellas.
   */
  fotoDeHoy?: boolean;
  vista: LazyExoticComponent<ComponentType>;
}

const OPERACION = { capacidad: "reportes_operacion", permiso: "reportes.operacion" } as const;
const RENTABILIDAD = { capacidad: "reportes_rentabilidad", permiso: "reportes.rentabilidad" } as const;

const v = {
  ventas: lazy(() => import("./vistas/Ventas")),
  resultado: lazy(() => import("./vistas/EstadoResultado")),
  equilibrio: lazy(() => import("./vistas/PuntoEquilibrio")),
  metodos: lazy(() => import("./vistas/MetodosPago")),
  creditos: lazy(() => import("./vistas/CreditosReporte")),
  descuentos: lazy(() => import("./vistas/Descuentos")),
  mesas: lazy(() => import("./vistas/billar/RendimientoMesas")),
  ocupacion: lazy(() => import("./vistas/billar/Ocupacion")),
  tiempoFijo: lazy(() => import("./vistas/billar/TiempoFijo")),
  pausas: lazy(() => import("./vistas/billar/PausasAjustes")),
  meseros: lazy(() => import("./vistas/Meseros")),
  mermas: lazy(() => import("./vistas/farmacia/MermasVista")),
  sugerencia: lazy(() => import("./vistas/farmacia/SugerenciaVista")),
  profesionales: lazy(() => import("./vistas/agenda/VistasAgenda").then((m) => ({ default: m.Profesionales }))),
  servicios: lazy(() => import("./vistas/agenda/VistasAgenda").then((m) => ({ default: m.Servicios }))),
  asistencia: lazy(() => import("./vistas/agenda/VistasAgenda").then((m) => ({ default: m.Asistencia }))),
  ocupacionAgenda: lazy(() => import("./vistas/agenda/VistasAgenda").then((m) => ({ default: m.OcupacionAgenda }))),
  retencion: lazy(() => import("./vistas/agenda/VistasAgenda").then((m) => ({ default: m.Retencion }))),
  top: lazy(() => import("./vistas/TopProductos")),
  lentos: lazy(() => import("./vistas/ProductosLentos")),
  categorias: lazy(() => import("./vistas/Categorias")),
  horas: lazy(() => import("./vistas/HorasDias")),
  cierres: lazy(() => import("./vistas/Cierres")),
  cajeros: lazy(() => import("./vistas/Cajeros")),
  caja: lazy(() => import("./vistas/MovimientosCaja")),
  stock: lazy(() => import("./vistas/StockCritico")),
  compras: lazy(() => import("./vistas/Compras")),
  insumos: lazy(() => import("./vistas/Insumos")),
};

/** El catálogo entero, con los nombres del rubro. Qué se ve lo filtra `reportesVisibles`. */
export function catalogo(rubro: string | undefined): FichaReporte[] {
  const p = productos(rubro);
  return [
    // ── Plata ──
    { id: "ventas", titulo: "Ventas", descripcion: "General, detallado y mensual", icono: "fileText", tono: "verde", grupo: "plata", permiso: "reportes.ver", vista: v.ventas },
    {
      id: "resultado",
      titulo: "Estado de resultado",
      descripcion: "Cuánto ganaste de verdad",
      icono: "billetera",
      tono: "verde",
      grupo: "plata",
      ...RENTABILIDAD,
      // Lee los gastos, que el backend sirve con la feature y el permiso de
      // Gastos: sin esto, a quien no los tiene le aparecía un reporte que
      // siempre falla.
      seccion: "gastos",
      vista: v.resultado,
    },
    {
      id: "equilibrio",
      titulo: "Punto de equilibrio",
      descripcion: "Cuánto vender para no perder",
      icono: "trendingUp",
      tono: "verde",
      grupo: "plata",
      ...RENTABILIDAD,
      seccion: "gastos",
      vista: v.equilibrio,
    },
    { id: "metodos-pago", titulo: "Métodos de pago", descripcion: "Cómo te pagaron", icono: "tarjetas", tono: "ambar", grupo: "plata", ...OPERACION, vista: v.metodos },
    {
      id: "creditos",
      titulo: "Créditos (fiado)",
      descripcion: "Quién debe y hace cuánto",
      icono: "clock",
      tono: "ambar",
      grupo: "plata",
      // El nivel que ya tenía en la web (la deuda es plata), más lo que pide su
      // endpoint: el fiado.
      capacidad: "reportes_rentabilidad",
      permiso: "reportes.ver",
      feature: "fiado",
      vista: v.creditos,
    },
    { id: "descuentos", titulo: "Descuentos y anulaciones", descripcion: "Plata perdida o regalada", icono: "x", tono: "rosa", grupo: "plata", ...OPERACION, vista: v.descuentos },

    // ── Billar ──
    { id: "mesas", titulo: "Rendimiento por mesa", descripcion: "Horas, ventas y Bs por hora", icono: "bola", tono: "verde", grupo: "rubro", seccion: "reportes_billar", vista: v.mesas },
    { id: "ocupacion", titulo: "Ocupación", descripcion: "Mapa de calor por día y hora", icono: "grid", tono: "azul", grupo: "rubro", seccion: "reportes_billar", vista: v.ocupacion },
    { id: "tiempo-fijo", titulo: "Tiempo fijo y promos", descripcion: "Paquetes, excedentes y descuentos", icono: "cronometro", tono: "morado", grupo: "rubro", seccion: "reportes_billar", vista: v.tiempoFijo },
    // Venía en la pestaña Billar de los reportes viejos: el dueño ve quién anuló o corrió la hora de una mesa.
    { id: "pausas-ajustes", titulo: "Pausas y ajustes", descripcion: "Quién pausó, anuló o movió una cuenta", icono: "pausa", tono: "rosa", grupo: "rubro", seccion: "reportes_billar", vista: v.pausas },

    // ── Restaurante (salón) ──
    {
      id: "meseros",
      titulo: "Ventas por mesero",
      descripcion: "Quién atendió, cuánto vendió y qué anuló",
      icono: "users",
      tono: "ambar",
      grupo: "rubro",
      ...OPERACION,
      feature: "salon",
      // Sin salón no hay meseros: una farmacia, un salón de belleza o un
      // billar verían una lista siempre vacía.
      fueraDeRubro: ["FARMACIA", ...RUBROS_BELLEZA, "BILLAR"],
      vista: v.meseros,
    },

    // ── Farmacia ──
    {
      id: "mermas",
      titulo: "Vencimientos y mermas",
      descripcion: "Lo perdido y lo que está por vencer",
      icono: "trendingDown",
      tono: "rosa",
      grupo: "rubro",
      ...RENTABILIDAD,
      soloEnRubro: esFarmacia,
      vista: v.mermas,
    },
    {
      id: "sugerencia-compra",
      titulo: "Sugerencia de compra",
      descripcion: "Qué pedir según lo que se vende",
      icono: "cart",
      tono: "azul",
      grupo: "rubro",
      ...OPERACION,
      soloEnRubro: esFarmacia,
      fotoDeHoy: true,
      vista: v.sugerencia,
    },

    // ── Belleza (agenda) ──
    { id: "profesionales", titulo: "Producción por profesional", descripcion: "Lo que cobró cada profesional", icono: "users", tono: "verde", grupo: "rubro", seccion: "reportes_agenda", soloEnRubro: esBelleza, vista: v.profesionales },
    { id: "servicios", titulo: "Servicios más pedidos", descripcion: "Qué se pide y cuánto deja", icono: "tag", tono: "morado", grupo: "rubro", seccion: "reportes_agenda", soloEnRubro: esBelleza, vista: v.servicios },
    { id: "asistencia", titulo: "Asistencia", descripcion: "No-shows y cancelaciones", icono: "userX", tono: "ambar", grupo: "rubro", seccion: "reportes_agenda", soloEnRubro: esBelleza, vista: v.asistencia },
    { id: "ocupacion-agenda", titulo: "Ocupación de la agenda", descripcion: "Horas reservadas sobre horas de horario", icono: "calendar", tono: "azul", grupo: "rubro", seccion: "reportes_agenda", soloEnRubro: esBelleza, vista: v.ocupacionAgenda },
    { id: "retencion", titulo: "Retención", descripcion: "Cuántos clientes vuelven", icono: "userHeart", tono: "rosa", grupo: "rubro", seccion: "reportes_agenda", soloEnRubro: esBelleza, vista: v.retencion },

    // ── Productos ──
    { id: "top-productos", titulo: `Top ${p}`, descripcion: "Más vendidos y más rentables", icono: "trendingUp", tono: "verde", grupo: "productos", ...OPERACION, vista: v.top },
    { id: "productos-lentos", titulo: `${capital(p)} lentos`, descripcion: "Lo que no se está vendiendo", icono: "trendingDown", tono: "rosa", grupo: "productos", ...RENTABILIDAD, vista: v.lentos },
    { id: "categorias", titulo: "Categorías", descripcion: "Ventas y margen por categoría", icono: "grid", tono: "azul", grupo: "productos", ...OPERACION, vista: v.categorias },

    // ── Operación ──
    { id: "horas", titulo: "Horas y días", descripcion: "Cuándo vendés más", icono: "calendar", tono: "morado", grupo: "operacion", ...OPERACION, vista: v.horas },
    { id: "cierres", titulo: "Cierres de caja", descripcion: "Historial y diferencias", icono: "fileText", tono: "verde", grupo: "operacion", permiso: "reportes.ver", vista: v.cierres },
    // Junta los cierres (quién cobró, sus turnos) con los descuentos y las
    // anulaciones de cada cajero: pide los dos niveles que leen esos datos.
    { id: "cajeros", titulo: "Ventas por cajero", descripcion: "Quién atendió, cuánto vendió y qué anuló", icono: "users", tono: "ambar", grupo: "operacion", ...OPERACION, vista: v.cajeros },
    { id: "caja", titulo: "Movimientos de caja", descripcion: "El efectivo que entró y salió sin una venta", icono: "dollar", tono: "gris", grupo: "operacion", permiso: "reportes.ver", vista: v.caja },

    // ── Inventario ──
    // Lo arma la sugerencia de compra (venta diaria, días que alcanza, cuánto
    // pedir), que es de operación: `stock-critico` sólo trae el stock.
    { id: "stock-critico", titulo: "Stock crítico", descripcion: `${capital(p)} por reponer`, icono: "cart", tono: "ambar", grupo: "inventario", ...OPERACION, fotoDeHoy: true, vista: v.stock },
    { id: "compras", titulo: "Compras", descripcion: "Qué se compró y cuánto se gastó", icono: "truck", tono: "azul", grupo: "inventario", ...RENTABILIDAD, vista: v.compras },
    {
      id: "insumos",
      titulo: "Insumos",
      descripcion: "Lo que gastaste en materia prima",
      icono: "sack",
      tono: "verde",
      grupo: "inventario",
      ...RENTABILIDAD,
      feature: "insumos",
      // Igual que la sección Insumos: una farmacia no transforma nada y el
      // tinte de una peluquería no es una receta.
      fueraDeRubro: ["FARMACIA", ...RUBROS_BELLEZA],
      vista: v.insumos,
    },
  ];
}

/** Lo que hace falta saber del usuario para decidir qué ve. */
export interface ContextoCatalogo {
  rubro?: string;
  features?: Feature[];
  permisos?: string[];
  puede: (seccion: Seccion) => boolean;
  incluye: (capacidad: Capacidad) => boolean;
}

export function esVisible(f: FichaReporte, ctx: ContextoCatalogo): boolean {
  if (f.soloEnRubro && !f.soloEnRubro(ctx.rubro)) return false;
  if (f.fueraDeRubro && ctx.rubro && (f.fueraDeRubro as string[]).includes(ctx.rubro)) return false;
  if (f.capacidad && !ctx.incluye(f.capacidad)) return false;
  if (f.permiso && !ctx.permisos?.includes(f.permiso)) return false;
  if (f.feature && !tieneFeature(ctx.features, f.feature)) return false;
  if (f.seccion && !ctx.puede(f.seccion)) return false;
  return true;
}

export interface GrupoVisible {
  id: IdGrupo;
  titulo: string;
  /** El grupo del rubro recién llegado lleva la etiqueta "Nuevo". */
  nuevo: boolean;
  fichas: FichaReporte[];
}

/** El nombre del grupo propio de cada rubro. */
export function tituloGrupoRubro(rubro: string | undefined): string {
  if (esBillar(rubro)) return "Billar";
  if (esFarmacia(rubro)) return "Farmacia";
  if (esBelleza(rubro)) return "Agenda";
  if (rubro === "RESTAURANTE") return "Restaurante";
  return "Atención";
}

/** Los grupos con lo que el usuario ve. Un grupo vacío no se dibuja. */
export function gruposVisibles(ctx: ContextoCatalogo): GrupoVisible[] {
  const fichas = catalogo(ctx.rubro).filter((f) => esVisible(f, ctx));
  const titulos: Record<IdGrupo, string> = {
    plata: "Plata",
    rubro: tituloGrupoRubro(ctx.rubro),
    productos: esFarmacia(ctx.rubro) ? "Medicamentos" : "Productos",
    operacion: "Operación",
    inventario: "Inventario",
  };
  const orden: IdGrupo[] = ["plata", "rubro", "productos", "operacion", "inventario"];
  return orden
    .map((id) => ({ id, titulo: titulos[id], nuevo: id === "rubro" && esBillar(ctx.rubro), fichas: fichas.filter((f) => f.grupo === id) }))
    .filter((g) => g.fichas.length > 0);
}
