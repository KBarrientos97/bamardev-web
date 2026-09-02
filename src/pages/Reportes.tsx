import { useMemo, useState } from "react";
import { Icon, type NombreIcono } from "../components/Icon";
import { Chips, EncabezadoPagina } from "../components/filtros";
import { Boton, Campo, Cargando, ErrorMsg, Input, Kpi, Modal, Vacio } from "../components/ui";
import { api } from "../lib/api";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum, isoDia } from "../lib/format";
import { useApi } from "../lib/useApi";
import type { RangoReporte } from "../types";

// ── Período ─────────────────────────────────────────────────────────────────

type Preset = "hoy" | "ayer" | "semana" | "mes" | "anio" | "custom";

const OPC_PRESET = [
  ["hoy", "Hoy"],
  ["ayer", "Ayer"],
  ["semana", "Semana"],
  ["mes", "Mes"],
  ["anio", "Año"],
  ["custom", "Personalizado"],
] as const satisfies readonly (readonly [Preset, string])[];

/**
 * Rango de cada preset en hora LOCAL. Se arma con `isoDia` y no con
 * `toISOString`: en Bolivia (UTC-4) el ISO de la medianoche cae en el día
 * anterior y "hoy" mostraría las ventas de ayer.
 */
function rangoDePreset(preset: Preset): RangoReporte {
  const hoy = new Date();
  const desde = new Date(hoy);

  switch (preset) {
    case "ayer": {
      desde.setDate(desde.getDate() - 1);
      return { desde: isoDia(desde), hasta: isoDia(desde) };
    }
    case "semana":
      desde.setDate(desde.getDate() - 6);
      break;
    case "mes":
      desde.setDate(1);
      break;
    case "anio":
      desde.setMonth(0, 1);
      break;
    case "hoy":
    case "custom":
      break;
  }
  return { desde: isoDia(desde), hasta: isoDia(hoy) };
}

// ── Catálogo de reportes ────────────────────────────────────────────────────

interface FichaReporte {
  nombre: string;
  titulo: string;
  texto: string;
  icono: NombreIcono;
}

const REPORTES: FichaReporte[] = [
  {
    nombre: "top-productos",
    titulo: "Productos más vendidos",
    texto: "Qué se vende más y cuánto deja cada cosa.",
    icono: "trendingUp",
  },
  {
    nombre: "productos-lentos",
    titulo: "Productos lentos",
    texto: "Lo que no rota y tiene plata parada en el almacén.",
    icono: "trendingDown",
  },
  {
    nombre: "categorias",
    titulo: "Por categoría",
    texto: "Cuánto aporta cada rubro del catálogo.",
    icono: "grid",
  },
  {
    nombre: "horas",
    titulo: "Horarios",
    texto: "Hora pico y mejor día de la semana.",
    icono: "clock",
  },
  {
    nombre: "metodos-pago",
    titulo: "Formas de pago",
    texto: "Cuánto entra por efectivo, QR y tarjeta.",
    icono: "qr",
  },
  {
    nombre: "descuentos",
    titulo: "Descuentos y anulaciones",
    texto: "Lo que se perdió y quién lo autorizó.",
    icono: "alert",
  },
  {
    nombre: "cierres",
    titulo: "Cierres de caja",
    texto: "Historial de turnos y diferencias de arqueo.",
    icono: "lock",
  },
  {
    nombre: "delivery",
    titulo: "Delivery",
    texto: "Entregas, tarifas y lo que hay por rendir.",
    icono: "truck",
  },
  {
    nombre: "stock-critico",
    titulo: "Stock crítico",
    texto: "Lo que está por agotarse en el almacén.",
    icono: "warehouse",
  },
  {
    nombre: "insumos",
    titulo: "Insumos",
    texto: "Compras de materia prima y su costo.",
    icono: "sack",
  },
  {
    nombre: "financiero",
    titulo: "Financiero",
    texto: "Ventas contra compras y margen del período.",
    icono: "dollar",
  },
  {
    nombre: "creditos",
    titulo: "Créditos",
    texto: "Deuda por cobrar, antigüedad y cobros.",
    icono: "fileText",
  },
];

// ── Formateo genérico ───────────────────────────────────────────────────────

