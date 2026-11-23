import { useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "../../../components/Icon";
import { Boton, Modal } from "../../../components/ui";
import { fmtNumero, textoAlSalir, valorDe } from "../../../lib/nutricion/calculo";
import {
  type PesoDeLaEvaluacion,
  enUnidad,
  equivalenciasDe,
  fmtDosis,
  paraEscribir,
  partesEquivalencias,
  pasoSiguiente,
  textoCambioPeso,
  textoPaso,
  textoSubir,
  valorDelPaso,
} from "../../../lib/nutricion/seguimiento/formato";
import { conCambioDeLaboratorio, valorLimitado, type ErroresSemana, type FormSemana } from "../../../lib/nutricion/seguimiento/formulario";
import type { DosisAnotada, Paso, UnidadDosis } from "../../../lib/nutricion/seguimiento/tipos";
import { AreaTexto, CampoNumero, CampoTexto, Rotulo, SeccionHoja } from "../piezas";
import { AMARILLO, BotonToque, Equivalentes } from "./piezas";

/**
 * Los bloques de la hoja «Semana N» (que comparte «Iniciar tratamiento» para el
 * registro inicial): Peso, Dosis, Observaciones y Pagos (§4.2). Todo campo
 * arranca vacío; lo de la semana anterior va en gris al lado y los botones de
 * un toque escriben recién cuando se tocan.
 */

type Cambiar = <K extends keyof FormSemana>(campo: K, valor: FormSemana[K]) => void;

export function BloquePeso({
  id,
  form,
  errores,
  intento,
  cambiar,
  anterior,
  inicial,
  evaluacion,
  autoFocus = false,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: Cambiar;
  /** El peso de la semana anterior (con peso), para «anterior: 123,4» y lo que bajó esta semana. */
  anterior: number | null;
  /** El primer peso del tratamiento, para «en total». */
  inicial: number | null;
  evaluacion: PesoDeLaEvaluacion | null;
  autoFocus?: boolean;
}) {
  const err = intento || form.pesoKg ? errores.pesoKg : null;
  const peso = err ? null : valorDe("pesoKg", form.pesoKg);
  const cambio = textoCambioPeso(peso, anterior, inicial);
  return (
    <Rotulo
      htmlFor={`${id}-peso`}
      label="Peso (kg)"
      extra={anterior != null ? `anterior: ${fmtNumero(anterior, 2)}` : undefined}
      error={err}
    >
      <CampoNumero
        id={`${id}-peso`}
        value={form.pesoKg}
        unidad="kg"
        invalido={!!err}
        autoFocus={autoFocus}
        onChange={(v) => cambiar("pesoKg", v)}
        onBlur={() => {
          const t = textoAlSalir("pesoKg", form.pesoKg);
          if (t !== form.pesoKg) cambiar("pesoKg", t);
        }}
      />
      {/* Lo que bajó, pegado al campo; abajo, el peso de la Evaluación para usar. */}
      {cambio && !err && <p className="mt-1 text-xs font-semibold text-texto-2">{cambio}</p>}
      {evaluacion && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-texto-3">
          <span>{evaluacion.texto}</span>
          <button
            type="button"
            onClick={() => cambiar("pesoKg", fmtNumero(evaluacion.pesoKg, 2))}
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-primary-700 hover:bg-primary-50 lg:min-h-9"
          >
            Usar
          </button>
        </p>
      )}
    </Rotulo>
  );
}

/** Los motivos de un toque de «No se aplicó» (Kevin, 23-nov). */
const MOTIVOS = ["Salud", "Viaje", "No vino"];

