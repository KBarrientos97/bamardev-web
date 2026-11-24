import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EstadoCuentaPublico, PagoHecho } from "../../lib/academia/tipos";
import { descargarComoImagen } from "../../lib/compartirTicket";

const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «24 nov 2026, 14:05», en la hora de Bolivia: es la hora que el estudiante vivió. */
function cuando(iso: string): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  return f.toLocaleString("es-BO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" });
}

/** Un nombre de archivo sin barras ni espacios: «comprobante-EL-000123». */
const nombreArchivo = (p: PagoHecho) => `comprobante-${p.comprobante.replace(/[^\w-]+/g, "-")}`;

/**
 * El comprobante en sí, lo que se baja como imagen. Colores fijos y sin
 * variables del tema: se rasteriza tal cual y tiene que verse igual en cualquier
 * celular. Sin el logo: una imagen de otro origen puede impedir que se genere.
 */
function Comprobante({ d, p }: { d: EstadoCuentaPublico; p: PagoHecho }) {
  return (
    <div style={{ width: 380, padding: 24, background: "#fff", color: "#111827", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{d.instituto.nombre}</p>
      <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 14px" }}>Comprobante de pago</p>
      <div style={{ borderTop: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", padding: "10px 0", fontSize: 13, lineHeight: 1.6 }}>
        <div>
          <strong>N.º:</strong> {p.comprobante}
        </div>
        <div>
          <strong>Fecha:</strong> {cuando(p.fecha)}
        </div>
        <div>
          <strong>Estudiante:</strong> {d.alumno.nombres}
        </div>
        <div>
          <strong>Curso:</strong> {d.curso} · {d.grupo.nombre} · Sede {d.grupo.sede}
        </div>
        {p.formas.length > 0 && (
          <div>
            <strong>Pagado con:</strong> {p.formas.join(" + ")}
          </div>
        )}
      </div>
      <div style={{ padding: "10px 0", fontSize: 13 }}>
        {p.conceptos.map((c, i) => (
          <div key={`${c.concepto}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0" }}>
            <span>{c.concepto}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{bs(c.monto)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #111827", paddingTop: 10, fontSize: 16, fontWeight: 700 }}>
        <span>Total pagado</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{bs(p.total)}</span>
      </div>
      <p style={{ fontSize: 11, color: "#6B7280", margin: "16px 0 0", textAlign: "center" }}>
        Comprobante emitido por {d.instituto.nombre}. Este pago figura en tu estado de cuenta.
      </p>
    </div>
  );
}

/**
 * El comprobante de un pago ya hecho, para bajar como evidencia (24-nov). Es el
 * mismo recibo que da la caja, armado con lo que el backend ya manda en el
 * estado de cuenta; no hay nada que pedir ni subir. Cada renglón pagado del
 * estado de cuenta tiene su botón (`pagos` de la cuota señala qué comprobantes
 * le tocan); un pago anulado no figura porque el backend no lo manda.
 *
 * Devuelve `bajar(pago)`, cuál se está armando, el aviso si falló y `oculto`: el
 * comprobante fuera de la vista, que quien llama pone UNA vez en la página (una
 * imagen no sale de algo con display:none, y se arma sólo mientras se baja).
 */
export function useComprobantePago(d: EstadoCuentaPublico): {
  bajar: (p: PagoHecho) => void;
  bajando: PagoHecho | null;
  fallo: string;
  oculto: ReactNode;
} {
  const [bajando, setBajando] = useState<PagoHecho | null>(null);
  const [fallo, setFallo] = useState("");
  const nodo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bajando) return;
    let vivo = true;
    const el = nodo.current;
    void (async () => {
      const ok = el ? await descargarComoImagen(el, nombreArchivo(bajando)) : false;
      if (!vivo) return;
      if (!ok) setFallo("No se pudo preparar el comprobante. Probá de nuevo.");
      setBajando(null);
    })();
    return () => {
      vivo = false;
    };
  }, [bajando]);

  return {
    bajar: (p) => {
      setFallo("");
      setBajando(p);
    },
    bajando,
    fallo,
    oculto: bajando ? (
      <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0 }}>
        <div ref={nodo}>
          <Comprobante d={d} p={bajando} />
        </div>
      </div>
    ) : null,
  };
}
