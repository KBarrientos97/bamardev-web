import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Badge, Boton, Cargando, ErrorMsg, Input, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtFechaHora, fmtNum, isoDia } from "../../lib/format";
import { normalizar } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { AsientoControlado, LibroControlados as Libro } from "../../types";
import LibroImpreso from "./LibroImpreso";
import { numerarPorSucursal, tituloLibro } from "./impresionLibro";

const LIBROS = [
  ["", "Los dos libros"],
  ["PSICOTROPICOS", "Psicotrópicos"],
  ["ESTUPEFACIENTES", "Estupefacientes"],
] as const;

/** El primer día del mes de una fecha, en hora local. */
function inicioDeMes(d: Date, mesesAtras = 0): string {
  return isoDia(new Date(d.getFullYear(), d.getMonth() - mesesAtras, 1));
}

/** El último día del mes anterior. */
function finDelMesPasado(d: Date): string {
  return isoDia(new Date(d.getFullYear(), d.getMonth(), 0));
}

/**
 * El libro de controlados: lo vendido con receta archivada (psicotrópicos) o
 * valorada (estupefacientes), con el paciente, el médico y la receta de cada
 * venta. Es lo que la farmacia presenta al SEDES por gestión.
 *
 * Se llena solo al cobrar: no hay alta ni edición a mano. Una venta anulada
 * sigue en el libro, marcada, porque el libro tiene que explicar también lo
 * que salió y volvió.
 *
 * Se exporta a Excel para archivarlo, y se imprime con encabezado y firmas
 * (`LibroImpreso`): el libro oficial lo firma el regente farmacéutico, y una
 * planilla pelada sin quién la emite ni de qué período es no sirve para eso.
 */
