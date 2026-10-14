import { aCentavos, esPositivo } from "./dinero";
import { saldado } from "./gastos";
import { GASTOS_FINANCIEROS, IMPUESTOS } from "./resultado";
import type { Gasto } from "../types";

/**
 * A qué parte del resultado va cada gasto. Port de `GrupoGasto.kt` (Android,
 * ea9b8ac), para que la web y el celular separen igual:
 *
 *   • Del local       → lo que cuesta tener el negocio abierto.
 *   • Banco y deudas  → cuotas, intereses, comisiones (GASTOS_FINANCIEROS).
 *   • Impuestos       → lo del fisco.
 *
 * Se decide por el CÓDIGO de la categoría, nunca por el nombre: un nombre se
 * corrige, un código no cambia. Las categorías propias del negocio van al
 * local. Y se suma `monto` (lo gastado), no `pagado`: un gasto pendiente
 * entra entero al mes al que corresponde.
 */
export type GrupoGasto = "LOCAL" | "BANCO" | "IMPUESTOS";

export function grupoDe(categoria: string): GrupoGasto {
  if (categoria === GASTOS_FINANCIEROS) return "BANCO";
  if (categoria === IMPUESTOS) return "IMPUESTOS";
  return "LOCAL";
}

const PALABRAS_BANCO = new Set([
  "deuda",
  "deudas",
  "prestamo",
  "prestamos",
  "interes",
  "intereses",
  "banco",
  "bancario",
  "bancaria",
  "bancarios",
  "bancarias",
]);

/**
 * ¿Un gasto del local que parece un pago al banco? Pasó en el restaurante: dos
 * gastos "Deuda" y "Deudas" cargados en Otros contaban como gasto operativo y
 * el resultado del local se veía Bs 926 peor de lo que era.
 *
 * Palabras ENTERAS, sin acentos ni mayúsculas: "Bancos para la barra" no
 * cuenta (son bancos de sentarse); "Banco Unión" como beneficiario sí.
 */
export function pareceDeBanco(g: Gasto): boolean {
  if (grupoDe(g.categoria) !== "LOCAL") return false;
  const texto = [g.concepto, g.categoriaNombre, g.beneficiario].filter(Boolean).join(" ");
  const palabras = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return palabras.some((p) => PALABRAS_BANCO.has(p));
}

export interface DesgloseGastos {
  delLocal: number;
  banco: number;
  impuestos: number;
  total: number;
  /** Hay algo fuera del local: recién ahí vale la pena partir el total. */
  separado: boolean;
}

export function desgloseGastos(gastos: Gasto[]): DesgloseGastos {
  const suma = (grupo: GrupoGasto) => aCentavos(gastos.filter((g) => grupoDe(g.categoria) === grupo).reduce((a, g) => a + g.monto, 0));
  const delLocal = suma("LOCAL");
  const banco = suma("BANCO");
  const impuestos = suma("IMPUESTOS");
  return { delLocal, banco, impuestos, total: aCentavos(delLocal + banco + impuestos), separado: esPositivo(banco) || esPositivo(impuestos) };
}

export type EstadoLinea = "VENCIDO" | "PAGADO" | "PARCIAL" | "PENDIENTE";

/**
 * El estado de un rubro entero (todos sus gastos). Un solo gasto vencido marca
 * el rubro: es lo que el dueño tiene que ver primero. Todo saldado = pagado;
 * algo pagado = parcial; si no, pendiente (también una lista vacía).
 */
export function estadoLinea(gastos: Gasto[]): EstadoLinea {
  if (gastos.length === 0) return "PENDIENTE";
  if (gastos.some((g) => g.vencido && !saldado(g))) return "VENCIDO";
  if (gastos.every(saldado)) return "PAGADO";
  if (gastos.some((g) => esPositivo(g.pagado))) return "PARCIAL";
  return "PENDIENTE";
}

/** «A», «A» y «B», «A», «B» y «C», «A», «B» y 3 más. */
export function listaNombres(nombres: string[]): string {
  const unicos = [...new Set(nombres)].map((n) => `«${n}»`);
  if (unicos.length <= 1) return unicos[0] ?? "";
  if (unicos.length <= 3) return `${unicos.slice(0, -1).join(", ")} y ${unicos[unicos.length - 1]}`;
  return `${unicos.slice(0, 2).join(", ")} y ${unicos.length - 2} más`;
}
