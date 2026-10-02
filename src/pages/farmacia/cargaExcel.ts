import { crearXlsx, type Filas } from "../../lib/planilla";
import type { CondicionVenta, LoteImportado, MedicamentoImportado } from "../../types";
import { mesAIso } from "./mercaderia";

/**
 * La carga desde Excel, del lado de la web: qué columna es cada cosa, qué fila
 * está bien, y cómo se juntan las filas de un mismo medicamento.
 *
 * Una fila por LOTE: un medicamento con tres lotes son tres filas con el mismo
 * código (o el mismo nombre). Es como el dueño ya tiene la planilla, y es lo
 * que permite cargar cada lote con su vencimiento y su costo.
 *
 * El backend vuelve a validar todo; esto existe para mostrar los problemas
 * con su número de fila ANTES de cargar, cuando todavía se pueden corregir en
 * el Excel.
 */

export type ClaveColumna =
  | "codBarra"
  | "nombre"
  | "principioActivo"
  | "concentracion"
  | "formaFarmaceutica"
  | "laboratorio"
  | "categoria"
  | "condicionVenta"
  | "controlado"
  | "manejaLote"
  | "registroSanitario"
  | "precio"
  | "costo"
  | "stockMinimo"
  | "cantidad"
  | "lote"
  | "vencimiento";

interface Columna {
  clave: ClaveColumna;
  /** El título en la plantilla. */
  titulo: string;
  ancho: number;
  /** Formato Texto en la plantilla, para que Excel no lo "corrija". */
  texto?: boolean;
  obligatoria?: boolean;
  /** Cómo puede venir el título en un Excel propio, ya normalizado. */
  sinonimos: string[];
}

/** Las columnas, en el orden de la plantilla. */
export const COLUMNAS: Columna[] = [
  {
    clave: "codBarra",
    titulo: "Código de barras",
    ancho: 17,
    texto: true,
    sinonimos: ["codigo de barras", "codigo de barra", "codigo", "cod barra", "cod barras", "codbarra", "ean"],
  },
  {
    clave: "nombre",
    titulo: "Nombre",
    ancho: 34,
    obligatoria: true,
    sinonimos: ["nombre", "producto", "medicamento", "articulo", "nombre comercial", "descripcion"],
  },
  {
    clave: "principioActivo",
    titulo: "Principio activo",
    ancho: 22,
    sinonimos: ["principio activo", "generico", "nombre generico", "droga", "dci"],
  },
  { clave: "concentracion", titulo: "Concentración", ancho: 14, sinonimos: ["concentracion", "dosis"] },
  {
    clave: "formaFarmaceutica",
    titulo: "Forma farmacéutica",
    ancho: 18,
    sinonimos: ["forma farmaceutica", "forma"],
  },
  {
    clave: "laboratorio",
    titulo: "Laboratorio",
    ancho: 16,
    sinonimos: ["laboratorio", "lab", "marca", "fabricante"],
  },
  { clave: "categoria", titulo: "Categoría", ancho: 18, sinonimos: ["categoria", "rubro", "familia", "grupo", "linea"] },
  {
    clave: "condicionVenta",
    titulo: "Condición de venta",
    ancho: 18,
    sinonimos: ["condicion de venta", "condicion", "receta"],
  },
  { clave: "controlado", titulo: "Controlado", ancho: 11, sinonimos: ["controlado", "psicotropico"] },
  { clave: "manejaLote", titulo: "Maneja lote", ancho: 12, sinonimos: ["maneja lote", "maneja lotes", "con lote"] },
  {
    clave: "registroSanitario",
    titulo: "Registro sanitario",
    ancho: 18,
    texto: true,
    sinonimos: ["registro sanitario", "registro", "reg sanitario", "nro registro"],
  },
  {
    clave: "precio",
    titulo: "Precio de venta",
    ancho: 14,
    obligatoria: true,
    sinonimos: ["precio de venta", "precio", "pvp", "precio venta", "precio unitario"],
  },
  {
    clave: "costo",
    titulo: "Costo",
    ancho: 10,
    sinonimos: ["costo", "costo unitario", "precio de compra", "precio compra", "precio costo"],
  },
  { clave: "stockMinimo", titulo: "Stock mínimo", ancho: 12, sinonimos: ["stock minimo", "minimo", "stock min"] },
  {
    clave: "cantidad",
    titulo: "Cantidad",
    ancho: 10,
    sinonimos: ["cantidad", "stock", "existencia", "existencias", "saldo", "unidades"],
  },
  { clave: "lote", titulo: "Lote", ancho: 14, texto: true, sinonimos: ["lote", "nro lote", "numero de lote", "n lote"] },
  {
    clave: "vencimiento",
    titulo: "Vencimiento (MM/AAAA)",
    ancho: 21,
    texto: true,
    sinonimos: ["vencimiento", "fecha de vencimiento", "vence", "venc", "fecha venc", "caducidad"],
  },
];

