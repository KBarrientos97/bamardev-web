import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatoPrecio, urlWhatsappConTexto } from "../../lib/pagina/catalogo";
import { cantidadTotal, mensajePedido, totalPedido, type DatosPedido } from "../../lib/pagina/pedido";
import type { Pedido } from "../../lib/pagina/usePedido";
import type { ContactoWhatsapp } from "../../lib/pagina/whatsapp";
import { ElegirDestino } from "./EleccionWhatsapp";

/**
 * El pedido de la página (IDEAS/6 #1): el botón flotante muestra cuánto
 * lleva y el panel arma el mensaje para el WhatsApp del negocio. El estado
 * vive en `usePedido`.
 */

const boton = (color: string): CSSProperties => ({
  border: "none",
  borderRadius: 999,
  background: color,
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 15,
  padding: "12px 18px",
  cursor: "pointer",
});

export default function PedidoPagina({
  negocio,
  color,
  destinos,
  pedido,
  sucursal,
}: {
  negocio: string;
  color: string;
  /**
   * A qué WhatsApp puede ir el pedido (sin ninguno, no hay carrito). Con uno,
   * directo; con varios (sucursales con su número, 13-oct), el cliente elige.
   */
  destinos: ContactoWhatsapp[];
  pedido: Pedido;
  /** La sucursal elegida en el catálogo, si hay más de una: de ella son los precios. */
  sucursal?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [destinoElegido, setDestino] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosPedido>({ nombre: "", entrega: "RETIRO", direccion: "", nota: "" });
  const burbuja = useRef<HTMLButtonElement>(null);
  const { lineas } = pedido;
  const cantidad = cantidadTotal(lineas);
  const { total, aConfirmar } = totalPedido(lineas);

  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [abierto]);

  if (!cantidad && !abierto) return null;

  const totalTexto = total > 0 ? `${formatoPrecio(total)}${aConfirmar ? " +" : ""}` : "a confirmar";
  // Se recuerda por URL: con otra sucursal elegida en el catálogo cambia la
  // lista, y una elección vieja no apunta a otro número.
  const destino = destinos.length === 1 ? destinos[0] : (destinos.find((d) => d.url === destinoElegido) ?? null);
  // La sucursal del mensaje: la elegida en el catálogo o, si se eligió a qué
  // WhatsApp mandarlo, ésa (el general no es una sucursal).
  const sucursalMensaje = sucursal ?? (destinos.length > 1 && destino && destino.etiqueta !== "General" ? destino.etiqueta : null);
  const url = destino ? urlWhatsappConTexto(destino.url, mensajePedido(negocio, lineas, datos, sucursalMensaje)) : undefined;
  const faltaDireccion = datos.entrega === "DELIVERY" && datos.direccion.trim().length < 5;
  const bloqueado = !lineas.length || faltaDireccion || !destino;

  if (!abierto) {
    return (
      <button
        ref={burbuja}
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Ver tu pedido: ${cantidad} ${cantidad === 1 ? "producto" : "productos"}, ${totalTexto}`}
        style={{
          ...boton(color),
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 50,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 6px 20px rgba(0,0,0,.2)",
          fontFamily: "Roboto, system-ui, sans-serif",
        }}
      >
        <span
          style={{ background: "#ffffff", color, borderRadius: 999, minWidth: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}
        >
          {cantidad}
        </span>
        Tu pedido · {totalTexto}
      </button>
    );
  }

  const campo: CSSProperties = { border: "1px solid #D1D5DB", borderRadius: 10, padding: "10px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tu pedido"
      onClick={(e) => e.target === e.currentTarget && setAbierto(false)}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <section
        style={{
          background: "#ffffff",
          width: "min(520px, 100%)",
          maxHeight: "92dvh",
          overflowY: "auto",
          borderRadius: "18px 18px 0 0",
          padding: 18,
          fontFamily: "Roboto, system-ui, sans-serif",
          color: "#1F2937",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Tu pedido</h2>
          <button type="button" aria-label="Cerrar el pedido" onClick={() => setAbierto(false)} style={{ border: "none", background: "transparent", fontSize: 24, cursor: "pointer" }}>
            ×
          </button>
        </header>

        {!lineas.length ? (
          <p style={{ margin: 0, color: "#6B7280" }}>Todavía no agregaste nada. Tocá un producto del catálogo para sumarlo.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {lineas.map((l) => (
              <li key={l.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{l.titulo}</div>
                  <div style={{ fontSize: 13, color: "#6B7280" }}>{formatoPrecio(l.precio, l.desde) ?? "Precio a consultar"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" aria-label={`Quitar uno de ${l.titulo}`} onClick={() => pedido.cambiar(l.id, -1)} style={cantidadBoton(color)}>
                    −
                  </button>
                  <span aria-label={`Cantidad de ${l.titulo}`} style={{ minWidth: 22, textAlign: "center", fontWeight: 700 }}>
                    {l.cantidad}
                  </span>
                  <button type="button" aria-label={`Sumar uno de ${l.titulo}`} onClick={() => pedido.cambiar(l.id, 1)} style={cantidadBoton(color)}>
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid #E5E7EB", paddingTop: 10 }}>
          <span>Total</span>
          <span>
            {total > 0 ? formatoPrecio(total) : "A confirmar"}
            {total > 0 && aConfirmar && <span style={{ fontWeight: 400, fontSize: 13, color: "#6B7280" }}> + a confirmar</span>}
          </span>
        </div>

        <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", gap: 8 }}>
          <legend style={{ fontSize: 13, color: "#4B5563", marginBottom: 6 }}>¿Cómo lo recibís?</legend>
          {(["RETIRO", "DELIVERY"] as const).map((e) => (
            <label
              key={e}
              style={{
                flex: 1,
                border: `1.5px solid ${datos.entrega === e ? color : "#D1D5DB"}`,
                borderRadius: 10,
                padding: "10px 12px",
                cursor: "pointer",
                fontSize: 14,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <input type="radio" name="entrega" checked={datos.entrega === e} onChange={() => setDatos({ ...datos, entrega: e })} />
              {e === "RETIRO" ? "Paso a recoger" : "Delivery"}
            </label>
          ))}
        </fieldset>
        {datos.entrega === "DELIVERY" && (
          <input aria-label="Dirección de entrega" placeholder="Dirección y referencia" value={datos.direccion} maxLength={160} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} style={campo} />
        )}
        <input aria-label="Tu nombre" placeholder="Tu nombre (opcional)" value={datos.nombre} maxLength={60} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} style={campo} />
        <input aria-label="Nota para el negocio" placeholder="Nota (sin cebolla, extra crema…)" value={datos.nota} maxLength={200} onChange={(e) => setDatos({ ...datos, nota: e.target.value })} style={campo} />

        {destinos.length > 1 && (
          <ElegirDestino
            opciones={destinos}
            elegido={destino ? destinos.indexOf(destino) : null}
            onElegir={(i) => setDestino(destinos[i].url)}
            color={color}
          />
        )}
        <a
          href={bloqueado ? undefined : url}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={bloqueado}
          onClick={(e) => {
            if (bloqueado) e.preventDefault();
          }}
          style={{
            ...boton(color),
            textAlign: "center",
            textDecoration: "none",
            opacity: bloqueado ? 0.5 : 1,
          }}
        >
          Enviar pedido por WhatsApp
        </a>
        <p style={{ margin: 0, fontSize: 12, color: "#6B7280", textAlign: "center" }}>
          Se abre WhatsApp con tu pedido escrito: el negocio te confirma el total y la entrega.
        </p>
        {lineas.length > 0 && (
          <button type="button" onClick={() => pedido.vaciar()} style={{ border: "none", background: "transparent", color: "#6B7280", cursor: "pointer", fontSize: 13 }}>
            Vaciar pedido
          </button>
        )}
      </section>
    </div>
  );
}

function cantidadBoton(color: string): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 999,
    border: `1.5px solid ${color}`,
    background: "#ffffff",
    color,
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
  };
}
