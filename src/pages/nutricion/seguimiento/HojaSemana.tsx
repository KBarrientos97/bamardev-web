import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/Icon";
import { Boton, Confirmar } from "../../../components/ui";
import { fmtFechaHora, fmtPlata } from "../../../lib/format";
import { ctrlEnter, pasarAlSiguiente, useTeclas } from "../../../lib/nutricion/atajos";
import { fechaLarga, fmtNumero, hoyIso } from "../../../lib/nutricion/calculo";
import { enfocaSolo, enfocarOMostrar } from "../../../lib/nutricion/foco";
import { apiSeguimiento, esCodigo, hojaDesactualizada } from "../../../lib/nutricion/seguimiento/api";
import { esDiaSemana } from "../../../lib/nutricion/seguimiento/dias";
import {
  concentracion,
  conMgDelEscalon,
  delCatalogo,
  diaYMes,
  dosisYSusMg,
  escalonesDeLaSemana,
  esDia,
  esSemanaDePago,
  igualQueLaAnterior,
  marcaVigente,
  mesDeLaSemana,
  nombreSemana,
  pagoDelMes,
  pagoDelRegistro,
  partesEquivalencias,
  pasosDe,
  pasosMgDe,
  pesoDeLaEvaluacion,
  productoInicialDe,
  productoVigente,
  rachaAntes,
  referenciasDelPago,
  textoFaltaPago,
  textoPresentacion,
  ultimoPesoDelSeguimiento,
  type EscalonesDeLaSemana,
} from "../../../lib/nutricion/seguimiento/formato";
import {
  cambioLaMarca,
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
  vialDe,
  type FormSemana,
} from "../../../lib/nutricion/seguimiento/formulario";
import type { CatalogoSeguimiento, HojaPaciente, Producto, ProductoSeguimiento, Registro, Tratamiento } from "../../../lib/nutricion/seguimiento/tipos";
import { useAtrasConCambios } from "../../../lib/useAtrasConCambios";
import { useAvisoAlCerrar } from "../../../lib/useAvisoAlCerrar";
import { BloqueDosis, BloqueObservaciones, BloquePagos, BloquePeso, BloqueProducto, PieHoja, PreguntaSinPago, QuienYCuando } from "./bloques";
import { ChipDia } from "./DiaSemana";
import DialogoTratamientos from "./DialogoTratamientos";
import HojaGrande from "./HojaGrande";

/**
 * La hoja «Semana N» (cargar y corregir; también «Inicial»), según la maqueta
 * A del 23-nov (CONTRATO-nutricion-seguimiento-23nov §7.2): pantalla entera en
 * el teléfono y la tablet, diálogo ancho de dos columnas en la PC. Arriba la
 * semana (el número se puede cambiar, discreto en el título), el mes y la
 * fecha; la franja con lo de la semana pasada; el peso grande con lo que bajó
 * en vivo; la dosis con «Igual que la anterior» ya marcada en una semana
 * nueva; las observaciones; y el pago, abierto en amarillo cuando toca.
 *
 * Todo lo demás arranca vacío (lo de antes, en gris al lado). La dosis marcada
 * de fábrica no cuenta como cambio sin guardar, pero se guarda al guardar.
 * `Ctrl+Enter` guarda; `Esc` cierra (con cambios, pregunta); `Enter` pasa al
 * campo siguiente.
 */
