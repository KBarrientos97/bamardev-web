import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import { Badge, Boton, Campo, ErrorMsg, Kpi, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtNum, isoDia } from "../../lib/format";
import { leerPlanilla } from "../../lib/planilla";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { MedicamentoImportado } from "../../types";
import {
  enTandas,
  leerMedicamentos,
  plantillaMedicamentos,
  resumenStock,
  type LecturaMedicamentos,
  type ProblemaFila,
} from "./cargaExcel";
import { ordenarSucursales } from "./mercaderia";

/** Más que esto se carga en dos archivos: el navegador lo lee entero de una vez. */
const MAXIMO_FILAS = 10_000;

/** Cuántos problemas se listan; el resto se cuenta. */
const PROBLEMAS_A_LA_VISTA = 200;

type Fase = "elegir" | "revisando" | "revisado" | "cargando" | "listo";

interface Revision {
  /** Lo que se va a crear: ni existe ni tiene problemas. */
  nuevos: MedicamentoImportado[];
  existen: number;
  problemas: ProblemaFila[];
}

interface Final {
  creados: number;
  unidades: number;
  existian: number;
  problemas: ProblemaFila[];
  /** La carga se cortó: por qué. */
  cortada?: string;
}

/**
 * Cargar medicamentos desde Excel: el catálogo de una farmacia que arranca y
 * su stock de entrada, con lotes. Dos mil medicamentos a mano eran días.
 *
 * Primero se REVISA y después se carga. La revisión no escribe nada: dice
 * cuántos se van a crear, cuántos ya estaban (y no se tocan) y qué filas
 * tienen problemas, con su número, para corregirlas en el Excel. Lo que ya
 * existe se saltea siempre, así que subir el mismo archivo otra vez —porque se
 * cortó o porque se corrigió una fila— no duplica nada.
 */
