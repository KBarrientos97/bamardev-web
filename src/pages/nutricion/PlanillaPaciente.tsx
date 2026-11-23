import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import MenuMas from "../../components/MenuMas";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { iniciales } from "../../lib/format";
import { apiNutricion, esNoEncontrado } from "../../lib/nutricion/api";
import { conAlt, hayDialogoAbierto, useTeclas } from "../../lib/nutricion/atajos";
import {
  conUnidad,
  evolucion,
  fechaLarga,
  fmtCambio,
  grado,
  gradoDelResumen,
  resumenDe,
  sufijoDelDia,
  vecesDelDia,
  type CampoControl,
} from "../../lib/nutricion/calculo";
import type { Catalogo, Control, MedidaConTabla, Paciente } from "../../lib/nutricion/tipos";
import { useCatalogo } from "../../lib/nutricion/useCatalogo";
import { hayDeLosDos, puntosDeLaSerie, resumenDeLaSerie, ultimoImcDeLaSerie } from "../../lib/nutricion/pesos";
import { editaNutricion, RUTA_SEGUIMIENTO } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { EncabezadoPagina, PaginaAcademia as Pagina, Tarjeta } from "../academia/piezas";
import GraficoEvolucion from "./GraficoEvolucion";
import HojaControl from "./HojaControl";
import MedidorImc from "./MedidorImc";
import { TONO } from "../../lib/nutricion/tonos";
import { ChipGrado, Tecla } from "./piezas";

/** Cada medida de la planilla: cómo se llama, su unidad, sus decimales y, si tiene, su tabla de grados. */
interface Medida {
  campo: CampoControl;
  nombre: string;
  /** El nombre corto para la planilla y los chips del gráfico. */
  corto: string;
  unidad: string;
  decimales: number;
  grado?: { medida: MedidaConTabla; campo: "imcGrado" | "grasaGrado" | "musculoGrado" | "visceralGrado" };
}

const MEDIDAS: Record<CampoControl, Medida> = {
  pesoKg: { campo: "pesoKg", nombre: "Peso", corto: "Peso", unidad: "kg", decimales: 2 },
  imc: { campo: "imc", nombre: "IMC", corto: "IMC", unidad: "", decimales: 1, grado: { medida: "imc", campo: "imcGrado" } },
  grasaPct: { campo: "grasaPct", nombre: "% de grasa", corto: "% grasa", unidad: "%", decimales: 1, grado: { medida: "grasa", campo: "grasaGrado" } },
  musculoPct: {
    campo: "musculoPct",
    nombre: "% de músculo",
    corto: "% músculo",
    unidad: "%",
    decimales: 1,
    grado: { medida: "musculo", campo: "musculoGrado" },
  },
  edadCorporal: { campo: "edadCorporal", nombre: "Edad corporal", corto: "Edad corporal", unidad: "años", decimales: 0 },
  grasaVisceral: {
    campo: "grasaVisceral",
    nombre: "Grasa visceral",
    corto: "Grasa visceral",
    unidad: "",
    decimales: 1,
    grado: { medida: "visceral", campo: "visceralGrado" },
  },
  cinturaCm: { campo: "cinturaCm", nombre: "Cintura", corto: "Cintura", unidad: "cm", decimales: 1 },
  caderaCm: { campo: "caderaCm", nombre: "Cadera", corto: "Cadera", unidad: "cm", decimales: 1 },
  pechoCm: { campo: "pechoCm", nombre: "Pecho", corto: "Pecho", unidad: "cm", decimales: 1 },
};

/** Los renglones de la planilla, como la hoja de papel. */
const FILAS: CampoControl[] = ["pesoKg", "imc", "grasaPct", "musculoPct", "edadCorporal", "grasaVisceral", "cinturaCm", "caderaCm", "pechoCm"];
/** Las medidas que se pueden ver en el gráfico, en este orden. */
const DEL_GRAFICO: CampoControl[] = ["pesoKg", "imc", "grasaPct", "musculoPct", "cinturaCm", "caderaCm", "pechoCm", "grasaVisceral"];
/** Las tarjetas de arriba. */
const DEL_RESUMEN: CampoControl[] = ["pesoKg", "imc", "grasaPct", "musculoPct", "grasaVisceral", "cinturaCm"];

