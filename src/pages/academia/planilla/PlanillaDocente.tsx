import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import PanelLateral from "../../../components/PanelLateral";
import { Chips } from "../../../components/filtros";
import { AvisoOk, Boton, Campo, Cargando, Confirmar, ErrorMsg, Input, Modal, Select, Vacio, useAviso } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { fechaCorta, nombreDe } from "../../../lib/academia/formato";
import type { EstadoPlanilla, LineaPlanilla, MetodoPagoPlanilla, MotivoNoPago, MotivoNoPagoLinea } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import {
  MOTIVOS_NO_PAGO,
  TEXTO_ESTADO_PLANILLA as TEXTO_ESTADO,
  textoFormaPago,
  textoMotivoNoPago,
} from "../../../lib/academia/vista";
import { ApiError } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import {
  BotonFila,
  Chip,
  EncabezadoPagina,
  FiltrosConteo,
  KpiTarjeta,
  LISTA,
  PaginaAcademia,
  ResumenPanel,
  SeccionPanel,
  TABLA,
  Tarjeta,
  type TonoChip,
} from "../piezas";

type Lista = "cuentan" | "postergados" | "atrasados" | "sinPagar";

/** Cómo se le paga al docente. La tarjeta (que el backend acepta) no es cómo se paga un sueldo. */
const METODOS: readonly (readonly [MetodoPagoPlanilla, string])[] = [
  ["EFECTIVO", "Efectivo"],
  ["TRANSFERENCIA", "Transferencia"],
  ["QR", "QR"],
];

/** En curso en gris, cerrada (falta pagarla) en ámbar, pagada en verde. */
const CHIP_ESTADO: Record<EstadoPlanilla, TonoChip> = {
  EN_CURSO: "gris",
  CERRADA: "ambar",
  PAGADA: "verde",
};

/** Cada grupo muestra hasta acá; más, con "Ver los N restantes" (PLAN-ACADEMIAS §5). */
const LIMITE = 20;

/**
 * Las columnas de la tabla de un grupo en escritorio. Caben con el panel
 * lateral abierto (la página se angosta 380 px).
 */
const COLUMNAS = "lg:grid-cols-[minmax(140px,2fr)_minmax(100px,1fr)_104px_140px_44px_104px]";

/**
 * N8 · Planilla de un docente (ronda 2, D2): el mes de un docente, con lo que
 * cuenta (estudiantes que pagaron el módulo completo: lo cobrado del módulo ×
 * su %), lo postergado (abonaron a medias: se paga el mes en que completen),
 * lo atrasado de meses anteriores y lo sin pagar. Cada línea dice de dónde
 * sale el monto ("Pagó Bs 1.350 · 1.350 ÷ 3 = 450 · 20 % = Bs 90").
 *
 * "Cerrar planilla" la deja inmutable (un mes en curso pide confirmar) y
 * "Registrar pago" la vuelve un gasto de sueldos. La retención y los atrasos
 * quedan por confirmar (D9).
 *
 * A6 (reunión con Derick, 22-oct): es sólo del admin, abre en "Cuentan", y en
 * las líneas que no le suman al docente (postergados y sin pagar) quien
 * liquida anota por qué: no pagó, se retiró, beca, un acuerdo u otro motivo.
 */