/**
 * Un título tal como se compara: sin tildes, sin mayúsculas, sin el asterisco
 * de "obligatorio" y sin lo que va entre paréntesis ("Vencimiento (MM/AAAA)").
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    // "P.V.P." es "pvp" y "Nº" es "n": los puntos se van sin dejar hueco.
    .replace(/[*º°.]/g, "")
    .replace(/[_:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Encabezado {
  /** La fila de los títulos (desde 0). */
  fila: number;
  /** En qué columna (desde 0) está cada dato. */
  columnas: Partial<Record<ClaveColumna, number>>;
  /** Los títulos que no se reconocieron: esas columnas no se cargan. */
  ignoradas: string[];
}

/**
 * Dónde están los títulos. No siempre en la fila 1: un Excel propio suele
 * traer arriba el nombre de la farmacia o la fecha. Se busca en las primeras
 * 15 filas la que tenga los dos obligatorios.
 */
export function ubicarEncabezado(filas: Filas): Encabezado | null {
  for (let f = 0; f < Math.min(filas.length, 15); f++) {
    const titulos = (filas[f] ?? []).map((t) => normalizar(t ?? ""));
    const columnas: Partial<Record<ClaveColumna, number>> = {};
    const usadas = new Set<number>();
    for (const col of COLUMNAS) {
      // Por sinónimo, en orden: "nombre" le gana a "descripcion" si están los
      // dos, y un título se usa una sola vez.
      for (const s of col.sinonimos) {
        const i = titulos.findIndex((t, idx) => t === s && !usadas.has(idx));
        if (i >= 0) {
          columnas[col.clave] = i;
          usadas.add(i);
          break;
        }
      }
    }
    if (columnas.nombre != null && columnas.precio != null) {
      const ignoradas = (filas[f] ?? [])
        .map((t, i) => (t?.trim() && !usadas.has(i) ? t.trim() : ""))
        .filter(Boolean);
      return { fila: f, columnas, ignoradas };
    }
  }
  return null;
}

// ── Una celda por vez ───────────────────────────────────────────────────────

type Leido<T> = { valor: T } | { error: string };

/**
 * Un número como lo escribe una persona o lo guarda Excel: "12,50", "12.5",
 * "1.234,50" o "Bs 15". Con punto Y coma, el último es el decimal.
 */
export function leerNumero(texto: string, que: string): Leido<number | null> {
  let t = texto.replace(/\s/g, "").replace(/^bs\.?/i, "");
  if (!t) return { valor: null };
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    t = t.replace(",", ".");
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: `${que} "${texto.trim()}" no es un número.` };
  if (n < 0) return { error: `${que} no puede ser negativo.` };
  return { valor: n };
}

/**
 * El vencimiento, como AAAA-MM-DD.
 *
 * - "04/2028" (como en la caja) es el ÚLTIMO día de abril, igual que en el
 *   ingreso de mercadería: se puede vender todo el mes.
 * - "15/04/2028" o "2028-04-15" es ese día.
 * - Un número es una fecha guardada por Excel (días desde 1899): se toma tal
 *   cual. Si Excel convirtió "04/2028" en el 1 de abril, queda el 1 de abril,
 *   que es el lado seguro: se deja de vender antes, nunca después.
 */
export function leerVencimiento(texto: string): Leido<string | null> {
  const t = texto.trim();
  if (!t) return { valor: null };
  const malo = { error: `El vencimiento "${t}" no se entiende: escribilo como en la caja, MM/AAAA.` };

  if (/^\d+(\.\d+)?$/.test(t)) {
    const dias = Number(t);
    if (dias < 20000 || dias > 80000) return malo;
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(dias) * 86_400_000);
    return { valor: fecha.toISOString().slice(0, 10) };
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fechaValida(+iso[1], +iso[2], +iso[3]) ?? malo;
  const dma = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (dma) {
    const anio = dma[3].length === 2 ? 2000 + Number(dma[3]) : Number(dma[3]);
    return fechaValida(anio, +dma[2], +dma[1]) ?? malo;
  }
  const mes = mesAIso(t);
  return mes ? { valor: mes } : malo;
}

function fechaValida(anio: number, mes: number, dia: number): { valor: string } | null {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) {
    return null;
  }
  return { valor: f.toISOString().slice(0, 10) };
}