export default function LibroControladosPagina() {
  const hoy = new Date();
  const { negocio, usuario } = useAuth();
  const [libro, setLibro] = useState<"" | Libro>("");
  const [desde, setDesde] = useState(() => inicioDeMes(hoy));
  const [hasta, setHasta] = useState(() => isoDia(hoy));
  const suc = useSucursales();

  // La hora que lleva el impreso es la de mandar a imprimir, no la de abrir la
  // pantalla: un libro que quedó abierto desde la mañana no puede decir que se
  // imprimió a las 8. `flushSync` deja la fecha en el DOM antes de que el
  // navegador arme la vista previa, igual que hace el recibo del POS.
  const [impresoEn, setImpresoEn] = useState<Date | null>(null);
  const imprimir = () => {
    flushSync(() => setImpresoEn(new Date()));
    window.print();
  };
  // Ctrl+P no pasa por el botón: la hora se fija igual al avisar el navegador.
  useEffect(() => {
    const sellar = () => flushSync(() => setImpresoEn(new Date()));
    window.addEventListener("beforeprint", sellar);
    return () => window.removeEventListener("beforeprint", sellar);
  }, []);

  const asientos = useApi(
    () =>
      api.libroControlados({
        desde,
        hasta,
        libro: libro || null,
        almacenId: suc.elegir ? suc.sucursalId : null,
      }),
    [desde, hasta, libro, suc.elegir, suc.sucursalId],
  );
  const filas = useMemo(() => asientos.datos ?? [], [asientos.datos]);
  const anuladas = filas.filter((a) => a.anuladaEn).length;
  // La columna de sucursal sólo cuando hay más de una en el período.
  const variasSucursales = new Set(filas.map((a) => a.almacen.id)).size > 1;
  const titulo = tituloLibro(libro);
  // Para el nombre de la planilla: el local del libro o "todas".
  const sucursalNombreArchivo = suc.sedeVista || suc.todas;

  // La sucursal que encabeza el impreso: la elegida en el filtro o, para quien
  // entró atado a una (el backend le fuerza la suya), esa. Con un solo local el
  // impreso queda como siempre (el atado lleva su sede, la organización nada).
  const sucursalImpresa = suc.hayVarias ? suc.sedeVista : (usuario?.sucursal ?? "");
  // Con 2+ locales cada uno lleva SU libro, con su N° corrido y su encabezado:
  // el consolidado ("Todas") mezclaría asientos de locales distintos en un papel
  // que se firma y se presenta al SEDES. Se exporta (la planilla lleva la
  // sucursal en una columna), pero para imprimir hay que elegir una.
  const faltaElegirLocal = suc.elegir && suc.sucursalId == null;
  // El N° de cada asiento en el libro de SU sucursal (con un local, 1, 2, 3…).
  const numeros = numerarPorSucursal(filas);
  // La sesión no trae dirección ni teléfono del negocio, pero la sucursal sí
  // (`Almacen`). Se toma la elegida o, sin filtro, la principal: es la que usa
  // la caja cuando una operación no dice de cuál se trata. En el consolidado
  // de varias no hay una sola dirección, y el impreso deja el renglón en blanco.
  const local =
    suc.sucursales.find((a) => a.id === suc.sucursalId) ?? (suc.elegir ? undefined : suc.sugerida);
  const negocioImpreso = negocio
    ? { nombre: negocio.nombre, direccion: local?.direccion, telefono: local?.telefono }
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <div>
        <EncabezadoPagina
          titulo="Libro de controlados"
          subtitulo={
            "Lo vendido con receta archivada o valorada. Se llena solo al cobrar." +
            // La sede del usuario asignado (sólo con 2+ locales): apenas el nombre.
            (suc.miSede ? ` · ${suc.miSede}` : "")
          }
          accion={
            <div className="flex gap-2">
              <Boton
                variante="soft"
                icono="download"
                disabled={filas.length === 0}
                onClick={() =>
                  bajarCsv(titulo, desde, hasta, filas, numeros, suc.hayVarias ? sucursalNombreArchivo : null)
                }
              >
                Exportar a Excel
              </Boton>
              <Boton
                variante="soft"
                icono="printer"
                disabled={filas.length === 0 || faltaElegirLocal}
                onClick={imprimir}
              >
                Imprimir
              </Boton>
            </div>
          }
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-borde bg-white p-4">
        <Chips valor={libro} opciones={LIBROS} onChange={setLibro} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-texto-3">Desde</span>
            <Input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => e.target.value && setDesde(e.target.value)}
              className="w-40"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-texto-3">Hasta</span>
            <Input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => e.target.value && setHasta(e.target.value)}
              className="w-40"
            />
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            <Atajo
              onClick={() => {
                setDesde(inicioDeMes(hoy));
                setHasta(isoDia(hoy));
              }}
            >
              Este mes
            </Atajo>
            <Atajo
              onClick={() => {
                setDesde(inicioDeMes(hoy, 1));
                setHasta(finDelMesPasado(hoy));
              }}
            >
              Mes pasado
            </Atajo>
            {/* La gestión: el libro se presenta por año. */}
            <Atajo
              onClick={() => {
                setDesde(isoDia(new Date(hoy.getFullYear(), 0, 1)));
                setHasta(isoDia(hoy));
              }}
            >
              Esta gestión
            </Atajo>
          </div>
        </div>
        {suc.elegir && (
          <Chips
            valor={suc.sucursalId == null ? "" : String(suc.sucursalId)}
            opciones={suc.opciones}
            onChange={(v) => suc.setSucursalId(v ? Number(v) : null)}
          />
        )}
        {faltaElegirLocal && (
          <p className="text-xs text-texto-3">
            Para imprimir elegí una sucursal: cada local lleva su propio libro, con su
            numeración y su encabezado. Excel baja todas juntas, con la sucursal de cada asiento.
          </p>
        )}
      </div>

      {asientos.cargando && !asientos.datos ? (
        <Cargando />
      ) : asientos.error ? (
        <ErrorMsg onReintentar={asientos.recargar}>{asientos.error}</ErrorMsg>
      ) : filas.length === 0 ? (
        <Vacio
          icono="fileText"
          titulo="No hay ventas de controlados"
          texto="En este período no se vendió nada con receta archivada ni valorada."
        />
      ) : (
        <>
          <p className="text-[13px] text-texto-3">
            {fmtNum(filas.length)} {filas.length === 1 ? "asiento" : "asientos"}
            {anuladas > 0 && ` · ${fmtNum(anuladas)} de ventas anuladas`}
          </p>

          {/* Teléfono: una tarjeta por asiento. */}
          <ul className="space-y-2 lg:hidden">
            {filas.map((a, i) => (
              <li
                key={a.id}
                className={`rounded-2xl border border-borde bg-white p-3.5 ${a.anuladaEn ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-texto">
                      {numeros[i]}. {a.producto.nombre}
                    </p>
                    <p className="text-xs text-texto-3">{fmtFechaHora(a.fecha)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-texto">
                    {fmtNum(a.cantidad)} u.
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-texto-4">Paciente</dt>
                  <dd className="text-texto-2">{paciente(a)}</dd>
                  <dt className="text-texto-4">Médico</dt>
                  <dd className="text-texto-2">{medico(a)}</dd>
                  <dt className="text-texto-4">Receta</dt>
                  <dd className="text-texto-2">{receta(a)}</dd>
                  <dt className="text-texto-4">Despachó</dt>
                  <dd className="text-texto-2">
                    {a.despachadoPor.nombre} · {a.comprobante ?? `Venta ${a.ventaId}`}
                    {variasSucursales && ` · ${a.almacen.nombre}`}
                  </dd>
                </dl>
                {a.anuladaEn && <Anulada fecha={a.anuladaEn} />}
              </li>
            ))}
          </ul>

          {/* Escritorio: la tabla del libro. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-borde bg-white lg:block">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-borde bg-muted text-xs font-semibold text-texto-3">
                <tr>
                  <th className="px-3 py-2.5">N°</th>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Medicamento</th>
                  <th className="px-3 py-2.5 text-right">Cant.</th>
                  <th className="px-3 py-2.5">Paciente</th>
                  <th className="px-3 py-2.5">Médico</th>
                  <th className="px-3 py-2.5">Receta</th>
                  <th className="px-3 py-2.5">Despachó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-soft">
                {filas.map((a, i) => (
                  <tr key={a.id} className={a.anuladaEn ? "text-texto-4" : "text-texto-2"}>
                    <td className="px-3 py-2.5 align-top">{numeros[i]}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top">
                      {fmtFechaHora(a.fecha)}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <span className={`font-semibold ${a.anuladaEn ? "line-through" : "text-texto"}`}>
                        {a.producto.nombre}
                      </span>
                      {droga(a) && (
                        <span className="block text-xs text-texto-4">{droga(a)}</span>
                      )}
                      {a.anuladaEn && <Anulada fecha={a.anuladaEn} />}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-bold">
                      {fmtNum(a.cantidad)}
                    </td>
                    <td className="px-3 py-2.5 align-top">{paciente(a)}</td>
                    <td className="px-3 py-2.5 align-top">{medico(a)}</td>
                    <td className="px-3 py-2.5 align-top">{receta(a)}</td>
                    <td className="px-3 py-2.5 align-top">
                      {a.despachadoPor.nombre}
                      <span className="block text-xs text-texto-4">
                        {a.comprobante ?? `Venta ${a.ventaId}`}
                        {variasSucursales && ` · ${a.almacen.nombre}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* El papel: oculto en pantalla, lo único que sale al imprimir. Sin
              elegir local (2+ locales) no se arma: no hay un libro que imprimir. */}
          {!faltaElegirLocal && (
            <LibroImpreso
              negocio={negocioImpreso}
              libro={libro}
              sucursal={sucursalImpresa}
              desde={desde}
              hasta={hasta}
              impresoPor={usuario?.nombre ?? usuario?.username ?? ""}
              impresoEn={impresoEn ?? hoy}
              filas={filas}
            />
          )}
        </>
      )}
    </div>
  );
}

function Atajo({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-borde px-2.5 py-1.5 text-xs font-semibold text-texto-2 hover:bg-muted"
    >
      {children}
    </button>
  );
}

function Anulada({ fecha }: { fecha: string }) {
  return (
    <span className="mt-1 flex items-center gap-1">
      <Badge tono="rojo">Anulada</Badge>
      <span className="text-[11px] text-texto-4">el {fmtFecha(fecha)}</span>
    </span>
  );
}

/**
 * La droga y su concentración, si dicen algo que el nombre no dice: con
 * "Clonazepam 2 mg" de nombre, repetir "Clonazepam 2 mg" abajo es ruido.
 */
function droga(a: AsientoControlado): string | null {
  const texto = [a.producto.principioActivo, a.producto.concentracion].filter(Boolean).join(" ");
  return texto && texto.toLowerCase() !== a.producto.nombre.toLowerCase() ? texto : null;
}

const paciente = (a: AsientoControlado) =>
  a.pacienteDocumento ? `${a.pacienteNombre} (CI ${a.pacienteDocumento})` : a.pacienteNombre;

const medico = (a: AsientoControlado) => `${a.medicoNombre} · Mat. ${a.medicoMatricula}`;

const receta = (a: AsientoControlado) =>
  `${a.recetaNumero ? `N° ${a.recetaNumero} · ` : ""}${fmtFecha(a.recetaFecha.slice(0, 10))}`;

/** Una celda de planilla: entre comillas, y sin que Excel la lea como fórmula. */
function celda(v: string | number): string {
  const t = String(v);
  const seguro = /^[=+@-]/.test(t) && !/^-?[\d.,]+$/.test(t) ? `'${t}` : t;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * La planilla del libro. `;` y coma decimal, como el resto de las
 * exportaciones: en un Excel es-BO la coma es el decimal.
 */
function bajarCsv(
  titulo: string,
  desde: string,
  hasta: string,
  filas: AsientoControlado[],
  /** El N° de cada asiento en el libro de su sucursal (ver `numerarPorSucursal`). */
  numeros: number[],
  /** De qué local es la planilla, para el nombre del archivo; null = un solo local. */
  sucursal: string | null,
) {
  const columnas = [
    "N°",
    "Fecha",
    "Medicamento",
    "Principio activo",
    "Cantidad",
    "Paciente",
    "CI",
    "Médico",
    "Matrícula",
    "N° de receta",
    "Fecha de la receta",
    "Venta",
    "Despachó",
    "Sucursal",
    "Anulada",
  ];
  const lineas = [
    columnas.map(celda).join(";"),
    ...filas.map((a, i) =>
      [
        numeros[i],
        fmtFechaHora(a.fecha),
        a.producto.nombre,
        [a.producto.principioActivo, a.producto.concentracion].filter(Boolean).join(" "),
        String(a.cantidad).replace(".", ","),
        a.pacienteNombre,
        a.pacienteDocumento ?? "",
        a.medicoNombre,
        a.medicoMatricula,
        a.recetaNumero ?? "",
        fmtFecha(a.recetaFecha.slice(0, 10)),
        a.comprobante ?? String(a.ventaId),
        a.despachadoPor.nombre,
        a.almacen.nombre,
        a.anuladaEn ? fmtFecha(a.anuladaEn) : "",
      ]
        .map(celda)
        .join(";"),
    ),
  ];
  const blob = new Blob(["\uFEFF" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  // Con 2+ locales el archivo dice de cuál es: los libros de dos locales no se pisan.
  const deCual = sucursal
    ? `-${normalizar(sucursal).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`
    : "";
  enlace.download = `${titulo.toLowerCase().replace(/\s+/g, "-")}${deCual}-${desde}-a-${hasta}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

