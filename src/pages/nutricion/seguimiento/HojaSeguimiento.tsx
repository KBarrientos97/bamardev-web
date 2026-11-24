import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Modal, Vacio, useAviso } from "../../../components/ui";
import { fmtPlata, iniciales } from "../../../lib/format";
import { conAlt, ctrlEnter, escribiendo, hayDialogoAbierto, useTeclas } from "../../../lib/nutricion/atajos";
import { conUnidad, fechaLarga, hoyIso } from "../../../lib/nutricion/calculo";
import { apiSeguimiento, esNoEncontrado } from "../../../lib/nutricion/seguimiento/api";
import {
  escalonesDeLaSemana,
  flechaKg,
  leerDosis,
  nombreSemana,
  rachaAntes,
  semanaCorta,
  semanas,
  textoKg,
  textoProducto,
  textoFaltaPago,
  textoJeringa,
  textoMgPorUi,
  textoSexo,
  textoVial,
} from "../../../lib/nutricion/seguimiento/formato";
import { bajarPdfSeguimiento, documentoSeguimiento, enviarPdfSeguimientoPorWhatsapp } from "../../../lib/nutricion/seguimiento/pdf";
import type { CatalogoSeguimiento, HojaPaciente, Registro, Tratamiento, TratamientoAnterior } from "../../../lib/nutricion/seguimiento/tipos";
import { useCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { editaSeguimiento, RUTA_EVALUACION, RUTA_SEGUIMIENTO } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { ChipsFiltro, EncabezadoPagina, KpiTarjeta, PaginaAcademia as Pagina, Tarjeta } from "../../academia/piezas";
import GraficoEvolucion from "../GraficoEvolucion";
import { AreaTexto, CampoTexto, Rotulo, Tecla } from "../piezas";
import HojaSemana from "./HojaSemana";
import HojaTratamiento from "./HojaTratamiento";
import { Equivalentes, Franja } from "./piezas";
import TablaSemanas from "./TablaSemanas";

/** Qué hoja está abierta encima. */
type Abierta =
  | { que: "semana"; registro: Registro | null; semana: number; focoPago?: boolean; focoProducto?: boolean }
  | { que: "iniciar" }
  | { que: "editar" }
  | { que: "terminar" }
  | { que: "borrar" };

/**
 * La hoja de seguimiento del paciente (CONTRATO-nutricion-seguimiento-23nov
 * §4.2): quién es, su tratamiento (con el vial y la nota), los avisos de pago,
 * cómo va (las tarjetas), la tabla como la hoja de papel (filtrable por mes) y
 * el peso de cada semana. «Cargar semana N» con `Alt+N`; `/` o `Ctrl+K` vuelven
 * al buscador. Sin `seguimiento.editar`, o con el tratamiento terminado, todo
 * es de sólo lectura. Los anteriores se miran en la misma pantalla
 * (`?tratamiento=3`).
 */
export default function HojaSeguimiento() {
  const { id } = useParams();
  const pacienteId = Number(id);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { usuario, puede, negocio } = useAuth();
  const edita = editaSeguimiento(usuario);
  const veEvaluacion = puede("nutricion");
  const hoja = useApi(() => apiSeguimiento.hoja(pacienteId), [pacienteId]);
  const catalogo = useCatalogoSeguimiento();
  const activo = hoja.datos?.tratamiento ?? null;
  // Uno anterior, en la misma pantalla. El activo, aunque venga en la URL, se lee de la hoja.
  const pedido = Number(params.get("tratamiento")) || null;
  const mirando = pedido && hoja.datos && pedido !== activo?.id ? pedido : null;
  const otro = useApi(() => (mirando ? apiSeguimiento.tratamiento(mirando) : Promise.resolve(null)), [mirando], { clave: mirando });
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [aviso, setAviso] = useAviso(5000);
  const [error, setError] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [mesElegido, setMesElegido] = useState<number | "todo" | null>(null);
  // Una hoja abierta recibió un 404/409 (otra persona borró, cargó o terminó
  // algo mientras tanto): al cerrarla se vuelve a leer, para no seguir
  // mostrando una semana que ya no existe o un tratamiento que ya terminó.
  const desactualizada = useRef(false);
  // «Ver la hoja» tras una semana repetida: la semana a dejar a la vista cuando
  // llegue la hoja releída (`antes`: la que había al tocar el botón).
  const [aVer, setAVer] = useState<{ semana: number; antes: HojaPaciente | null } | null>(null);

  const t: Tratamiento | null = mirando ? (otro.datos ?? null) : activo;
  const enCurso = !!t && t.estado === "ACTIVO";
  const editable = edita && enCurso;
  const siguiente = t ? t.resumen.semana + 1 : 1;

  // Al entrar (y al cambiar de tratamiento), el mes del último registro.
  const ultimoMes = t?.registros[t.registros.length - 1]?.mes ?? null;
  useEffect(() => setMesElegido(null), [t?.id]);
  const mes = mesElegido === "todo" ? null : (mesElegido ?? ultimoMes);

  // Con la hoja releída (otra que la de antes, no la vieja con `cargando` en
  // falso): el mes de esa semana marcado y su renglón a la vista.
  const datosHoja = hoja.datos;
  useEffect(() => {
    if (!aVer || datosHoja === aVer.antes) return;
    setAVer(null);
    const r = t?.registros.find((x) => x.semana === aVer.semana);
    if (!r) return;
    setMesElegido(r.mes);
    // Sin limpieza: el `setAVer(null)` de arriba vuelve a correr este efecto y la cortaría.
    setTimeout(() => {
      const visible = Array.from(document.querySelectorAll<HTMLElement>(`[data-semana="${aVer.semana}"]`)).find((e) => e.getClientRects().length > 0);
      visible?.scrollIntoView?.({ block: "center" });
    }, 60);
  }, [aVer, datosHoja, t]);

  useTeclas((e) => {
    if (abierta || hayDialogoAbierto()) return;
    if (editable && conAlt(e, "n")) {
      e.preventDefault();
      setAbierta({ que: "semana", registro: null, semana: siguiente });
      return;
    }
    // Buscar a otro paciente: de vuelta a la lista, con el buscador enfocado.
    // Escribiendo, o con la nota del tratamiento abierta (aunque el foco haya
    // quedado en otro lado), no: se iba de la hoja y la nota a medio escribir
    // se perdía sin preguntar (probado el 23-nov).
    if (escribiendo(e.target) || document.getElementById("nota-tratamiento")) return;
    if (((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) || e.key === "/") {
      e.preventDefault();
      navigate(RUTA_SEGUIMIENTO);
    }
  });

  const h = hoja.datos;
  const cat = catalogo.datos;
  if ((hoja.error && !h) || (catalogo.error && !cat)) {
    const falla = hoja.error ? hoja.falla : catalogo.falla;
    return (
      <Pagina>
        {esNoEncontrado(falla) ? (
          <Vacio
            icono="search"
            titulo="No encontramos este paciente"
            texto="Puede que ya no exista o que sea de otro negocio."
            accion={
              <Link to={RUTA_SEGUIMIENTO} className="text-sm font-semibold text-primary-700 hover:underline">
                Volver al seguimiento
              </Link>
            }
          />
        ) : (
          <ErrorMsg
            onReintentar={() => {
              hoja.recargar();
              catalogo.recargar();
            }}
          >
            {hoja.error || catalogo.error}
          </ErrorMsg>
        )}
      </Pagina>
    );
  }
  if (!h || !cat) return <Cargando texto="Cargando la hoja…" />;
  const p = h.paciente;

  /** Cierra la hoja de encima; si el servidor avisó que lo de atrás quedó viejo, lo vuelve a leer. */
  const cerrarHoja = () => {
    setAbierta(null);
    if (!desactualizada.current) return;
    desactualizada.current = false;
    hoja.recargar();
    if (mirando) otro.recargar();
  };
  const marcarDesactualizada = () => {
    desactualizada.current = true;
  };
  /** «Ver la hoja» (semana repetida al cargar): cierra la carga sin preguntar y relee la hoja. */
  const verSemana = (semana: number) => {
    desactualizada.current = false;
    setAbierta(null);
    setAVer({ semana, antes: h });
    hoja.recargar();
  };

  /**
   * Lo que devuelve una escritura: el tratamiento al día. Con `releer` (se
   * puso, corrigió o quitó una marca de producto, §7.1: el servidor recalcula
   * las semanas siguientes) se vuelve a leer la hoja entera, además.
   */
  const alGuardar = (nuevo: Tratamiento, texto: string, releer = false) => {
    desactualizada.current = false;
    if (nuevo.estado === "ACTIVO" && (!mirando || mirando === nuevo.id)) {
      hoja.setDatos({ ...h, tratamiento: nuevo, anteriores: h.anteriores.filter((a) => a.id !== nuevo.id) });
      if (mirando) setParams({}, { replace: true });
      if (releer) hoja.recargar();
    } else if (mirando === nuevo.id) {
      otro.setDatos(nuevo);
      if (releer) otro.recargar();
    } else {
      hoja.recargar();
    }
    setAbierta(null);
    setError("");
    setAviso(texto);
  };

  async function terminar(fecha: string) {
    if (!t) return;
    setProcesando(true);
    setError("");
    try {
      const nuevo = await apiSeguimiento.cambiarTratamiento(t.id, { estado: "TERMINADO", terminadoEn: fecha });
      setAbierta(null);
      // Se sigue mirando el mismo, ya terminado (y así queda al recargar la página).
      setParams({ tratamiento: String(nuevo.id) }, { replace: true });
      hoja.recargar();
      setAviso(`Tratamiento terminado el ${fechaLarga(nuevo.terminadoEn ?? fecha)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo terminar.");
      setAbierta(null);
    } finally {
      setProcesando(false);
    }
  }

  async function reabrir() {
    if (!t) return;
    setProcesando(true);
    setError("");
    try {
      await apiSeguimiento.cambiarTratamiento(t.id, { estado: "ACTIVO" });
      setParams({}, { replace: true });
      hoja.recargar();
      setAviso("Tratamiento reabierto: se pueden cargar semanas otra vez.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reabrir.");
    } finally {
      setProcesando(false);
    }
  }

  async function borrarTratamiento() {
    if (!t) return;
    setProcesando(true);
    setError("");
    try {
      await apiSeguimiento.borrarTratamiento(t.id);
      setAbierta(null);
      setParams({}, { replace: true });
      hoja.recargar();
      setAviso(`Tratamiento borrado: ${t.nombre}.`);
    } catch (e) {
      setAbierta(null);
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      setProcesando(false);
    }
  }

  const datos = [
    p.ci ? `CI ${p.ci}${p.ciExpedido ? ` ${p.ciExpedido}` : ""}` : null,
    p.edad != null ? `${p.edad} años` : null,
    textoSexo(p.sexo),
    p.telefono,
  ].filter(Boolean);

  const acciones: AccionMenu[] = [];
  if (editable) {
    acciones.push({ clave: "editar", etiqueta: "Editar tratamiento", icono: "edit", onClick: () => setAbierta({ que: "editar" }) });
    acciones.push({ clave: "terminar", etiqueta: "Terminar tratamiento", icono: "checkCirculo", onClick: () => setAbierta({ que: "terminar" }) });
  }
  if (edita && t) {
    acciones.push({ clave: "borrar", etiqueta: "Borrar tratamiento", icono: "trash", peligrosa: true, separar: acciones.length > 0, onClick: () => setAbierta({ que: "borrar" }) });
  }
  const puedeIniciar = edita && !activo && p.activo;

  return (
    <Pagina>
      <EncabezadoPagina
        volver={{ a: RUTA_SEGUIMIENTO, texto: "Seguimiento" }}
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
            {veEvaluacion && (
              <Link
                to={`${RUTA_EVALUACION}/${p.id}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-borde bg-white px-3 text-sm font-semibold text-texto-2 transition-colors hover:bg-muted sm:min-h-[42px] sm:px-4"
              >
                <Icon name="evaluacion" size={16} />
                {/* En el celular, corto: así «⋯» no queda solo en otro renglón. */}
                <span className="max-sm:hidden">Ver evaluación</span>
                <span className="sm:hidden">Evaluación</span>
              </Link>
            )}
            {editable && (
              <Boton
                icono="plus"
                className="min-h-11 max-sm:px-3 sm:min-h-[42px]"
                onClick={() => setAbierta({ que: "semana", registro: null, semana: siguiente })}
                title={`Cargar semana ${siguiente} (Alt+N)`}
              >
                Cargar semana {siguiente}
                <Tecla sobreColor>Alt+N</Tecla>
              </Boton>
            )}
            {acciones.length > 0 && <MenuMas etiqueta="Más acciones del tratamiento" titulo={t?.nombre ?? p.nombre} acciones={acciones} />}
          </>
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[13px] text-texto-3 sm:pl-14">
          {!p.activo && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-texto-3">Archivado</span>}
          <span>{datos.join(" · ") || "Sin datos de contacto"}</span>
        </p>
      </EncabezadoPagina>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {/* Archivado en la Evaluación: su hoja se ve, pero no se le inicia un tratamiento (409 PACIENTE_ARCHIVADO). */}
      {!p.activo && (
        <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-borde bg-slate-50 px-4 py-3 text-sm text-texto-2">
          <Icon name="archive" size={18} className="mt-px shrink-0 text-texto-3" />
          <span>
            <span className="font-semibold text-texto">Paciente archivado.</span> No se le puede iniciar un tratamiento: primero hay que devolverlo a la lista en
            la Evaluación.
          </span>
        </div>
      )}

      {mirando && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-borde bg-white px-4 py-2.5 text-sm text-texto-2">
          <span className="flex items-center gap-2">
            <Icon name="archive" size={16} className="text-texto-3" />
            Estás viendo un tratamiento anterior.
          </span>
          <Link to={`${RUTA_SEGUIMIENTO}/${p.id}`} replace className="inline-flex min-h-11 items-center font-semibold text-primary-700 hover:underline lg:min-h-9">
            {activo ? "Volver al actual" : "Volver"}
          </Link>
        </div>
      )}

      {mirando && otro.cargando && !otro.datos ? (
        <Cargando texto="Cargando el tratamiento…" />
      ) : mirando && otro.error && !otro.datos ? (
        <ErrorMsg onReintentar={otro.recargar}>{esNoEncontrado(otro.falla) ? "Ese tratamiento ya no existe." : otro.error}</ErrorMsg>
      ) : !t ? (
        <Tarjeta etiqueta="Tratamiento">
          <Vacio
            icono="seguimiento"
            titulo={h.anteriores.length ? `${p.nombre} no tiene un tratamiento en curso.` : `${p.nombre} todavía no tiene un tratamiento.`}
            texto={!p.activo ? "Está archivado: no se le puede iniciar uno." : undefined}
            accion={
              puedeIniciar ? (
                <Boton icono="plus" onClick={() => setAbierta({ que: "iniciar" })}>
                  Iniciar tratamiento
                </Boton>
              ) : undefined
            }
          />
        </Tarjeta>
      ) : (
        <>
          <RenglonTratamiento
            t={t}
            catalogo={cat}
            edita={editable}
            onNota={async (nota) => {
              const nuevo = await apiSeguimiento.cambiarTratamiento(t.id, { nota });
              alGuardar(nuevo, nota ? "Nota del tratamiento guardada." : "Nota del tratamiento borrada.");
            }}
          />

          {t.estado === "TERMINADO" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-slate-50 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-texto-2">
                <Icon name="checkCirculo" size={18} className="text-texto-3" />
                Tratamiento terminado el {fechaLarga(t.terminadoEn)}
              </span>
              {edita && !activo && p.activo && (
                <span className="flex flex-wrap gap-2">
                  <Boton variante="ghost" onClick={() => void reabrir()} disabled={procesando}>
                    Reabrir
                  </Boton>
                  <Boton icono="plus" onClick={() => setAbierta({ que: "iniciar" })} disabled={procesando}>
                    Iniciar otro tratamiento
                  </Boton>
                </span>
              )}
            </div>
          )}

          {enCurso && <AvisosDePago t={t} edita={editable} onAnotar={(r) => setAbierta({ que: "semana", registro: r, semana: r.semana, focoPago: true })} />}

          <Resumen t={t} catalogo={cat} />

          <Tarjeta
            titulo="Semanas"
            bajada={editable ? "Tocá una semana para corregirla." : undefined}
            acciones={<BotonesPdf t={t} catalogo={cat} paciente={p} negocio={negocio?.nombre ?? null} onAviso={setAviso} onError={setError} />}
            sinRelleno
            barra={
              t.meses.length > 1 ? (
                <ChipsDeMes
                  valor={mes == null ? "todo" : String(mes)}
                  onChange={(v) => setMesElegido(v === "todo" ? "todo" : Number(v))}
                  opciones={[{ clave: "todo", label: "Todo" }, ...t.meses.map((m) => ({ clave: String(m.mes), label: `Mes ${m.mes}` }))]}
                />
              ) : undefined
            }
          >
            <TablaSemanas
              tratamiento={t}
              catalogo={cat}
              mes={mes}
              editable={editable}
              onCorregir={(r) => setAbierta({ que: "semana", registro: r, semana: r.semana })}
              onCargar={(s) => setAbierta({ que: "semana", registro: null, semana: s })}
              onCorregirProducto={(r) => setAbierta({ que: "semana", registro: r, semana: r.semana, focoProducto: true })}
            />
          </Tarjeta>

          <PesoPorSemana t={t} />
        </>
      )}

      {h.anteriores.length > 0 && <Anteriores anteriores={h.anteriores} pacienteId={p.id} mirando={mirando} abiertaDeEntrada={!activo} />}

      {abierta?.que === "semana" && t && (
        <HojaSemana
          // Otra semana es otra hoja: nada de lo escrito en una queda en la otra.
          key={abierta.registro ? `r${abierta.registro.id}` : `n${abierta.semana}`}
          tratamiento={t}
          catalogo={cat}
          registro={abierta.registro}
          semana={abierta.semana}
          pacienteNombre={p.nombre}
          ultimoControl={h.ultimoControl}
          focoPago={abierta.focoPago}
          focoProducto={abierta.focoProducto}
          onEditarTratamiento={editable ? () => setAbierta({ que: "editar" }) : undefined}
          onCorregirMarca={editable ? (r) => setAbierta({ que: "semana", registro: r, semana: r.semana, focoProducto: true }) : undefined}
          onCerrar={cerrarHoja}
          onGuardado={alGuardar}
          onDesactualizada={marcarDesactualizada}
          onVerSemana={verSemana}
        />
      )}
      {(abierta?.que === "iniciar" || abierta?.que === "editar") && (
        <HojaTratamiento
          modo={abierta.que}
          pacienteId={p.id}
          pacienteNombre={p.nombre}
          catalogo={cat}
          tratamiento={abierta.que === "editar" ? t : null}
          ultimoControl={h.ultimoControl}
          onCerrar={cerrarHoja}
          onDesactualizada={marcarDesactualizada}
          onGuardado={(nuevo, texto) => {
            if (abierta.que === "iniciar") {
              desactualizada.current = false;
              setParams({}, { replace: true });
              hoja.setDatos({ ...h, tratamiento: nuevo });
              setAbierta(null);
              setAviso(texto);
            } else alGuardar(nuevo, texto);
          }}
          onYaTiene={() => {
            setAbierta(null);
            setParams({}, { replace: true });
            hoja.recargar();
          }}
        />
      )}
      {abierta?.que === "terminar" && t && <DialogoTerminar t={t} procesando={procesando} onCancelar={() => setAbierta(null)} onTerminar={(f) => void terminar(f)} />}
      <Confirmar
        abierto={abierta?.que === "borrar"}
        titulo={t ? `¿Borrar el tratamiento ${t.nombre}?` : "¿Borrar el tratamiento?"}
        texto={
          t
            ? t.resumen.registros > 1
              ? `Se borran sus ${t.resumen.registros} semanas (con el inicial), con sus pesos, dosis y pagos anotados. No se puede deshacer.`
              : "Se borra el registro inicial. No se puede deshacer."
            : ""
        }
        etiquetaOk="Borrar tratamiento"
        peligroso
        procesando={procesando}
        onCancel={() => setAbierta(null)}
        onOk={() => void borrarTratamiento()}
      />
    </Pagina>
  );
}

// ── El renglón del tratamiento y su nota ────────────────────────────────────

function RenglonTratamiento({
  t,
  catalogo,
  edita,
  onNota,
}: {
  t: Tratamiento;
  catalogo: CatalogoSeguimiento;
  edita: boolean;
  onNota: (nota: string | null) => Promise<void>;
}) {
  return (
    <section aria-label="Tratamiento" className="card space-y-2 px-4 py-3.5 sm:px-5">
      <p className="text-[15px] text-texto-2">
        Tratamiento: <span className="font-bold text-texto">{t.nombre}</span> · desde el {fechaLarga(t.inicio)}
      </p>
      {t.presentacion && (
        <p className="text-[13px] text-texto-3">
          {textoVial(t.presentacion.mg, t.presentacion.ml)} · {textoMgPorUi(t.presentacion.mgPorUi)} ({textoJeringa(catalogo.uiPorMl)})
        </p>
      )}
      {/* §7.1: con cambios de producto, `nombre` es el de hoy; con qué empezó, en gris. */}
      {(t.cambiosDeProducto ?? 0) > 0 && t.productoInicial && (
        <p className="flex items-center gap-1.5 text-[13px] text-texto-3">
          <Icon name="swap" size={14} className="shrink-0" />
          Empezó con {textoProducto(t.productoInicial)} · cambió de producto {t.cambiosDeProducto === 1 ? "una vez" : `${t.cambiosDeProducto} veces`}
        </p>
      )}
      <NotaTratamiento nota={t.nota} edita={edita} onGuardar={onNota} />
    </section>
  );
}

/**
 * La nota general del tratamiento, a la vista (§4.2). Con permiso se edita ahí
 * mismo: un toque la abre, `Ctrl+Enter` guarda y `Esc` cancela. Lo de UNA
 * semana va en las Observaciones de esa semana.
 */
function NotaTratamiento({ nota, edita, onGuardar }: { nota: string | null; edita: boolean; onGuardar: (nota: string | null) => Promise<void> }) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const abrir = () => {
    setTexto(nota ?? "");
    setError("");
    setAbierta(true);
    setTimeout(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  };
  async function guardar() {
    if (guardando) return;
    const limpia = texto.trim() || null;
    if (limpia === (nota ?? null)) {
      setAbierta(false);
      return;
    }
    setGuardando(true);
    setError("");
    try {
      await onGuardar(limpia);
      setAbierta(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la nota.");
    } finally {
      setGuardando(false);
    }
  }

  if (abierta) {
    return (
      <div className="space-y-2 border-t border-borde-soft pt-3">
        <Rotulo htmlFor="nota-tratamiento" label="Notas del tratamiento" error={error || null}>
          <AreaTexto
            ref={area}
            id="nota-tratamiento"
            rows={3}
            maxLength={2000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (ctrlEnter(e)) {
                e.preventDefault();
                e.stopPropagation();
                void guardar();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setAbierta(false);
              }
            }}
          />
        </Rotulo>
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="ghost" onClick={() => setAbierta(false)} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar nota"}
            <Tecla sobreColor>Ctrl+Enter</Tecla>
          </Boton>
        </div>
      </div>
    );
  }
  if (!nota) {
    return edita ? (
      <button type="button" onClick={abrir} className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-primary-700 hover:underline lg:min-h-8">
        <Icon name="plus" size={14} />
        Agregar una nota del tratamiento
      </button>
    ) : null;
  }
  return (
    <div className="rounded-xl bg-muted px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Notas del tratamiento</p>
        {edita && (
          <button type="button" onClick={abrir} className="-my-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-primary-700 hover:bg-white lg:min-h-9">
            <Icon name="edit" size={13} />
            Editar
          </button>
        )}
      </div>
      <p className="mt-0.5 whitespace-pre-line break-words text-sm text-texto-2">{nota}</p>
    </div>
  );
}

// ── Los avisos de pago ──────────────────────────────────────────────────────

function AvisosDePago({ t, edita, onAnotar }: { t: Tratamiento; edita: boolean; onAnotar: (r: Registro) => void }) {
  const { pagosPendientes, proximoPago } = t.resumen;
  if (!pagosPendientes.length && !proximoPago) return null;
  return (
    <div className="space-y-2">
      {pagosPendientes.map((pp) => {
        // «Anotar pago» abre el último registro cargado de ese mes.
        const delMes = t.registros.filter((r) => r.mes === pp.mes);
        const ultimo = delMes[delMes.length - 1];
        return (
          <Franja
            key={pp.mes}
            tono="alerta"
            accion={
              edita && ultimo ? (
                <Boton variante="danger" icono="coins" className="min-h-11 lg:min-h-10" onClick={() => onAnotar(ultimo)}>
                  Anotar pago
                </Boton>
              ) : undefined
            }
          >
            {textoFaltaPago(pp)}
          </Franja>
        );
      })}
      {proximoPago && (
        <Franja tono="amarilla" icono="coins">
          En la próxima semana ({proximoPago.semana}) le toca pagar.
        </Franja>
      )}
    </div>
  );
}

// ── Las tarjetas ────────────────────────────────────────────────────────────

function Resumen({ t, catalogo }: { t: Tratamiento; catalogo: CatalogoSeguimiento }) {
  const r = t.resumen;
  const kg = flechaKg(r.kgBajados);
  const total = textoKg(r.kgBajados);
  // La última semana con peso anterior: «Última semana: bajó 0,4 kg».
  const ultimaSemana = textoKg([...t.registros].reverse().find((x) => x.kgSemana != null)?.kgSemana);
  const d = r.dosisActual;
  // La dosis actual se lee contra los escalones de SU semana (§7.4): «42 UI» y «12,5 mg», no «≈ 12,6 mg».
  const racha = rachaAntes(t.registros, Infinity, (s) => escalonesDeLaSemana(t, s, catalogo));
  const deLaDosis = racha?.semana;
  // Las semanas en esta dosis, por escalón (§7.4): un cambio de vial no corta la cuenta.
  const enDosis = racha?.aplicaciones ?? r.semanasEnDosis;
  const leida = d ? leerDosis(d, deLaDosis != null ? escalonesDeLaSemana(t, deLaDosis, catalogo) : null) : null;
  const sinAplicar = r.semanasSinDosis ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <KpiTarjeta etiqueta="Peso inicial" valor={r.pesoInicial != null ? conUnidad(r.pesoInicial, "kg", 2) : "—"} />
      <KpiTarjeta
        etiqueta="Peso actual"
        valor={r.pesoActual != null ? conUnidad(r.pesoActual, "kg", 2) : "—"}
        pie={r.ultimaFecha && r.pesoActual != null ? `al ${fechaLarga(ultimaConPeso(t) ?? r.ultimaFecha)}` : undefined}
      />
      <KpiTarjeta
        etiqueta={kg?.subio ? "Subió" : "Bajó"}
        valor={total ? `${total.cifra} kg` : "—"}
        tono={kg?.subio ? "urgente" : kg && !kg.igual ? "ok" : "normal"}
        pie={
          total || ultimaSemana ? (
            <span className="block space-y-0.5">
              {total && <span className="block">desde el inicio</span>}
              {ultimaSemana && (
                <span className="block">
                  Última semana: {ultimaSemana.tono === "igual" ? "igual" : `${ultimaSemana.texto.toLowerCase()} kg`}
                </span>
              )}
            </span>
          ) : undefined
        }
      />
      <KpiTarjeta
        etiqueta="Dosis actual"
        valor={leida ? leida.anotado : "—"}
        pie={
          d || sinAplicar > 0 ? (
            <span className="block space-y-0.5">
              {leida && leida.equivalencias.length > 0 && <Equivalentes partes={leida.equivalencias} aprox={leida.aprox} className="block" />}
              {d && enDosis > 0 && <span className="block">{semanas(enDosis)} en esta dosis</span>}
              {sinAplicar > 0 && <span className="block font-semibold text-warning-text">{semanas(sinAplicar)} sin aplicar</span>}
            </span>
          ) : undefined
        }
      />
      {/* La fecha de la semana más alta (`ultimaFecha` es la más reciente cargada, que puede ser otra si se movió una semana). */}
      <KpiTarjeta
        etiqueta="Semana"
        valor={String(r.semana)}
        pie={t.registros.length ? `${nombreSemana(r.semana)} · ${fechaLarga(t.registros[t.registros.length - 1].fecha)}` : undefined}
      />
      <KpiTarjeta
        etiqueta="Pagado"
        valor={fmtPlata(r.pagado.total)}
        pie={
          r.pagado.total > 0 ? (
            // Un concepto por renglón: en la tarjeta angosta, «·» al final de un renglón se leía suelto.
            <span className="block space-y-0.5">
              <span className="block whitespace-nowrap">Medicamento {fmtPlata(r.pagado.medicamento)}</span>
              <span className="block whitespace-nowrap">Control {fmtPlata(r.pagado.control)}</span>
              {r.pagado.otro > 0 && <span className="block whitespace-nowrap">Otro {fmtPlata(r.pagado.otro)}</span>}
            </span>
          ) : (
            "Sólo lo anotado en la hoja"
          )
        }
      />
    </div>
  );
}

