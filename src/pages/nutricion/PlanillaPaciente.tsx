import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chips } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import MenuMas from "../../components/MenuMas";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { iniciales } from "../../lib/format";
import { apiNutricion, esNoEncontrado } from "../../lib/nutricion/api";
import { conAlt, hayDialogoAbierto, useTeclas } from "../../lib/nutricion/atajos";
import { fechaLarga, fmtCambio, tallaConUnidad, type CampoControl } from "../../lib/nutricion/calculo";
import { bajarPdfEvaluacion, documentoEvaluacion, enviarPdfEvaluacionPorWhatsapp } from "../../lib/nutricion/pdfEvaluacion";
import { DEL_GRAFICO, evolucionDe, imcDeHoy, MEDIDAS, tarjetasDeHoy, valorCon, type Medida } from "../../lib/nutricion/planilla";
import type { Catalogo, Control, Paciente } from "../../lib/nutricion/tipos";
import { useCatalogo } from "../../lib/nutricion/useCatalogo";
import { editaNutricion, RUTA_SEGUIMIENTO } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { EncabezadoPagina, PaginaAcademia as Pagina, Tarjeta } from "../academia/piezas";
import BotonesPdf from "./BotonesPdf";
import { ENCABEZADO_CON_MENU, MENU_AL_LADO_DEL_NOMBRE, RenglonDeAcciones } from "./EncabezadoConMenu";
import GraficoEvolucion from "./GraficoEvolucion";
import HojaControl from "./HojaControl";
import MedidorImc from "./MedidorImc";
import { ChipGrado, Tecla } from "./piezas";
import { Planilla } from "./PlanillaControles";

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
  const { usuario, puede, negocio } = useAuth();
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

  // Con el «⋯» (quien edita), en el teléfono va arriba a la derecha del nombre
  // y los botones llenan sus renglones (como en la hoja de seguimiento): sin
  // «Seguimiento», «Editar ficha» + «Nuevo control» + «⋯» no entran en 360 px y
  // el «⋯» caía solo abajo. Desde `sm`, como siempre.
  const enRenglon = edita ? "max-sm:min-h-11 max-sm:flex-auto" : "";

  return (
    <Pagina>
      <EncabezadoPagina
        className={edita ? ENCABEZADO_CON_MENU : ""}
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
            {(veSeguimiento || edita) && (
              <RenglonDeAcciones conMenu={edita}>
                {veSeguimiento && (
                  <Link
                    to={`${RUTA_SEGUIMIENTO}/${p.id}`}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted ${enRenglon}`}
                  >
                    <Icon name="seguimiento" size={16} />
                    Seguimiento
                  </Link>
                )}
                {edita && (
                  <Link
                    to={`/evaluacion/${p.id}/editar`}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted ${enRenglon}`}
                  >
                    <Icon name="edit" size={16} />
                    Editar ficha
                  </Link>
                )}
                {edita && (
                  <Boton icono="plus" className={enRenglon} onClick={() => setHoja({ control: null })} title="Nuevo control (Alt+N)">
                    Nuevo control
                    <Tecla sobreColor>Alt+N</Tecla>
                  </Boton>
                )}
              </RenglonDeAcciones>
            )}
            {edita && (
              <MenuMas
                etiqueta="Más acciones del paciente"
                titulo={p.nombre}
                className={MENU_AL_LADO_DEL_NOMBRE}
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
                // 44 px para el dedo hasta `lg` (en la tablet medían 34); en la PC, como siempre.
                <div className="py-3 [&_button]:min-h-11 lg:[&_button]:min-h-0">
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
            // El PDF (§6.1): con `nutricion.ver` alcanza, también archivado.
            acciones={
              <BotonesPdf
                listo="PDF de la evaluación listo."
                descargar={() => bajarPdfEvaluacion(documentoEvaluacion({ negocio: negocio?.nombre ?? null, paciente: p, catalogo: cat }))}
                enviar={() => enviarPdfEvaluacionPorWhatsapp(documentoEvaluacion({ negocio: negocio?.nombre ?? null, paciente: p, catalogo: cat }), p.telefono)}
                onAviso={setAviso}
                onError={setError}
              />
            }
            bajada={
              // Sin pesos del seguimiento, la bajada de siempre.
              conPesoSemanal ? (
                <>
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
// Las piezas de abajo son de sólo lectura (sin `onAbrir` ni `edita`): las usa
// también la consulta del paciente por carnet en la página (25-nov).

export function Resumen({ paciente, catalogo }: { paciente: Paciente; catalogo: Catalogo }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {tarjetasDeHoy(paciente, catalogo).map(({ campo, medida: m, resumen: r, grado: g, desdeInicio, desdeAnterior, delSeguimiento }) => {
        const pies: string[] = [];
        // Espacios duros: «desde el anterior» baja entero, no queda «anterior» solo abajo.
        if (desdeInicio != null) pies.push(`${fmtCambio(desdeInicio, m.decimales)}${m.unidad ? ` ${m.unidad}` : ""} desde el inicio`);
        if (desdeAnterior != null) pies.push(`${fmtCambio(desdeAnterior, m.decimales)} kg desde el anterior`);
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
            {delSeguimiento && (
              <p className="mt-1 text-xs tabular-nums text-texto-4">
                del seguimiento <span className="whitespace-nowrap">({fechaLarga(delSeguimiento)})</span>
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
export function ImcDeHoy({ paciente, catalogo }: { paciente: Paciente; catalogo: Catalogo }) {
  // Con la serie de pesos al día, el último IMC de la serie (puede ser de una
  // semana del seguimiento); sin ella, el del último control, como siempre.
  const { ultimo, rangos, grado: g } = imcDeHoy(paciente, catalogo);
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

export function Evolucion({ paciente, medida }: { paciente: Paciente; medida: Medida }) {
  // Peso e IMC: todos los puntos de la serie al día; los del seguimiento, más chicos.
  const { puntos, leyenda } = evolucionDe(paciente, medida.campo);
  if (!puntos.length) {
    return <p className="py-8 text-center text-sm text-texto-3">Todavía no hay datos de {medida.nombre.toLowerCase()}.</p>;
  }
  return (
    <div className="space-y-2">
      <GraficoEvolucion puntos={puntos} nombre={medida.nombre} formato={(n) => valorCon(medida, n)} />
      {puntos.length === 1 && <p className="text-center text-[13px] text-texto-3">Con el próximo control vas a ver la evolución.</p>}
      {leyenda && (
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

// Vive en su archivo (§8 del contrato); sigue saliendo de acá porque la importa «Consultar mi ficha».
export { Planilla };

// ── La ficha, en modo lectura ───────────────────────────────────────────────

export function FichaLectura({ paciente: p, catalogo, edita }: { paciente: Paciente; catalogo: Catalogo; edita: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const nombreEnf = (codigo: string) => catalogo.enfermedades.find((e) => e.codigo === codigo)?.nombre ?? codigo;
  const conSi = Object.entries(p.enfermedades ?? {}).filter(([, e]) => e.tiene);
  const filasDatos: [string, string | null][] = [
    ["Talla", p.tallaCm != null ? tallaConUnidad(p.tallaCm) : null],
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
