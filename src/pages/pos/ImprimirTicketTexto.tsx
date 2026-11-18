import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { Icon } from "../../components/Icon";
import { Boton } from "../../components/ui";
import { useLocalDelPapel } from "../../lib/useHayVariasSucursales";
import { useAuth } from "../../store/AuthContext";

/**
 * Imprimir un ticket de TEXTO de 58 mm: el de cierre, el de un pedido de
 * Yango/PedidosYa y el de un pedido web (CONTRATO-DELIVERY-FULL-18NOV §9).
 *
 * El mismo mecanismo que el recibo: un `#area-impresion` que es lo ÚNICO
 * visible al imprimir (index.css), con el rollo fijado por `--ancho-ticket`
 * (48 mm útiles de los 58) y el diálogo de impresión del navegador.
 *
 * SIEMPRE en negrita y negro puro (18-nov): en la térmica el texto normal sale
 * claro y no se lee. `papel-negrita` pone todo en negro y el `<pre>` va en 700.
 * En Courier New la negrita tiene el mismo ancho que la normal (0,6 em por
 * letra): las 32 columnas a 2,4 mm miden ~46 mm en los dos casos y entran en
 * los 48 del rollo.
 *
 * El papel se monta recién al imprimir y se retira al terminar: así nunca hay
 * dos `#area-impresion` a la vez ni un ticket escondido en cada pantalla.
 */

/** La letra del papel: de ancho fijo, para que las columnas caigan donde deben. */
export const LETRA_TICKET = '"Courier New", Courier, "Liberation Mono", monospace';

/** El papel que se imprime. */
function PapelTicket({ texto, testId }: { texto: string; testId: string }) {
  return (
    <article
      id="area-impresion"
      data-testid={testId}
      className="hidden print:block papel-negrita"
      style={{ "--ancho-ticket": "48mm" } as CSSProperties}
    >
      {/* 32 columnas: con una letra de ancho fijo de 2,4 mm el renglón mide ~46 mm y entra en los 48 del rollo. */}
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre",
          fontFamily: LETRA_TICKET,
          fontSize: "2.4mm",
          lineHeight: 1.3,
          fontWeight: 700,
          color: "#000",
        }}
      >
        {texto}
      </pre>
    </article>
  );
}

/**
 * `imprimir(texto)` monta el papel, abre el diálogo de impresión y lo retira
 * al terminar; `papel` es lo que hay que dibujar (va al `<body>`).
 */
export function useImpresionTexto(testId = "ticket-texto"): { imprimir: (texto: string) => void; papel: ReactNode } {
  const [texto, setTexto] = useState<string | null>(null);
  const alTerminar = useRef<(() => void) | null>(null);

  // Si la pantalla se cierra con el diálogo abierto, no queda el oyente colgado.
  useEffect(
    () => () => {
      if (alTerminar.current) window.removeEventListener("afterprint", alTerminar.current);
    },
    [],
  );

  const imprimir = useCallback((t: string) => {
    if (alTerminar.current) window.removeEventListener("afterprint", alTerminar.current);
    const fin = () => {
      window.removeEventListener("afterprint", fin);
      alTerminar.current = null;
      setTexto(null);
    };
    alTerminar.current = fin;
    window.addEventListener("afterprint", fin);
    // El papel tiene que estar en el DOM antes de que el navegador arme la impresión.
    flushSync(() => setTexto(t));
    window.print();
  }, []);

  return { imprimir, papel: texto != null ? createPortal(<PapelTicket texto={texto} testId={testId} />, document.body) : null };
}

/**
 * Lo que va arriba del papel: el nombre del negocio y el local, con la misma
 * regla que el ticket de cierre (el local sólo con 2+ sucursales).
 */
export function useCabeceraDelPapel(sede: string | null | undefined): { negocio: string; sede: string | null } {
  const { negocio } = useAuth();
  const local = useLocalDelPapel(sede ? { nombre: sede } : null);
  return { negocio: negocio?.nombre ?? "", sede: local?.nombre ?? null };
}

/** El ticket en pantalla, tal cual sale: la misma letra, en negrita y en negro. */
export function VistaTicketTexto({ texto, etiqueta = "Vista del ticket" }: { texto: string; etiqueta?: string }) {
  return (
    <div className="flex justify-center rounded-xl bg-muted p-3">
      <pre
        aria-label={etiqueta}
        className="max-w-full overflow-x-auto rounded-md border border-borde bg-white px-3 py-3 text-[13px] leading-[1.35] text-black"
        style={{ margin: 0, whiteSpace: "pre", fontFamily: LETRA_TICKET, fontWeight: 700 }}
      >
        {texto}
      </pre>
    </div>
  );
}

/** El botón que imprime un texto ya armado. */
export default function ImprimirTicketTexto({
  texto,
  etiqueta = "Imprimir",
  variante = "ghost",
  className = "",
  testId,
  fila = false,
}: {
  /** El texto o, para no armarlo en cada dibujo, la función que lo arma al tocar. */
  texto: string | (() => string);
  etiqueta?: string;
  variante?: "primary" | "ghost";
  className?: string;
  testId?: string;
  /** De lado a lado, con la letra del renglón (como el de «Productos vendidos» del cierre). */
  fila?: boolean;
}) {
  const { imprimir, papel } = useImpresionTexto(testId);
  const alTocar = () => imprimir(typeof texto === "function" ? texto() : texto);
  return (
    <>
      {fila ? (
        <button
          type="button"
          onClick={alTocar}
          className={`flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted ${className}`}
        >
          <Icon name="printer" size={17} />
          {etiqueta}
        </button>
      ) : (
        <Boton variante={variante} icono="printer" onClick={alTocar} className={className}>
          {etiqueta}
        </Boton>
      )}
      {papel}
    </>
  );
}