/** La fecha del último registro con peso (la del «Peso actual»). */
function ultimaConPeso(t: Tratamiento): string | null {
  for (let i = t.registros.length - 1; i >= 0; i--) if (t.registros[i].pesoKg != null) return t.registros[i].fecha;
  return null;
}

// ── El gráfico ──────────────────────────────────────────────────────────────

function PesoPorSemana({ t }: { t: Tratamiento }) {
  const puntos = t.registros.flatMap((r) => (r.pesoKg == null ? [] : [{ fecha: r.fecha, valor: r.pesoKg, etiqueta: semanaCorta(r.semana) }]));
  return (
    <Tarjeta titulo="Peso por semana">
      {puntos.length ? (
        <div className="space-y-2">
          <GraficoEvolucion puntos={puntos} nombre="Peso" formato={(n) => conUnidad(n, "kg", 2)} />
          {puntos.length === 1 && <p className="text-center text-[13px] text-texto-3">Con la próxima semana vas a ver cómo baja.</p>}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-texto-3">Todavía no hay pesos anotados.</p>
      )}
    </Tarjeta>
  );
}

// ── Los chips de mes ────────────────────────────────────────────────────────

/**
 * «Todo · Mes 1 · Mes 2…». Con muchas semanas (8 o 10 meses) en el teléfono
 * van en una sola fila que se desliza de costado (antes eran tres renglones de
 * chips arriba de la tabla), con el mes elegido a la vista; en la tablet y la
 * PC, como siempre, bajan de renglón si no entran.
 */