export default function ImportarMedicamentos() {
  const { usuario } = useAuth();
  const almacenes = useApi(() => api.getAlmacenes(), []);
  const [almacenId, setAlmacenId] = useState("");
  const [fase, setFase] = useState<Fase>("elegir");
  const [archivo, setArchivo] = useState("");
  const [lectura, setLectura] = useState<LecturaMedicamentos | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [final, setFinal] = useState<Final | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Quien pertenece a una sucursal carga en la suya: el backend no le deja otra.
  const miSucursal = usuario?.sucursalId ?? null;
  const opciones = useMemo(
    () =>
      ordenarSucursales(
        (almacenes.datos ?? []).filter(
          (a) => a.activo !== false && (miSucursal == null || a.id === miSucursal),
        ),
      ),
    [almacenes.datos, miSucursal],
  );
  const sucursal = opciones.find((a) => String(a.id) === almacenId);

  // La sucursal de quien carga y, si es el dueño, la principal: igual que el
  // ingreso de mercadería.
  useEffect(() => {
    if (almacenId || opciones.length === 0) return;
    const sugerida =
      opciones.find((a) => a.id === miSucursal) ?? opciones.find((a) => a.esPrincipal) ?? opciones[0];
    setAlmacenId(String(sugerida.id));
  }, [opciones, almacenId, miSucursal]);

  function bajarPlantilla() {
    const blob = new Blob([plantillaMedicamentos() as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "plantilla-medicamentos.xlsx";
    enlace.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Vuelve a empezar. El campo del archivo se vacía para que elegir el MISMO
   * archivo otra vez (ya corregido) dispare la lectura: sin cambio de valor,
   * el navegador no avisa nada.
   */
  function reiniciar(vaciarCampo = true) {
    setFase("elegir");
    setArchivo("");
    setLectura(null);
    setRevision(null);
    setFinal(null);
    setError("");
    if (vaciarCampo && input.current) input.current.value = "";
  }

  async function alElegir(f: File | undefined) {
    if (!f) return;
    // El campo queda con el nombre del archivo elegido: vaciarlo acá mostraba
    // "Ningún archivo seleccionado" al lado de su propia revisión.
    reiniciar(false);
    setArchivo(f.name);
    setFase("revisando");
    try {
      const leida = leerMedicamentos(await leerPlanilla(f));
      if ("error" in leida) throw new Error(leida.error);
      if (leida.filas > MAXIMO_FILAS) {
        throw new Error(
          `Tiene ${fmtNum(leida.filas)} filas: cargalo en partes de hasta ${fmtNum(MAXIMO_FILAS)}.`,
        );
      }
      if (leida.filas === 0) throw new Error("El archivo no tiene filas debajo de los títulos.");

      // Lo que sólo sabe el servidor: qué ya está en el catálogo.
      const porFila = new Map<number, { estado: string; mensaje?: string }>();
      for (const tanda of enTandas(leida.medicamentos)) {
        const r = await api.importarMedicamentos({
          almacenId: Number(almacenId),
          soloRevisar: true,
          medicamentos: tanda,
        });
        for (const x of r.resultados) porFila.set(x.fila, x);
      }
      const delServidor = leida.medicamentos
        .map((m) => ({ m, r: porFila.get(m.fila) }))
        .filter(({ r }) => r?.estado === "ERROR")
        .map(({ m, r }) => ({ fila: m.fila, mensaje: r?.mensaje ?? "No se puede cargar." }));
      setLectura(leida);
      setRevision({
        nuevos: leida.medicamentos.filter((m) => porFila.get(m.fila)?.estado === "LISTO"),
        existen: leida.medicamentos.filter((m) => porFila.get(m.fila)?.estado === "EXISTE").length,
        problemas: [...leida.problemas, ...delServidor].sort((a, b) => a.fila - b.fila),
      });
      setFase("revisado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
      setFase("elegir");
      // Así el mismo archivo, ya corregido, se puede volver a elegir.
      if (input.current) input.current.value = "";
    }
  }

  async function cargar() {
    if (!revision) return;
    const total = revision.nuevos.length;
    const cantidades = new Map(
      revision.nuevos.map((m) => [m.fila, m.lotes.reduce((a, l) => a + l.cantidad, 0)]),
    );
    const resultado: Final = {
      creados: 0,
      unidades: 0,
      existian: revision.existen,
      problemas: [...revision.problemas],
    };
    setFase("cargando");
    setProgreso({ hechos: 0, total });
    try {
      for (const tanda of enTandas(revision.nuevos)) {
        const r = await api.importarMedicamentos({
          almacenId: Number(almacenId),
          medicamentos: tanda,
        });
        for (const x of r.resultados) {
          if (x.estado === "CREADO") {
            resultado.creados++;
            resultado.unidades += cantidades.get(x.fila) ?? 0;
          } else if (x.estado === "EXISTE") resultado.existian++;
          else resultado.problemas.push({ fila: x.fila, mensaje: x.mensaje ?? "No se pudo cargar." });
        }
        setProgreso((p) => ({ ...p, hechos: p.hechos + tanda.length }));
      }
    } catch (e) {
      resultado.cortada = e instanceof Error ? e.message : "Se cortó la conexión.";
    }
    resultado.problemas.sort((a, b) => a.fila - b.fila);
    setFinal(resultado);
    setFase("listo");
  }

  const ocupado = fase === "revisando" || fase === "cargando";
  const resumen = revision ? resumenStock(revision.nuevos, isoDia(new Date())) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Cargar desde Excel"
        subtitulo="El catálogo y el stock de arranque de una vez, con sus lotes."
        volver={{ a: "/inventario/productos", etiqueta: "Medicamentos" }}
      />

      <Paso numero={1} titulo="Prepará la planilla">
        <p className="text-[13px] text-texto-2">
          Una fila por cada <strong>lote</strong>: si un medicamento tiene tres lotes, va en tres
          filas con el mismo código o el mismo nombre. Sólo el <strong>nombre</strong> y el{" "}
          <strong>precio de venta</strong> son obligatorios. El vencimiento va como en la caja:
          MM/AAAA.
        </p>
        <p className="text-[13px] text-texto-3">
          ¿Ya tenés tu propio Excel? Sirve igual si los títulos de las columnas se llaman parecido
          (Nombre, Precio, Stock, Lote, Vencimiento…).
        </p>
        <div>
          <Boton variante="soft" icono="download" onClick={bajarPlantilla}>
            Bajar plantilla
          </Boton>
        </div>
      </Paso>

      <Paso numero={2} titulo="Elegí la sucursal y el archivo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Sucursal donde entra el stock">
            <Select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              disabled={ocupado || fase === "revisado"}
            >
              {opciones.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Archivo (.xlsx o .csv)">
            <input
              ref={input}
              type="file"
              accept=".xlsx,.csv"
              aria-label="Archivo de medicamentos"
              disabled={ocupado || !almacenId}
              onChange={(e) => void alElegir(e.target.files?.[0])}
              className="block w-full text-[13px] text-texto-2 file:mr-3 file:rounded-xl file:border-0 file:bg-primary-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
            />
          </Campo>
        </div>
        {fase === "revisando" && (
          <p className="text-[13px] text-texto-3">Revisando {archivo}…</p>
        )}
      </Paso>

      <ErrorMsg>{error || almacenes.error}</ErrorMsg>

      {fase === "revisado" && revision && lectura && resumen && (
        <Paso numero={3} titulo="Revisá antes de cargar">
          <p className="text-xs text-texto-3">
            {archivo}: {fmtNum(lectura.filas)} {lectura.filas === 1 ? "fila" : "filas"} con datos.
            Todavía no se cargó nada.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              etiqueta="Para cargar"
              valor={fmtNum(revision.nuevos.length)}
              pie={
                resumen.conStock > 0
                  ? `${fmtNum(resumen.conStock)} con stock · ${fmtNum(resumen.unidades)} unidades`
                  : "Sólo al catálogo, sin stock"
              }
              icono="plus"
              tono="verde"
            />
            <Kpi
              etiqueta="Ya están"
              valor={fmtNum(revision.existen)}
              pie="No se tocan, ni su stock"
              icono="check"
              tono="gris"
            />
            <Kpi
              etiqueta="Con problemas"
              valor={fmtNum(revision.problemas.length)}
              pie="No se cargan: corregilos en el Excel"
              icono="alert"
              tono="amarillo"
            />
          </div>

          {resumen.sinLote > 0 && (
            <Aviso>
              {resumen.sinLote === 1
                ? "1 medicamento entra"
                : `${fmtNum(resumen.sinLote)} medicamentos entran`}{" "}
              con stock sin lote ni vencimiento: no van a aparecer en Vencimientos hasta que se les
              cargue un lote con un ingreso.
            </Aviso>
          )}
          {resumen.vencidos > 0 && (
            <Aviso>
              {resumen.vencidos === 1 ? "1 lote ya está vencido" : `${fmtNum(resumen.vencidos)} lotes ya están vencidos`}:
              entran al stock pero no se venden, y aparecen en Vencimientos para darlos de baja o
              devolverlos.
            </Aviso>
          )}
          {lectura.ignoradas.length > 0 && (
            <p className="text-xs text-texto-3">
              Columnas que no se usan: {lectura.ignoradas.join(", ")}.
            </p>
          )}

          <ListaProblemas problemas={revision.problemas} />

          <div className="flex flex-wrap gap-2">
            <Boton icono="save" onClick={() => void cargar()} disabled={revision.nuevos.length === 0}>
              {revision.nuevos.length === 1
                ? `Cargar 1 medicamento en ${sucursal?.nombre ?? "la sucursal"}`
                : `Cargar ${fmtNum(revision.nuevos.length)} medicamentos en ${sucursal?.nombre ?? "la sucursal"}`}
            </Boton>
            <Boton variante="ghost" onClick={() => reiniciar()}>
              Elegir otro archivo
            </Boton>
          </div>
        </Paso>
      )}

      {fase === "cargando" && (
        <section className="space-y-2 rounded-2xl border border-borde bg-white p-4">
          <p className="text-sm font-semibold text-texto">
            Cargando {fmtNum(progreso.hechos)} de {fmtNum(progreso.total)} medicamentos…
          </p>
          <div
            role="progressbar"
            aria-label="Avance de la carga"
            aria-valuemin={0}
            aria-valuemax={progreso.total}
            aria-valuenow={progreso.hechos}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-texto-3">No cierres esta pantalla hasta que termine.</p>
        </section>
      )}

      {fase === "listo" && final && (
        <section className="space-y-3 rounded-2xl border border-borde bg-white p-4">
          {final.cortada && (
            <ErrorMsg>
              {`Se cargaron ${fmtNum(final.creados)} de ${fmtNum(revision?.nuevos.length ?? 0)}. Lo que sigue no entró: ${final.cortada} Volvé a subir el mismo archivo: lo que ya entró se saltea solo.`}
            </ErrorMsg>
          )}
          <div className="rounded-xl bg-primary-50 p-4 text-primary-700">
            <p className="text-lg font-extrabold">
              {final.creados === 1
                ? "1 medicamento nuevo"
                : `${fmtNum(final.creados)} medicamentos nuevos`}{" "}
              en {sucursal?.nombre ?? "la sucursal"}
            </p>
            <p className="mt-0.5 text-sm">
              {final.unidades > 0
                ? `Entraron ${fmtNum(final.unidades)} unidades al stock, con un ingreso "Inventario inicial" que se ve en Movimientos.`
                : "Sin stock: entraron sólo al catálogo."}
            </p>
            {final.existian > 0 && (
              <p className="mt-0.5 text-sm">
                {final.existian === 1
                  ? "1 ya estaba en el catálogo y no se tocó."
                  : `${fmtNum(final.existian)} ya estaban en el catálogo y no se tocaron.`}
              </p>
            )}
          </div>
          <ListaProblemas problemas={final.problemas} />
          <div className="flex flex-wrap gap-2">
            <Link
              to="/inventario/productos"
              className="inline-flex items-center justify-center rounded-xl bg-primary-boton px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-boton-hover"
            >
              Ver medicamentos
            </Link>
            <Boton variante="ghost" onClick={() => reiniciar()}>
              Cargar otro archivo
            </Boton>
          </div>
        </section>
      )}
    </div>
  );
}

function Paso({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-borde bg-white p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-texto">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-extrabold text-primary-700">
          {numero}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-[13px] text-[#B45309]">
      {children}
    </p>
  );
}

/** Cada fila que no entra, con su número: es lo que se corrige en el Excel. */
function ListaProblemas({ problemas }: { problemas: ProblemaFila[] }) {
  if (problemas.length === 0) return null;
  const resto = problemas.length - PROBLEMAS_A_LA_VISTA;
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-bold text-texto">Filas que no se cargan</h3>
      <ul className="max-h-72 divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde-soft">
        {problemas.slice(0, PROBLEMAS_A_LA_VISTA).map((p, i) => (
          <li key={`${p.fila}-${i}`} className="flex items-start gap-2 px-3 py-2 text-[13px]">
            <Badge tono="amarillo">Fila {p.fila}</Badge>
            <span className="min-w-0 text-texto-2">{p.mensaje}</span>
          </li>
        ))}
      </ul>
      {resto > 0 && (
        <p className="mt-1 text-xs text-texto-3">Y {fmtNum(resto)} más.</p>
      )}
    </div>
  );
}
