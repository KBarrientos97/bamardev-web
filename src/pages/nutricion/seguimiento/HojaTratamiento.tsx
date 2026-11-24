import { useEffect, useRef, useState } from "react";
import { Boton, Confirmar, Modal } from "../../../components/ui";
import { ctrlEnter, pasarAlSiguiente, useTeclas } from "../../../lib/nutricion/atajos";
import { fmtNumero, hoyIso } from "../../../lib/nutricion/calculo";
import { apiSeguimiento, hojaDesactualizada, tratamientoQueYaTiene } from "../../../lib/nutricion/seguimiento/api";
import {
  concentracion,
  delCatalogo,
  fmtDosis,
  numeroDeDosis,
  pasosDe,
  pesoDeLaEvaluacion,
  textoJeringa,
  textoMgPorUi,
  UNIDADES_DOSIS,
} from "../../../lib/nutricion/seguimiento/formato";
import {
  cambiosDeTratamiento,
  conPagoDelMes,
  erroresDeSemana,
  erroresDeTratamiento,
  hayErrores,
  iniciarAInput,
  semanaCambio,
  semanaVacia,
  tratamientoDesde,
  tratamientoVacio,
  vialDe,
  type FormSemana,
  type FormTratamiento,
} from "../../../lib/nutricion/seguimiento/formulario";
import type { CatalogoSeguimiento, HojaPaciente, Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";
import { useAtrasConCambios } from "../../../lib/useAtrasConCambios";
import { useAvisoAlCerrar } from "../../../lib/useAvisoAlCerrar";
import { CampoNumero, CampoTexto, Rotulo, SeccionHoja, Tecla } from "../piezas";
import { BloqueDosis, BloqueObservaciones, BloquePagos, BloquePeso, PreguntaSinPago } from "./bloques";
import { BotonesUnidad, BotonToque } from "./piezas";

/**
 * «Iniciar tratamiento» y «Editar tratamiento» (§4.2): el nombre (con las
 * sugerencias del catálogo), la presentación del vial (opcional, para pasar la
 * dosis de mg a UI y a ml) y en qué se anota la dosis (ningún botón marcado al
 * iniciar: es obligatorio elegir). Al iniciar, además, el registro inicial,
 * con los mismos bloques que «Semana N». Todo arranca vacío.
 */
export default function HojaTratamiento({
  modo,
  pacienteId,
  pacienteNombre,
  catalogo,
  tratamiento,
  ultimoControl,
  onCerrar,
  onGuardado,
  onYaTiene,
  onDesactualizada,
}: {
  modo: "iniciar" | "editar";
  pacienteId: number;
  pacienteNombre: string;
  catalogo: CatalogoSeguimiento;
  /** El que se edita. */
  tratamiento?: Tratamiento | null;
  ultimoControl: HojaPaciente["ultimoControl"];
  onCerrar: () => void;
  onGuardado: (t: Tratamiento, aviso: string) => void;
  /** El paciente ya tenía uno activo (409): volver a leer la hoja. */
  onYaTiene?: () => void;
  /** El servidor dijo que la hoja de atrás quedó vieja (404 / 409): se vuelve a leer al cerrar. */
  onDesactualizada?: () => void;
}) {
  const iniciar = modo === "iniciar";
  const [antesT] = useState<FormTratamiento>(() => (!iniciar && tratamiento ? tratamientoDesde(tratamiento) : tratamientoVacio()));
  const [formT, setFormT] = useState<FormTratamiento>(antesT);
  const [antesS] = useState<FormSemana>(() => semanaVacia(0));
  const [formS, setFormS] = useState<FormSemana>(antesS);
  const cambiarT = <K extends keyof FormTratamiento>(campo: K, valor: FormTratamiento[K]) => setFormT((f) => ({ ...f, [campo]: valor }));
  const cambiarS = <K extends keyof FormSemana>(campo: K, valor: FormSemana[K]) => setFormS((f) => ({ ...f, [campo]: valor }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [yaTiene, setYaTiene] = useState(false);
  const [intento, setIntento] = useState(false);
  const [preguntaCerrar, setPreguntaCerrar] = useState(false);
  const [preguntaPago, setPreguntaPago] = useState(false);
  const avisoError = useRef<HTMLParagraphElement>(null);
  const medicamento = useRef<HTMLInputElement>(null);
  const hoy = hoyIso();
  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);

  const conCambios = semanaCambio(antesS, formS) || (Object.keys(antesT) as (keyof FormTratamiento)[]).some((k) => antesT[k].trim() !== formT[k].trim());
  const pedirCerrar = () => (conCambios ? setPreguntaCerrar(true) : onCerrar());

  const erroresT = erroresDeTratamiento(formT);
  const erroresS = iniciar ? erroresDeSemana(formS, { inicial: true, semanasCargadas: [], hoy }) : {};
  const delCat = delCatalogo(catalogo, formT.nombre);
  const vial = vialDe(formT);
  const conc = vial ? concentracion(vial.mg, vial.ml, catalogo.uiPorMl) : null;
  const pasos = iniciar && delCat ? pasosDe(delCat.pasosMg, conc?.mgPorMl ?? null, catalogo.uiPorMl) : [];
  const unidad = formT.unidadDosis;
  const tocaPago = iniciar && catalogo.ajustes.avisarPagos;

  async function guardar(sinPago = false) {
    if (guardando) return;
    setIntento(true);
    if (hayErrores(erroresT) || hayErrores(erroresS)) {
      setError("Hay un dato para revisar.");
      return;
    }
    if (!iniciar && !conCambios) {
      onCerrar();
      return;
    }
    if (tocaPago && !conPagoDelMes(formS) && !sinPago) {
      setPreguntaPago(true);
      return;
    }
    setError("");
    setYaTiene(false);
    setGuardando(true);
    try {
      if (iniciar) {
        const t = await apiSeguimiento.iniciar(pacienteId, iniciarAInput(formT, formS));
        setPreguntaPago(false);
        onGuardado(t, `Tratamiento iniciado: ${t.nombre}.`);
      } else if (tratamiento) {
        const cambios = cambiosDeTratamiento(antesT, formT);
        if (!Object.keys(cambios).length) {
          onCerrar();
          return;
        }
        const t = await apiSeguimiento.cambiarTratamiento(tratamiento.id, cambios);
        onGuardado(t, "Tratamiento actualizado.");
      }
    } catch (e) {
      setPreguntaPago(false);
      if (hojaDesactualizada(e)) onDesactualizada?.();
      setYaTiene(tratamientoQueYaTiene(e) != null);
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const otraPregunta = preguntaCerrar || preguntaPago;
  // El atrás del navegador con algo escrito tampoco se lleva la hoja: pregunta
  // lo mismo que `Esc` (si ya hay una pregunta abierta, no abre otra). Cerrar o
  // recargar la pestaña, el aviso del navegador.
  useAtrasConCambios(conCambios && !guardando, () => {
    if (!otraPregunta) pedirCerrar();
  });
  useAvisoAlCerrar(conCambios);
  useTeclas((e) => {
    if (otraPregunta || !ctrlEnter(e)) return;
    e.preventDefault();
    void guardar();
  });

  const id = "ht";
  const errVial = intento ? erroresT.vial : null;
  const errMg = intento || formT.vialMg ? erroresT.vialMg : null;
  const errMl = intento || formT.vialMl ? erroresT.vialMl : null;
  const primerPaso = delCat?.pasosMg[0];

  return (
    <>
      <Modal
        abierto
        titulo={iniciar ? "Iniciar tratamiento" : "Editar tratamiento"}
        subtitulo={pacienteNombre}
        onClose={otraPregunta ? sinCerrar : pedirCerrar}
        ancho="max-w-2xl"
        cerrarAlClicAfuera={false}
        acciones={
          <>
            <Boton variante="ghost" onClick={pedirCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton onClick={() => void guardar()} disabled={guardando} title="Guardar (Ctrl+Enter)">
              {guardando ? "Guardando…" : iniciar ? "Iniciar tratamiento" : "Guardar"}
              <Tecla sobreColor>Ctrl+Enter</Tecla>
            </Boton>
          </>
        }
      >
        <div
          className="space-y-5"
          onKeyDown={(e) => {
            const el = e.target as HTMLElement;
            if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || el.tagName !== "INPUT") return;
            e.preventDefault();
            pasarAlSiguiente(e.currentTarget, el);
          }}
        >
          <Rotulo htmlFor={`${id}-nombre`} label="Tratamiento" error={intento ? erroresT.nombre : null}>
            <CampoTexto
              id={`${id}-nombre`}
              value={formT.nombre}
              maxLength={80}
              autoFocus
              autoComplete="off"
              invalido={intento && !!erroresT.nombre}
              onChange={(e) => cambiarT("nombre", e.target.value)}
            />
            {catalogo.tratamientos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {catalogo.tratamientos.map((t) => (
                  <BotonToque key={t.nombre} onClick={() => cambiarT("nombre", t.nombre)}>
                    {t.nombre}
                  </BotonToque>
                ))}
              </div>
            )}
          </Rotulo>

          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-texto-2">
              Presentación del vial <span className="font-normal text-texto-4">(opcional)</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm text-texto-2">
              <span>Vial de</span>
              <div className="w-28">
                <CampoNumero
                  id={`${id}-vialMg`}
                  aria-label="Miligramos del vial"
                  value={formT.vialMg}
                  unidad="mg"
                  invalido={!!(errMg || errVial)}
                  onChange={(v) => cambiarT("vialMg", v)}
                />
              </div>
              <span>en</span>
              <div className="w-28">
                <CampoNumero
                  id={`${id}-vialMl`}
                  aria-label="Mililitros del vial"
                  value={formT.vialMl}
                  unidad="ml"
                  invalido={!!(errMl || errVial)}
                  onChange={(v) => cambiarT("vialMl", v)}
                />
              </div>
            </div>
            {(errMg || errMl || errVial) && <p className="text-xs text-danger-text">{errMg ?? errMl ?? errVial}</p>}
            {delCat && delCat.presentaciones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {delCat.presentaciones.map((p) => (
                  <BotonToque
                    key={`${p.mg}-${p.ml}`}
                    onClick={() => setFormT((f) => ({ ...f, vialMg: fmtNumero(p.mg, 2), vialMl: fmtNumero(p.ml, 2) }))}
                  >
                    {fmtNumero(p.mg, 2)}&nbsp;mg en {fmtNumero(p.ml, 2)}&nbsp;ml
                  </BotonToque>
                ))}
              </div>
            )}
            <p className="text-[12px] text-texto-3">
              {conc ? (
                <span className="font-semibold text-texto-2">
                  {textoMgPorUi(conc.mgPorUi)}
                  {primerPaso != null && (
                    <>
                      {" "}
                      · {fmtDosis(primerPaso, "mg")} ≈&nbsp;{numeroDeDosis(primerPaso / conc.mgPorUi, "UI").texto}&nbsp;UI
                    </>
                  )}{" "}
                  <span className="font-normal text-texto-3">({textoJeringa(catalogo.uiPorMl)})</span>
                </span>
              ) : (
                "Sirve para pasar la dosis de mg a UI y a ml."
              )}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-texto-2">¿En qué anotás la dosis?</p>
            <BotonesUnidad valor={formT.unidadDosis} onElegir={(u) => cambiarT("unidadDosis", u)} unidades={UNIDADES_DOSIS} invalido={intento && !!erroresT.unidadDosis} />
            {intento && erroresT.unidadDosis && <p className="text-xs text-danger-text">{erroresT.unidadDosis}</p>}
            {!iniciar && (
              <p className="text-[12px] text-texto-3">
                Cambiar la unidad o el vial vale de acá en adelante: las semanas ya cargadas quedan como se anotaron.
              </p>
            )}
          </div>

          {iniciar && (
            <SeccionHoja titulo="Registro inicial">
              <div className="space-y-5">
                <Rotulo htmlFor={`${id}-fecha`} label="Fecha" error={intento ? erroresS.fecha : null} className="max-w-[13.75rem]">
                  <CampoTexto
                    id={`${id}-fecha`}
                    type="date"
                    value={formS.fecha}
                    max={hoy}
                    invalido={intento && !!erroresS.fecha}
                    onChange={(e) => cambiarS("fecha", e.target.value)}
                  />
                </Rotulo>
                <div className="max-w-md">
                  <BloquePeso
                    id={id}
                    form={formS}
                    errores={erroresS}
                    intento={intento}
                    cambiar={cambiarS}
                    anterior={null}
                    inicial={null}
                    evaluacion={pesoDeLaEvaluacion(ultimoControl, null, "inicio")}
                  />
                </div>
                <BloqueDosis
                  id={id}
                  form={formS}
                  errores={erroresS}
                  intento={intento}
                  cambiar={cambiarS}
                  unidad={unidad}
                  mgPorMl={conc?.mgPorMl ?? null}
                  uiPorMl={catalogo.uiPorMl}
                  pasos={pasos}
                  sinPresentacion={pasos.length > 0 && unidad && unidad !== "mg" && !conc ? `Cargá la presentación del vial (arriba) para ver las dosis en ${unidad}.` : null}
                  antes={null}
                  racha={null}
                  ofrecerSinDosis={false}
                />
                <BloqueObservaciones id={id} form={formS} cambiar={cambiarS} />
                <BloquePagos id={id} form={formS} errores={erroresS} intento={intento} cambiar={cambiarS} tocaPago={tocaPago} refMedicamento={medicamento} />
              </div>
            </SeccionHoja>
          )}

          {error && (
            <div ref={avisoError} className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text" role="alert">
              <span className="flex-1">{error}</span>
              {yaTiene && onYaTiene && (
                <Boton variante="ghost" onClick={onYaTiene}>
                  Ver su tratamiento
                </Boton>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Confirmar
        abierto={preguntaCerrar}
        titulo="¿Cerrar sin guardar?"
        texto={iniciar ? "Lo que escribiste del tratamiento se pierde." : "Los cambios del tratamiento se pierden."}
        etiquetaOk="Cerrar sin guardar"
        peligroso
        onCancel={() => setPreguntaCerrar(false)}
        onOk={onCerrar}
      />
      <PreguntaSinPago
        abierta={preguntaPago}
        procesando={guardando}
        onAnotar={() => {
          setPreguntaPago(false);
          setTimeout(() => medicamento.current?.focus(), 0);
        }}
        onGuardar={() => void guardar(true)}
      />
    </>
  );
}

const sinCerrar = () => {};