function ChipsDeMes({ valor, onChange, opciones }: { valor: string; onChange: (v: string) => void; opciones: { clave: string; label: string }[] }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = caja.current;
    const el = c?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!c || !el || c.scrollWidth <= c.clientWidth) return;
    c.scrollLeft = el.offsetLeft - c.clientWidth / 2 + el.offsetWidth / 2;
  }, [valor, opciones.length]);
  return (
    <div
      ref={caja}
      className="relative -mx-4 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:-mx-5 sm:px-5 md:mx-0 md:overflow-visible md:px-0 [&_button]:min-h-11 [&_button]:shrink-0 lg:[&_button]:min-h-9 max-md:[&>[role=group]]:w-max max-md:[&>[role=group]]:flex-nowrap"
    >
      <ChipsFiltro<string> etiqueta="Filtrar por mes" valor={valor} onChange={onChange} opciones={opciones} />
    </div>
  );
}

// ── El PDF ──────────────────────────────────────────────────────────────────

/**
 * «Descargar PDF» y «Enviar por WhatsApp» (§7.2): con `seguimiento.ver`
 * alcanza. En el teléfono y la tablet, el diálogo de compartir del equipo; en
 * la PC, «Guardar como» o la descarga, y para WhatsApp el chat del paciente
 * con el mensaje y el PDF descargado para adjuntar.
 */