/** Claves cuyo valor es plata: se muestran con el símbolo del negocio. */
const PISTAS_DINERO = [
  "total",
  "monto",
  "ingreso",
  "precio",
  "costo",
  "venta",
  "saldo",
  "importe",
  // Las que no encajan en las pistas de arriba pero igual son plata: salen de
  // los reportes reales (cierres, financiero, insumos, créditos).
  "efectivo",
  "esperado",
  "apertura",
  "conteo",
  "ganancia",
  "utilidad",
  "invertido",
  "valorparado",
  "cobrado",
  "fiado",
  "abonos",
  "rendir",
  "tarifas",
];

/** Claves de porcentaje que ya vienen en 0..100 (no en 0..1). */
const PISTAS_PCT = ["pct", "porcentaje", "margen"];

/**
 * Claves que CUENTAN cosas aunque su nombre contenga una pista de dinero:
 * `clientesConSaldo` son 4 clientes, no Bs 4, y `creditosAbiertos` son
 * documentos. Sin esta lista el formateo les pone el símbolo de la moneda.
 */
const PISTAS_CONTEO = [
  "cantidad",
  "clientes",
  "creditos",
  "abiertos",
  "num",
  "index",
  "id",
  "dias",
  "unidades",
  "vendidas",
  "stock",
  "pendientes",
];

/**
 * Parte la clave en palabras (`totalPorCobrar` → total, por, cobrar). El
 * conteo se compara por palabra entera y no por substring: "id" vive dentro
 * de "vencido", "utilidad" e "invertido", y buscarlo suelto los degradaba a
 * simple número justo cuando son los montos más importantes del reporte.
 */
function palabras(clave: string): string[] {
  return clave
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
}

function esDinero(clave: string): boolean {
  const k = clave.toLowerCase();
  // El porcentaje gana: "margenPct" contiene "margen" pero no es plata.
  if (PISTAS_PCT.some((p) => k.includes(p))) return false;
  // Y el conteo le gana al dinero: "clientesConSaldo" cuenta gente.
  if (palabras(clave).some((p) => PISTAS_CONTEO.includes(p))) return false;
  return PISTAS_DINERO.some((p) => k.includes(p));
}

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}(T|$)/;

/** camelCase → "Texto legible": las claves salen del backend sin traducir. */
function legible(clave: string): string {
  const conEspacios = clave
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1).toLowerCase();
}

/** Valor de celda ya formateado según lo que insinúa su clave. */
function fmtValor(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";

  if (typeof valor === "number") {
    if (esDinero(clave)) return fmtMoney(valor);
    if (PISTAS_PCT.some((p) => clave.toLowerCase().includes(p))) return `${fmtNum(valor, 1)}%`;
    return fmtNum(valor, Number.isInteger(valor) ? 0 : 2);
  }

  if (typeof valor === "string") {
    if (ISO_FECHA.test(valor)) {
      // Con hora se muestra la hora; una fecha suelta (yyyy-MM-dd) no la tiene.
      return valor.includes("T") ? fmtFechaHora(valor) : fmtFecha(valor);
    }
    return valor;
  }

  return String(valor);
}

/** Texto plano del valor, para el CSV (sin símbolos que rompan la planilla). */
function valorCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

/**
 * Baja una tabla como CSV. Separador `;` porque en es-BO la coma es el
 * decimal y Excel partiría los números al medio.
 */