export default function HojaSemana({
  tratamiento,
  catalogo,
  registro,
  semana,
  pacienteNombre,
  diaSemana,
  ultimoControl,
  focoPago = false,
  focoProducto = false,
  onEditarTratamiento,
  onCorregirMarca,
  onCerrar,
  onGuardado,
  onDesactualizada,
  onVerSemana,
  onListaCambiada,
}: {
  tratamiento: Tratamiento;
  catalogo: CatalogoSeguimiento;
  /** El registro a corregir; null = una semana nueva. */
  registro: Registro | null;
  /** El número de la semana nueva (la que sigue, o la que se tocó para cargar). */
  semana: number;
  pacienteNombre: string;
  /**
   * El día que viene (§11): la pastilla «Viene los martes» en la cabecera, para
   * ir a buscar su vial. Sin día (null, o un backend anterior), la cabecera de siempre.
   */
  diaSemana?: number | null;
  ultimoControl: HojaPaciente["ultimoControl"];
  /** «Anotar pago»: abre con el foco en «Medicamento». */
  focoPago?: boolean;
  /** «Corregir» desde el renglón de la marca: abre con el foco en el producto nuevo. */
  focoProducto?: boolean;
  /** Para el aviso del vial que falta («Editar tratamiento»), si puede editarlo. */
  onEditarTratamiento?: () => void;
  /**
   * El vial que falta es el de un producto que cambió en otra semana (§7.1):
   * el aviso lleva a corregir ESA marca, no el tratamiento (que es el del inicio).
   */
  onCorregirMarca?: (r: Registro) => void;
  onCerrar: () => void;
  /** `releer`: se puso, corrigió o quitó una marca de producto; las semanas siguientes cambiaron. */
  onGuardado: (t: Tratamiento, aviso: string, releer?: boolean) => void;
  /** El servidor dijo que la hoja de atrás quedó vieja (404 / 409): se vuelve a leer al cerrar. */
  onDesactualizada?: () => void;
  /**
   * «Ver la hoja» después de un SEMANA_REPETIDA al cargar: cierra sin
   * preguntar, vuelve a leer la hoja y deja a la vista esa semana.
   */
  onVerSemana?: (semana: number) => void;
  /**
   * Se cambió la lista de tratamientos desde el «+ Agregar» del cambio de
   * producto (§9.2, ya guardada): el catálogo de atrás se vuelve a leer.
   */
  onListaCambiada?: (productos: ProductoSeguimiento[]) => void;
}) {
  const esInicial = registro?.semana === 0;
  const unidad = tratamiento.unidadDosis;
  const otros = tratamiento.registros.filter((r) => r.id !== registro?.id);
  /** La concentración del vial de un producto (null sin vial). */
  const concDe = (p: Producto) => (p.vialMg != null && p.vialMl != null ? (concentracion(p.vialMg, p.vialMl, catalogo.uiPorMl)?.mgPorMl ?? null) : null);

  // Una semana nueva viene con «Igual que la anterior» marcada (Kevin, 23-nov):
  // la última dosis aplicada antes de ella. Va también en `antes`, así cerrar
  // sin tocar nada no pregunta; y viaja al guardar como cualquier dato.
  const [antes] = useState<FormSemana>(() => {
    if (registro) return semanaDesde(registro);
    const r = rachaAntes(otros, semana, (s) => escalonesDeLaSemana(tratamiento, s, catalogo));
    const deAntes = r ? conMgDelEscalon(r.dosis, escalonesDeLaSemana(tratamiento, r.semana, catalogo)) : null;
    const igual = deAntes ? igualQueLaAnterior(deAntes, unidad, concDe(productoVigente(tratamiento, semana)), catalogo.uiPorMl) : null;
    return { ...semanaVacia(semana), dosis: igual?.escribe ?? "" };
  });
  const [form, setForm] = useState<FormSemana>(antes);
  const cambiar = <K extends keyof FormSemana>(campo: K, valor: FormSemana[K]) => setForm((f) => ({ ...f, [campo]: valor }));
  const refProducto = useRef<HTMLInputElement>(null);
  // Mientras no se toque la dosis, sigue a «Igual que la anterior» (si se cambia el número de la semana).
  const [dosisDeFabrica, setDosisDeFabrica] = useState(!registro && !!antes.dosis);
  const [guardando, setGuardando] = useState(false);
  // Al toque, sin esperar el dibujo: dos toques seguidos en «Guardar» mandaban la semana dos veces.
  const enCurso = useRef(false);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [preguntaCerrar, setPreguntaCerrar] = useState(false);
  const [preguntaPago, setPreguntaPago] = useState(false);
  // «Tratamientos» abierta encima, desde el «+ Agregar» del cambio de producto (§9.2).
  const [enLaLista, setEnLaLista] = useState(false);
  // La semana que el servidor dijo que ya existe al CARGARLA (puede que se haya
  // guardado y se perdió la respuesta): la ayuda para no cargarla dos veces.
  const [repetida, setRepetida] = useState<number | null>(null);
  const avisoError = useRef<HTMLDivElement>(null);
  const medicamento = useRef<HTMLInputElement>(null);
  const hoy = hoyIso();

  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  // «Anotar pago»: directo al campo del medicamento. En la PC con el foco; con
  // el dedo, el pago queda a la vista sin subir el teclado (`foco.ts`).
  useEffect(() => {
    if (!focoPago) return;
    const t = setTimeout(() => {
      enfocarOMostrar(medicamento.current);
      medicamento.current?.scrollIntoView?.({ block: "center" });
    }, 50);
    return () => clearTimeout(t);
  }, [focoPago]);
  // «Corregir» la marca desde la tabla: directo al producto (con el dedo, a la vista).
  useEffect(() => {
    if (!focoProducto) return;
    const t = setTimeout(() => {
      refProducto.current?.scrollIntoView?.({ block: "center" });
      enfocarOMostrar(refProducto.current);
    }, 80);
    return () => clearTimeout(t);
  }, [focoProducto]);

  const conCambios = semanaCambio(antes, form);
  const pedirCerrar = () => (conCambios ? setPreguntaCerrar(true) : onCerrar());

  // De qué semana es la hoja (el número se puede cambiar, salvo en el inicial).
  const numero = esInicial ? 0 : (valorLimitado("semana", form.semana) ?? registro?.semana ?? semana);
  const errores = erroresDeSemana(form, { inicial: esInicial, semanasCargadas: otros.map((r) => r.semana), hoy });
  const previos = otros.filter((r) => r.semana < numero);
  const conPeso = previos.filter((r) => r.pesoKg != null);
  const pesoAntes = conPeso[conPeso.length - 1] ?? null;
  const primerPeso = otros.find((r) => r.pesoKg != null && r.semana < numero) ?? null;
  const racha = rachaAntes(otros, numero, (s) => escalonesDeLaSemana(tratamiento, s, catalogo));
  const pasada = previos[previos.length - 1] ?? null;
  // La dosis de antes, con los mg de su escalón si es uno (§7.4): con otro vial, «Igual» son esos mismos mg.
  const escalonesDeAntes = racha ? escalonesDeLaSemana(tratamiento, racha.semana, catalogo) : null;
  const dosisDeAntes = racha ? conMgDelEscalon(racha.dosis, escalonesDeAntes) : null;

  // La semana se anotó en otra unidad (la del tratamiento cambió después):
  // mientras no se toque el número, se lee en la suya, con lo que tenía.
  const otraUnidad = registro?.unidadDosis && registro.unidadDosis !== unidad && registro.dosis != null ? registro.unidadDosis : null;
  const sinTocarDosis = form.dosis === antes.dosis;
  const unidadDelCampo = otraUnidad && sinTocarDosis ? otraUnidad : unidad;

  // El producto de ESTA semana (§7.1): el de su marca, si se puso una; si no,
  // el vigente (la marca más alta antes de ella, o el del inicio). Con otro
  // vial, los botones de la dosis y las equivalencias usan el vial nuevo.
  const vigente = productoVigente(tratamiento, numero, registro?.id);
  const marcaDeAntes = marcaVigente(tratamiento.registros, numero, registro?.id);
  const vialMarca = form.cambioProducto ? vialDe({ vialMg: form.productoVialMg, vialMl: form.productoVialMl }) : null;
  const productoSemana: Producto =
    form.cambioProducto && form.productoNombre.trim()
      ? { nombre: form.productoNombre.trim(), vialMg: vialMarca?.mg ?? null, vialMl: vialMarca?.ml ?? null }
      : vigente;
  const mgPorMlSemana = form.cambioProducto ? (vialMarca ? concDe({ nombre: "", vialMg: vialMarca.mg, vialMl: vialMarca.ml }) : null) : concDe(vigente);
  const mgPorMl = unidadDelCampo === unidad ? mgPorMlSemana : null;

  // Si se cambia el número de una semana nueva (o el vial de esta semana) sin
  // haber tocado la dosis, la marcada sigue siendo la de antes de ESA semana.
  const igualAhora = dosisDeFabrica && dosisDeAntes ? (igualQueLaAnterior(dosisDeAntes, unidad, mgPorMlSemana, catalogo.uiPorMl)?.escribe ?? "") : null;
  useEffect(() => {
    if (igualAhora != null && !form.sinDosis && form.dosis !== igualAhora) setForm((f) => ({ ...f, dosis: igualAhora }));
  }, [igualAhora, form.sinDosis, form.dosis]);

  // «Hoy toca el pago del mes»: la semana de pago (o el inicial) de un mes sin
  // pago todavía, sin contar lo que tenga anotado esta misma semana.
  const mes = mesDeLaSemana(tratamiento.meses, numero);
  const pagadoSinEsta = mes ? pagoDelMes(mes.pagado) - (registro && registro.mes === mes.mes ? (registro.pagoMedicamento ?? 0) + (registro.pagoControl ?? 0) : 0) : 0;
  const tocaPago = !!mes && esSemanaDePago(tratamiento.meses, numero) && pagadoSinEsta <= 0;
  const pendiente = tratamiento.resumen.pagosPendientes[0] ?? null;
  const conPagoAnotado = !!registro && pagoDelRegistro(registro) > 0;
  const tituloPago = tocaPago
    ? `Hoy toca el pago del mes ${mes!.mes}`
    : pendiente && !conPagoAnotado
      ? textoFaltaPago(pendiente).replace(/ \(desde el .*\)$/, "")
      : "Pago de esta semana";
  // Lo que ya lleva pagado el mes de esta semana (sin lo guardado en ella) y lo
  // que pagó el mes anterior, por MES (§8.2): un mes se paga a veces en dos visitas.
  const referenciasPago = referenciasDelPago(tratamiento.meses, numero, registro);

  // El peso de la Evaluación se ofrece sólo si el control se anotó DESPUÉS del
  // último peso del seguimiento (de todas sus semanas, también ésta como está
  // guardada; por fecha y, el mismo día, por cuándo se guardó) y no es de un
  // día posterior al de esta hoja (§8.2).
  const ultimoPeso = ultimoPesoDelSeguimiento(tratamiento.registros);
  const fechaHoja = esDia(form.fecha) ? form.fecha : (registro?.fecha ?? hoy);

  // Los escalones son de la droga (en mg): los que manda el servidor o, si el
  // producto de hoy no es del catálogo, los del producto de esta semana o del
  // inicio. Se cuentan con el vial de ESTA semana.
  const pasosMg = pasosMgDe(tratamiento, catalogo, productoSemana.nombre, vigente.nombre);
  const pasos = pasosDe(pasosMg, mgPorMlSemana, catalogo.uiPorMl);
  const faltaVial = pasos.length > 0 && unidad !== "mg" && !mgPorMlSemana;
  // Las presentaciones del catálogo para el producto nuevo (o, si no es del catálogo, las de la droga).
  const presentaciones = (
    delCatalogo(catalogo, form.productoNombre) ??
    delCatalogo(catalogo, vigente.nombre) ??
    delCatalogo(catalogo, productoInicialDe(tratamiento).nombre)
  )?.presentaciones ?? [];
  // Una semana guardada que sólo tiene la marca: quitarla la dejaría vacía (§7.1, el servidor no deja).
  const soloMarca = !!registro && !semanaConDatos({ ...form, cambioProducto: false });

  async function guardar(sinPago = false) {
    if (guardando || enCurso.current) return;
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
    if (registro && !esInicial && antes.cambioProducto && !form.cambioProducto && !semanaConDatos(form)) {
      setError("Sin el cambio de producto esta semana queda vacía: para quitarlo, borrá la semana.");
      return;
    }
    if (tocaPago && !conPagoDelMes(form) && !sinPago) {
      setPreguntaPago(true);
      return;
    }
    setError("");
    enCurso.current = true;
    setGuardando(true);
    try {
      const t = registro
        ? await apiSeguimiento.corregirRegistro(registro.id, cambiosDeSemana(antes, form, esInicial))
        : await apiSeguimiento.cargarSemana(tratamiento.id, soloLoEscrito(semanaAInput(form, false)));
      setPreguntaPago(false);
      // Poner, corregir o quitar la marca cambia las equivalencias de las semanas siguientes: la hoja se relee entera.
      onGuardado(t, registro ? (esInicial ? "Registro inicial corregido." : `Semana ${numero} corregida.`) : `Semana ${numero} guardada.`, cambioLaMarca(antes, form));
    } catch (e) {
      setPreguntaPago(false);
      if (hojaDesactualizada(e)) onDesactualizada?.();
      // Al cargar (no al mover una ya cargada): que no invite a cambiarle el número y duplicarla.
      setRepetida(!registro && esCodigo(e, "SEMANA_REPETIDA") ? numero : null);
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!registro || enCurso.current) return;
    enCurso.current = true;
    setGuardando(true);
    try {
      const t = await apiSeguimiento.borrarRegistro(registro.id);
      setBorrando(false);
      onGuardado(t, `Semana ${registro.semana} borrada.`, !!registro.producto);
    } catch (e) {
      setBorrando(false);
      if (hojaDesactualizada(e)) onDesactualizada?.();
      setError(e instanceof Error ? e.message : "No se pudo borrar.");
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  // Con una pregunta o la ventana «Tratamientos» encima, `Esc`, el atrás y `Ctrl+Enter` son de ella.
  const otraPregunta = borrando || preguntaCerrar || preguntaPago || enLaLista;
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
  const deHoy = form.fecha === hoy;
  const errSemana = !esInicial && (intento || form.semana !== antes.semana) ? errores.semana : null;
  const errFecha = intento ? errores.fecha : null;
  const vial = productoSemana.vialMg != null && productoSemana.vialMl != null ? textoPresentacion(productoSemana.vialMg, productoSemana.vialMl) : null;
  // §11: el día que viene, para ir a buscar su vial (cargar, corregir y el inicial).
  const conDia = esDiaSemana(diaSemana);
  // Con el teclado abierto y poco alto, este renglón no va (los errores de abajo y la pastilla del día, sí).
  const renglonPaciente = (
    <p className="col-span-2 row-start-2 min-w-0 text-sm text-texto-2 sm:col-span-1 sm:col-start-1 group-data-[teclado=compacto]/hoja:hidden">
      {pacienteNombre} · {productoSemana.nombre}
      {vial && <span className="max-sm:hidden">, {vial}</span>}
    </p>
  );
  // El vial que falta: el del producto nuevo de esta semana, el de una marca de antes o el del tratamiento.
  const avisoVial = !faltaVial ? null : form.cambioProducto ? (
    <>Completá la presentación del vial del producto nuevo para ver las dosis en {unidad}.</>
  ) : marcaDeAntes ? (
    <>
      Cargá la presentación del vial de {vigente.nombre} para ver las dosis en {unidad}.{" "}
      {onCorregirMarca && !conCambios ? (
        <button type="button" onClick={() => onCorregirMarca(marcaDeAntes)} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
          Corregir el cambio de la semana {marcaDeAntes.semana}
        </button>
      ) : onCorregirMarca ? (
        <span>Se carga en el cambio de producto de la semana {marcaDeAntes.semana} (guardá antes esta semana).</span>
      ) : null}
    </>
  ) : (
    <>
      Cargá la presentación del vial para ver las dosis en {unidad}.{" "}
      {onEditarTratamiento && !conCambios ? (
        <button type="button" onClick={onEditarTratamiento} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
          Editar tratamiento
        </button>
      ) : onEditarTratamiento ? (
        <span>Se carga en «Editar tratamiento» (guardá antes esta semana).</span>
      ) : null}
    </>
  );

  return (
    <>
      <HojaGrande
        titulo={nombreSemana(registro ? registro.semana : numero)}
        // Mientras guarda, `Esc` y la ✕ esperan (como «Cancelar»): preguntaba «se pierde» y la semana se guardaba igual.
        onClose={otraPregunta || guardando ? sinCerrar : pedirCerrar}
        cabecera={
          /*
            Con el día que viene (§11), una columna más desde `sm`: la pastilla,
            inmediatamente a la izquierda de la fecha. En el teléfono, en el renglón
            de abajo, antes del paciente; ese renglón se disuelve desde `sm`
            (`contents`) para que la pastilla y el paciente vayan cada uno a su lugar
            de la grilla. Sin día, la cabecera de siempre.
          */
          <div
            className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 ${
              conDia ? "sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-3" : "sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4"
            }`}
          >
            <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 sm:gap-2.5">
              <h2 className="flex items-baseline gap-1 whitespace-nowrap text-[22px] font-bold leading-tight sm:text-[26px] lg:text-[22px]">
                {esInicial ? (
                  "Inicial"
                ) : (
                  <>
                    Semana
                    {/*
                      El número se puede cambiar, discreto: del ancho justo de sus cifras, con el
                      subrayado punteado entero (un borde: el subrayado del texto, el campo lo
                      recortaba y en el teléfono no se veía). El toque de 44 px es el del rótulo.
                    */}
                    <label htmlFor={`${id}-semana`} className="inline-flex min-h-11 cursor-text items-center">
                      <input
                        id={`${id}-semana`}
                        aria-label="Semana"
                        title="El número de la semana (se puede cambiar)"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={form.semana}
                        aria-invalid={!!errSemana || undefined}
                        aria-describedby={errSemana ? `${id}-semana-error` : undefined}
                        onChange={(e) => cambiar("semana", e.target.value)}
                        style={{ width: `${Math.max(1, form.semana.length)}ch` }}
                        className={`box-content rounded-t-md border-b-2 border-dashed bg-transparent px-[0.12ch] pb-0.5 text-center font-bold leading-tight tabular-nums outline-none transition-colors hover:bg-muted focus:border-solid focus:bg-primary-50 ${
                          errSemana ? "border-danger text-danger-text" : "border-slate-300 text-texto focus:border-primary"
                        }`}
                      />
                    </label>
                  </>
                )}
              </h2>
              {mes && (
                <span className="whitespace-nowrap rounded-full bg-primary-50 px-[9px] py-[3px] text-[13px] font-medium text-primary-boton-hover sm:px-2.5 sm:py-1">
                  Mes {mes.mes}
                </span>
              )}
            </div>
            <CampoFecha
              id={`${id}-fecha`}
              valor={form.fecha}
              max={hoy}
              invalido={!!errFecha}
              onCambiar={(v) => cambiar("fecha", v)}
              className={`col-start-2 row-start-1 justify-self-start sm:row-span-2 sm:justify-self-end${conDia ? " sm:col-start-3" : ""}`}
            />
            {conDia ? (
              <div className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
                {/* Siempre a la vista, también con el teclado abierto y poco alto (el renglón del paciente, no). */}
                <ChipDia dia={diaSemana} className="sm:col-start-2 sm:row-span-2 sm:row-start-1" />
                {renglonPaciente}
              </div>
            ) : (
              renglonPaciente
            )}
            {(errSemana || errFecha) && (
              <p id={errSemana ? `${id}-semana-error` : undefined} role="alert" className={`col-span-2 text-[13px] font-semibold text-danger-text${conDia ? " sm:col-span-3" : ""}`}>
                {errSemana ?? errFecha}
              </p>
            )}
          </div>
        }
        franja={pasada && <FranjaSemanaPasada pasada={pasada} racha={racha} escalones={escalonesDeAntes} />}
        pie={<PieHoja onCancelar={pedirCerrar} onGuardar={() => void guardar()} guardando={guardando} etiqueta={esInicial ? "Guardar el inicial" : `Guardar la semana ${numero}`} />}
      >
        <div
          className="px-4 py-4 sm:px-6 sm:py-[18px]"
          onKeyDown={(e) => {
            // `Enter` en un campo de una línea pasa al siguiente.
            const el = e.target as HTMLElement;
            if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || el.tagName !== "INPUT") return;
            e.preventDefault();
            pasarAlSiguiente(e.currentTarget, el);
          }}
        >
          <div className="flex flex-col gap-4 sm:gap-3.5 lg:grid lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4 sm:gap-3.5">
              <BloquePeso
                id={id}
                form={form}
                errores={errores}
                intento={intento}
                cambiar={cambiar}
                etiqueta={deHoy ? "Peso de hoy" : "Peso"}
                semana={numero}
                antes={pesoAntes ? { pesoKg: pesoAntes.pesoKg!, semana: pesoAntes.semana } : null}
                inicial={primerPeso ? { pesoKg: primerPeso.pesoKg!, semana: primerPeso.semana } : null}
                evaluacion={pesoDeLaEvaluacion(ultimoControl, ultimoPeso, esInicial ? "inicio" : "semana", hoy, fechaHoja)}
                // Una semana nueva empieza por el peso; con el dedo, sin subir el teclado al abrir (Kevin, 26-nov).
                autoFocus={!registro && !focoPago && enfocaSolo()}
              />

              <BloqueDosis
                id={id}
                form={form}
                errores={errores}
                intento={intento}
                cambiar={cambiar}
                etiqueta={deHoy ? "Dosis de hoy" : "Dosis"}
                unidad={unidadDelCampo}
                mgPorMl={mgPorMl}
                uiPorMl={catalogo.uiPorMl}
                pasos={pasos}
                sinPresentacion={avisoVial}
                antes={dosisDeAntes}
                ofrecerSinDosis={!esInicial}
                guardadas={guardadas && sinTocarDosis ? guardadas : null}
                avisoUnidad={otraUnidad ? `Se anotó en ${otraUnidad}. Si la cambiás, se anota en ${unidad}.` : null}
                onTocar={() => setDosisDeFabrica(false)}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-4 sm:gap-3.5">
              <BloqueObservaciones id={id} form={form} cambiar={cambiar} etiqueta={esInicial ? "Observaciones" : "Observaciones de la semana"} />

              {!esInicial && (
                <BloqueProducto
                  id={id}
                  form={form}
                  errores={errores}
                  intento={intento}
                  cambiar={(c) => setForm((f) => ({ ...f, ...c }))}
                  vigente={vigente}
                  teniaMarca={!!registro?.producto}
                  soloMarca={soloMarca}
                  presentaciones={presentaciones}
                  primerPasoMg={pasosMg[0] ?? null}
                  uiPorMl={catalogo.uiPorMl}
                  onBorrarSemana={registro ? () => setBorrando(true) : undefined}
                  refNombre={refProducto}
                  sugerencias={catalogo.tratamientos.map((t) => t.nombre)}
                  onAgregarALaLista={catalogo.ajustes.puedeCambiarlos ? () => setEnLaLista(true) : undefined}
                />
              )}

              <BloquePagos
                id={id}
                form={form}
                errores={errores}
                intento={intento}
                cambiar={cambiar}
                tocaPago={tocaPago}
                titulo={tituloPago}
                referencias={referenciasPago}
                abiertaDeEntrada={tocaPago || (!!pendiente && catalogo.ajustes.avisarPagos) || conPagoAnotado || focoPago}
                refMedicamento={medicamento}
              />
            </div>
          </div>

          {(quien.length > 0 || (registro && !esInicial)) && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-borde-soft pt-3">
              <QuienYCuando partes={quien} />
              {registro && !esInicial && (
                <Boton variante="ghost" className="min-h-11 text-danger-text! lg:min-h-10" icono="trash" onClick={() => setBorrando(true)} disabled={guardando}>
                  Borrar semana
                </Boton>
              )}
            </div>
          )}

          {error && (
            <div ref={avisoError} className="mt-4 rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text" role="alert">
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
      </HojaGrande>
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
          // De vuelta de la pregunta: con el dedo, el pago a la vista y el teclado cerrado.
          setTimeout(() => enfocarOMostrar(medicamento.current), 0);
        }}
        onGuardar={() => void guardar(true)}
      />
      {enLaLista && (
        <DialogoTratamientos
          abrirEn="agregar"
          onCerrar={(productos) => {
            setEnLaLista(false);
            if (productos) onListaCambiada?.(productos);
            // De vuelta al «+ Agregar»: el botón nuevo queda a la vista, sin elegirse.
            // Es un botón (no sube el teclado): también con el dedo.
            setTimeout(() => document.getElementById(`${id}-producto-agregar`)?.focus(), 0);
          }}
        />
      )}
    </>
  );
}

const sinCerrar = () => {};

/**
 * «La semana pasada (4 · 17/11): 123,9 kg · 8 UI (2,4 mg) · lleva 4
 * aplicaciones con esa dosis». Si la pasada no se aplicó, la dice y nombra la
 * última dosis aplicada. La dosis, leída contra los escalones de su semana:
 * «8 UI (2,5 mg)», no «(2,4 mg)» (§7.4).
 */
function FranjaSemanaPasada({ pasada, racha, escalones }: { pasada: Registro; racha: ReturnType<typeof rachaAntes>; escalones: EscalonesDeLaSemana | null }) {
  const partes: string[] = [];
  if (pasada.pesoKg != null) partes.push(`${fmtNumero(pasada.pesoKg, 2)} kg`);
  const enEsa = racha && racha.semana === pasada.semana;
  if (pasada.sinDosis) partes.push(`no se aplicó${pasada.motivoSinDosis ? ` (${pasada.motivoSinDosis})` : ""}`);
  else if (enEsa) partes.push(dosisYSusMg(racha.dosis, escalones));
  if (racha) {
    const veces = `${racha.aplicaciones} ${racha.aplicaciones === 1 ? "aplicación" : "aplicaciones"}`;
    partes.push(enEsa ? `lleva ${veces} con esa dosis` : `la última dosis: ${dosisYSusMg(racha.dosis, escalones)}, ${veces}`);
  }
  return (
    <div className="flex shrink-0 flex-wrap gap-x-2 gap-y-0.5 border-b border-borde bg-primary-50/60 px-4 py-2.5 text-sm leading-[1.45] text-texto-2 sm:px-6 sm:py-3 lg:py-2.5">
      <span className="font-bold text-texto">
        {pasada.semana === 0 ? "El inicial" : "La semana pasada"}
        <span className="max-sm:hidden">
          {" "}
          ({pasada.semana === 0 ? "" : `${pasada.semana} · `}
          {diaYMes(pasada.fecha)})
        </span>
        :
      </span>
      {partes.length ? (
        partes.map((p, i) => (
          // El espacio entre uno y otro, para el lector de pantalla (en el flex no ocupa lugar).
          <Fragment key={i}>
            {" "}
            <span className="whitespace-nowrap">
              {p}
              {i < partes.length - 1 ? " ·" : ""}
            </span>
          </Fragment>
        ))
      ) : (
        <span>sin peso ni dosis anotados</span>
      )}
    </div>
  );
}

/**
 * La fecha de la semana como un botón («📅 24/11/2026»; en el teléfono, «·
 * 24/11/2026» al lado del título). Es un campo de fecha transparente encima:
 * tocarlo abre el calendario del equipo.
 */
function CampoFecha({
  id,
  valor,
  max,
  invalido,
  onCambiar,
  className = "",
}: {
  id: string;
  valor: string;
  max: string;
  invalido: boolean;
  onCambiar: (v: string) => void;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`relative inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl text-sm text-texto-2 focus-within:ring-2 focus-within:ring-primary-200 sm:h-12 sm:rounded-[14px] sm:border sm:bg-white sm:px-4 sm:text-base sm:font-medium sm:text-texto lg:h-11 lg:rounded-xl lg:px-3.5 lg:text-[15px] ${
        invalido ? "text-danger-text sm:border-danger" : "sm:border-borde"
      } ${className}`}
    >
      <span aria-hidden="true" className="sm:hidden">
        ·
      </span>
      <Icon name="calendar" size={20} className="shrink-0 text-texto-2 max-sm:hidden" />
      <span className="tabular-nums">{valor ? fechaLarga(valor) : "Elegí la fecha"}</span>
      <input
        id={id}
        type="date"
        aria-label="Fecha"
        value={valor}
        max={max}
        aria-invalid={invalido || undefined}
        onChange={(e) => onCambiar(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Sin `showPicker` (o fuera de un gesto): el campo se escribe con el teclado.
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}