const SI = new Set(["si", "s", "x", "1", "true", "verdadero", "yes"]);
const NO = new Set(["no", "n", "0", "false", "falso"]);

export function leerSiNo(texto: string, que: string, siVacio: boolean): Leido<boolean> {
  const t = normalizar(texto);
  if (!t) return { valor: siVacio };
  if (SI.has(t)) return { valor: true };
  if (NO.has(t)) return { valor: false };
  return { error: `${que}: "${texto.trim()}" no es Sí ni No.` };
}

const CONDICIONES: Record<string, CondicionVenta> = {
  libre: "LIBRE",
  "venta libre": "LIBRE",
  "sin receta": "LIBRE",
  otc: "LIBRE",
  receta: "RECETA_MEDICA",
  "receta medica": "RECETA_MEDICA",
  "con receta": "RECETA_MEDICA",
  "bajo receta": "RECETA_MEDICA",
  "receta archivada": "RECETA_ARCHIVADA",
  archivada: "RECETA_ARCHIVADA",
  "receta valorada": "RECETA_VALORADA",
  valorada: "RECETA_VALORADA",
};

export function leerCondicion(texto: string): Leido<CondicionVenta> {
  const t = normalizar(texto);
  if (!t) return { valor: "LIBRE" };
  const c = CONDICIONES[t];
  return c
    ? { valor: c }
    : {
        error: `Condición de venta "${texto.trim()}": va Libre, Receta, Receta archivada o Receta valorada.`,
      };
}

/** Un código que Excel mostró como número científico ya perdió dígitos. */
const CIENTIFICO = /^\d+([.,]\d+)?e\+?\d+$/i;

// ── El archivo entero ───────────────────────────────────────────────────────

export interface ProblemaFila {
  fila: number;
  mensaje: string;
}

export interface LecturaMedicamentos {
  medicamentos: MedicamentoImportado[];
  problemas: ProblemaFila[];
  /** Filas con datos debajo de los títulos (sin contar las vacías). */
  filas: number;
  ignoradas: string[];
}

/** Una fila ya validada, antes de juntarla con las de su medicamento. */
interface FilaLeida {
  fila: number;
  ficha: Omit<MedicamentoImportado, "fila" | "lotes">;
  lote: LoteImportado | null;
}

/**
 * Lee el archivo entero: valida cada fila y junta las de un mismo
 * medicamento. Lo que tiene problemas no se carga y se dice en qué fila está.
 */
export function leerMedicamentos(filas: Filas): LecturaMedicamentos | { error: string } {
  const encabezado = ubicarEncabezado(filas);
  if (!encabezado) {
    return {
      error:
        'No encontré los títulos "Nombre" y "Precio de venta" en las primeras filas. Usá la plantilla, o poné esos títulos arriba de tus columnas.',
    };
  }
  const problemas: ProblemaFila[] = [];
  const leidas: FilaLeida[] = [];
  let conDatos = 0;

  for (let i = encabezado.fila + 1; i < filas.length; i++) {
    const celdas = filas[i] ?? [];
    if (celdas.every((c) => !c?.trim())) continue;
    conDatos++;
    const fila = i + 1;
    const r = leerFila(celdas, encabezado.columnas, fila);
    if ("error" in r) problemas.push({ fila, mensaje: r.error });
    else leidas.push(r);
  }

  const { medicamentos, problemas: deAgrupar } = agrupar(leidas);
  return {
    medicamentos,
    problemas: [...problemas, ...deAgrupar].sort((a, b) => a.fila - b.fila),
    filas: conDatos,
    ignoradas: encabezado.ignoradas,
  };
}

