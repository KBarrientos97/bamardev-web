import { useEffect, useRef, type CSSProperties } from "react";
import type { ContactoWhatsapp } from "../../lib/pagina/whatsapp";

/**
 * Elegir a qué WhatsApp escribir (13-oct), cuando la página tiene más de un
 * número (sucursales con el suyo). Una hoja desde abajo en el celular y una
 * tarjeta centrada en la computadora, con estilos en línea como el resto de
 * la página pública (no lee el tema de la app). Cada opción es el enlace
 * `wa.me` ya armado, con el mensaje del botón que se tocó.
 */

const PATH_WHATSAPP =
  "M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1";

export default function EleccionWhatsapp({
  titulo = "¿A qué WhatsApp escribís?",
  opciones,
  color,
  familia = "Roboto, system-ui, sans-serif",
  onCerrar,
  onElegir,
}: {
  titulo?: string;
  opciones: ContactoWhatsapp[];
  /** El color de la página: el de los botones. */
  color: string;
  familia?: string;
  onCerrar: () => void;
  /** Cuando se toca una opción (el enlace igual se abre). */
  onElegir?: (o: ContactoWhatsapp) => void;
}) {
  const primero = useRef<HTMLAnchorElement>(null);
  // La tecla lee siempre el último `onCerrar` sin volver a colgar el listener.
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    primero.current?.focus();
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar.current();
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("keydown", alTecla);
      // El foco vuelve a donde estaba al cerrar.
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);
  // En la computadora, tarjeta centrada; en el celular, hoja desde abajo.
  const escritorio = typeof window !== "undefined" && window.innerWidth >= 640;

  const opcion: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid #E5E7EB",
    background: "#ffffff",
    color: "#1F2937",
    textDecoration: "none",
    fontSize: 16,
    fontWeight: 600,
    minWidth: 0,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      style={{
        position: "fixed",
        inset: 0,
        // Encima del visor del catálogo (1000) y del pedido (60).
        zIndex: 1100,
        background: "rgba(17,24,39,.55)",
        display: "flex",
        alignItems: escritorio ? "center" : "flex-end",
        justifyContent: "center",
        padding: escritorio ? 16 : 0,
        fontFamily: familia,
      }}
    >
      <section
        style={{
          background: "#ffffff",
          width: "min(440px, 100%)",
          boxSizing: "border-box",
          maxHeight: "85dvh",
          overflowY: "auto",
          borderRadius: escritorio ? 18 : "18px 18px 0 0",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#1F2937" }}>{titulo}</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            style={{ border: "none", background: "transparent", fontSize: 26, lineHeight: 1, cursor: "pointer", color: "#4B5563" }}
          >
            ×
          </button>
        </header>
        {opciones.map((o, i) => (
          <a
            key={`${o.etiqueta}-${i}`}
            ref={i === 0 ? primero : undefined}
            href={o.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              onElegir?.(o);
              onCerrar();
            }}
            style={opcion}
          >
            <span
              aria-hidden="true"
              style={{ width: 36, height: 36, flex: "none", borderRadius: 999, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d={PATH_WHATSAPP} />
              </svg>
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.etiqueta}</span>
          </a>
        ))}
      </section>
    </div>
  );
}

/**
 * La misma elección dentro de un formulario (el pedido, la gift card): una
 * opción por número, y nada elegido hasta que el cliente elige, para que el
 * pedido no vaya a la sucursal equivocada sin que lo note.
 */
export function ElegirDestino({
  opciones,
  elegido,
  onElegir,
  color,
  titulo = "¿A qué sucursal lo mandás?",
}: {
  opciones: ContactoWhatsapp[];
  elegido: number | null;
  onElegir: (i: number) => void;
  color: string;
  titulo?: string;
}) {
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <legend style={{ fontSize: 13, color: "#4B5563", marginBottom: 6 }}>{titulo}</legend>
      {opciones.map((o, i) => (
        <label
          key={`${o.etiqueta}-${i}`}
          style={{
            border: `1.5px solid ${elegido === i ? color : "#D1D5DB"}`,
            borderRadius: 10,
            padding: "10px 12px",
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            gap: 8,
            alignItems: "center",
            minWidth: 0,
          }}
        >
          <input type="radio" name="destino-whatsapp" checked={elegido === i} onChange={() => onElegir(i)} />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.etiqueta}</span>
        </label>
      ))}
    </fieldset>
  );
}
