import { useEffect, useRef, useState } from "react";
import { Boton, Confirmar, Modal } from "../../../components/ui";
import { fmtFechaHora, fmtPlata } from "../../../lib/format";
import { ctrlEnter, pasarAlSiguiente, useTeclas } from "../../../lib/nutricion/atajos";
import { fechaLarga, hoyIso } from "../../../lib/nutricion/calculo";
import { apiSeguimiento, esCodigo, hojaDesactualizada } from "../../../lib/nutricion/seguimiento/api";
import {
  dosisDelRegistro,
  esSemanaDePago,
  fmtDosis,
  mesDeLaSemana,
  nombreSemana,
  pagoDelMes,
  pagoDelRegistro,
  partesEquivalencias,
  pesoDeLaEvaluacion,
  semanas,
} from "../../../lib/nutricion/seguimiento/formato";
import {
  cambiosDeSemana,
  conPagoDelMes,
  erroresDeSemana,
  hayErrores,
  semanaAInput,
  semanaCambio,
  semanaConDatos,
  semanaDesde,
  semanaVacia,
  soloLoEscrito,
  valorLimitado,
  type FormSemana,
} from "../../../lib/nutricion/seguimiento/formulario";
import type { CatalogoSeguimiento, HojaPaciente, Registro, Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";
import { CampoNumero, CampoTexto, Rotulo, Tecla } from "../piezas";
import {
  BloqueDosis,
  BloqueObservaciones,
  BloquePagos,
  BloquePeso,
  PreguntaSinPago,
  QuienYCuando,
} from "./bloques";

/**
 * La hoja «Semana N» (cargar y corregir; también «Inicial»),
 * CONTRATO-nutricion-seguimiento-23nov §4.2. Todo vacío salvo la fecha y el
 * número de la semana; al lado de cada campo, en gris, lo de la semana
 * anterior. Los botones de la dosis escriben el número recién cuando se
 * tocan. Si es la semana de pago del mes y el mes no tiene pago, el bloque de
 * los pagos va en amarillo y, si se guarda sin pago, pregunta (no bloquea).
 * `Ctrl+Enter` guarda; `Esc` cierra (con cambios, pregunta); `Enter` pasa al
 * campo siguiente.
 */
export default function HojaSemana({
  tratamiento,
  catalogo,
  registro,
  semana,
  pacienteNombre,
  ultimoControl,
  focoPago = false,
  onEditarTratamiento,
  onCerrar,
  onGuardado,
  onDesactualizada,
  onVerSemana,
}: {
  tratamiento: Tratamiento;
  catalogo: CatalogoSeguimiento;
  /** El registro a corregir; null = una semana nueva. */
  registro: Registro | null;
  /** El número de la semana nueva (la que sigue, o la que se tocó para cargar). */
  semana: number;
  pacienteNombre: string;
  ultimoControl: HojaPaciente["ultimoControl"];
  /** «Anotar pago»: abre con el foco en «Medicamento (Bs)». */
  focoPago?: boolean;
  /** Para el aviso del vial que falta («Editar tratamiento»), si puede editarlo. */
  onEditarTratamiento?: () => void;
  onCerrar: () => void;
  onGuardado: (t: Tratamiento, aviso: string) => void;
  /** El servidor dijo que la hoja de atrás quedó vieja (404 / 409): se vuelve a leer al cerrar. */
  onDesactualizada?: () => void;
  /**
   * «Ver la hoja» después de un SEMANA_REPETIDA al cargar: cierra sin
   * preguntar, vuelve a leer la hoja y deja a la vista esa semana.
   */
  onVerSemana?: (semana: number) => void;
}) {
  const esInicial = registro?.semana === 0;
  const [antes] = useState<FormSemana>(() => (registro ? semanaDesde(registro) : semanaVacia(semana)));
  const [form, setForm] = useState<FormSemana>(antes);
  const cambiar = <K extends keyof FormSemana>(campo: K, valor: FormSemana[K]) => setForm((f) => ({ ...f, [campo]: valor }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [preguntaCerrar, setPreguntaCerrar] = useState(false);
  const [preguntaPago, setPreguntaPago] = useState(false);
  // La semana que el servidor dijo que ya existe al CARGARLA (puede que se haya
  // guardado y se perdió la respuesta): la ayuda para no cargarla dos veces.
  const [repetida, setRepetida] = useState<number | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  const medicamento = useRef<HTMLInputElement>(null);
  const hoy = hoyIso();

  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  // «Anotar pago»: directo al campo del medicamento.
  useEffect(() => {
    if (!focoPago) return;
    const t = setTimeout(() => {
      medicamento.current?.focus();
      medicamento.current?.scrollIntoView?.({ block: "center" });
    }, 50);
    return () => clearTimeout(t);
  }, [focoPago]);

  const conCambios = semanaCambio(antes, form);
  const pedirCerrar = () => (conCambios ? setPreguntaCerrar(true) : onCerrar());

  // De qué semana es la hoja (el número se puede cambiar, salvo en el inicial).
  const numero = esInicial ? 0 : (valorLimitado("semana", form.semana) ?? registro?.semana ?? semana);
  const otros = tratamiento.registros.filter((r) => r.id !== registro?.id);
  const errores = erroresDeSemana(form, { inicial: esInicial, semanasCargadas: otros.map((r) => r.semana), hoy });
  const previos = otros.filter((r) => r.semana < numero);
  const pesoAntes = [...previos].reverse().find((r) => r.pesoKg != null) ?? null;
  const primerPeso = otros.find((r) => r.pesoKg != null && r.semana < numero) ?? null;
  const dosisAntes = [...previos].reverse().map(dosisDelRegistro).find((d) => d != null) ?? null;

  // La semana se anotó en otra unidad (la del tratamiento cambió después):
  // mientras no se toque el número, se lee en la suya, con lo que tenía.
  const unidad = tratamiento.unidadDosis;
  const otraUnidad = registro?.unidadDosis && registro.unidadDosis !== unidad && registro.dosis != null ? registro.unidadDosis : null;
  const sinTocarDosis = form.dosis === antes.dosis;
  const unidadDelCampo = otraUnidad && sinTocarDosis ? otraUnidad : unidad;

  // «Hoy toca el pago del mes»: la semana de pago (o el inicial) de un mes sin
  // pago todavía, sin contar lo que tenga anotado esta misma semana.
  const mes = mesDeLaSemana(tratamiento.meses, numero);
  const pagadoSinEsta = mes ? pagoDelMes(mes.pagado) - (registro && registro.mes === mes.mes ? (registro.pagoMedicamento ?? 0) + (registro.pagoControl ?? 0) : 0) : 0;
  const tocaPago = !!mes && esSemanaDePago(tratamiento.meses, numero) && pagadoSinEsta <= 0;

  const pasos = tratamiento.pasos;
  const faltaVial = pasos.length > 0 && unidad !== "mg" && !tratamiento.presentacion;
  const racha =
    !registro && tratamiento.resumen.dosisActual && tratamiento.resumen.semanasEnDosis > 0
      ? `Lleva ${semanas(tratamiento.resumen.semanasEnDosis)} con ${fmtDosis(tratamiento.resumen.dosisActual.dosis, tratamiento.resumen.dosisActual.unidadDosis)}`
      : null;

  async function guardar(sinPago = false) {
    if (guardando) return;
    setIntento(true);
    setRepetida(null);
    if (hayErrores(errores)) {
      setError("Hay un dato para revisar.");
      return;
    }
    if (!registro && !semanaConDatos(form)) {
      setError("Escribí al menos el peso, la dosis, una observación o un pago, o marcá «No se aplicó».");
      return;
    }
    if (registro && !conCambios) {
      onCerrar();
      return;
    }
    if (tocaPago && !conPagoDelMes(form) && !sinPago) {
      setPreguntaPago(true);
      return;
    }
    setError("");
    setGuardando(true);
    try {
      const t = registro
        ? await apiSeguimiento.corregirRegistro(registro.id, cambiosDeSemana(antes, form, esInicial))
        : await apiSeguimiento.cargarSemana(tratamiento.id, soloLoEscrito(semanaAInput(form, false)));
      setPreguntaPago(false);
      onGuardado(t, registro ? (esInicial ? "Registro inicial corregido." : `Semana ${numero} corregida.`) : `Semana ${numero} guardada.`);
    } catch (e) {
      setPreguntaPago(false);
      if (hojaDesactualizada(e)) onDesactualizada?.();
      // Al cargar (no al mover una ya cargada): que no invite a cambiarle el número y duplicarla.
      setRepetida(!registro && esCodigo(e, "SEMANA_REPETIDA") ? numero : null);
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!registro) return;
    setGuardando(true);
    try {
      const t = await apiSeguimiento.borrarRegistro(registro.id);
      setBorrando(false);
      onGuardado(t, `Semana ${registro.semana} borrada.`);
    } catch (e) {
      setBorrando(false);
      if (hojaDesactualizada(e)) onDesactualizada?.();
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      setGuardando(false);
    }
  }

  const otraPregunta = borrando || preguntaCerrar || preguntaPago;
  useTeclas((e) => {
    if (otraPregunta || !ctrlEnter(e)) return;
    e.preventDefault();
    void guardar();
  });

  const id = "hs";
  const quien: string[] = [];
  if (registro) {
    quien.push(registro.registradoPor ? `Cargó: ${registro.registradoPor}, ${fmtFechaHora(registro.creadoEn)}` : `Cargado el ${fmtFechaHora(registro.creadoEn)}`);
    if (registro.actualizadoPor && registro.actualizadoEn !== registro.creadoEn) {
      quien.push(`Corrigió: ${registro.actualizadoPor}, ${fmtFechaHora(registro.actualizadoEn)}`);
    }
  }
  const pagoAnotado = registro ? pagoDelRegistro(registro) : 0;
  const guardadas = otraUnidad && registro ? partesEquivalencias(registro, otraUnidad) : null;

  return (
    <>
      <Modal
        abierto
        titulo={nombreSemana(registro ? registro.semana : numero)}
        subtitulo={`${pacienteNombre} · ${tratamiento.nombre}${registro ? ` · del ${fechaLarga(registro.fecha)}` : ""}`}
        onClose={otraPregunta ? sinCerrar : pedirCerrar}
        ancho="max-w-2xl"
        cerrarAlClicAfuera={false}
        acciones={
          <>
            {registro && !esInicial && (
              <Boton variante="ghost" className="mr-auto text-danger-text!" onClick={() => setBorrando(true)} disabled={guardando}>
                Borrar semana
              </Boton>
            )}
            <Boton variante="ghost" onClick={pedirCerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton onClick={() => void guardar()} disabled={guardando} title="Guardar (Ctrl+Enter)">
              {guardando ? "Guardando…" : "Guardar"}
              <Tecla sobreColor>Ctrl+Enter</Tecla>
            </Boton>
          </>
        }
      >
        <div
          className="space-y-5"
          onKeyDown={(e) => {
            // `Enter` en un campo de una línea pasa al siguiente.
            const el = e.target as HTMLElement;
            if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || el.tagName !== "INPUT") return;
            e.preventDefault();
            pasarAlSiguiente(e.currentTarget, el);
          }}
        >
          <div className="grid max-w-md grid-cols-2 gap-3">
            {!esInicial && (
              <Rotulo htmlFor={`${id}-semana`} label="Semana" error={intento || form.semana !== antes.semana ? errores.semana : null}>
                <CampoNumero
                  id={`${id}-semana`}
                  value={form.semana}
                  inputMode="numeric"
                  invalido={!!((intento || form.semana !== antes.semana) && errores.semana)}
                  onChange={(v) => cambiar("semana", v)}
                />
              </Rotulo>
            )}
            <Rotulo htmlFor={`${id}-fecha`} label="Fecha" error={intento ? errores.fecha : null} className={esInicial ? "col-span-2 max-w-[13.75rem]" : ""}>
              <CampoTexto
                id={`${id}-fecha`}
                type="date"
                value={form.fecha}
                max={hoy}
                invalido={intento && !!errores.fecha}
                onChange={(e) => cambiar("fecha", e.target.value)}
              />
            </Rotulo>
          </div>

          <div className="max-w-md">
            <BloquePeso
              id={id}
              form={form}
              errores={errores}
              intento={intento}
              cambiar={cambiar}
              anterior={pesoAntes?.pesoKg ?? null}
              inicial={primerPeso?.pesoKg ?? null}
              evaluacion={pesoDeLaEvaluacion(ultimoControl, pesoAntes?.fecha ?? null, esInicial ? "inicio" : "semana")}
              autoFocus={!registro && !focoPago}
            />
          </div>

          <BloqueDosis
            id={id}
            form={form}
            errores={errores}
            intento={intento}
            cambiar={cambiar}
            unidad={unidadDelCampo}
            mgPorMl={unidadDelCampo === unidad ? (tratamiento.presentacion?.mgPorMl ?? null) : null}
            uiPorMl={catalogo.uiPorMl}
            pasos={pasos}
            sinPresentacion={
              faltaVial ? (
                <>
                  Cargá la presentación del vial para ver las dosis en {unidad}.{" "}
                  {onEditarTratamiento && !conCambios ? (
                    <button type="button" onClick={onEditarTratamiento} className="font-semibold underline underline-offset-2">
                      Editar tratamiento
                    </button>
                  ) : onEditarTratamiento ? (
                    <span>Se carga en «Editar tratamiento» (guardá antes esta semana).</span>
                  ) : null}
                </>
              ) : null
            }
            antes={dosisAntes}
            racha={racha}
            ofrecerSinDosis={!esInicial}
            guardadas={guardadas && sinTocarDosis ? guardadas : null}
            avisoUnidad={otraUnidad ? `Se anotó en ${otraUnidad}. Si la cambiás, se anota en ${unidad}.` : null}
          />

          <BloqueObservaciones id={id} form={form} cambiar={cambiar} />

          <BloquePagos id={id} form={form} errores={errores} intento={intento} cambiar={cambiar} tocaPago={tocaPago} refMedicamento={medicamento} />

          <QuienYCuando partes={quien} />

          {error && (
            <div ref={avisoError} className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text" role="alert">
              <p>{error}</p>
              {repetida != null && onVerSemana && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="min-w-0 flex-1 text-texto-2">Puede que ya esté guardada. Mirá la hoja antes de cargarla de nuevo.</span>
                  <Boton variante="ghost" className="min-h-11 lg:min-h-10" onClick={() => onVerSemana(repetida)}>
                    Ver la hoja
                  </Boton>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Confirmar
        abierto={borrando}
        titulo={registro ? `¿Borrar la semana ${registro.semana}?` : "¿Borrar la semana?"}
        texto={
          pagoAnotado > 0
            ? `Esta semana tiene un pago anotado de ${fmtPlata(pagoAnotado)}. Si la borrás, se pierde.`
            : registro
              ? `Se borra lo anotado el ${fechaLarga(registro.fecha)}. Las demás semanas no cambian.`
              : ""
        }
        etiquetaOk="Borrar semana"
        peligroso
        procesando={guardando}
        onCancel={() => setBorrando(false)}
        onOk={() => void borrar()}
      />
      <Confirmar
        abierto={preguntaCerrar}
        titulo="¿Cerrar sin guardar?"
        texto="Lo que escribiste en esta semana se pierde."
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