function leerFila(
  celdas: string[],
  columnas: Partial<Record<ClaveColumna, number>>,
  fila: number,
): FilaLeida | { error: string } {
  const celda = (c: ClaveColumna) => {
    const i = columnas[c];
    return i == null ? "" : (celdas[i] ?? "").trim();
  };
  const opcional = (c: ClaveColumna) => celda(c).replace(/\s+/g, " ") || undefined;

  const nombre = opcional("nombre");
  if (!nombre) return { error: "Falta el nombre." };

  const codBarra = celda("codBarra").replace(/\s+/g, "");
  if (CIENTIFICO.test(codBarra)) {
    return {
      error: `El código de barras se ve como "${codBarra}": Excel ya le borró dígitos. Poné esa columna como Texto y volvé a escribir los códigos.`,
    };
  }

  const precio = leerNumero(celda("precio"), "El precio");
  if ("error" in precio) return precio;
  if (precio.valor == null) return { error: "Falta el precio de venta." };
  const costo = leerNumero(celda("costo"), "El costo");
  if ("error" in costo) return costo;
  const minimo = leerNumero(celda("stockMinimo"), "El stock mínimo");
  if ("error" in minimo) return minimo;
  const cantidad = leerNumero(celda("cantidad"), "La cantidad");
  if ("error" in cantidad) return cantidad;
  const condicion = leerCondicion(celda("condicionVenta"));
  if ("error" in condicion) return condicion;
  const controlado = leerSiNo(celda("controlado"), "Controlado", false);
  if ("error" in controlado) return controlado;
  // Sí por defecto: en una farmacia casi todo vence, y un medicamento sin
  // lote no aparece nunca en Vencimientos. Lo que no vence (un barbijo) se
  // marca "No".
  const manejaLote = leerSiNo(celda("manejaLote"), "Maneja lote", true);
  if ("error" in manejaLote) return manejaLote;
  const vencimiento = leerVencimiento(celda("vencimiento"));
  if ("error" in vencimiento) return vencimiento;

  const lote = celda("lote") || undefined;
  const hay = (cantidad.valor ?? 0) > 0;
  if (!hay && (lote || vencimiento.valor)) {
    return { error: "Tiene lote o vencimiento pero no la cantidad." };
  }
  if (hay && lote && !manejaLote.valor) {
    return { error: `Dice que no maneja lote, pero trae el lote ${lote}.` };
  }
  if (hay && lote && !vencimiento.valor) {
    return { error: `El lote ${lote} no tiene vencimiento (MM/AAAA).` };
  }
  if (hay && !lote && vencimiento.valor) {
    return { error: "Tiene vencimiento pero no el número de lote." };
  }

  return {
    fila,
    ficha: {
      nombre,
      codBarra: codBarra || undefined,
      principioActivo: opcional("principioActivo"),
      concentracion: opcional("concentracion"),
      formaFarmaceutica: opcional("formaFarmaceutica"),
      laboratorio: opcional("laboratorio"),
      registroSanitario: opcional("registroSanitario"),
      categoria: opcional("categoria"),
      condicionVenta: condicion.valor,
      controlado: controlado.valor,
      manejaLote: manejaLote.valor,
      precio: precio.valor,
      costo: costo.valor ?? undefined,
      stockMinimo: minimo.valor ?? undefined,
    },
    lote: hay
      ? {
          fila,
          codigo: lote,
          vencimiento: vencimiento.valor ?? undefined,
          cantidad: cantidad.valor!,
          costo: costo.valor ?? undefined,
        }
      : null,
  };
}

/** Quién es un medicamento sin código: nombre, concentración, laboratorio y forma. */
function claveDe(f: FilaLeida["ficha"]): string {
  return [f.nombre, f.concentracion, f.laboratorio, f.formaFarmaceutica]
    .map((t) => normalizar(t ?? ""))
    .join("|");
}

/**
 * Junta las filas de un mismo medicamento: la primera trae la ficha y cada
 * una suma su lote.
 *
 * Es el mismo medicamento si tiene el mismo código; sin código, si coincide
 * en nombre, concentración, laboratorio y forma. Dos códigos distintos son dos
 * artículos aunque se llamen igual (es la misma regla del backend para "ya
 * existe").
 */
function agrupar(leidas: FilaLeida[]): {
  medicamentos: MedicamentoImportado[];
  problemas: ProblemaFila[];
} {
  const medicamentos: MedicamentoImportado[] = [];
  const problemas: ProblemaFila[] = [];
  const porCodigo = new Map<string, MedicamentoImportado>();
  const porClave = new Map<string, MedicamentoImportado>();

  for (const l of leidas) {
    const clave = claveDe(l.ficha);
    const codigo = l.ficha.codBarra;
    let med = codigo ? porCodigo.get(codigo) : undefined;

    if (med && normalizar(med.nombre) !== normalizar(l.ficha.nombre)) {
      problemas.push({
        fila: l.fila,
        mensaje: `El código ${codigo} ya está en la fila ${med.fila} con otro nombre ("${med.nombre}").`,
      });
      continue;
    }
    if (!med) {
      const mismo = porClave.get(clave);
      if (mismo && (!codigo || !mismo.codBarra)) {
        med = mismo;
        // La fila sin código se suma a la que sí lo tiene, y al revés: la
        // primera con código se lo pone al medicamento.
        if (codigo && !mismo.codBarra) {
          mismo.codBarra = codigo;
          porCodigo.set(codigo, mismo);
        }
      }
    }
    if (med && l.ficha.manejaLote !== med.manejaLote) {
      problemas.push({
        fila: l.fila,
        mensaje: `"Maneja lote" no coincide con la fila ${med.fila}, que es el mismo medicamento.`,
      });
      continue;
    }
    if (!med) {
      med = { fila: l.fila, ...l.ficha, lotes: [] };
      medicamentos.push(med);
      if (codigo) porCodigo.set(codigo, med);
      if (!porClave.has(clave)) porClave.set(clave, med);
    }
    if (l.lote) med.lotes.push(l.lote);
  }
  return { medicamentos, problemas };
}

