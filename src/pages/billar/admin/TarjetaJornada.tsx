import { Select } from "../../../components/ui";
import { CORTE_JORNADA_MAX, horaDeCorte } from "../../../lib/jornada";
import { Nota, Tarjeta } from "../ui";
import type { BorradorTarifas } from "./borrador";
import { Etiqueta } from "./piezas";

/**
 * Mesas de billar → Tarifas: a qué hora termina la JORNADA (ver
 * `lib/jornada.ts`). Un billar abre a la tarde y cierra a las 2 o 4 a. m.:
 * con el día del calendario, "Hoy" a la 1:30 a. m. mostraba casi nada y la
 * noche del viernes quedaba partida en dos días. Como el "closeoutHour" de
 * Toast, lo cobrado antes de esta hora cuenta para el día anterior.
 *
 * Es un ajuste del negocio como los avisos: va en el mismo borrador y se
 * guarda con "Guardar cambios". De 00:00 a 12:00, de a media hora (el rango de
 * Toast); un valor que el backend tenga fuera de esos pasos se ofrece igual,
 * para no cambiarlo sin que nadie lo toque.
 */
export function TarjetaJornada({ b, onCambiar }: { b: BorradorTarifas; onCambiar: (b: BorradorTarifas) => void }) {
  const opciones = Array.from({ length: CORTE_JORNADA_MAX / 30 + 1 }, (_, i) => i * 30);
  if (!opciones.includes(b.horaCorteMin)) opciones.push(b.horaCorteMin);
  opciones.sort((x, y) => x - y);
  return (
    <Tarjeta icono="clock" titulo="Jornada">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <Etiqueta>La jornada termina a las</Etiqueta>
          <div className="max-w-xs">
            <Select
              aria-label="Hora en que termina la jornada"
              value={String(b.horaCorteMin)}
              onChange={(e) => onCambiar({ ...b, horaCorteMin: Number(e.target.value) })}
            >
              {opciones.map((min) => (
                <option key={min} value={min}>
                  {min === 0 ? "00:00 (medianoche, el día del calendario)" : horaDeCorte(min)}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-1.5 text-xs text-texto-4">
            Lo que se cobra antes de esta hora cuenta para el día anterior. Ponela 1 o 2 horas después de que cerrás.
          </p>
        </div>
        <Nota tono="gris">
          Sólo decide a qué día va cada venta en los reportes: de madrugada, "Hoy" sigue siendo la noche que corre y
          el viernes incluye su madrugada. No cierra la caja ni las mesas, y las horas del reloj no cambian.
        </Nota>
      </div>
    </Tarjeta>
  );
}