const valorCon = (m: Medida, n: number | null | undefined) => conUnidad(n, m.unidad, m.decimales);

/** El grado del valor que muestra la tarjeta: el del mismo control (ver `gradoDelResumen`). */
function gradoActual(controles: Control[], m: Medida, catalogo: Catalogo | null) {
  if (!m.grado) return null;
  return grado(catalogo, m.grado.medida, gradoDelResumen(controles, m.campo, m.grado.campo));
}

/**
 * La planilla del paciente (CONTRATO-nutricion-evaluacion-22nov §4.3): quién
 * es, cómo está hoy (las tarjetas), cómo viene (el gráfico), todos sus
 * controles como en la hoja de papel y su ficha, plegada. «Nuevo control»
 * con `Alt+N`; tocar una fecha de la planilla abre ese control para
 * corregirlo.
 */
export default function PlanillaPaciente() {
  const { id } = useParams();
  const pacienteId = Number(id);
  const { usuario, puede } = useAuth();
  const edita = editaNutricion(usuario);
  // El seguimiento del tratamiento (23-nov): quien lo ve tiene el atajo a la hoja.
  const veSeguimiento = puede("seguimiento");
  const ficha = useApi(() => apiNutricion.paciente(pacienteId), [pacienteId]);
  const catalogo = useCatalogo();
  const [hoja, setHoja] = useState<{ control: Control | null } | null>(null);
  const [aviso, setAviso] = useAviso(5000);
  const [error, setError] = useState("");
  const [archivando, setArchivando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [medida, setMedida] = useState<CampoControl>("pesoKg");

  useTeclas((e) => {
    if (!edita || hoja || hayDialogoAbierto() || !ficha.datos || !catalogo.datos) return;
    if (conAlt(e, "n")) {
      e.preventDefault();
      setHoja({ control: null });
    }
  });

  const p = ficha.datos;
  if ((ficha.error && !p) || (catalogo.error && !catalogo.datos)) {
    const falla = ficha.error ? ficha.falla : catalogo.falla;
    return (
      <Pagina>
        {esNoEncontrado(falla) ? (
          <Vacio
            icono="search"
            titulo="No encontramos este paciente"
            texto="Puede que ya no exista o que sea de otro negocio."
            accion={
              <Link to="/evaluacion" className="text-sm font-semibold text-primary-700 hover:underline">
                Volver a los pacientes
              </Link>
            }
          />
        ) : (
          <ErrorMsg
            onReintentar={() => {
              ficha.recargar();
              catalogo.recargar();
            }}
          >
            {ficha.error || catalogo.error}
          </ErrorMsg>
        )}
      </Pagina>
    );
  }
  if (!p || !catalogo.datos) return <Cargando texto="Cargando el paciente…" />;
  const cat = catalogo.datos;
  const controles = p.controles;
  const conPesoSemanal = !!p.pesos?.some((x) => x.origen === "SEGUIMIENTO");

  async function archivar(volverALaLista: boolean) {
    setProcesando(true);
    setError("");
    try {
      const nuevo = volverALaLista ? await apiNutricion.desarchivar(pacienteId) : await apiNutricion.archivar(pacienteId);
      ficha.setDatos(nuevo);
      setArchivando(false);
      setAviso(volverALaLista ? "Volvió a la lista de pacientes." : "Archivado: ya no sale en la lista. Está en «Ver archivados».");
    } catch (e) {
      setArchivando(false);
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setProcesando(false);
    }
  }

  const sexo = p.sexo === "F" ? "Mujer" : p.sexo === "M" ? "Hombre" : null;
  const datos = [
    p.ci ? `CI ${p.ci}${p.ciExpedido ? ` ${p.ciExpedido}` : ""}` : null,
    p.edad != null ? `${p.edad} años` : null,
    sexo,
    p.telefono,
  ].filter(Boolean);

  return (
    <Pagina>
      <EncabezadoPagina
        volver={{ a: "/evaluacion", texto: "Pacientes" }}
        titulo={
          <span className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-base font-bold text-primary-700">
              {iniciales(p.nombre)}
            </span>
            <span className="min-w-0 break-words">{p.nombre}</span>
          </span>
        }
        acciones={
          <>
            {veSeguimiento && (
              <Link
                to={`${RUTA_SEGUIMIENTO}/${p.id}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted"
              >
                <Icon name="seguimiento" size={16} />
                Seguimiento
              </Link>
            )}
            {edita && (
              <Link
                to={`/evaluacion/${p.id}/editar`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted"
              >
                <Icon name="edit" size={16} />
                Editar ficha
              </Link>
            )}
            {edita && (
              <Boton icono="plus" onClick={() => setHoja({ control: null })} title="Nuevo control (Alt+N)">
                Nuevo control
                <Tecla sobreColor>Alt+N</Tecla>
              </Boton>
            )}
            {edita && (
              <MenuMas
                etiqueta="Más acciones del paciente"
                titulo={p.nombre}
                acciones={[
                  p.activo
                    ? { clave: "archivar", etiqueta: "Archivar paciente", icono: "archive", peligrosa: true, onClick: () => setArchivando(true) }
                    : { clave: "volver", etiqueta: "Volver a la lista de pacientes", icono: "archive", onClick: () => void archivar(true) },
                ]}
              />
            )}
          </>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[13px] text-texto-3 sm:pl-14">
          {!p.activo && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-texto-3">Archivado</span>
          )}
          <span>{datos.join(" · ") || "Sin datos de contacto"}</span>
        </p>
      </EncabezadoPagina>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {controles.length === 0 && !p.pesos?.length ? (
        <Tarjeta etiqueta="Controles">
          <Vacio
            icono="evaluacion"
            titulo="Todavía no hay controles"
            texto="El primer control es el de la evaluación inicial: el peso, las medidas y la composición."
            accion={
              edita ? (
                <Boton icono="plus" onClick={() => setHoja({ control: null })}>
                  Registrar el primer control
                </Boton>
              ) : undefined
            }
          />
        </Tarjeta>
      ) : (
        <>
          <Resumen paciente={p} catalogo={cat} />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-6">
            <Tarjeta
              titulo="Evolución"
              barra={
                <div className="py-3">
                  <Chips<CampoControl> envolver valor={medida} onChange={setMedida} opciones={DEL_GRAFICO.map((c) => [c, MEDIDAS[c].corto] as const)} />
                </div>
              }
            >
              <Evolucion paciente={p} medida={MEDIDAS[medida]} />
            </Tarjeta>
            <ImcDeHoy paciente={p} catalogo={cat} />
          </div>

          <Tarjeta
            titulo="Controles"
            contador={controles.length}
            bajada={
              // Sin pesos del seguimiento, la bajada de siempre.
              conPesoSemanal ? (
                <>
                  {edita && controles.length > 0 && <span className="block">Tocá una fecha para corregir ese control.</span>}
                  <span className="block">
                    El peso de cada semana se anota en{" "}
                    {veSeguimiento ? (
                      <Link to={`${RUTA_SEGUIMIENTO}/${p.id}`} className="font-semibold text-primary-700 hover:underline">
                        Seguimiento
                      </Link>
                    ) : (
                      "Seguimiento"
                    )}{" "}
                    y se ve en el gráfico.
                  </span>
                </>
              ) : edita ? (
                "Tocá una fecha para corregir ese control."
              ) : undefined
            }
            sinRelleno
          >
            {controles.length ? (
              <Planilla controles={controles} catalogo={cat} onAbrir={edita ? (c) => setHoja({ control: c }) : undefined} />
            ) : (
              <Vacio
                icono="evaluacion"
                titulo="Todavía no hay controles"
                texto="El primer control es el de la evaluación inicial: el peso, las medidas y la composición."
                accion={
                  edita ? (
                    <Boton icono="plus" onClick={() => setHoja({ control: null })}>
                      Registrar el primer control
                    </Boton>
                  ) : undefined
                }
              />
            )}
          </Tarjeta>
        </>
      )}

      <FichaLectura paciente={p} catalogo={cat} edita={edita} />

      {hoja && (
        <HojaControl
          paciente={p}
          catalogo={cat}
          control={hoja.control}
          onCerrar={() => setHoja(null)}
          onGuardado={(nuevo, texto) => {
            ficha.setDatos(nuevo);
            setHoja(null);
            setAviso(texto);
          }}
        />
      )}

      <Confirmar
        abierto={archivando}
        titulo={`¿Archivar a ${p.nombre}?`}
        texto="No se borra nada: deja de salir en la lista de pacientes y se puede devolver desde «Ver archivados»."
        etiquetaOk="Archivar"
        procesando={procesando}
        onCancel={() => setArchivando(false)}
        onOk={() => void archivar(false)}
      />
    </Pagina>
  );
}

// ── Las tarjetas de arriba ──────────────────────────────────────────────────

/** ¿Esta medida sale de la serie de pesos al día (§4.4 del seguimiento)? Sólo Peso e IMC, y si la respuesta la trae. */
const deLaSerie = (p: Paciente, campo: CampoControl): campo is "pesoKg" | "imc" => !!p.pesos && (campo === "pesoKg" || campo === "imc");

function Resumen({ paciente, catalogo }: { paciente: Paciente; catalogo: Catalogo }) {
  const controles = paciente.controles;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {DEL_RESUMEN.map((campo) => {
        const m = MEDIDAS[campo];
        const serie = deLaSerie(paciente, campo) ? puntosDeLaSerie(paciente, campo) : null;
        const r = serie ? resumenDeLaSerie(serie) : resumenDe(controles, campo);
        // El grado del IMC de la serie es el del último peso con IMC (el del seguimiento sale de la tabla).
        const g =
          serie && campo === "imc" ? grado(catalogo, "imc", ultimoImcDeLaSerie(paciente.pesos)?.imcGrado) : gradoActual(controles, m, catalogo);
        const cuantos = serie ? serie.length : controles.length;
        const delSeguimiento = !!r && "delSeguimiento" in r && r.delSeguimiento;
        const pies: string[] = [];
        // Espacios duros: «desde el anterior» baja entero, no queda «anterior» solo abajo.
        if (r?.desdeInicio != null) pies.push(`${fmtCambio(r.desdeInicio, m.decimales)}${m.unidad ? ` ${m.unidad}` : ""} desde el inicio`);
        if (campo === "pesoKg" && r?.desdeAnterior != null && cuantos > 2) {
          pies.push(`${fmtCambio(r.desdeAnterior, m.decimales)} kg desde el anterior`);
        }
        return (
          <div key={campo} className="card min-w-0 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{m.nombre}</p>
            <p className={`mt-1.5 text-xl font-bold tabular-nums tracking-tight ${r ? "text-texto" : "text-texto-4"}`}>{r ? valorCon(m, r.actual) : "—"}</p>
            {g && <ChipGrado rango={g} className="mt-1.5" />}
            {pies.map((t) => (
              <p key={t} className="mt-1 text-xs tabular-nums text-texto-3">
                {t}
              </p>
            ))}
            {/* La fecha entera, en su renglón si no entra: «·» al final de un renglón se leía suelto. */}
            {delSeguimiento && r && (
              <p className="mt-1 text-xs tabular-nums text-texto-4">
                del seguimiento <span className="whitespace-nowrap">({fechaLarga(r.fecha)})</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── El medidor del IMC ──────────────────────────────────────────────────────

/** El medidor de la hoja con el último IMC (sólo para mirar: el grado se corrige en el control). */
function ImcDeHoy({ paciente, catalogo }: { paciente: Paciente; catalogo: Catalogo }) {
  // Con la serie de pesos al día, el último IMC de la serie (puede ser de una
  // semana del seguimiento); sin ella, el del último control, como siempre.
  const ultimo: { fecha: string; imc: number | null; imcGrado: string | null } | undefined = paciente.pesos
    ? (ultimoImcDeLaSerie(paciente.pesos) ?? undefined)
    : [...paciente.controles].reverse().find((c) => c.imc != null || c.imcGrado);
  const rangos = catalogo.tablas.imc?.find((t) => t.sexo == null && t.edadDesde == null && t.edadHasta == null)?.rangos ?? catalogo.tablas.imc?.[0]?.rangos;
  const g = grado(catalogo, "imc", ultimo?.imcGrado);
  return (
    <Tarjeta titulo="IMC" bajada={ultimo ? `Del ${fechaLarga(ultimo.fecha)}` : "Sale con el peso y la talla"}>
      <div className="space-y-3">
        <MedidorImc rangos={rangos} valor={ultimo?.imc ?? null} elegido={ultimo?.imcGrado ?? null} />
        {ultimo && (
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {ultimo.imc != null && <span className="text-lg font-bold tabular-nums text-texto">{valorCon(MEDIDAS.imc, ultimo.imc)}</span>}
            <ChipGrado rango={g} />
          </p>
        )}
      </div>
    </Tarjeta>
  );
}

// ── El gráfico ──────────────────────────────────────────────────────────────

function Evolucion({ paciente, medida }: { paciente: Paciente; medida: Medida }) {
  // Peso e IMC: todos los puntos de la serie al día; los del seguimiento, más chicos.
  const serie = deLaSerie(paciente, medida.campo) ? puntosDeLaSerie(paciente, medida.campo) : null;
  const puntos = serie ? serie.map((x) => ({ ...x, chico: x.delSeguimiento })) : evolucion(paciente.controles, medida.campo);
  if (!puntos.length) {
    return <p className="py-8 text-center text-sm text-texto-3">Todavía no hay datos de {medida.nombre.toLowerCase()}.</p>;
  }
  return (
    <div className="space-y-2">
      <GraficoEvolucion puntos={puntos} nombre={medida.nombre} formato={(n) => valorCon(medida, n)} />
      {puntos.length === 1 && <p className="text-center text-[13px] text-texto-3">Con el próximo control vas a ver la evolución.</p>}
      {serie && hayDeLosDos(serie) && (
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-texto-3" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-primary-boton bg-white" />
            Control
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-boton" />
            Seguimiento semanal
          </span>
        </p>
      )}
    </div>
  );
}

// ── La planilla de controles ────────────────────────────────────────────────

/**
 * Como la hoja: un renglón por medida y una columna por control, en orden de
 * fecha (la primera es la «Inicial»). Se desplaza de costado con la primera
 * columna fija, y arranca mostrando el último control.
 */
function Planilla({
  controles,
  catalogo,
  onAbrir,
}: {
  controles: Control[];
  catalogo: Catalogo;
  onAbrir?: (c: Control) => void;
}) {
  const carril = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = carril.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [controles.length]);

  const celdaFija =
    "sticky left-0 z-10 border-r border-borde-soft bg-white px-4 py-2.5 text-left shadow-[4px_0_8px_-6px_rgba(15,23,42,0.18)] max-sm:px-3 sm:px-5";
  // El segundo control del mismo día lleva «(2)»: si no, las dos columnas se llaman igual.
  const veces = vecesDelDia(controles.map((c) => c.fecha));

  // Cada control ocupa justo 1/N de lo que queda al lado de la columna fija
  // (N = cuántos entran: 2 en el celular, de 3 a 7 según el ancho) y el carril
  // encaja de a una columna: nunca asoma medio control detrás de los nombres
  // de las medidas («besidad grado 1»). Con menos controles que N, llenan el ancho.
  const anchoControl = "calc((100cqw - var(--fija)) / min(var(--columnas), var(--visibles)))";
  return (
    <div className="@container">
      {/* scroll-lateral-ok: la planilla de controles se lee como la hoja, con la primera columna fija (contrato §4.3). */}
      <div
        ref={carril}
        className="overflow-x-auto snap-x snap-mandatory scroll-pl-(--fija) [--fija:8.75rem] [--visibles:2] sm:[--fija:12.5rem] sm:[--visibles:3] sm:@3xl:[--visibles:4] sm:@4xl:[--visibles:5] sm:@5xl:[--visibles:6] sm:@6xl:[--visibles:7]"
      >
        <table
          className="min-w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ "--columnas": controles.length, width: `calc(var(--fija) + var(--columnas) * ${anchoControl})` } as React.CSSProperties}
        >
          <colgroup>
            <col style={{ width: "var(--fija)" }} />
            {controles.map((c) => (
              <col key={c.id} style={{ width: anchoControl }} />
            ))}
          </colgroup>
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
            <th scope="col" className={`${celdaFija} bg-muted`}>
              Medida
            </th>
            {controles.map((c, i) => (
              <th scope="col" key={c.id} className="min-w-0 snap-start border-b border-borde-soft bg-muted px-2 py-1.5 text-center align-bottom">
                {onAbrir ? (
                  <button
                    type="button"
                    onClick={() => onAbrir(c)}
                    aria-label={`Corregir el control del ${fechaLarga(c.fecha)}${sufijoDelDia(veces[i])}`}
                    className="inline-flex w-full flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-white hover:text-primary-700 focus-visible:bg-white"
                  >
                    <Encabezado c={c} vez={veces[i]} />
                  </button>
                ) : (
                  <span className="inline-flex flex-col items-center gap-0.5 px-2 py-1">
                    <Encabezado c={c} vez={veces[i]} />
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FILAS.map((campo) => {
            const m = MEDIDAS[campo];
            return (
              <tr key={campo}>
                <th scope="row" className={`${celdaFija} border-t font-semibold text-texto-2 sm:whitespace-nowrap`}>
                  {m.nombre}
                  {/* «% de grasa» ya dice su unidad: «(%)» al lado sería repetirla. */}
                  {m.unidad && m.unidad !== "%" && <span className="font-normal text-texto-4 max-sm:block sm:ml-1">({m.unidad})</span>}
                </th>
                {controles.map((c) => {
                  const v = c[campo];
                  const g = m.grado ? grado(catalogo, m.grado.medida, c[m.grado.campo]) : null;
                  const t = g ? TONO[g.tono] : null;
                  return (
                    <td
                      key={c.id}
                      onClick={onAbrir ? () => onAbrir(c) : undefined}
                      className={`border-t border-borde-soft px-2 py-1.5 text-center align-middle ${onAbrir ? "cursor-pointer" : ""}`}
                    >
                      {v == null && !g ? (
                        <span className="text-texto-4">—</span>
                      ) : (
                        <span className={`inline-flex w-full max-w-[7.5rem] flex-col items-center rounded-lg px-1.5 py-1 ${t ? `${t.suave} ${t.texto}` : "text-texto"}`}>
                          {v != null ? (
                            <span className="font-semibold tabular-nums">{valorCon({ ...m, unidad: "" }, v)}</span>
                          ) : (
                            // El grado se eligió sin escribir el valor: «—» parecía un dato que falta.
                            <span className="text-[12px] font-medium">sin medir</span>
                          )}
                          {g && <span className="text-[11px] font-medium leading-tight">{g.nombre}</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <th scope="row" className={`${celdaFija} border-t align-top font-semibold text-texto-2`}>
              Nota
            </th>
            {controles.map((c) => (
              <td
                key={c.id}
                onClick={onAbrir ? () => onAbrir(c) : undefined}
                className={`max-w-[14rem] border-t border-borde-soft px-3 py-2 align-top text-[13px] text-texto-2 ${onAbrir ? "cursor-pointer" : ""}`}
              >
                {c.nota ? <span className="block whitespace-pre-line break-words">{c.nota}</span> : <span className="block text-center text-texto-4">—</span>}
              </td>
            ))}
          </tr>
        </tbody>
        </table>
      </div>
    </div>
  );
}

function Encabezado({ c, vez }: { c: Control; vez: number }) {
  return (
    <>
      <span className="whitespace-nowrap text-[13px] font-bold normal-case tracking-normal text-texto tabular-nums">
        {fechaLarga(c.fecha)}
        {sufijoDelDia(vez)}
      </span>
      {c.inicial ? (
        <span className="rounded-full bg-primary-100 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-primary-700">Inicial</span>
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-texto-4">Control</span>
      )}
    </>
  );
}

// ── La ficha, en modo lectura ───────────────────────────────────────────────

function FichaLectura({ paciente: p, catalogo, edita }: { paciente: Paciente; catalogo: Catalogo; edita: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const nombreEnf = (codigo: string) => catalogo.enfermedades.find((e) => e.codigo === codigo)?.nombre ?? codigo;
  const conSi = Object.entries(p.enfermedades ?? {}).filter(([, e]) => e.tiene);
  const filasDatos: [string, string | null][] = [
    ["Talla", p.tallaCm != null ? conUnidad(p.tallaCm, "cm") : null],
    ["Fecha de nacimiento", p.fechaNacimiento ? fechaLarga(p.fechaNacimiento) : null],
    ["Hijos", p.hijos != null ? String(p.hijos) : null],
    ["Teléfono", p.telefono],
    ["Carnet", p.ci ? `${p.ci}${p.ciExpedido ? ` ${p.ciExpedido}` : ""}` : null],
  ];
  const datos = filasDatos.filter((d): d is [string, string] => !!d[1]);
  const textos: [string, string | null][] = [
    ["Observaciones", p.observaciones],
    ["Últimos análisis clínicos", p.ultimosAnalisis],
    ["Otras enfermedades", p.otrasEnfermedades],
    ["Cirugías", p.cirugias],
    ["Conducta alimentaria", p.conductaAlimentaria],
    ["Conducta del sueño", p.conductaSueno],
    ["Actividad física", p.actividadFisica],
    ["Consumo de agua", p.consumoAgua],
  ];
  const conTexto = textos.filter(([, t]) => t?.trim());
  const vacia = !datos.length && !conSi.length && !conTexto.length;

  return (
    <section className="card min-w-0 overflow-hidden">
      <h2>
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-controls="ficha-paciente"
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted sm:px-5"
        >
          <span className="text-[15px] font-bold text-texto">Ficha del paciente</span>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-texto-3">
            {abierta ? "Plegar" : "Ver la ficha"}
            <Icon name="chevronDown" size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
          </span>
        </button>
      </h2>
      {abierta && (
        <div id="ficha-paciente" className="space-y-5 border-t border-borde-soft px-4 py-4 sm:px-5">
          {vacia ? (
            <p className="text-sm text-texto-3">
              La ficha no tiene más datos.{" "}
              {edita && (
                <Link to={`/evaluacion/${p.id}/editar`} className="font-semibold text-primary-700 hover:underline">
                  Completarla
                </Link>
              )}
            </p>
          ) : (
            <>
              {datos.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                  {datos.map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{k}</dt>
                      <dd className="break-words text-sm text-texto">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {conSi.length > 0 && (
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-texto-4">Enfermedades de base</h3>
                  <ul className="flex flex-wrap gap-2">
                    {conSi.map(([codigo, e]) => (
                      <li key={codigo} className="rounded-xl bg-warning-bg px-3 py-1.5 text-[13px] text-warning-text">
                        <span className="font-semibold">{nombreEnf(codigo)}</span>
                        {e.nota && <span className="text-warning-text/90"> · {e.nota}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {conTexto.length > 0 && (
                <dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                  {conTexto.map(([k, t]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{k}</dt>
                      <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-texto">{t}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