function bajarCsv(nombre: string, filas: Record<string, unknown>[], columnas: string[]) {
  const escapar = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lineas = [
    columnas.map((c) => escapar(legible(c))).join(";"),
    ...filas.map((f) => columnas.map((c) => escapar(valorCsv(f[c]))).join(";")),
  ];
  // BOM para que Excel abra los acentos bien en Windows.
  const blob = new Blob(["﻿" + lineas.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function Reportes() {
  const [preset, setPreset] = useState<Preset>("mes");
  const [desdeManual, setDesdeManual] = useState(() => rangoDePreset("mes").desde ?? "");
  const [hastaManual, setHastaManual] = useState(() => isoDia(new Date()));
  const [abierto, setAbierto] = useState<FichaReporte | null>(null);

  const rango: RangoReporte = useMemo(
    () =>
      preset === "custom"
        ? { desde: desdeManual, hasta: hastaManual }
        : rangoDePreset(preset),
    [preset, desdeManual, hastaManual],
  );

  const resumen = useApi<Record<string, unknown>>(
    () => api.reporte<Record<string, unknown>>("resumen", rango),
    [rango.desde, rango.hasta],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Reportes"
        subtitulo={`Del ${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}`}
      />

      <div className="space-y-3">
        <Chips valor={preset} opciones={OPC_PRESET} onChange={setPreset} />
        {preset === "custom" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Desde">
              <Input
                type="date"
                value={desdeManual}
                max={hastaManual}
                onChange={(e) => setDesdeManual(e.target.value)}
              />
            </Campo>
            <Campo label="Hasta">
              <Input
                type="date"
                value={hastaManual}
                min={desdeManual}
                onChange={(e) => setHastaManual(e.target.value)}
              />
            </Campo>
          </div>
        )}
      </div>

      <ErrorMsg>{resumen.error}</ErrorMsg>

      {resumen.cargando ? (
        <Cargando />
      ) : (
        <KpisResumen datos={resumen.datos} />
      )}

      <section className="space-y-3">
        <h2 className="text-[15px] font-bold text-texto">Reportes de detalle</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {REPORTES.map((r) => (
            <li key={r.nombre}>
              <button
                onClick={() => setAbierto(r)}
                className="card flex w-full items-start gap-3 p-4 text-left transition-shadow hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <Icon name={r.icono} size={21} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-bold text-texto">{r.titulo}</h3>
                  <p className="mt-0.5 text-[13px] text-texto-3">{r.texto}</p>
                </div>
                <Icon name="chevronRight" size={17} color="#94A3B8" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {abierto && (
        <VistaReporte
          key={`${abierto.nombre}-${rango.desde}-${rango.hasta}`}
          ficha={abierto}
          rango={rango}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  );
}

/**
 * KPIs del resumen. El backend no manda un `totales` plano: la plata está en
 * `ventas` y `finanzas`, y tickets/ticketPromedio/unidades vienen como
 * `{ valor, deltaPct }`. Se leen las dos formas por si el contrato cambia.
 */
function KpisResumen({ datos }: { datos: Record<string, unknown> | null }) {
  if (!datos) return null;

  const totales = esObjetoPlano(datos.totales) ? datos.totales : {};
  const finanzas = esObjetoPlano(datos.finanzas) ? datos.finanzas : {};

  /** Lee un número tanto si es escalar como si viene envuelto en `{valor}`. */
  const num = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (esObjetoPlano(v) && typeof v.valor === "number") return v.valor;
    return null;
  };

  const ventas = num(totales.ventas) ?? num(datos.tickets);
  const ingresos = num(finanzas.ingresosNetos) ?? num(totales.ingresos) ?? num(datos.ventas);
  const ticket = num(datos.ticketPromedio) ?? num(totales.ticketPromedio);
  const utilidad = num(finanzas.utilidadBruta);
  const anuladas = num(totales.anuladas);
  const pendientes = num(totales.pendientes);

  const tarjetas: { etiqueta: string; valor: string; icono: NombreIcono; tono?: "rojo" | "amarillo" }[] = [];
  if (ingresos !== null)
    tarjetas.push({ etiqueta: "Ingresos", valor: fmtMoney(ingresos), icono: "dollar" });
  if (ventas !== null)
    tarjetas.push({ etiqueta: "Ventas", valor: fmtNum(ventas), icono: "cart" });
  if (ticket !== null)
    tarjetas.push({ etiqueta: "Ticket promedio", valor: fmtMoney(ticket), icono: "chart" });
  if (utilidad !== null)
    tarjetas.push({ etiqueta: "Utilidad bruta", valor: fmtMoney(utilidad), icono: "trendingUp" });
  if (anuladas !== null)
    tarjetas.push({ etiqueta: "Anuladas", valor: fmtNum(anuladas), icono: "x", tono: "rojo" });
  if (pendientes !== null)
    tarjetas.push({
      etiqueta: "Pendientes",
      valor: fmtNum(pendientes),
      icono: "clock",
      tono: "amarillo",
    });

  if (tarjetas.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tarjetas.map((t) => (
        <Kpi
          key={t.etiqueta}
          etiqueta={t.etiqueta}
          valor={t.valor}
          icono={t.icono}
          tono={t.tono ?? "verde"}
        />
      ))}
    </div>
  );
}

function VistaReporte({
  ficha,
  rango,
  onClose,
}: {
  ficha: FichaReporte;
  rango: RangoReporte;
  onClose: () => void;
}) {
  const datos = useApi<unknown>(() => api.reporte(ficha.nombre, rango), [ficha.nombre]);

  return (
    <Modal
      abierto
      titulo={ficha.titulo}
      subtitulo={`Del ${fmtFecha(rango.desde)} al ${fmtFecha(rango.hasta)}`}
      onClose={onClose}
      ancho="max-w-4xl"
    >
      {datos.cargando ? (
        <Cargando />
      ) : datos.error ? (
        <ErrorMsg>{datos.error}</ErrorMsg>
      ) : (
        <Renderizador nombre={ficha.nombre} datos={datos.datos} />
      )}
    </Modal>
  );
}

/**
 * Dibuja la respuesta sin conocerla: cada reporte tiene su propia forma y
 * mantener doce componentes a mano se desincronizaría con el backend en el
 * primer cambio. Un array de objetos es una tabla; un objeto es una sección
 * por cada array que traiga y KPIs con sus escalares.
 */
function Renderizador({ nombre, datos }: { nombre: string; datos: unknown }) {
  if (datos === null || datos === undefined) {
    return <Vacio icono="chart" titulo="Sin datos" texto="No hay nada en este período." />;
  }

  if (Array.isArray(datos)) {
    return <Tabla nombre={nombre} filas={datos} />;
  }

  if (!esObjetoPlano(datos)) {
    return <p className="text-sm text-texto-2">{String(datos)}</p>;
  }

  const escalares: [string, unknown][] = [];
  const listas: [string, unknown[]][] = [];
  const objetos: [string, Record<string, unknown>][] = [];

  for (const [clave, valor] of Object.entries(datos)) {
    if (Array.isArray(valor)) listas.push([clave, valor]);
    else if (esObjetoPlano(valor)) objetos.push([clave, valor]);
    else escalares.push([clave, valor]);
  }

  // Los objetos anidados (financiero.compras, creditos.resumen) son grupos de
  // escalares: se aplanan a KPIs en vez de inventarles una tabla de una fila.
  const kpis = [
    ...escalares,
    ...objetos.flatMap(([padre, obj]) =>
      Object.entries(obj).map(([k, v]) => [`${padre}.${k}`, v] as [string, unknown]),
    ),
  ].filter(([, v]) => v !== null && v !== undefined && v !== "");

  const vacio = kpis.length === 0 && listas.every(([, l]) => l.length === 0);
  if (vacio) {
    return <Vacio icono="chart" titulo="Sin datos" texto="No hay nada en este período." />;
  }

  return (
    <div className="space-y-5">
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {kpis.map(([clave, valor]) => (
            <div key={clave} className="rounded-xl bg-muted p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
                {legible(clave.split(".").pop() ?? clave)}
              </p>
              <p className="mt-0.5 text-sm font-bold text-texto">
                {fmtValor(clave, valor)}
              </p>
            </div>
          ))}
        </div>
      )}

      {listas.map(([clave, filas]) => (
        <section key={clave}>
          <h4 className="mb-2 text-[13px] font-bold text-texto">{legible(clave)}</h4>
          <Tabla nombre={`${nombre}-${clave}`} filas={filas} />
        </section>
      ))}
    </div>
  );
}

function Tabla({ nombre, filas }: { nombre: string; filas: unknown[] }) {
  if (filas.length === 0) {
    return <p className="text-[13px] text-texto-3">Sin datos en este período.</p>;
  }

  // Hay reportes que mandan listas de números sueltos (horas.porHora): se
  // muestran indexadas para que igual se puedan leer y exportar.
  const objetos: Record<string, unknown>[] = filas.every(esObjetoPlano)
    ? (filas as Record<string, unknown>[])
    : filas.map((v, i) => ({ posicion: i, valor: v }));

  // Las columnas se juntan de todas las filas: una fila puede traer una clave
  // que otra no, y quedarse con las de la primera perdería datos.
  const columnas = [...new Set(objetos.flatMap((f) => Object.keys(f)))];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-texto-4">
          {fmtNum(objetos.length)} {objetos.length === 1 ? "fila" : "filas"}
        </span>
        <Boton
          variante="ghost"
          icono="download"
          className="px-3 py-1.5 text-xs"
          onClick={() => bajarCsv(nombre, objetos, columnas)}
        >
          Exportar CSV
        </Boton>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde">
        <table className="w-full min-w-max text-left text-[13px]">
          <thead className="bg-muted">
            <tr>
              {columnas.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-texto-4"
                >
                  {legible(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde-soft">
            {objetos.map((f, i) => (
              <tr key={i}>
                {columnas.map((c) => (
                  <td key={c} className="whitespace-nowrap px-3.5 py-2.5 text-texto-2">
                    {fmtValor(c, f[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
