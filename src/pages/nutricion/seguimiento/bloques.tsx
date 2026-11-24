import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "../../../components/Icon";
import { Boton, Modal } from "../../../components/ui";
import { fmtNumero, textoAlSalir, valorDe } from "../../../lib/nutricion/calculo";
import {
  type PesoDeLaEvaluacion,
  concentracion,
  equivalenciasDe,
  fmtDosis,
  fmtDosisCalculada,
  igualQueLaAnterior,
  numeroDeDosis,
  paraEscribir,
  partesEquivalencias,
  partesPaso,
  pasoSiguiente,
  resultadoDelPeso,
  textoJeringa,
  textoMgPorUi,
  textoProducto,
  valorDelPaso,
  dosisConMg,
  type TonoKg,
} from "../../../lib/nutricion/seguimiento/formato";
import { valorLimitado, vialDe, type ErroresSemana, type FormSemana } from "../../../lib/nutricion/seguimiento/formulario";
import type { DosisAnotada, Paso, Producto, UnidadDosis } from "../../../lib/nutricion/seguimiento/tipos";
import { CampoNumero, CampoTexto } from "../piezas";
import { BotonToque, Equivalentes } from "./piezas";

/**
 * Los bloques de la hoja «Semana N» según la maqueta A del 23-nov («Todo a la
 * vista»), que comparte «Iniciar tratamiento» para el registro inicial: Peso
 * de hoy, Dosis de hoy, Observaciones y Pago. Los campos de carga arrancan
 * vacíos (lo de antes va en gris al lado); la excepción es la dosis de una
 * semana nueva, que viene con «Igual que la anterior» marcada (Kevin, 23-nov).
 * Blancos de toque de 44 px o más; los números, con el teclado numérico.
 */

type Cambiar = <K extends keyof FormSemana>(campo: K, valor: FormSemana[K]) => void;

/** El rótulo chico en mayúsculas de cada bloque («PESO DE HOY»). */
export const ROTULO = "text-xs font-bold uppercase tracking-[0.06em] text-texto-2";

/** El borde de los bloques en la tablet y la PC (en el teléfono van sueltos, como la maqueta). */
const CAJA = "sm:rounded-2xl sm:border sm:border-borde";

/** El color del resultado del peso: bajó (la marca), subió (alerta), igual (gris). */
const TONO_PESO: Record<TonoKg, string> = {
  bajo: "bg-primary-50 text-primary-boton-hover",
  subio: "bg-danger-bg text-danger-text",
  igual: "bg-slate-100 text-texto-2",
};

