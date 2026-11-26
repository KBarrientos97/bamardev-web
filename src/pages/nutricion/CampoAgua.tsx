import { useState, type ReactNode } from "react";
import { componerAgua, fmtLitros, leerAgua, vasosDe, type Agua, type Cantidad } from "../../lib/nutricion/agua";
import { MAXIMO_NOTA } from "./CampoConAtajos";
import { CampoTexto } from "./piezas";

/**
 * El consumo de agua de la ficha (26-nov-2026, opción A elegida por el dueño):
 * una regla de litros de 8 casillas, de ½ a 4 L, que se llena de izquierda a
 * derecha, con «0» («No toma agua») a su izquierda y la nota debajo.
 *
 * El dato es UN texto (`lib/nutricion/agua.ts`); la nota está siempre. Nada
 * viene elegido de fábrica y tocar lo elegido lo apaga (la nota se queda).
 */

const mismo = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** La lectura del renglón del rótulo: «1,5 L al día · unos 6 vasos», «No toma agua», «Sin anotar». */
function Lectura({ cantidad }: { cantidad: Cantidad | null }) {
  let contenido: ReactNode;
  if (!cantidad) {
    contenido = <span className="text-texto-3">Sin anotar</span>;
  } else if (cantidad.tipo === "no_toma") {
    contenido = <span className="font-semibold text-texto">No toma agua</span>;
  } else {
    const vasos = vasosDe(cantidad.litros);
    contenido = (
      <>
        <span className="font-semibold text-texto">{fmtLitros(cantidad.litros)} L al día</span>
        <span className="text-texto-3"> · {vasos === 1 ? "1 vaso" : `unos ${vasos} vasos`}</span>
      </>
    );
  }
  return (
    <span aria-live="polite" className="text-[13px] tabular-nums">
      {contenido}
    </span>
  );
}

export default function CampoAgua({
  id,
  valor,
  onCambiar,
  className = "",
}: {
  /** El id de la nota (el rótulo apunta a ella). */
  id: string;
  valor: string;
  onCambiar: (texto: string) => void;
  className?: string;
}) {
  // Igual que `CampoConAtajos`: lo que se ve se lee del texto sólo cuando el
  // texto llega de afuera; mientras se escribe, la nota queda como se tecleó.
  const [visto, setVisto] = useState(valor);
  const [agua, setAgua] = useState<Agua>(() => leerAgua(valor));
  let actual = agua;
  if (valor !== visto) {
    actual = leerAgua(valor);
    setVisto(valor);
    setAgua(actual);
  }

  const cambiar = (a: Agua) => {
    const texto = componerAgua(a);
    setAgua(a);
    setVisto(texto);
    onCambiar(texto);
  };
  const poner = (cantidad: Cantidad | null) => cambiar({ ...actual, cantidad });

  return (
    <div className={`min-w-0 ${className}`}>
      {/* En la columna angosta, la lectura va a la derecha del rótulo. */}
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={id} className="text-[13px] font-semibold text-texto-2">
          Consumo de agua
        </label>
        <Lectura cantidad={actual.cantidad} />
      </div>

      <Regla cantidad={actual.cantidad} poner={poner} />

      <CampoTexto
        id={id}
        value={actual.nota}
        maxLength={MAXIMO_NOTA}
        placeholder="Nota (opcional)"
        onChange={(e) => cambiar({ ...actual, nota: e.target.value })}
      />
    </div>
  );
}

const CASILLAS: { litros: number; texto: string }[] = [
  { litros: 0.5, texto: "½" },
  { litros: 1, texto: "1" },
  { litros: 1.5, texto: "1½" },
  { litros: 2, texto: "2" },
  { litros: 2.5, texto: "2½" },
  { litros: 3, texto: "3" },
  { litros: 3.5, texto: "3½" },
  { litros: 4, texto: "4" },
];

function Regla({ cantidad, poner }: { cantidad: Cantidad | null; poner: (c: Cantidad | null) => void }) {
  const noToma = cantidad?.tipo === "no_toma";
  const hay = cantidad?.tipo === "litros" ? cantidad.litros : null;
  return (
    <div className="mb-2 flex items-stretch gap-1.5">
      <button
        type="button"
        aria-label="No toma agua"
        aria-pressed={noToma}
        onClick={() => poner(noToma ? null : { tipo: "no_toma" })}
        className={`h-12 w-11 shrink-0 rounded-[10px] border text-[13px] font-semibold transition-colors sm:h-9 ${
          noToma ? "border-[#475569] bg-[#475569] text-white" : "border-[#94a3b8] bg-white text-texto-2"
        }`}
      >
        0
      </button>
      <div
        role="group"
        aria-label="Litros al día"
        className="grid h-12 min-w-0 flex-1 grid-cols-8 gap-px overflow-hidden rounded-[10px] border border-[#94a3b8] bg-[#e2e8f0] sm:h-9"
      >
        {CASILLAS.map((c) => {
          const lleno = hay !== null && hay >= c.litros - 1e-9;
          const elegido = hay !== null && mismo(hay, c.litros);
          return (
            <button
              key={c.litros}
              type="button"
              aria-label={`${fmtLitros(c.litros)} ${c.litros === 1 ? "litro" : "litros"} al día`}
              aria-pressed={elegido}
              onClick={() => poner(elegido ? null : { tipo: "litros", litros: c.litros })}
              className={`text-[13px] font-semibold tabular-nums transition-colors ${lleno ? "bg-[#0369a1] text-white" : "bg-[#f8fafc] text-texto-2"}`}
            >
              {c.texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}
