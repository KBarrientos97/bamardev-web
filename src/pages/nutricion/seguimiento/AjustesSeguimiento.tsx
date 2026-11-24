import { useState } from "react";
import { Boton, Modal } from "../../../components/ui";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import { errorDeNumero, valorLimitado } from "../../../lib/nutricion/seguimiento/formulario";
import type { AjustesSeguimiento } from "../../../lib/nutricion/seguimiento/tipos";
import { olvidarCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { CampoNumero } from "../piezas";

/**
 * «Ajustes del seguimiento» (§4.1): si se avisan los pagos y cada cuántas
 * semanas paga el paciente (de fábrica, al iniciar y cada 5). Es un ajuste del
 * negocio: abre con lo que está guardado. Lo ve sólo quien puede cambiarlo
 * (`ajustes.puedeCambiarlos`). Cambiarlo no toca ninguna semana cargada: el
 * servidor vuelve a contar al leer.
 */
export default function DialogoAjustesSeguimiento({
  ajustes,
  onCerrar,
  onGuardado,
}: {
  ajustes: AjustesSeguimiento;
  onCerrar: () => void;
  onGuardado: (a: AjustesSeguimiento) => void;
}) {
  const [avisar, setAvisar] = useState(ajustes.avisarPagos);
  const [cada, setCada] = useState(String(ajustes.pagoCadaSemanas));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const errCada = !cada.trim() ? "Escribí cada cuántas semanas" : errorDeNumero("pagoCadaSemanas", cada);
  const n = valorLimitado("pagoCadaSemanas", cada);

  async function guardar() {
    if (guardando || errCada || n == null) return;
    const cambios: Partial<AjustesSeguimiento> = {};
    if (avisar !== ajustes.avisarPagos) cambios.avisarPagos = avisar;
    if (n !== ajustes.pagoCadaSemanas) cambios.pagoCadaSemanas = n;
    if (!Object.keys(cambios).length) {
      onCerrar();
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const nuevos = await apiSeguimiento.cambiarAjustes(cambios);
      olvidarCatalogoSeguimiento();
      onGuardado(nuevos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Ajustes del seguimiento"
      onClose={onCerrar}
      ancho="max-w-md"
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={guardando || !!errCada}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {/* El renglón entero es el interruptor: en la tablet se toca con el dedo, y la perilla sola era chica. */}
        <button
          type="button"
          role="switch"
          aria-checked={avisar}
          onClick={() => setAvisar((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between gap-4 border-b border-borde-soft py-3 text-left"
        >
          <span className="min-w-0">
            <span className="block text-sm text-texto">Avisar los pagos</span>
            <span className="mt-0.5 block text-[13px] text-texto-3">En la lista, en la hoja de cada paciente y en «Pagos pendientes».</span>
          </span>
          <span
            aria-hidden="true"
            className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors"
            style={{ background: avisar ? "var(--color-primary-boton)" : "#CBD5E1" }}
          >
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150" style={{ left: avisar ? 18 : 2 }} />
          </span>
        </button>
        <div className="space-y-1.5">
          <label htmlFor="ajuste-cada" className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-texto">
            <span>El paciente paga al iniciar y después cada</span>
            <span className="w-20">
              <CampoNumero
                id="ajuste-cada"
                value={cada}
                invalido={!!errCada}
                onChange={setCada}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void guardar();
                  }
                }}
              />
            </span>
            <span>semanas</span>
          </label>
          {errCada ? (
            <p id="ajuste-cada-error" className="text-xs text-danger-text">
              {errCada}
            </p>
          ) : (
            n != null && (
              <p className="text-[13px] text-texto-3">
                Las semanas de pago quedan marcadas en amarillo:{" "}
                <span className="whitespace-nowrap">
                  {n}, {2 * n}, {3 * n}…
                </span>
              </p>
            )
          )}
        </div>
        {error && (
          <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
