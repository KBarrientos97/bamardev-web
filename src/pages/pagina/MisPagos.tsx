import { useEffect, useRef, useState } from "react";
import type { EstadoCuentaPublico, PagoHecho } from "../../lib/academia/tipos";
import { descargarComoImagen } from "../../lib/compartirTicket";
import { Icon } from "../../components/Icon";

const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Cuántos pagos se ven sin tocar «Ver todos». */
const VISIBLES = 3;

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
 * «Tus pagos» (24-nov): los pagos que el estudiante ya hizo, con su
 * comprobante para bajar como evidencia. Es el mismo recibo que le da la caja,
 * armado con lo que el backend ya manda en el estado de cuenta; no hay nada que
 * pedir ni subir. Un pago anulado no figura (el backend no lo manda).
 */
export default function MisPagos({ d, color, className = "" }: { d: EstadoCuentaPublico; color: string; className?: string }) {
  const pagos = d.pagosHechos ?? [];
  const [todos, setTodos] = useState(false);
  /** El pago cuyo comprobante se está armando: se dibuja fuera de la vista, se rasteriza y se descarta. */
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

  if (!pagos.length) return null;
  const vistos = todos ? pagos : pagos.slice(0, VISIBLES);

  return (
    <section aria-labelledby="t-pagos" className={`overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm ${className}`}>
      <h2 id="t-pagos" className="border-b border-[#E5E7EB] px-5 py-3.5 text-sm font-bold text-[#111827]">
        Tus pagos
      </h2>
      <ul className="divide-y divide-[#F1F5F9] px-5">
        {vistos.map((p) => (
          <li key={`${p.comprobante}-${p.fecha}`} className="space-y-2 py-3">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#111827]">{p.conceptos.map((c) => c.concepto).join(" · ")}</span>
                <span className="mt-0.5 block text-[12px] text-[#6B7280]">
                  {cuando(p.fecha)} · {p.comprobante}
                  {p.formas.length > 0 ? ` · ${p.formas.join(" + ")}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-[#047857]">{bs(p.total)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFallo("");
                setBajando(p);
              }}
              disabled={bajando != null}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border bg-white text-[13px] font-semibold hover:bg-[#F9FAFB] disabled:opacity-60"
              style={{ color, borderColor: color }}
              aria-label={`Descargar comprobante ${p.comprobante}`}
            >
              <Icon name="download" size={15} />
              {bajando === p ? "Preparando…" : "Descargar comprobante"}
            </button>
          </li>
        ))}
      </ul>
      {pagos.length > VISIBLES && (
        <button
          type="button"
          onClick={() => setTodos((t) => !t)}
          className="block w-full border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3 text-center text-[13px] font-semibold"
          style={{ color }}
        >
          {todos ? "Ver menos" : `Ver todos (${pagos.length})`}
        </button>
      )}
      {fallo && (
        <p role="alert" className="border-t border-[#FECACA] bg-[#FEF2F2] px-5 py-2.5 text-[13px] text-[#B91C1C]">
          {fallo}
        </p>
      )}
      {/* Fuera de la vista, no escondido: una imagen no sale de algo con display:none. */}
      {bajando && (
        <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0 }}>
          <div ref={nodo}>
            <Comprobante d={d} p={bajando} />
          </div>
        </div>
      )}
    </section>
  );
}