function BotonesPdf({
  t,
  catalogo,
  paciente,
  negocio,
  onAviso,
  onError,
}: {
  t: Tratamiento;
  catalogo: CatalogoSeguimiento;
  paciente: HojaPaciente["paciente"];
  negocio: string | null;
  onAviso: (texto: string) => void;
  onError: (texto: string) => void;
}) {
  const [armando, setArmando] = useState<"pdf" | "whatsapp" | null>(null);
  async function hacer(que: "pdf" | "whatsapp") {
    if (armando) return;
    setArmando(que);
    onError("");
    try {
      const doc = documentoSeguimiento({ negocio, paciente, tratamiento: t, catalogo });
      if (que === "pdf") {
        const r = await bajarPdfSeguimiento(doc);
        if (r === "guardado" || r === "descargado") onAviso("PDF del seguimiento listo.");
      } else {
        const r = await enviarPdfSeguimientoPorWhatsapp(doc, paciente.telefono);
        if (r === "descargado") onAviso("Se descargó el PDF: adjuntalo en el chat de WhatsApp.");
      }
    } catch {
      onError("No se pudo armar el PDF. Probá de nuevo.");
    } finally {
      setArmando(null);
    }
  }
  // En el teléfono, cortos: los dos entran en un renglón.
  return (
    <>
      <Boton variante="ghost" icono="download" aria-label="Descargar PDF" className="min-h-11 lg:min-h-10" disabled={!!armando} onClick={() => void hacer("pdf")}>
        {armando === "pdf" ? (
          "Armando…"
        ) : (
          <>
            <span className="sm:hidden">PDF</span>
            <span className="max-sm:hidden">Descargar PDF</span>
          </>
        )}
      </Boton>
      <Boton variante="ghost" icono="compartir" aria-label="Enviar por WhatsApp" className="min-h-11 lg:min-h-10" disabled={!!armando} onClick={() => void hacer("whatsapp")}>
        {armando === "whatsapp" ? (
          "Armando…"
        ) : (
          <>
            <span className="sm:hidden">WhatsApp</span>
            <span className="max-sm:hidden">Enviar por WhatsApp</span>
          </>
        )}
      </Boton>
    </>
  );
}