export function BloqueDosis({
  id,
  form,
  errores,
  intento,
  cambiar,
  unidad,
  mgPorMl,
  uiPorMl,
  pasos,
  sinPresentacion,
  antes,
  racha,
  ofrecerSinDosis,
  avisoUnidad,
  guardadas,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: Cambiar;
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
  /** La dosis de antes (la última aplicada): «Igual que la anterior» y «Subir». */
  antes: DosisAnotada | null;
  /** «Lleva 2 semanas con 17 UI». */
  racha: string | null;
  /** «No se aplicó esta semana» (no en el inicial). */
  ofrecerSinDosis: boolean;
  /** La semana se anotó en otra unidad: lo que pasa si se cambia el número. */
  avisoUnidad?: string | null;
  /** Las equivalencias con que se guardó (la dosis sin tocar, anotada con otra concentración). */
  guardadas?: string[] | null;
}) {
  const err = !form.sinDosis && (intento || form.dosis) ? errores.dosis : null;
  const n = err ? null : valorLimitado("dosis", form.dosis);
  const equivalencias = guardadas ?? (n != null && unidad ? partesEquivalencias(equivalenciasDe(n, unidad, mgPorMl, uiPorMl), unidad) : []);
  const apagada = form.sinDosis || !unidad;
  const escribir = (v: number) => unidad && cambiar("dosis", paraEscribir(v, unidad));
  const igual = unidad && antes ? enUnidad(antes, unidad) : null;
  const subir = unidad && !sinPresentacion ? pasoSiguiente(pasos, antes, unidad) : null;
  const visibles = unidad ? pasos.filter((p) => valorDelPaso(p, unidad) != null) : [];
  const motivo = useRef<HTMLInputElement>(null);

  return (
    <SeccionHoja titulo="Dosis">
      <div className="space-y-3">
        <Rotulo
          htmlFor={`${id}-dosis`}
          label="Dosis"
          error={err}
          ayuda={
            !unidad ? (
              "Elegí primero en qué anotás la dosis."
            ) : form.sinDosis ? undefined : equivalencias.length || avisoUnidad ? (
              <>
                <Equivalentes partes={equivalencias} className="text-[13px]" />
                {avisoUnidad && <span className="block">{avisoUnidad}</span>}
              </>
            ) : undefined
          }
          className="max-w-xs"
        >
          <CampoNumero
            id={`${id}-dosis`}
            value={form.dosis}
            unidad={unidad || undefined}
            invalido={!!err}
            disabled={apagada}
            onChange={(v) => cambiar("dosis", v)}
          />
        </Rotulo>

        {unidad && !form.sinDosis && (
          <>
            {(igual != null || subir) && (
              <div className="flex flex-wrap gap-2">
                {igual != null && antes && (
                  <BotonToque onClick={() => escribir(igual)}>Igual que la anterior: {fmtDosis(igual, unidad)}</BotonToque>
                )}
                {subir && (
                  <BotonToque onClick={() => escribir(valorDelPaso(subir, unidad)!)} className="border-primary-200 text-primary-700">
                    <Icon name="arrowUp" size={15} />
                    {textoSubir(subir, unidad)}
                  </BotonToque>
                )}
              </div>
            )}
            {sinPresentacion ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-info-bg px-3 py-2 text-[13px] text-info-text">
                <Icon name="info" size={15} className="mt-px shrink-0" />
                <span>{sinPresentacion}</span>
              </p>
            ) : (
              visibles.length > 0 && (
                <div role="group" aria-label="Escalones de la dosis" className="flex flex-wrap gap-2">
                  {visibles.map((p) => (
                    <BotonToque key={p.mg} onClick={() => escribir(valorDelPaso(p, unidad)!)}>
                      {textoPaso(p, unidad)}
                    </BotonToque>
                  ))}
                </div>
              )
            )}
            {racha && <p className="text-[12px] text-texto-3">{racha}</p>}
          </>
        )}

        {ofrecerSinDosis && (
          <div className="space-y-3">
            <button
              type="button"
              aria-pressed={form.sinDosis}
              onClick={() => {
                cambiar("sinDosis", !form.sinDosis);
                if (!form.sinDosis) setTimeout(() => motivo.current?.focus(), 0);
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-3.5 text-[13px] font-semibold transition-colors ${
                form.sinDosis
                  ? "border-warning-text/50 bg-warning-bg text-warning-text"
                  : "border-borde bg-white text-texto-2 hover:border-warning-text/40 hover:bg-warning-suave"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 items-center justify-center rounded border ${form.sinDosis ? "border-warning-text bg-warning-text text-white" : "border-texto-4"}`}
              >
                {form.sinDosis && <Icon name="check" size={12} strokeWidth={3} />}
              </span>
              No se aplicó esta semana
            </button>
            {form.sinDosis && (
              <div className="space-y-2">
                <Rotulo htmlFor={`${id}-motivo`} label="Motivo" className="max-w-sm">
                  <CampoTexto
                    ref={motivo}
                    id={`${id}-motivo`}
                    value={form.motivoSinDosis}
                    maxLength={200}
                    autoComplete="off"
                    onChange={(e) => cambiar("motivoSinDosis", e.target.value)}
                  />
                </Rotulo>
                <div className="flex flex-wrap gap-2">
                  {MOTIVOS.map((m) => (
                    <BotonToque key={m} onClick={() => cambiar("motivoSinDosis", m)}>
                      {m}
                    </BotonToque>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SeccionHoja>
  );
}

export function BloqueObservaciones({
  id,
  form,
  cambiar,
}: {
  id: string;
  form: FormSemana;
  cambiar: Cambiar;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  return (
    <Rotulo htmlFor={`${id}-observaciones`} label="Observaciones">
      <AreaTexto
        ref={area}
        id={`${id}-observaciones`}
        rows={3}
        maxLength={2000}
        value={form.observaciones}
        onChange={(e) => cambiar("observaciones", e.target.value)}
      />
      <div className="mt-2">
        <BotonToque
          onClick={() => {
            const t = conCambioDeLaboratorio(form.observaciones);
            cambiar("observaciones", t);
            // El cursor al final, para completar «de TG a Tirzec».
            setTimeout(() => {
              const el = area.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(t.length, t.length);
            }, 0);
          }}
        >
          <Icon name="plus" size={15} />
          Cambio de laboratorio
        </BotonToque>
      </div>
    </Rotulo>
  );
}

export function BloquePagos({
  id,
  form,
  errores,
  intento,
  cambiar,
  tocaPago,
  refMedicamento,
}: {
  id: string;
  form: FormSemana;
  errores: ErroresSemana;
  intento: boolean;
  cambiar: Cambiar;
  /** «Hoy toca el pago del mes»: la semana de pago (o el inicial) de un mes sin pago todavía. */
  tocaPago: boolean;
  refMedicamento?: RefObject<HTMLInputElement | null>;
}) {
  const plata = (campo: "pagoMedicamento" | "pagoControl" | "pagoOtro", label: string) => {
    const err = intento || form[campo] ? errores[campo] : null;
    return (
      <Rotulo htmlFor={`${id}-${campo}`} label={label} error={err}>
        <CampoNumero
          ref={campo === "pagoMedicamento" ? refMedicamento : undefined}
          id={`${id}-${campo}`}
          value={form[campo]}
          invalido={!!err}
          onChange={(v) => cambiar(campo, v)}
          onBlur={() => {
            const n = valorLimitado("pago", form[campo]);
            if (n != null) {
              const t = fmtNumero(n, 2);
              if (t !== form[campo]) cambiar(campo, t);
            }
          }}
        />
      </Rotulo>
    );
  };
  return (
    <section
      aria-label="Pagos"
      className={`space-y-3 ${tocaPago ? `rounded-2xl p-4 ${AMARILLO}` : "border-t border-borde-soft pt-4"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Pagos</h3>
        {tocaPago && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-200/70 px-2.5 py-1 text-[13px] font-bold text-yellow-900" role="status">
            <Icon name="coins" size={15} />
            Hoy toca el pago del mes
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {plata("pagoMedicamento", "Medicamento (Bs)")}
        {plata("pagoControl", "Control mensual (Bs)")}
        {plata("pagoOtro", "Otro (Bs)")}
      </div>
      <Rotulo htmlFor={`${id}-pagoNota`} label="Nota del pago">
        <CampoTexto id={`${id}-pagoNota`} value={form.pagoNota} maxLength={200} autoComplete="off" onChange={(e) => cambiar("pagoNota", e.target.value)} />
      </Rotulo>
      <p className="text-[12px] text-texto-3">Sólo queda anotado en la hoja: no entra a la caja.</p>
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