export function BloquePeso({
  id,
  form,
  errores,
  intento,
  cambiar,
  etiqueta,
  semana,
  antes,
  inicial,
  evaluacion,
  autoFocus = false,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: Cambiar;
  /** «Peso de hoy» (o «Peso», si la semana no es de hoy). */
  etiqueta: string;
  /** El número de la semana que se carga (para «desde la semana pasada»). */
  semana: number;
  /** El último peso cargado antes de esta semana. */
  antes: { pesoKg: number; semana: number } | null;
  /** El primer peso del tratamiento, para «desde el inicio». */
  inicial: { pesoKg: number; semana: number } | null;
  evaluacion: PesoDeLaEvaluacion | null;
  autoFocus?: boolean;
}) {
  const err = intento || form.pesoKg ? errores.pesoKg : null;
  const peso = err ? null : valorDe("pesoKg", form.pesoKg);
  const r = resultadoDelPeso(peso, antes, inicial, semana);
  return (
    <section className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5 sm:px-5 sm:py-[18px] lg:gap-[18px] lg:px-[18px] lg:py-4 ${CAJA}`}>
      <div className="flex flex-col gap-2 sm:w-[290px] sm:shrink-0 lg:w-[230px]">
        <label htmlFor={`${id}-peso`} className={ROTULO}>
          {etiqueta}
        </label>
        <div
          className={`flex h-16 items-center gap-2 rounded-2xl border-2 bg-white px-4 transition-shadow focus-within:ring-4 focus-within:ring-primary-100 sm:h-[72px] sm:px-[18px] lg:h-16 lg:px-4 ${
            err ? "border-danger" : "border-primary-boton"
          }`}
        >
          <input
            id={`${id}-peso`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            value={form.pesoKg}
            autoFocus={autoFocus}
            aria-invalid={!!err || undefined}
            aria-describedby={err ? `${id}-peso-error` : undefined}
            onChange={(e) => cambiar("pesoKg", e.target.value)}
            onBlur={() => {
              const t = textoAlSalir("pesoKg", form.pesoKg);
              if (t !== form.pesoKg) cambiar("pesoKg", t);
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-[30px] font-bold tabular-nums text-texto outline-none placeholder:text-texto-4 sm:text-[34px] lg:text-[30px]"
          />
          <span aria-hidden="true" className="text-[17px] text-texto-2 sm:text-lg lg:text-[17px]">
            kg
          </span>
        </div>
        {err && (
          <p id={`${id}-peso-error`} className="text-[13px] text-danger-text">
            {err}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-1 lg:gap-1.5" aria-live="polite">
        {r?.semana ? (
          <div
            className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl px-3 py-[9px] sm:self-start sm:px-3.5 sm:py-2.5 lg:flex-col lg:gap-0.5 lg:px-3 lg:py-[9px] ${TONO_PESO[r.semana.tono]}`}
          >
            <span className="whitespace-nowrap text-lg font-bold sm:text-xl lg:text-[19px]">{r.semana.texto}</span>{" "}
            <span className="text-sm lg:text-[13px]">{r.semana.desde}</span>
          </div>
        ) : (
          antes && (
            <p className="text-sm text-texto-3">
              Anterior: <span className="font-semibold tabular-nums text-texto-2">{fmtNumero(antes.pesoKg, 2)}&nbsp;kg</span>
            </p>
          )
        )}
        {r?.total ? (
          <p className="text-sm text-texto-2">{r.total}</p>
        ) : (
          !r &&
          inicial &&
          inicial.semana !== antes?.semana && (
            <p className="text-sm text-texto-3">
              Al inicio: <span className="tabular-nums">{fmtNumero(inicial.pesoKg, 2)}&nbsp;kg</span>
            </p>
          )
        )}
        {evaluacion && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-texto-2">
            <span>{evaluacion.texto} ·</span>
            <button
              type="button"
              onClick={() => cambiar("pesoKg", fmtNumero(evaluacion.pesoKg, 2))}
              className="-mx-1 inline-flex min-h-11 items-center rounded-lg px-1 font-semibold text-primary-700 underline-offset-2 hover:underline"
            >
              Usar ese
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

/** Los motivos de un toque de «No se aplicó» (Kevin, 23-nov). */
const MOTIVOS = ["Salud", "Viaje", "No vino"];

/** El color de un botón de dosis: elegido (verde, borde doble) o no. */
const colorDosis = (elegido: boolean) =>
  `transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
    elegido ? "border-2 border-primary-boton bg-primary-50 text-primary-boton-activo" : "border border-slate-300 bg-white text-texto hover:border-primary-200 hover:bg-primary-50/40"
  }`;
/** Un escalón (o «Otra»): dos renglones centrados. */
const ESCALON = "flex flex-col items-center justify-center gap-0.5 rounded-[14px] lg:rounded-xl";
/** «Igual que la anterior» y «Subir un escalón»: el texto a la izquierda y el tilde a la derecha. */
const GRANDE = "flex h-[62px] items-center justify-between gap-2 rounded-2xl px-4 text-left sm:h-[72px] sm:px-[18px] lg:h-16 lg:px-4";

export function BloqueDosis({
  id,
  form,
  errores,
  intento,
  cambiar,
  etiqueta,
  unidad,
  mgPorMl,
  uiPorMl,
  pasos,
  sinPresentacion,
  antes,
  ofrecerSinDosis,
  avisoUnidad,
  guardadas,
  onTocar,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: Cambiar;
  /** «Dosis de hoy» (o «Dosis»). */
  etiqueta: string;
  /** La del tratamiento ("" al iniciar, mientras no se elige). */
  unidad: UnidadDosis | "";
  mgPorMl: number | null;
  uiPorMl: number;
  pasos: Paso[];
  /**
   * Los escalones no se pueden pasar a UI ni a ml sin el vial: se esconden y
   * va este aviso (con el enlace a «Editar tratamiento», si se puede).
   */
  sinPresentacion: ReactNode | null;
  /** La dosis de antes (la última aplicada): «Igual que la anterior» y «Subir un escalón». */
  antes: DosisAnotada | null;
  /** «No se aplicó esta semana» (no en el inicial). */
  ofrecerSinDosis: boolean;
  /** La semana se anotó en otra unidad: lo que pasa si se cambia el número. */
  avisoUnidad?: string | null;
  /** Las equivalencias con que se guardó (la dosis sin tocar, anotada con otra concentración). */
  guardadas?: string[] | null;
  /** Se tocó algo de la dosis (deja de seguir a «Igual que la anterior» de fábrica). */
  onTocar?: () => void;
}) {
  const err = !form.sinDosis && (intento || form.dosis) ? errores.dosis : null;
  const n = err ? null : valorLimitado("dosis", form.dosis);
  const apagada = form.sinDosis;
  const igual = unidad && antes ? igualQueLaAnterior(antes, unidad, mgPorMl, uiPorMl) : null;
  const subir = unidad && !sinPresentacion ? pasoSiguiente(pasos, antes, unidad) : null;
  const visibles = unidad && !sinPresentacion ? pasos.filter((p) => valorDelPaso(p, unidad) != null) : [];
  // Lo que escribió a mano en «Otra»: mientras escribe, «Otra» es la elegida
  // aunque el número coincida con un botón (si no, el campo se vaciaba al
  // llegar a «17»).
  const [aMano, setAMano] = useState(false);
  const motivo = useRef<HTMLInputElement>(null);

  const mismo = (escribe: string) => !aMano && n != null && valorLimitado("dosis", escribe) === n;
  const escribir = (texto: string) => {
    setAMano(false);
    onTocar?.();
    cambiar("dosis", texto);
  };
  const delPaso = (p: Paso) => (unidad ? paraEscribir(valorDelPaso(p, unidad)!, unidad) : "");
  const coincide = (igual && mismo(igual.escribe)) || visibles.some((p) => mismo(delPaso(p)));
  const enOtra = !!form.dosis.trim() && (aMano || !coincide);
  const equivalencias =
    guardadas ?? (enOtra && n != null && unidad ? partesEquivalencias(equivalenciasDe(n, unidad, mgPorMl, uiPorMl), unidad) : []);

  // «8 UI · 2,5 mg»: si escribe lo mismo que un escalón, lo del escalón (§7.4:
  // 8 rayitas SON los 2,5 mg, aunque el vial diga 2,4); si no, lo anotado tal
  // cual y, pasado a otro vial, la cuenta con «≈».
  const pasoIgual = igual ? visibles.find((p) => delPaso(p) === igual.escribe) : undefined;
  const textoIgual =
    pasoIgual && unidad
      ? Object.values(partesPaso(pasoIgual, unidad)).filter(Boolean).join(" · ")
      : igual && antes && unidad
      ? igual.calculada
        ? [fmtDosisCalculada(igual.valor, unidad), unidad !== "mg" && antes.dosisMg != null ? `${numeroDeDosis(antes.dosisMg, "mg").texto} mg` : null]
            .filter(Boolean)
            .join(" · ")
        : dosisConMg(antes)
      : null;
  const textoSubirPaso = subir && unidad ? Object.values(partesPaso(subir, unidad)).filter(Boolean).join(" · ") : null;

  // El teléfono: 4 por fila y «Otra» ocupa lo que sobra del último renglón (dos lugares, si son 6).
  const restoTel = visibles.length % 4;
  const spanOtraTel = restoTel === 0 ? 4 : 4 - restoTel;
  const columnas = Math.min(7, visibles.length + 1);

  const campoOtra = (ancho: boolean) => (
    <label
      className={`${colorDosis(enOtra)} ${
        ancho
          ? "flex h-[54px] max-w-xs items-center justify-center gap-2 rounded-[14px] px-4 sm:h-[60px]"
          : `${ESCALON} h-[54px] max-sm:flex-row max-sm:gap-2 max-sm:[grid-column:var(--span-otra)] sm:h-[60px] lg:h-[52px]`
      } ${enOtra ? "" : "border-dashed border-slate-400"} ${apagada ? "opacity-45" : ""} cursor-text text-[13px] text-texto-2 lg:text-xs`}
      style={!ancho ? { ["--span-otra" as string]: `span ${spanOtraTel} / span ${spanOtraTel}` } : undefined}
    >
      <span>Otra</span>
      <input
        id={`${id}-dosis`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        aria-label={`Otra dosis${unidad ? ` en ${unidad}` : ""}`}
        placeholder={unidad || ""}
        disabled={apagada || !unidad}
        value={enOtra ? form.dosis : ""}
        aria-invalid={!!err || undefined}
        onChange={(e) => {
          setAMano(true);
          onTocar?.();
          cambiar("dosis", e.target.value);
        }}
        className="w-[60px] min-w-0 bg-transparent text-center text-[17px] font-bold tabular-nums text-texto outline-none placeholder:font-normal placeholder:text-texto-4 lg:w-12 lg:text-[15px]"
      />
    </label>
  );

  return (
    <section className={`flex flex-col gap-2.5 sm:gap-3 sm:px-5 sm:pb-[18px] sm:pt-3.5 lg:px-[18px] lg:pb-4 lg:pt-3 ${CAJA}`}>
      <div className="max-sm:contents sm:flex sm:items-center sm:justify-between sm:gap-3">
        <span className={ROTULO}>{etiqueta}</span>
        {ofrecerSinDosis && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] text-texto max-sm:order-5">
            <input
              type="checkbox"
              checked={form.sinDosis}
              onChange={(e) => {
                onTocar?.();
                cambiar("sinDosis", e.target.checked);
                if (e.target.checked) setTimeout(() => motivo.current?.focus(), 0);
              }}
              className="h-[22px] w-[22px] shrink-0 cursor-pointer accent-[var(--color-warning-text)] lg:h-5 lg:w-5"
            />
            No se aplicó esta semana
          </label>
        )}
      </div>

      {ofrecerSinDosis && form.sinDosis && (
        <div className="order-6 space-y-2 rounded-xl bg-warning-suave px-3 py-3 sm:order-1 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-motivo`} className="text-sm font-semibold text-warning-text">
              Motivo
            </label>
            <CampoTexto
              ref={motivo}
              id={`${id}-motivo`}
              value={form.motivoSinDosis}
              maxLength={200}
              autoComplete="off"
              enterKeyHint="next"
              onChange={(e) => cambiar("motivoSinDosis", e.target.value)}
              className="min-h-11 min-w-0 flex-1 text-base sm:max-w-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS.map((m) => (
              <BotonToque key={m} onClick={() => cambiar("motivoSinDosis", m)} className="min-h-11 text-sm">
                {m}
              </BotonToque>
            ))}
          </div>
        </div>
      )}

      {!unidad ? (
        <p className="order-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-texto-3">Elegí primero en qué anotás la dosis.</p>
      ) : (
        <>
          {(igual || subir) && (
            <div className="order-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
              {igual && textoIgual && (
                <button
                  type="button"
                  aria-pressed={mismo(igual.escribe)}
                  disabled={apagada}
                  onClick={() => escribir(igual.escribe)}
                  className={`${colorDosis(mismo(igual.escribe))} ${GRANDE}`}
                >
                  <span className="flex min-w-0 flex-col items-start gap-[3px]">
                    <span className={`text-[13px] sm:text-sm lg:text-[13px] ${mismo(igual.escribe) ? "" : "text-texto-2"}`}>Igual que la anterior</span>
                    <span className="whitespace-nowrap text-lg font-bold tabular-nums sm:text-xl lg:text-lg">{textoIgual}</span>
                  </span>
                  {mismo(igual.escribe) && <Icon name="check" size={24} strokeWidth={3} className="shrink-0 text-primary-boton" />}
                </button>
              )}
              {subir && textoSubirPaso && (
                <button
                  type="button"
                  aria-pressed={mismo(delPaso(subir))}
                  disabled={apagada}
                  onClick={() => escribir(delPaso(subir))}
                  className={`${colorDosis(mismo(delPaso(subir)))} ${GRANDE}`}
                >
                  <span className="flex min-w-0 flex-col items-start gap-[3px]">
                    <span className={`flex items-center gap-1 text-[13px] sm:text-sm lg:text-[13px] ${mismo(delPaso(subir)) ? "" : "text-texto-2"}`}>
                      <Icon name="arrowUp" size={14} />
                      Subir un escalón
                    </span>
                    <span className="whitespace-nowrap text-lg font-bold tabular-nums sm:text-xl lg:text-lg">{textoSubirPaso}</span>
                  </span>
                  {mismo(delPaso(subir)) && <Icon name="check" size={24} strokeWidth={3} className="shrink-0 text-primary-boton" />}
                </button>
              )}
            </div>
          )}

          {sinPresentacion ? (
            <>
              <p className="order-3 flex items-start gap-1.5 rounded-xl bg-info-bg px-3 py-2.5 text-[13px] text-info-text">
                <Icon name="info" size={15} className="mt-px shrink-0" />
                <span>{sinPresentacion}</span>
              </p>
              <div className="order-3">{campoOtra(true)}</div>
            </>
          ) : visibles.length > 0 ? (
            <div
              role="group"
              aria-label="Escalones de la dosis"
              className="order-3 grid grid-cols-4 gap-2 sm:[grid-template-columns:var(--cols)]"
              style={{ ["--cols" as string]: `repeat(${columnas}, minmax(0, 1fr))` }}
            >
              {visibles.map((p) => {
                const escribe = delPaso(p);
                const elegido = mismo(escribe);
                const { principal, secundario } = partesPaso(p, unidad);
                return (
                  <button
                    key={p.mg}
                    type="button"
                    aria-pressed={elegido}
                    aria-label={[principal, secundario].filter(Boolean).join(" · ")}
                    disabled={apagada}
                    onClick={() => escribir(escribe)}
                    className={`${colorDosis(elegido)} ${ESCALON} h-[54px] px-1 sm:h-[60px] lg:h-[52px]`}
                  >
                    <span className="whitespace-nowrap text-base font-bold tabular-nums sm:text-[17px] lg:text-[15px]">{principal}</span>
                    {secundario && <span className="whitespace-nowrap text-[13px] tabular-nums lg:text-xs">{secundario}</span>}
                  </button>
                );
              })}
              {campoOtra(false)}
            </div>
          ) : (
            <div className="order-3">{campoOtra(true)}</div>
          )}

          {(err || equivalencias.length > 0 || avisoUnidad) && !form.sinDosis && (
            <div className="order-4 space-y-0.5 text-[13px]">
              {err ? (
                <p id={`${id}-dosis-error`} className="text-danger-text">
                  {err}
                </p>
              ) : (
                equivalencias.length > 0 && <Equivalentes partes={equivalencias} className="block" />
              )}
              {avisoUnidad && <p className="text-texto-3">{avisoUnidad}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function BloqueObservaciones({
  id,
  form,
  cambiar,
  etiqueta = "Observaciones de la semana",
}: {
  id: string;
  form: FormSemana;
  cambiar: Cambiar;
  etiqueta?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-observaciones`} className={ROTULO}>
        {etiqueta}
      </label>
      <textarea
        id={`${id}-observaciones`}
        rows={3}
        maxLength={2000}
        value={form.observaciones}
        placeholder="Lo que quieras dejar anotado: cómo se sintió, por qué se saltó una dosis…"
        onChange={(e) => cambiar("observaciones", e.target.value)}
        className="min-h-[72px] w-full resize-y rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-base leading-relaxed text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 sm:min-h-[76px] sm:px-4 lg:min-h-[104px] lg:px-3.5 lg:text-[15px]"
      />
    </div>
  );
}

/**
 * «Vial de [ ] mg en [ ] ml» (opcional, los dos o ninguno), con los botones de
 * las presentaciones del catálogo y, al completarlo, la cuenta en gris («1 UI =
 * 0,3 mg · 2,5 mg ≈ 8 UI (jeringa…)»). Lo usan «Iniciar tratamiento» y el
 * cambio de producto de una semana.
 */
export function SelectorVial({
  id,
  titulo,
  vialMg,
  vialMl,
  onCambiar,
  presentaciones,
  primerPasoMg,
  uiPorMl,
  error,
  invalidoMg,
  invalidoMl,
}: {
  id: string;
  titulo: string;
  vialMg: string;
  vialMl: string;
  onCambiar: (mg: string, ml: string) => void;
  presentaciones: { mg: number; ml: number }[];
  primerPasoMg: number | null;
  uiPorMl: number;
  error: string | null | undefined;
  invalidoMg: boolean;
  invalidoMl: boolean;
}) {
  const v = vialDe({ vialMg, vialMl });
  const conc = v ? concentracion(v.mg, v.ml, uiPorMl) : null;
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-texto-2">
        {titulo} <span className="font-normal text-texto-4">(opcional)</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm text-texto-2">
        <span>Vial de</span>
        <div className="w-28">
          <CampoNumero
            id={`${id}-vialMg`}
            aria-label="Miligramos del vial"
            value={vialMg}
            unidad="mg"
            invalido={invalidoMg}
            onChange={(x) => onCambiar(x, vialMl)}
            className="min-h-12 text-base"
          />
        </div>
        <span>en</span>
        <div className="w-28">
          <CampoNumero
            id={`${id}-vialMl`}
            aria-label="Mililitros del vial"
            value={vialMl}
            unidad="ml"
            invalido={invalidoMl}
            onChange={(x) => onCambiar(vialMg, x)}
            className="min-h-12 text-base"
          />
        </div>
      </div>
      {error && <p className="text-xs text-danger-text">{error}</p>}
      {presentaciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presentaciones.map((p) => (
            <BotonToque key={`${p.mg}-${p.ml}`} onClick={() => onCambiar(fmtNumero(p.mg, 2), fmtNumero(p.ml, 2))}>
              {fmtNumero(p.mg, 2)}&nbsp;mg en {fmtNumero(p.ml, 2)}&nbsp;ml
            </BotonToque>
          ))}
        </div>
      )}
      <p className="text-[12px] text-texto-3">
        {conc ? (
          <span className="font-semibold text-texto-2">
            {textoMgPorUi(conc.mgPorUi)}
            {primerPasoMg != null && (
              <>
                {" "}
                · {fmtDosis(primerPasoMg, "mg")} ≈&nbsp;{numeroDeDosis(primerPasoMg / conc.mgPorUi, "UI").texto}&nbsp;UI
              </>
            )}{" "}
            <span className="whitespace-nowrap font-normal text-texto-3">({textoJeringa(uiPorMl)})</span>
          </span>
        ) : (
          "Sirve para pasar la dosis de mg a UI y a ml."
        )}
      </p>
    </div>
  );
}

/** Los campos del producto en el formulario de la semana. */
type CamposProducto = Pick<FormSemana, "cambioProducto" | "productoNombre" | "productoVialMg" | "productoVialMl">;

/**
 * «Cambió de producto desde esta semana» (§7.1 y §7.2), en vez del botón que
 * escribía «Cambio de laboratorio: » en las observaciones. Cerrado dice lo que
 * usa hoy; abierto pide el producto nuevo (vacío) y su vial (el mismo selector
 * de «Iniciar tratamiento»). Con otro vial, la dosis de ESTA hoja se cuenta con
 * el vial nuevo (lo hace la hoja). En una semana que ya tenía la marca, «Quitar
 * el cambio»; si la semana no tiene nada más, quitarla la dejaría vacía (el
 * servidor no deja): se ofrece borrar la semana.
 */
export function BloqueProducto({
  id,
  form,
  errores,
  intento,
  cambiar,
  vigente,
  teniaMarca,
  soloMarca,
  presentaciones,
  primerPasoMg,
  uiPorMl,
  onBorrarSemana,
  refNombre,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: (cambios: Partial<CamposProducto>) => void;
  /** El producto que se usaba antes de esta semana (sin contar su marca). */
  vigente: Producto;
  /** La semana ya tenía la marca guardada. */
  teniaMarca: boolean;
  /** La semana guardada no tiene nada más que la marca. */
  soloMarca: boolean;
  presentaciones: { mg: number; ml: number }[];
  primerPasoMg: number | null;
  uiPorMl: number;
  onBorrarSemana?: () => void;
  refNombre?: RefObject<HTMLInputElement | null>;
}) {
  const propio = useRef<HTMLInputElement>(null);
  const nombre = refNombre ?? propio;
  const titulo = "Cambió de producto desde esta semana";

  if (!form.cambioProducto) {
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          aria-expanded={false}
          onClick={() => {
            cambiar({ cambioProducto: true });
            setTimeout(() => nombre.current?.focus(), 0);
          }}
          className="flex h-[52px] items-center justify-between gap-3 rounded-2xl border border-borde bg-white px-4 text-left text-[15px] font-medium text-texto transition-colors hover:bg-muted sm:h-14 sm:px-[18px] sm:text-base lg:h-12 lg:rounded-[14px] lg:px-4 lg:text-[15px]"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Icon name="plus" size={20} strokeWidth={2.4} className="shrink-0 text-primary-boton" />
            {titulo}
          </span>
          <span className="min-w-0 truncate text-sm font-normal text-texto-2 max-sm:hidden lg:hidden">Hoy usa: {textoProducto(vigente)}</span>
        </button>
        {teniaMarca && (
          <p className="px-1 text-[13px] text-warning-text">
            Al guardar se quita el cambio a {form.productoNombre.trim() || "otro producto"}: desde esta semana vuelve a contar {vigente.nombre}.
          </p>
        )}
      </div>
    );
  }

  const errNombre = intento || form.productoNombre ? errores.productoNombre : null;
  const errMg = intento || form.productoVialMg ? errores.productoVialMg : null;
  const errMl = intento || form.productoVialMl ? errores.productoVialMl : null;
  const errVial = intento ? errores.productoVial : null;
  return (
    <section aria-label={titulo} className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50/40 p-3.5 sm:px-[18px] sm:py-4 lg:p-3.5">
      {teniaMarca ? (
        <h3 className="flex min-h-11 items-center gap-2.5 text-[15px] font-semibold text-texto sm:text-base lg:text-[15px]">
          <Icon name="swap" size={19} className="shrink-0 text-primary-boton" />
          {titulo}
        </h3>
      ) : (
        <button
          type="button"
          aria-expanded
          title="Tocá para cerrar: no cambió de producto"
          onClick={() => cambiar({ cambioProducto: false, productoNombre: "", productoVialMg: "", productoVialMl: "" })}
          className="-mx-1 flex min-h-11 items-center justify-between gap-2.5 rounded-xl px-1 text-left text-[15px] font-semibold text-texto hover:bg-white/70 sm:text-base lg:text-[15px]"
        >
          <span className="flex items-center gap-2.5">
            <Icon name="swap" size={19} className="shrink-0 text-primary-boton" />
            {titulo}
          </span>
          <Icon name="chevronDown" size={18} className="shrink-0 rotate-180 text-texto-3" />
        </button>
      )}
      <p className="-mt-1 text-sm text-texto-2">
        Antes usaba: <span className="font-semibold text-texto">{textoProducto(vigente)}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-producto`} className="text-[13px] font-semibold text-texto-2">
          Producto nuevo
        </label>
        <CampoTexto
          ref={nombre}
          id={`${id}-producto`}
          value={form.productoNombre}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="next"
          invalido={!!errNombre}
          onChange={(e) => cambiar({ productoNombre: e.target.value })}
          className="min-h-12 text-base"
        />
        {errNombre && <p className="text-xs text-danger-text">{errNombre}</p>}
      </div>
      <SelectorVial
        id={`${id}-producto`}
        titulo="Presentación del vial"
        vialMg={form.productoVialMg}
        vialMl={form.productoVialMl}
        onCambiar={(mg, ml) => cambiar({ productoVialMg: mg, productoVialMl: ml })}
        presentaciones={presentaciones}
        primerPasoMg={primerPasoMg}
        uiPorMl={uiPorMl}
        error={errMg ?? errMl ?? errVial}
        invalidoMg={!!(errMg || errVial)}
        invalidoMl={!!(errMl || errVial)}
      />
      {teniaMarca &&
        (soloMarca ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-texto-2">
            <span className="min-w-0 flex-1">Esta semana sólo tiene el cambio de producto: para quitarlo, borrá la semana.</span>
            {onBorrarSemana && (
              <Boton variante="ghost" icono="trash" className="min-h-11 text-danger-text! lg:min-h-10" onClick={onBorrarSemana}>
                Borrar semana
              </Boton>
            )}
          </p>
        ) : (
          <div>
            <Boton variante="ghost" className="min-h-11 text-danger-text! lg:min-h-10" onClick={() => cambiar({ cambioProducto: false })}>
              Quitar el cambio
            </Boton>
          </div>
        ))}
    </section>
  );
}

/** Un campo de plata del pago: «Bs» adelante, el número grande. */
function CampoPlata({
  id,
  label,
  corto,
  value,
  error,
  onChange,
  onBlur,
  refInput,
}: {
  id: string;
  label: string;
  /** El rótulo corto del teléfono y la PC («Control»). */
  corto?: string;
  value: string;
  error: string | null | undefined;
  onChange: (v: string) => void;
  onBlur: () => void;
  refInput?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-amber-900 sm:text-sm lg:text-[13px]">
        {corto ? (
          <>
            <span className="sm:hidden lg:inline">{corto}</span>
            <span className="max-sm:hidden lg:hidden">{label}</span>
            <span className="sr-only"> (Bs)</span>
          </>
        ) : (
          <>
            {label}
            <span className="sr-only"> (Bs)</span>
          </>
        )}
      </label>
      <span
        className={`flex h-[50px] items-center gap-1 rounded-[14px] border bg-white px-2.5 focus-within:ring-2 focus-within:ring-amber-200 sm:h-[52px] sm:gap-1.5 sm:px-3.5 lg:h-[46px] lg:rounded-xl lg:px-2.5 ${
          error ? "border-danger" : "border-[#d6a23a]"
        }`}
      >
        <span aria-hidden="true" className="text-sm text-texto-2 sm:text-[15px] lg:text-sm">
          Bs
        </span>
        <input
          ref={refInput}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          value={value}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="h-full min-w-0 flex-1 bg-transparent text-lg font-bold tabular-nums text-texto outline-none sm:text-xl lg:text-[17px]"
        />
      </span>
      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}

export function BloquePagos({
  id,
  form,
  errores,
  intento,
  cambiar,
  tocaPago,
  titulo,
  anterior,
  abiertaDeEntrada,
  refMedicamento,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: Cambiar;
  /** La semana de pago (o el inicial) de un mes sin pago todavía: va el cartel «Hoy toca el pago del mes». */
  tocaPago: boolean;
  /** «Hoy toca el pago del mes 2», «Falta el pago de la semana 5…», «Pago de esta semana». */
  titulo: string;
  /** «El anterior: Bs 600 el 20/10 (450 + 150)». */
  anterior: string | null;
  /** Abierta al entrar: toca pagar, hay un pago pendiente o la semana ya tiene un pago. */
  abiertaDeEntrada: boolean;
  refMedicamento?: RefObject<HTMLInputElement | null>;
}) {
  const [abierta, setAbierta] = useState(abiertaDeEntrada);
  const propio = useRef<HTMLInputElement>(null);
  const medicamento = refMedicamento ?? propio;
  const plata = (campo: "pagoMedicamento" | "pagoControl" | "pagoOtro", label: string, corto?: string) => {
    const err = intento || form[campo] ? errores[campo] : null;
    return (
      <CampoPlata
        id={`${id}-${campo}`}
        label={label}
        corto={corto}
        value={form[campo]}
        error={err}
        refInput={campo === "pagoMedicamento" ? medicamento : undefined}
        onChange={(v) => cambiar(campo, v)}
        onBlur={() => {
          const n = valorLimitado("pago", form[campo]);
          if (n != null) {
            const t = fmtNumero(n, 2);
            if (t !== form[campo]) cambiar(campo, t);
          }
        }}
      />
    );
  };

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => {
          setAbierta(true);
          setTimeout(() => medicamento.current?.focus(), 0);
        }}
        className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-borde bg-white px-4 py-2 text-left text-[15px] font-medium text-texto transition-colors hover:bg-muted sm:min-h-14 sm:px-[18px] sm:text-base lg:min-h-12 lg:rounded-[14px] lg:px-4 lg:text-[15px]"
      >
        <Icon name="plus" size={20} strokeWidth={2.4} className="shrink-0 text-primary-boton" />
        {/* En la columna angosta de la PC, «El anterior…» baja entero (se cortaba con «…» y partía «Anotar un / pago»). */}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="whitespace-nowrap">Anotar un pago</span>
          {anterior && <span className="text-sm font-normal text-texto-3 max-sm:hidden">{anterior}</span>}
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Pagos"
      className="flex flex-col gap-2.5 rounded-2xl border border-warning bg-warning-bg p-3.5 sm:gap-3 sm:px-[18px] sm:pb-4 sm:pt-3.5 lg:gap-2.5 lg:p-3.5"
    >
      <div className="flex flex-col gap-0.5 text-amber-900 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-3 lg:flex-col lg:items-start">
        <span className="flex items-center gap-1.5 text-base font-bold" role={tocaPago ? "status" : undefined}>
          {tocaPago && <Icon name="coins" size={17} className="shrink-0" />}
          {titulo}
        </span>
        {anterior && <span className="text-[13px] sm:text-sm lg:text-[13px]">{anterior}</span>}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-2">
        {plata("pagoMedicamento", "Medicamento")}
        {plata("pagoControl", "Control mensual", "Control")}
        {plata("pagoOtro", "Otro")}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <label htmlFor={`${id}-pagoNota`} className="text-[13px] font-medium text-amber-900">
          Nota del pago
        </label>
        <input
          id={`${id}-pagoNota`}
          type="text"
          value={form.pagoNota}
          maxLength={200}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => cambiar("pagoNota", e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-[12px] border border-[#d6a23a] bg-white px-3 text-base text-texto outline-none focus:ring-2 focus:ring-amber-200"
        />
      </div>
      <p className="text-[12px] text-amber-900/80">Sólo queda anotado en la hoja: no entra a la caja.</p>
    </section>
  );
}

/**
 * La pregunta de cuando se guarda la semana de pago sin anotar el pago: no
 * bloquea; el paciente queda en «Falta pagar».
 */
export function PreguntaSinPago({ abierta, onAnotar, onGuardar, procesando }: { abierta: boolean; onAnotar: () => void; onGuardar: () => void; procesando: boolean }) {
  return (
    <Modal
      abierto={abierta}
      titulo="¿Guardar sin el pago?"
      onClose={onAnotar}
      ancho="max-w-sm"
      acciones={
        <>
          <Boton variante="ghost" onClick={onGuardar} disabled={procesando}>
            {procesando ? "Guardando…" : "Guardar sin pago"}
          </Boton>
          <Boton onClick={onAnotar} disabled={procesando} autoFocus>
            Anotar el pago
          </Boton>
        </>
      }
    >
      <p className="text-sm text-texto-2">No anotaste el pago de esta semana. ¿Guardar igual? Va a quedar en «Falta pagar».</p>
    </Modal>
  );
}

/** «Cargó: Dra. Prueba, 14/12/2026 10:32 · Corrigió: …», en gris al pie. */
export function QuienYCuando({ partes }: { partes: string[] }) {
  if (!partes.length) return null;
  // Uno por renglón: juntos, «Corrigió:» quedaba al final de uno y el nombre en el otro.
  return (
    <p className="space-y-0.5 text-[12px] text-texto-4">
      {partes.map((t) => (
        <span key={t} className="block">
          {t}
        </span>
      ))}
    </p>
  );
}

/** El pie de las hojas grandes: «Cancelar» y el botón principal (con `Ctrl+Enter` a la vista en la PC). */
export function PieHoja({ onCancelar, onGuardar, guardando, etiqueta }: { onCancelar: () => void; onGuardar: () => void; guardando: boolean; etiqueta: string }) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3 lg:justify-end">
      <button
        type="button"
        onClick={onCancelar}
        disabled={guardando}
        className="h-[54px] shrink-0 rounded-2xl border border-slate-300 bg-white px-[18px] text-base font-medium text-texto transition-colors hover:bg-muted disabled:opacity-60 sm:h-14 sm:px-[26px] sm:text-[17px] lg:h-12 lg:rounded-[14px] lg:px-[22px] lg:text-base"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onGuardar}
        disabled={guardando}
        title={`${etiqueta} (Ctrl+Enter)`}
        className="inline-flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-primary-boton px-4 text-[17px] font-bold text-white transition-colors hover:bg-primary-boton-hover disabled:opacity-70 sm:h-14 sm:text-lg lg:h-12 lg:flex-none lg:rounded-[14px] lg:px-[22px] lg:text-base"
      >
        <span className="truncate">{guardando ? "Guardando…" : etiqueta}</span>
        <kbd className="hidden h-5 shrink-0 items-center rounded-md border border-primary-200 px-1.5 font-sans text-xs font-medium lg:inline-flex">Ctrl+Enter</kbd>
      </button>
    </div>
  );
}
