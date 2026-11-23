import { useState } from "react";
import { AvisoOk, ErrorMsg, Select, useAviso } from "../../components/ui";
import { useApi } from "../../lib/useApi";
import { apiReportes } from "../reportes/api";
import { Tarjeta } from "../tickets/piezas";
import { opcionesDeCorte, textoDeCorte } from "./cierreDelDia";

/**
 * Configuración › Caja › «El día termina a las…» (23-nov): la JORNADA de los
 * reportes para cualquier local, no sólo el billar (ver `lib/jornada.ts`).
 *
 * Pollos Don Omar abre el sábado y cierra el domingo a las 3 a. m. Con el día
 * del calendario, el reporte del "sábado" se llevaba la madrugada del turno
 * del viernes y no cuadraba con el PDF de su turno. Con el día terminando a
 * las 7:00, lo vendido antes de esa hora cuenta para el día anterior: el
 * sábado de los reportes es su turno del sábado entero.
 *
 * Vive en «Caja» porque es lo que el dueño tiene en la cabeza ("mi turno
 * cierra de madrugada"), aunque lo que cambia son los reportes. Se guarda al
 * elegir. Si la persona no ve los reportes (el GET responde 403), la tarjeta
 * no aparece: no tendría dónde notar el cambio.
 */
export function TarjetaCierreDelDia() {
  const estado = useApi(() => apiReportes.jornada(), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [guardado, setGuardado] = useAviso(4000);

  if (estado.error || !estado.datos) return null;
  const actual = estado.datos.corteMin;

  const cambiar = async (corteMin: number) => {
    setProcesando(true);
    setError("");
    try {
      estado.setDatos(await apiReportes.guardarJornada(corteMin));
      setGuardado("Guardado");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo guardar el cambio");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <Tarjeta titulo="El día de los reportes">
      <AvisoOk>{guardado}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>
      <label className="block">
        <span className="text-sm font-semibold text-texto">El día termina a las</span>
        <div className="mt-1.5 max-w-xs">
          <Select
            aria-label="Hora en que termina el día"
            value={String(actual)}
            disabled={procesando}
            onChange={(e) => void cambiar(Number(e.target.value))}
          >
            {opcionesDeCorte(actual).map((min) => (
              <option key={min} value={min}>
                {textoDeCorte(min)}
              </option>
            ))}
          </Select>
        </div>
      </label>
      <p className="mt-2 text-[13px] leading-snug text-texto-3">
        Si cerrás de madrugada, elegí una hora entre que cerrás y que abrís (por ejemplo las 7:00 si cerrás a las 3).
        Lo que se vende antes de esa hora cuenta para el día anterior: el reporte del sábado es tu turno del sábado
        entero. Sólo cambia los reportes: no cierra la caja y las horas de cada venta no cambian.
      </p>
    </Tarjeta>
  );
}
