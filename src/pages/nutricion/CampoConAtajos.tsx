import { useState } from "react";
import { componerRespuesta, leerRespuesta, type Respuesta } from "../../lib/nutricion/respuestas";
import { AreaTexto, CampoTexto, Rotulo } from "./piezas";

/**
 * Un campo de la ficha con atajos de un toque (25-nov-2026): el rótulo, una
 * fila de botoncitos con lo típico («Sí», «No», «2 L») y, debajo, el campo
 * para escribir, que está SIEMPRE (con atajo o sin él). Tocar un atajo lo
 * elige; tocar el elegido lo apaga y el campo vuelve a «sin contestar» (la
 * nota escrita se queda). Nada viene elegido de fábrica: todo abre vacío.
 *
 * El dato es UN texto, el de siempre: `valor` es el texto entero del campo y
 * `onCambiar` devuelve el texto entero ya compuesto («No: nunca», ver
 * `lib/nutricion/respuestas.ts`).
 */

/** Lo que tiene un atajo: compacto pero tocable, y del mismo ancho elegido o no. */
const CLASE_ATAJO =
  "inline-flex min-h-10 min-w-11 items-center justify-center whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-semibold transition-colors sm:min-h-9";
/** Los colores de «Mujer / Hombre» (`BotonesSexo`): blanco con borde; el elegido, en el verde suave. */
const ATAJO_APAGADO = "border-borde bg-white text-texto-2 hover:border-primary-200 hover:bg-muted";
const ATAJO_ELEGIDO = "border-primary bg-primary-50 text-primary-700";

/** Cuánto se deja escribir en la nota: con el atajo adelante («Con alteraciones: …») entra en los 2000 del servidor. */
export const MAXIMO_NOTA = 1950;

export default function CampoConAtajos({
  id,
  label,
  opciones,
  valor,
  onCambiar,
  multilinea = false,
  placeholder,
  className = "",
}: {
  /** El id de la nota (el rótulo apunta a ella). */
  id: string;
  label: string;
  opciones: readonly string[];
  valor: string;
  onCambiar: (texto: string) => void;
  /** La nota en dos renglones (si no, una línea). */
  multilinea?: boolean;
  placeholder?: string;
  className?: string;
}) {
  // Lo que se ve se lee del texto sólo cuando el texto llega de afuera (abrir
  // un paciente, limpiar la ficha): mientras se escribe, la nota queda como se
  // tecleó. Si no, escribir «No» en la nota (sin atajo) encendería el botón
  // «No» a mitad de palabra y vaciaría el campo donde se está escribiendo.
  const [visto, setVisto] = useState(valor);
  const [respuesta, setRespuesta] = useState<Respuesta>(() => leerRespuesta(valor, opciones));
  let actual = respuesta;
  if (valor !== visto) {
    actual = leerRespuesta(valor, opciones);
    setVisto(valor);
    setRespuesta(actual);
  }

  const cambiar = (r: Respuesta) => {
    const texto = componerRespuesta(r.opcion, r.nota);
    setRespuesta(r);
    setVisto(texto);
    onCambiar(texto);
  };

  const propsNota = {
    id,
    value: actual.nota,
    maxLength: MAXIMO_NOTA,
    placeholder,
    onChange: (e: { target: { value: string } }) => cambiar({ opcion: actual.opcion, nota: e.target.value }),
  };

  return (
    <Rotulo htmlFor={id} label={label} className={className}>
      <div role="group" aria-label={`${label}: respuesta rápida`} className="mb-2 flex flex-wrap gap-1.5">
        {opciones.map((o) => {
          const elegido = actual.opcion === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={elegido}
              // Tocar el elegido lo apaga; la nota escrita no se toca.
              onClick={() => cambiar({ opcion: elegido ? null : o, nota: actual.nota })}
              className={`${CLASE_ATAJO} ${elegido ? ATAJO_ELEGIDO : ATAJO_APAGADO}`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {multilinea ? <AreaTexto rows={2} {...propsNota} /> : <CampoTexto {...propsNota} />}
    </Rotulo>
  );
}
