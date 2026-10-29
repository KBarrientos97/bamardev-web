import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Boton, Modal } from "./ui";

/**
 * Lo que explica un reporte en "Cómo se calcula": qué muestra, de dónde salen
 * los números y qué entra o no entra. En palabras simples, para el dueño que
 * no lee cuentas.
 */
export interface TextoAyuda {
  /** Qué muestra el reporte, en una o dos frases. */
  queMuestra: string;
  /** De dónde salen los números: qué se suma y con qué fecha. */
  deDonde: string;
  /** Lo que sí entra. */
  incluye?: string[];
  /** Lo que no entra, con su porqué si hace falta. */
  noIncluye?: string[];
}

/**
 * El botón "Cómo se calcula" de cada reporte (L5, 28-oct: "un botón de ayuda
 * en cada reporte que explique cómo se calcula y de dónde sale"). Es uno solo
 * para todos —los de Reportes de ventas y los del Instituto— y abre un
 * diálogo de sólo leer.
 *
 * Con `compacto` es sólo el "?" redondo (en la cabecera de una tarjeta, donde
 * el texto no entra); el nombre accesible dice igual de qué reporte es.
 */
export function AyudaCalculo({ titulo, ayuda, compacto = false }: { titulo: string; ayuda: TextoAyuda; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Cómo se calcula: ${titulo}`}
        title="Cómo se calcula"
        className={
          compacto
            ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-borde bg-white text-texto-3 transition-colors hover:bg-muted hover:text-texto"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-borde bg-white px-3.5 py-2 text-[13px] font-semibold text-texto-2 transition-colors hover:bg-muted"
        }
      >
        <Icon name="pregunta" size={compacto ? 16 : 15} />
        {!compacto && <span className="max-sm:sr-only">Cómo se calcula</span>}
      </button>
      {abierto && (
        <Modal abierto titulo="Cómo se calcula" subtitulo={titulo} onClose={() => setAbierto(false)} acciones={<Boton onClick={() => setAbierto(false)}>Entendido</Boton>}>
          <div className="space-y-4 text-[13.5px] leading-relaxed text-texto-2">
            <Seccion titulo="Qué muestra">
              <p>{ayuda.queMuestra}</p>
            </Seccion>
            <Seccion titulo="De dónde salen los números">
              <p>{ayuda.deDonde}</p>
            </Seccion>
            {ayuda.incluye?.length ? (
              <Seccion titulo="Incluye">
                <Lista items={ayuda.incluye} />
              </Seccion>
            ) : null}
            {ayuda.noIncluye?.length ? (
              <Seccion titulo="No incluye">
                <Lista items={ayuda.noIncluye} />
              </Seccion>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-texto-4">{titulo}</h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}