/** De a tantos medicamentos por pedido: cada tanda entra en el límite del servidor. */
export function enTandas<T>(lista: T[], tamano = 100): T[][] {
  const tandas: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) tandas.push(lista.slice(i, i + tamano));
  return tandas;
}

/** Lo que va a entrar, para mostrarlo antes de cargar. */
export function resumenStock(medicamentos: MedicamentoImportado[], hoyIso: string) {
  const lotes = medicamentos.flatMap((m) => m.lotes);
  return {
    conStock: medicamentos.filter((m) => m.lotes.length > 0).length,
    unidades: lotes.reduce((a, l) => a + l.cantidad, 0),
    lotes: lotes.filter((l) => l.codigo).length,
    /** Medicamentos que manejan lote y entran con stock sin lote: no se ven en Vencimientos. */
    sinLote: medicamentos.filter((m) => m.manejaLote && m.lotes.some((l) => !l.codigo)).length,
    /** Lotes que ya vencieron: entran, pero no se venden. */
    vencidos: lotes.filter((l) => l.vencimiento && l.vencimiento < hoyIso).length,
  };
}

// ── La plantilla ────────────────────────────────────────────────────────────

/** La plantilla para bajar: una hoja para llenar y otra con un ejemplo y la ayuda. */
export function plantillaMedicamentos(): Uint8Array {
  const titulos = COLUMNAS.map((c) => (c.obligatoria ? `${c.titulo} *` : c.titulo));
  const ejemplo = [
    titulos,
    ["7771234000017", "Ibuprofeno", "Ibuprofeno", "400 mg", "Comprimido", "IFA", "Analgésicos", "Libre", "No", "Sí", "NN-12345/2024", 2.5, 1.2, 20, 100, "IBU2601", "04/2028"],
    ["7771234000017", "Ibuprofeno", "Ibuprofeno", "400 mg", "Comprimido", "IFA", "Analgésicos", "Libre", "No", "Sí", "NN-12345/2024", 2.5, 1.1, 20, 40, "IBU2509", "09/2027"],
    ["", "Amoxicilina", "Amoxicilina", "500 mg", "Cápsula", "BAGÓ", "Antibióticos", "Receta", "No", "Sí", "", 3.5, 1.8, 10, 60, "AMX-77", "11/2027"],
    ["", "Barbijo quirúrgico", "", "", "", "", "Insumos", "Libre", "No", "No", "", 1, 0.4, 50, 200, "", ""],
    ["", "Alcohol en gel 250 ml", "", "", "", "", "Higiene", "Libre", "No", "Sí", "", 15, 9, 5, "", "", ""],
  ];
  const ayuda = [
    ["Cómo llenar la planilla"],
    ["Se carga la PRIMERA hoja. Esta es sólo de ejemplo: la de al lado se llena igual."],
    ["Obligatorios: Nombre y Precio de venta. Lo demás se puede dejar vacío."],
    ["Una fila por lote: si un medicamento tiene tres lotes, va en tres filas con el mismo código o nombre."],
    ["Vencimiento como en la caja: MM/AAAA (04/2028 vale hasta el último día de abril)."],
    ["Condición de venta: Libre, Receta, Receta archivada o Receta valorada."],
    ["Controlado y Maneja lote: Sí o No. Maneja lote vacío es Sí; lo que no vence (un barbijo) va No."],
    ["Cantidad vacía: entra sólo al catálogo, sin stock."],
    ["Lo que ya está en el catálogo no se toca: se puede subir el mismo archivo dos veces sin duplicar nada."],
  ];
  return crearXlsx([
    {
      nombre: "Medicamentos",
      filas: [titulos],
      anchos: COLUMNAS.map((c) => c.ancho),
      columnasTexto: COLUMNAS.flatMap((c, i) => (c.texto ? [i] : [])),
    },
    {
      nombre: "Ejemplo",
      filas: ejemplo,
      anchos: COLUMNAS.map((c) => c.ancho),
      columnasTexto: COLUMNAS.flatMap((c, i) => (c.texto ? [i] : [])),
    },
    { nombre: "Ayuda", filas: ayuda, anchos: [110] },
  ]);
}