// ── Terminar ────────────────────────────────────────────────────────────────

function DialogoTerminar({ t, procesando, onCancelar, onTerminar }: { t: Tratamiento; procesando: boolean; onCancelar: () => void; onTerminar: (fecha: string) => void }) {
  const hoy = hoyIso();
  const [fecha, setFecha] = useState(hoy);
  const error = !fecha ? "Elegí la fecha" : fecha > hoy ? "No puede ser después de hoy" : fecha < t.inicio ? "No puede ser antes del inicio" : null;
  return (
    <Modal
      abierto
      titulo="¿Terminar el tratamiento?"
      subtitulo={`${t.nombre} · desde el ${fechaLarga(t.inicio)}`}
      onClose={onCancelar}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton onClick={() => !error && onTerminar(fecha)} disabled={procesando || !!error}>
            {procesando ? "Un momento…" : "Terminar tratamiento"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-texto-2">La hoja queda de sólo lectura. Si hace falta, se puede reabrir.</p>
        <Rotulo htmlFor="terminar-fecha" label="Terminó el" error={error}>
          <CampoTexto id="terminar-fecha" type="date" value={fecha} max={hoy} min={t.inicio} invalido={!!error} onChange={(e) => setFecha(e.target.value)} />
        </Rotulo>
      </div>
    </Modal>
  );
}

// ── Los anteriores ──────────────────────────────────────────────────────────

function Anteriores({
  anteriores,
  pacienteId,
  mirando,
  abiertaDeEntrada,
}: {
  anteriores: TratamientoAnterior[];
  pacienteId: number;
  mirando: number | null;
  /** Sin uno en curso, los anteriores son lo único que hay para ver: abiertos. */
  abiertaDeEntrada: boolean;
}) {
  const [abierta, setAbierta] = useState(mirando != null || abiertaDeEntrada);
  return (
    <section className="card min-w-0 overflow-hidden">
      <h2>
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-controls="tratamientos-anteriores"
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted sm:px-5"
        >
          <span className="text-[15px] font-bold text-texto">
            Tratamientos anteriores{" "}
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-texto-3">{anteriores.length}</span>
          </span>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-texto-3">
            {abierta ? "Plegar" : "Ver"}
            <Icon name="chevronDown" size={16} className={`transition-transform ${abierta ? "rotate-180" : ""}`} />
          </span>
        </button>
      </h2>
      {abierta && (
        <ul id="tratamientos-anteriores" className="divide-y divide-borde-soft border-t border-borde-soft">
          {anteriores.map((a) => {
            const kg = textoKg(a.kgBajados);
            const actual = mirando === a.id;
            return (
              <li key={a.id}>
                <Link
                  to={`${RUTA_SEGUIMIENTO}/${pacienteId}?tratamiento=${a.id}`}
                  aria-current={actual ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted sm:px-5 ${actual ? "bg-primary-50" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-texto">{a.nombre}</span>
                    <span className="text-texto-3">
                      {" "}
                      · {fechaLarga(a.inicio)} al {fechaLarga(a.terminadoEn)} · {semanas(a.semana)}
                    </span>
                    {kg && kg.tono !== "igual" && (
                      <span className={`whitespace-nowrap ${kg.tono === "subio" ? "text-danger-text" : "text-primary-700"}`}> · {kg.texto.toLowerCase()}&nbsp;kg</span>
                    )}
                  </span>
                  <Icon name="chevronRight" size={16} className="shrink-0 text-texto-4" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
