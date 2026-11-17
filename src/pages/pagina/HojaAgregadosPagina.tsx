import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { iconoPorLlave } from "../../lib/iconosArticulo";
import { gruposDelProducto, textoIncluye, vistaDeAgregados } from "../../lib/agregados/calculo";
import { elegidosDeToques, toquesDeElegidos, type Toque } from "../../lib/agregados/toques";
import type { AgregadoElegido, CatalogoAgregados } from "../../lib/agregados/tipos";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import type { Paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { Trazo } from "./PedidoPagina";

/**
 * La hoja de toppings de la página del cliente (PLAN-AGREGADOS §8.3): la del
 * punto de venta (`pos/HojaAgregados`) adaptada a lo que ve un cliente. Se abre
 * al tocar «Agregar» en un vaso que lleva toppings y también al tocar los
 * toppings de una línea del carrito, para cambiarlos.
 *
 * La página pública no lee el tema de la app: va con estilos en línea, el color
 * del negocio y botones de 44 px, pensada para el celular (hoja que sube desde
 * abajo; en la computadora, un cuadro al centro).
 *
 * Muestra lo mismo que va a cobrar el backend (`vistaDeAgregados` es su misma
 * regla): «2 de 2 incluidos», los extras con su precio y el total en vivo. Se
 * puede seguir sin toppings: el vaso se pide igual, al precio de la carta.
 */

const ICONO_MAS = "M12 5v14M5 12h14";
const ICONO_MENOS = "M5 12h14";
const FAMILIA = "Roboto, system-ui, sans-serif";

export interface PropsHojaAgregados {
  /** El ítem de la carta: su `id` es el que el JSON público usa para decir qué grupos lleva. */
  itemId: number;
  titulo: string;
  /** El precio del vaso en el local elegido; null si es «a consultar». */
  precio: number | null;
  catalogo: CatalogoAgregados;
  /** Opciones que el local elegido no ofrece o tiene agotadas: se ven, deshabilitadas. */
  agotadas: ReadonlySet<number>;
  /** Los toppings de la línea que se edita; sin esto, una hoja vacía. */
  inicial?: AgregadoElegido[];
  /** Cuántos vasos iguales tiene la línea que se edita (todos toman los toppings nuevos). */
  vasos?: number;
  /** Se está cambiando una línea del carrito: el botón dice «Guardar cambios». */
  editando?: boolean;
  c: Paleta;
  onConfirmar: (elegidos: AgregadoElegido[]) => void;
  onCerrar: () => void;
}

export default function HojaAgregadosPagina({ itemId, titulo, precio, catalogo, agotadas, inicial, vasos = 1, editando = false, c, onConfirmar, onCerrar }: PropsHojaAgregados) {
  const grupos = useMemo(() => gruposDelProducto(catalogo, itemId), [catalogo, itemId]);
  const [toques, setToques] = useState<Toque[]>(() => toquesDeElegidos(inicial));
  const cerrar = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLDivElement>(null);

  const elegidos = useMemo(() => elegidosDeToques(toques), [toques]);
  const vista = useMemo(() => vistaDeAgregados(elegidos, itemId, catalogo), [elegidos, itemId, catalogo]);
  const total = precio != null ? Math.round((precio + vista.extraPorUnidad) * 100) / 100 : null;
  const hechos = toques.length;

  // Foco adentro al abrir, Escape cierra y el foco no se escapa a la página de atrás.
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cerrar.current?.focus();
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Que el Escape de la hoja no cierre también el carrito que la abrió.
        e.stopImmediatePropagation();
        alCerrar.current();
      } else if (e.key === "Tab") {
        const lista = Array.from(caja.current?.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]") ?? []);
        if (!lista.length) return;
        const primero = lista[0];
        const ultimo = lista[lista.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    // En captura: antes que el listener del carrito de atrás.
    document.addEventListener("keydown", alTecla, true);
    return () => {
      document.removeEventListener("keydown", alTecla, true);
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  const cuantos = (grupoId: number, productoId: number) => toques.filter((t) => t.grupoId === grupoId && t.productoId === productoId).length;
  const sumar = (grupoId: number, productoId: number) => setToques((t) => [...t, { grupoId, productoId }]);
  const restar = (grupoId: number, productoId: number) =>
    setToques((t) => {
      // Se saca el ÚLTIMO toque de ese topping: lo que se eligió antes conserva su lugar.
      const i = t.map((x) => x.grupoId === grupoId && x.productoId === productoId).lastIndexOf(true);
      return i < 0 ? t : [...t.slice(0, i), ...t.slice(i + 1)];
    });

  const redondo: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 999,
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flex: "none",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Toppings de ${titulo}`}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(17,24,39,.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <style>{`@media (min-width:720px){.hoja-toppings{border-radius:20px!important;margin-bottom:5dvh}}`}</style>
      <div
        ref={caja}
        className="hoja-toppings"
        style={{
          background: "#ffffff",
          width: "min(520px, 100%)",
          maxHeight: "92dvh",
          borderRadius: "20px 20px 0 0",
          fontFamily: FAMILIA,
          color: "#1F2937",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <header style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px 12px", borderBottom: "1px solid #F1F2F4" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, lineHeight: 1.25 }}>{titulo}</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#4B5563" }}>
              {[precio != null ? formatoPrecio(precio) : null, ...grupos.map((g) => textoIncluye(g.grupo.nombre, g.incluidos))].filter(Boolean).join(" · ")}
              {grupos.some((g) => g.grupo.precioExtra == null) && grupos.length > 0 ? " · extra al precio del topping" : ""}
            </p>
            {vasos > 1 && (
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6B7280" }}>Valen para tus {vasos} vasos iguales.</p>
            )}
          </div>
          <button
            ref={cerrar}
            type="button"
            aria-label="Cerrar la hoja de toppings"
            onClick={onCerrar}
            style={{ ...redondo, width: 40, height: 40, background: "#F3F4F6", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "#374151" }}
          >
            ×
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 18, flex: 1, minHeight: 0 }}>
          {grupos.map(({ grupo, incluidos }) => {
            const deEste = toques.filter((t) => t.grupoId === grupo.id).length;
            const extras = Math.max(0, deEste - incluidos);
            const alMaximo = grupo.maximo != null && deEste >= grupo.maximo;
            return (
              <section key={grupo.id} aria-label={grupo.nombre}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{grupo.nombre}</h3>
                  <span style={{ fontSize: 12.5, color: "#6B7280" }}>
                    {grupo.precioExtra != null ? `Extra a ${formatoPrecio(grupo.precioExtra)} c/u` : "Extra al precio de cada uno"}
                  </span>
                </div>
                <p
                  role="status"
                  style={{
                    margin: "0 0 8px",
                    borderRadius: 12,
                    padding: "9px 12px",
                    fontSize: 14,
                    fontWeight: 700,
                    background: extras > 0 ? "#FEF3C7" : c.tinte,
                    color: extras > 0 ? "#92400E" : c.oscuro,
                  }}
                >
                  {incluidos > 0 ? `${Math.min(deEste, incluidos)} de ${incluidos} incluidos` : "Sin toppings incluidos"}
                  {extras > 0 && ` · ${extras} ${extras === 1 ? "extra" : "extras"}`}
                  {grupo.maximo != null && ` · hasta ${grupo.maximo}`}
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid #E5E7EB", borderRadius: 14, overflow: "hidden" }}>
                  {grupo.opciones.map((o, i) => {
                    const n = cuantos(grupo.id, o.productoId);
                    const agotada = agotadas.has(o.productoId);
                    const sinSumar = alMaximo || agotada;
                    return (
                      <li
                        key={o.productoId}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderTop: i ? "1px solid #F1F2F4" : "none", opacity: agotada && n === 0 ? 0.6 : 1 }}
                      >
                        <FotoOpcion nombre={o.nombre} icono={o.icono} foto={o.foto ?? null} c={c} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{o.nombre}</span>
                          <span style={{ display: "block", fontSize: 13, color: agotada ? "#B91C1C" : "#6B7280", fontWeight: agotada ? 700 : 400 }}>
                            {agotada ? "Agotado en este local" : formatoPrecio(grupo.precioExtra != null ? grupo.precioExtra : o.precio)}
                          </span>
                        </span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, background: c.tinte, borderRadius: 999, padding: 2, flex: "none" }}>
                          <button
                            type="button"
                            onClick={() => restar(grupo.id, o.productoId)}
                            disabled={n === 0}
                            aria-label={`Quitar ${o.nombre}`}
                            style={{ ...redondo, background: "#ffffff", opacity: n === 0 ? 0.35 : 1, cursor: n === 0 ? "default" : "pointer" }}
                          >
                            <Trazo d={ICONO_MENOS} color={c.oscuro} size={18} grosor={2.4} />
                          </button>
                          <span aria-label={`${o.nombre}: ${n}`} style={{ minWidth: 24, textAlign: "center", fontWeight: 800, fontSize: 16, color: c.oscuro }}>
                            {n}
                          </span>
                          <button
                            type="button"
                            onClick={() => sumar(grupo.id, o.productoId)}
                            disabled={sinSumar}
                            aria-label={`Agregar ${o.nombre}`}
                            style={{ ...redondo, background: c.oscuro, opacity: sinSumar ? 0.35 : 1, cursor: sinSumar ? "default" : "pointer" }}
                          >
                            <Trazo d={ICONO_MAS} color="#ffffff" size={18} grosor={2.4} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {vista.hijas.some((h) => !h.incluido) && (
            <dl style={{ margin: 0, background: "#F3F4F6", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, fontSize: 14, color: "#374151" }}>
              {vista.hijas
                .filter((h) => !h.incluido)
                .map((h) => (
                  <div key={`${h.productoId}-${h.precio}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <dt>
                      Extra: {h.cantidad > 1 ? `${h.cantidad} × ` : ""}
                      {h.nombre}
                    </dt>
                    <dd style={{ margin: 0, fontWeight: 800, color: "#111827" }}>{formatoPrecio(h.subtotal)}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>

        <footer
          style={{
            borderTop: "1px solid #E5E7EB",
            padding: "12px 18px calc(12px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "#ffffff",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6B7280" }}>Total</p>
            <p aria-live="polite" data-testid="total-hoja" style={{ margin: 0, fontSize: 22, fontWeight: 800, whiteSpace: "nowrap" }}>
              {total != null ? formatoPrecio(total) : "A consultar"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onConfirmar(elegidos)}
            style={{
              flex: 1,
              minHeight: 52,
              border: "none",
              borderRadius: 14,
              background: c.oscuro,
              color: "#ffffff",
              fontFamily: "inherit",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              padding: "0 14px",
            }}
          >
            {editando ? "Guardar cambios" : hechos === 0 ? "Agregar sin toppings" : "Agregar al pedido"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FotoOpcion({ nombre, icono, foto, c }: { nombre: string; icono: string | null; foto: string | null; c: Paleta }) {
  const [fallo, setFallo] = useState<string | null>(null);
  const url = urlDeImagen(foto);
  const delIcono = iconoPorLlave(icono);
  const src = url && fallo !== url ? url : delIcono && fallo !== delIcono.src ? delIcono.src : null;
  return (
    <span
      aria-hidden="true"
      style={{
        width: 44,
        height: 44,
        flex: "none",
        borderRadius: 12,
        overflow: "hidden",
        background: c.tinte,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: c.oscuro,
        fontWeight: 800,
        fontSize: 18,
      }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" onError={() => setFallo(src)} style={{ width: "78%", height: "78%", objectFit: "contain", display: "block" }} />
      ) : (
        nombre.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}