export default function PlanillaDocente() {
  const p = usePalabras();
  const { id } = useParams();
  const personalId = Number(id);
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const hoy = mesDe(new Date());
  const mes = params.get("mes") ?? hoy;
  const liquida = tienePermiso(usuario, "planilla.liquidar");
  const carga = useApi(() => apiAcademia.planillaDocente(personalId, mes), [personalId, mes]);
  const [lista, setLista] = useState<Lista>("cuentan");
  const [elegida, setElegida] = useState<LineaPlanilla | null>(null);
  const [verTodos, setVerTodos] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState(false);
  const [forzar, setForzar] = useState(false);
  /** El diálogo de "Registrar pago": el pago no se deshace, así que se confirma con el monto (QA ronda 2, B-12). */
  const [pagando, setPagando] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPagoPlanilla>("EFECTIVO");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(6000);
  /** La línea a la que se le está anotando el motivo (A6). */
  const [motivoDe, setMotivoDe] = useState<LineaPlanilla | null>(null);

  const volver = { a: "/academia/planilla", texto: `Planilla ${p.docente}s` };
  const d = carga.datos;
  if (carga.error && !d) {
    return (
      <PaginaAcademia>
        <EncabezadoPagina titulo={`Planilla ${p.docente}s`} volver={volver} />
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      </PaginaAcademia>
    );
  }
  if (!d) return <Cargando />;

  async function cerrar(conForzar = false) {
    setOcupado(true);
    setError("");
    try {
      await apiAcademia.cerrarPlanilla(personalId, mes, conForzar);
      setAviso("Planilla cerrada: ya no cambia.");
      carga.recargar();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.MES_EN_CURSO) setForzar(true);
      else if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.PLANILLA_CERRADA) {
        setAviso("La planilla ya estaba cerrada.");
        carga.recargar();
      } else setError(e instanceof Error ? e.message : "No se pudo cerrar la planilla");
    } finally {
      setOcupado(false);
    }
  }

  async function pagar() {
    setOcupado(true);
    setError("");
    try {
      await apiAcademia.pagarPlanilla(personalId, mes, metodo);
      setAviso("Pago registrado como gasto de sueldos.");
      setPagando(false);
      carga.recargar();
    } catch (e) {
      setPagando(false);
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setOcupado(false);
    }
  }

  const r = d.resumen;
  const listas: Record<Lista, LineaPlanilla[]> = { cuentan: d.cuentan, postergados: d.postergados, atrasados: d.atrasados, sinPagar: d.sinPagar };
  const elegidas = listas[lista];
  const porGrupo = agrupar(elegidas);
  const meses = [...new Set([hoy, mes, ...d.meses.map((x) => x.mes), ...Array.from({ length: 5 }, (_, i) => sumarMeses(hoy, -(i + 1)))])].sort().reverse();
  const pcts = d.pct.porCurso.length
    ? `${d.pct.defecto} % (${d.pct.porCurso.map((x) => `${nombreDe(x.carrera)} ${x.pct} %`).join(", ")})`
    : `${d.pct.defecto} %`;
  const columnaCobrado = lista === "postergados" ? "Abonó" : lista === "sinPagar" ? "Precio" : "Cobrado del módulo";
  const cuenta = lista === "cuentan" || lista === "atrasados";
  /** Las listas que no le suman al docente llevan el motivo (A6). */
  const conMotivo = lista === "postergados" || lista === "sinPagar";

  /** El motivo nuevo (o null) en la línea de la lista y en el panel, sin recargar todo. */
  function ponerMotivo(l: LineaPlanilla, motivo: MotivoNoPagoLinea | null) {
    const igual = (x: LineaPlanilla) => x.inscripcionId === l.inscripcionId && materiaDe(x) === materiaDe(l);
    const cambiar = (xs: LineaPlanilla[]) => xs.map((x) => (igual(x) ? { ...x, motivoNoPago: motivo } : x));
    if (d) carga.setDatos({ ...d, postergados: cambiar(d.postergados), sinPagar: cambiar(d.sinPagar) });
    if (elegida && igual(elegida)) setElegida({ ...elegida, motivoNoPago: motivo });
  }

  const acciones: AccionMenu[] = [
    { clave: "excel", etiqueta: "Exportar Excel con el formato del instituto", icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
  ];

  return (
    // Con el panel abierto la página se corre a la izquierda; `w-auto` porque
    // PaginaAcademia trae `w-full` y con el margen se saldría de la pantalla.
    <PaginaAcademia className={elegida ? "md:mr-[380px] md:w-auto" : ""}>
      <EncabezadoPagina
        volver={volver}
        titulo={`Prof. ${d.docente.nombre} · ${tituloMes(d.mes)}`}
        bajada={
          <>
            {d.grupos?.length
              ? `${[...new Set(d.grupos.map((g) => g.carrera.nombre))].join(", ")} · ${d.grupos.length} ${d.grupos.length === 1 ? "grupo" : "grupos"} · `
              : ""}
            Cobra el {pcts} de lo cobrado
          </>
        }
        acciones={
          <>
            <label className="flex items-center gap-2 text-[13px] text-texto-3">
              Mes
              <Select value={mes} onChange={(e) => setParams({ mes: e.target.value })}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {tituloMes(m)}
                  </option>
                ))}
              </Select>
            </label>
            {liquida && d.estado === "EN_CURSO" && (
              <Boton icono="lock" disabled={ocupado} onClick={() => void cerrar()}>
                Cerrar planilla
              </Boton>
            )}
            {liquida && d.estado === "CERRADA" && (
              <Boton icono="billetera" disabled={ocupado} onClick={() => setPagando(true)}>
                Registrar pago {fmtMoney(r.liquido)}
              </Boton>
            )}
            <MenuMas etiqueta="Más acciones de la planilla" acciones={acciones} />
          </>
        }
      >
        <div className="pt-1">
          <Chip tono={CHIP_ESTADO[d.estado]}>{TEXTO_ESTADO[d.estado]}</Chip>
        </div>
      </EncabezadoPagina>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>
      {d.estado !== "EN_CURSO" && (
        <p role="status" className="card flex flex-wrap items-center gap-2 px-4 py-3 text-sm text-texto-2">
          <Chip tono={CHIP_ESTADO[d.estado]}>Planilla {TEXTO_ESTADO[d.estado]}</Chip>
          <span>
            líquido <b className="tabular-nums text-texto">{fmtMoney(r.liquido)}</b>
            {!r.retencionActiva ? " · retención y atrasos siguen por confirmar" : ""}
          </span>
        </p>
      )}

      {/* Con el panel abierto no entran cinco por fila: van de a tres. */}
      <section aria-label="Resumen de la planilla" className={`grid grid-cols-2 gap-3 sm:gap-4 ${elegida ? "lg:grid-cols-3" : "lg:grid-cols-5"}`}>
        <KpiTarjeta
          icono="users"
          etiqueta="Cuentan"
          valor={`${r.cuentan} ${r.cuentan === 1 ? p.alumno : p.alumnos}`}
          pie={r.atrasados ? `+ ${r.atrasados} de meses anteriores` : undefined}
        />
        <KpiTarjeta
          icono="billetera"
          etiqueta="Bruto"
          valor={fmtMoney(r.bruto)}
          pie={r.brutoAtrasados ? `${fmtMoney(r.brutoCuentan ?? 0)} del mes + ${fmtMoney(r.brutoAtrasados)} atrasados` : undefined}
        />
        <KpiTarjeta
          icono="percent"
          etiqueta="Retención"
          valor={r.retencionActiva && r.retencion != null ? `− ${fmtMoney(r.retencion)}` : "—"}
          pie={r.retencionActiva ? undefined : "Por confirmar con el instituto"}
        />
        <KpiTarjeta
          icono="clock"
          etiqueta="Atrasos"
          valor={r.atrasos != null ? `− ${fmtMoney(r.atrasos)}` : "—"}
          pie={r.atrasos != null ? undefined : "Por confirmar con el instituto"}
        />
        <div className={`col-span-2 grid ${elegida ? "lg:col-span-2" : "lg:col-span-1"}`}>
          <KpiTarjeta icono="coins" tono="ok" etiqueta={d.estado === "EN_CURSO" ? "Líquido provisorio" : "Líquido"} valor={fmtMoney(r.liquido)} />
        </div>
      </section>

      <Tarjeta
        etiqueta={`${p.Alumnos} de la planilla`}
        sinRelleno
        barra={
          <FiltrosConteo<Lista>
            enTarjeta
            etiqueta="Secciones de la planilla"
            valor={lista}
            onChange={(k) => {
              setLista(k);
              setElegida(null);
            }}
            opciones={[
              { clave: "cuentan", label: "Cuentan", n: r.cuentan },
              { clave: "postergados", label: "Postergados", n: r.postergados },
              { clave: "atrasados", label: "Atrasados", n: r.atrasados },
              { clave: "sinPagar", label: "Sin pagar", n: r.sinPagar },
            ]}
          />
        }
      >
        {elegidas.length === 0 ? (
          <Vacio icono="fileText" titulo="Nada en esta lista" />
        ) : (
          porGrupo.map(([grupo, lineas]) => {
            const todos = verTodos[grupo] ?? false;
            const visibles = todos ? lineas : lineas.slice(0, LIMITE);
            const total = lineas.reduce((s, l) => s + (cuenta ? l.monto : (l.montoPotencial ?? l.monto)), 0);
            return (
              <section key={grupo} aria-label={grupo} className="border-t border-borde-soft first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
                  <h2 className="text-sm font-bold text-texto">{grupo}</h2>
                  <span className="text-[13px] font-semibold tabular-nums text-texto-2">
                    {lineas.length} {lineas.length === 1 ? p.alumno : p.alumnos} · {fmtMoney(total)}
                  </span>
                </div>
                <div className={`hidden gap-3 px-4 py-2.5 sm:px-5 lg:grid ${TABLA.encabezado} ${COLUMNAS}`}>
                  <span>{p.Alumno}</span>
                  <span>{p.Materia}</span>
                  <span>Forma de pago</span>
                  <span className="text-right">{columnaCobrado}</span>
                  <span className="text-right">%</span>
                  <span className="text-right">{cuenta ? "Para el docente" : "Quedaría"}</span>
                </div>
                <ul className={`${LISTA.lista} border-t border-borde-soft`}>
                  {visibles.map((l) => (
                    <li key={`${l.inscripcionId}-${l.materia.orden}`}>
                      <button
                        type="button"
                        onClick={() => setElegida(l)}
                        aria-label={`Ver el detalle de ${l.alumno.nombre}`}
                        // UX 8: de dónde sale el monto, también al pasar el mouse.
                        title={l.explicacion}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-left transition-colors sm:px-5 ${COLUMNAS} ${
                          elegida === l ? "bg-primary-50" : "hover:bg-muted"
                        }`}
                      >
                        <span className="truncate text-sm font-medium text-texto max-lg:order-1">{l.alumno.nombre}</span>
                        <span className="hidden truncate text-sm text-texto-2 lg:block">
                          M{l.materia.orden} {l.materia.nombre}
                        </span>
                        <span className="truncate text-sm text-texto-2 max-lg:order-3 max-lg:text-[12px] max-lg:text-texto-3">{textoFormaPago(l.formaPago)}</span>
                        <span className="hidden text-right text-sm tabular-nums text-texto-2 lg:block">
                          {fmtMoney(lista === "postergados" ? l.abonado : lista === "sinPagar" ? l.montoModulo : l.cobradoModulo)}
                        </span>
                        <span className="hidden text-right text-sm tabular-nums text-texto-3 lg:block">{l.pct} %</span>
                        <span className={`text-right text-sm font-semibold tabular-nums max-lg:order-2 ${cuenta ? "text-texto" : "text-texto-3"}`}>
                          {fmtMoney(cuenta ? l.monto : (l.montoPotencial ?? l.monto))}
                        </span>
                      </button>
                      {conMotivo && (l.motivoNoPago || (liquida && materiaDe(l) != null)) && (
                        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 sm:px-5">
                          {l.motivoNoPago && (
                            <span className="min-w-0 text-[12px] text-texto-2">
                              <span className="font-semibold">Motivo:</span> {textoMotivoNoPago(l.motivoNoPago)}
                            </span>
                          )}
                          {liquida && materiaDe(l) != null && (
                            <BotonFila
                              variante="ghost"
                              icono="edit"
                              onClick={() => setMotivoDe(l)}
                              aria-label={`${l.motivoNoPago ? "Cambiar el motivo" : "Agregar motivo"} de ${l.alumno.nombre}`}
                            >
                              {l.motivoNoPago ? "Cambiar motivo" : "Agregar motivo"}
                            </BotonFila>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {lineas.length > LIMITE && (
                  <div className="border-t border-borde-soft bg-muted px-4 py-2.5 sm:px-5">
                    <BotonFila variante="ghost" onClick={() => setVerTodos({ ...verTodos, [grupo]: !todos })}>
                      {todos ? "Ver menos" : `Ver los ${lineas.length - LIMITE} ${p.alumnos} restantes`}
                    </BotonFila>
                  </div>
                )}
              </section>
            );
          })
        )}
      </Tarjeta>

      {elegida && (
        <PanelLateral
          abierto
          titulo={elegida.alumno.nombre}
          subtitulo={`${elegida.grupo.nombre} · M${elegida.materia.orden} ${elegida.materia.nombre} · ${textoFormaPago(elegida.formaPago)}`}
          onClose={() => setElegida(null)}
          acciones={
            <Link
              to={`/academia/alumnos/${elegida.alumno.id}`}
              className="inline-flex w-full items-center justify-center rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
            >
              Ficha del {p.alumno}
            </Link>
          }
        >
          <SeccionPanel titulo={`Para el ${p.docente} este mes`}>
            <ResumenPanel>
              <span className={`block text-2xl font-bold tabular-nums ${cuenta ? "text-primary-700" : "text-texto-3"}`}>
                {fmtMoney(cuenta ? elegida.monto : 0)}
              </span>
              <span className="mt-0.5 block text-[13px] text-texto-3">
                {lista === "cuentan"
                  ? "Pagó el módulo completo"
                  : lista === "atrasados"
                    ? "Completó un módulo de un mes anterior"
                    : lista === "postergados"
                      ? `Abonó ${fmtMoney(elegida.abonado)} de ${fmtMoney(elegida.montoModulo)}: suma ${fmtMoney(elegida.montoPotencial ?? 0)} cuando complete`
                      : "No pagó el módulo: no suma"}
              </span>
            </ResumenPanel>
          </SeccionPanel>
          <SeccionPanel titulo="De dónde sale el monto">
            <p className="rounded-xl border border-borde-soft bg-white p-3 text-[13px] text-texto-2">{elegida.explicacion}</p>
          </SeccionPanel>
          {conMotivo && (elegida.motivoNoPago || (liquida && materiaDe(elegida) != null)) && (
            <SeccionPanel titulo={`Por qué no se le paga al ${p.docente}`}>
              {elegida.motivoNoPago ? (
                <p className="text-[13px] text-texto-2">
                  {textoMotivoNoPago(elegida.motivoNoPago)}
                  <span className="block text-[12px] text-texto-3">
                    {[nombreDe(elegida.motivoNoPago.usuario ?? ""), fechaCorta(elegida.motivoNoPago.fecha)].filter(Boolean).join(" · ")}
                  </span>
                </p>
              ) : (
                <p className="text-[13px] text-texto-3">Sin motivo anotado.</p>
              )}
              {liquida && materiaDe(elegida) != null && (
                <BotonFila variante="ghost" icono="edit" className="mt-2" onClick={() => setMotivoDe(elegida)}>
                  {elegida.motivoNoPago ? "Cambiar motivo" : "Agregar motivo"}
                </BotonFila>
              )}
            </SeccionPanel>
          )}
        </PanelLateral>
      )}

      {motivoDe && (
        <DialogoMotivo
          linea={motivoDe}
          onCerrar={() => setMotivoDe(null)}
          onGuardado={(m) => {
            ponerMotivo(motivoDe, m);
            setMotivoDe(null);
            setAviso(m ? "Motivo anotado." : "Motivo quitado.");
          }}
        />
      )}

      <Modal
        abierto={pagando}
        titulo="Registrar el pago"
        onClose={() => !ocupado && setPagando(false)}
        ancho="max-w-sm"
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setPagando(false)} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton onClick={() => void pagar()} disabled={ocupado}>
              {ocupado ? "Un momento…" : `Pagar ${fmtMoney(r.liquido)}`}
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-texto-2">
            ¿Pagar <b className="tabular-nums">{fmtMoney(r.liquido)}</b> a {d.docente.nombre} por {tituloMes(d.mes).toLowerCase()}? Queda como gasto de
            sueldos y la planilla pasa a pagada: no se deshace.
          </p>
          <div className="space-y-2">
            <span className="block text-[13px] font-semibold text-texto-2">Cómo se le paga</span>
            <Chips titulo="Método" valor={metodo} opciones={METODOS} onChange={setMetodo} />
          </div>
        </div>
      </Modal>

      <Confirmar
        abierto={forzar}
        titulo="El mes no terminó"
        texto="Si la cerrás ahora, lo que se pague después entra en la planilla del mes siguiente. ¿Cerrarla igual?"
        etiquetaOk="Cerrar igual"
        onCancel={() => setForzar(false)}
        onOk={() => {
          setForzar(false);
          void cerrar(true);
        }}
      />
    </PaginaAcademia>
  );
}

/** El módulo de la línea, como lo pide el endpoint del motivo; un backend anterior no lo manda. */
function materiaDe(l: LineaPlanilla): number | undefined {
  return l.materiaId ?? l.materia.id;
}

/**
 * A6: anotar por qué una línea no le suma al docente. Cinco opciones y, con
 * "Otro", el texto es obligatorio. Si ya tenía uno, se cambia o se quita.
 */
function DialogoMotivo({
  linea,
  onCerrar,
  onGuardado,
}: {
  linea: LineaPlanilla;
  onCerrar: () => void;
  onGuardado: (m: MotivoNoPagoLinea | null) => void;
}) {
  const { usuario } = useAuth();
  const actual = linea.motivoNoPago ?? null;
  const [motivo, setMotivo] = useState<MotivoNoPago>(actual?.motivo ?? "NO_PAGO");
  const [detalle, setDetalle] = useState(actual?.detalle ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const materiaId = materiaDe(linea)!;
  const falta = motivo === "OTRO" && detalle.trim().length < 3;

  async function guardar() {
    if (falta) return setError("Contá cuál es el motivo.");
    setOcupado(true);
    setError("");
    try {
      const det = detalle.trim();
      await apiAcademia.guardarMotivoNoPago({ inscripcionId: linea.inscripcionId, materiaId, motivo, ...(det ? { detalle: det } : {}) });
      onGuardado({ motivo, detalle: det || null, usuario: usuario?.nombre ?? usuario?.username ?? null, fecha: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el motivo");
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    setOcupado(true);
    setError("");
    try {
      await apiAcademia.quitarMotivoNoPago(linea.inscripcionId, materiaId);
      onGuardado(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el motivo");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Motivo de no pago"
      subtitulo={`${linea.alumno.nombre} · M${linea.materia.orden} ${linea.materia.nombre}`}
      onClose={() => !ocupado && onCerrar()}
      ancho="max-w-sm"
      acciones={
        <>
          {actual && (
            <Boton variante="ghost" onClick={() => void quitar()} disabled={ocupado} className="mr-auto">
              Quitar motivo
            </Boton>
          )}
          <Boton variante="ghost" onClick={onCerrar} disabled={ocupado}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={ocupado}>
            {ocupado ? "Guardando…" : "Guardar motivo"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div role="radiogroup" aria-label="Motivo" className="space-y-1.5">
          {MOTIVOS_NO_PAGO.map(([k, label]) => (
            <label
              key={k}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 text-sm transition-colors sm:min-h-10 ${
                motivo === k ? "border-primary bg-primary-50 font-semibold text-primary-700" : "border-borde bg-white text-texto-2 hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="motivo-no-pago"
                checked={motivo === k}
                onChange={() => setMotivo(k)}
                className="h-4 w-4 accent-[var(--color-primary-boton)]"
              />
              {label}
            </label>
          ))}
        </div>
        <Campo label={motivo === "OTRO" ? "¿Cuál?" : "Detalle (opcional)"}>
          <Input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder={motivo === "OTRO" ? "Contá el motivo" : ""} />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** Las líneas por grupo, en el orden en que llegan. */
function agrupar(lineas: LineaPlanilla[]): [string, LineaPlanilla[]][] {
  const m = new Map<string, LineaPlanilla[]>();
  for (const l of lineas) m.set(l.grupo.nombre, [...(m.get(l.grupo.nombre) ?? []), l]);
  return [...m.entries()];
}
