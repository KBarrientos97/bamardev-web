import { hoyIso } from "../../lib/nutricion/calculo";
import { Tarjeta } from "../academia/piezas";
import { Numero, type PropsEtapa } from "./EtapasEvaluacion";
import FiguraCuerpo, { type Cinta } from "./FiguraCuerpo";
import { BotonesSexo, CampoTexto, Rotulo } from "./piezas";

/**
 * La etapa 2 de la evaluación: las tres medidas con la cinta y la figura que
 * muestra por dónde pasa cada una. El estado y el guardado viven en
 * `Evaluacion.tsx`; acá sólo se dibuja y se avisa.
 *
 * Los campos van como el cuerpo y como la figura: Pecho, Cintura, Cadera, de
 * arriba abajo. El armado depende del ancho de la TARJETA (container queries),
 * no de la ventana, porque el menú lateral cambia el lugar que queda:
 * - Angosta (el teléfono): los campos a la izquierda y la figura sola a la
 *   derecha, para que se vea mientras se escribe.
 * - Ancha (tablet y PC, desde 40rem): una columna de 240 px con los campos
 *   (la misma de los pasos 3 y 4) y, al lado, un «escenario» con la figura
 *   grande y sus rótulos: el nombre y el valor de cada cinta.
 * Tocar una cinta (o su rótulo) lleva al campo.
 */

/** Una medida: la cinta de la figura y el campo del control. */
const MEDIDAS: { cinta: Cinta; campo: "pechoCm" | "cinturaCm" | "caderaCm"; label: string }[] = [
  { cinta: "pecho", campo: "pechoCm", label: "Pecho" },
  { cinta: "cintura", campo: "cinturaCm", label: "Cintura" },
  { cinta: "cadera", campo: "caderaCm", label: "Cadera" },
];

export function EtapaMedidas(p: PropsEtapa & { cinta: Cinta | null; onCinta: (c: Cinta | null) => void }) {
  const { ficha, control, cambiarControl } = p;
  const sexo = ficha.sexo || null;
  const valores: Record<Cinta, string> = { pecho: control.pechoCm, cintura: control.cinturaCm, cadera: control.caderaCm };
  // El foco pasa al campo y su onFocus marca la cinta: la figura no decide nada por su cuenta.
  // También con el dedo: tocar la cinta es para escribir esa medida (`foco.ts`).
  const irAlCampo = (cinta: Cinta) => document.getElementById(`ev-${cinta}`)?.focus();

  return (
    <Tarjeta titulo="Medidas" bajada="Con la cinta, en centímetros.">
      {/* Tres filas: la fecha, una línea fina y las tres medidas. Angosta, la figura va
          al lado de las medidas (lo que ilustra), y la línea cruza también por arriba de
          ella; ancha, el escenario ocupa las tres filas a la derecha. */}
      <div className="@container">
        <div className="grid grid-cols-[minmax(0,1fr)_7.75rem] items-start gap-x-4 gap-y-4 @md:grid-cols-[minmax(0,1fr)_8.75rem] @md:gap-x-6 @min-[40rem]:grid-cols-[minmax(0,240px)_minmax(0,1fr)] @min-[40rem]:gap-x-8">
          <Rotulo htmlFor="ev-fecha" label="Fecha de la evaluación" error={p.error("fecha")} className="col-start-1 row-start-1">
            <CampoTexto
              id="ev-fecha"
              type="date"
              value={control.fecha}
              max={hoyIso()}
              invalido={!!p.error("fecha")}
              onChange={(e) => cambiarControl("fecha", e.target.value)}
              onBlur={() => p.tocar("fecha")}
            />
          </Rotulo>
          <div aria-hidden="true" className="col-[1/3] row-start-2 border-t border-borde-soft @min-[40rem]:col-[1/2]" />
          <div data-columna="" className="col-start-1 row-start-3 min-w-0 space-y-4">
            {MEDIDAS.map(({ cinta, campo, label }) => (
              <Numero
                key={cinta}
                id={`ev-${cinta}`}
                campo={campo}
                label={label}
                unidad="cm"
                valor={control[campo]}
                onCambiar={(v) => cambiarControl(campo, v)}
                onFocus={() => p.onCinta(cinta)}
                onBlur={() => p.onCinta(null)}
                p={p}
              />
            ))}
          </div>

          {/* Ancho: el alto de la figura (293) más el relleno y el borde (42) es el de la
              columna sin errores; si un campo muestra su error, el escenario se estira
              abajo y la figura no se mueve. */}
          <div
            data-escenario=""
            className="col-start-2 row-start-3 min-w-0 @min-[40rem]:row-[1/4] @min-[40rem]:flex @min-[40rem]:justify-center @min-[40rem]:self-stretch @min-[40rem]:rounded-2xl @min-[40rem]:border @min-[40rem]:border-borde-soft @min-[40rem]:bg-[linear-gradient(160deg,var(--color-primary-50)_0%,var(--color-card)_70%)] @min-[40rem]:px-6 @min-[40rem]:py-5"
          >
            {sexo ? (
              <>
                {/* Angosta: la figura sola, a lo ancho de su columna. */}
                <FiguraCuerpo
                  sexo={sexo}
                  resaltada={p.cinta}
                  valores={valores}
                  onTocar={irAlCampo}
                  className="block h-auto w-full @min-[40rem]:hidden"
                />
                {/* Ancha: con rótulos y de alto fijo. */}
                <FiguraCuerpo
                  sexo={sexo}
                  resaltada={p.cinta}
                  valores={valores}
                  rotulos
                  onTocar={irAlCampo}
                  className="hidden h-[293px] w-auto max-w-full @min-[40rem]:block"
                />
              </>
            ) : (
              <div className="flex w-full items-center justify-center">
                <div className="w-full space-y-2 rounded-2xl border border-dashed border-borde bg-muted p-2.5 @md:p-4 @min-[40rem]:max-w-60 @min-[40rem]:bg-card/80">
                  <p className="text-center text-[12px] font-semibold text-texto-3 @md:text-[13px]">Sexo del paciente</p>
                  <BotonesSexo valor="" apilados etiqueta="Sexo del paciente" onElegir={(s) => p.cambiarFicha("sexo", s)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}
