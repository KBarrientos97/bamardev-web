import { useEffect, useRef, useState, type CSSProperties } from "react";
import { iconoPorLlave } from "../../lib/iconosArticulo";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { ICONO_RED, paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio, urlWhatsappConTexto } from "../../lib/pagina/catalogo";
import {
  cantidadTotal,
  mensajePedido,
  subtotalLinea,
  totalPedido,
  type DatosPedido,
  type LineaPedido,
} from "../../lib/pagina/pedido";
import type { Pedido } from "../../lib/pagina/usePedido";
import type { ContactoWhatsapp } from "../../lib/pagina/whatsapp";
import { conMayuscula, termino } from "../../lib/rubro";
import { ElegirDestino } from "./EleccionWhatsapp";

/**
 * El pedido de la página (IDEAS/6 #1). Rehecho el 09-nov a pedido del dueño:
 * la burbuja de la esquina pasó a ser una barra a todo el ancho, abajo (la
 * que se usa en las apps de delivery: se ve, se toca con el pulgar y dice
 * cuánto lleva), y el panel muestra cada línea con su foto y subtotal, con el
 * total y «Enviar» siempre a la vista al pie. El estado vive en `usePedido`.
 */

const VERDE_WHATSAPP = "#0C7A55";
const FAMILIA = "Roboto, system-ui, sans-serif";

/** Nombre, entrega y dirección se recuerdan en este navegador para la próxima vez (no la nota). */
function claveDatos(sub: string) {
  return `pedido-datos:${sub}`;
}

function leerDatos(sub: string | undefined): DatosPedido {
  const vacio: DatosPedido = {
    nombre: "",
    entrega: "RETIRO",
    direccion: "",
    nota: "",
  };
  if (!sub) return vacio;
  try {
    const v = JSON.parse(
      localStorage.getItem(claveDatos(sub)) ?? "null",
    ) as Partial<DatosPedido> | null;
    if (!v || typeof v !== "object") return vacio;
    return {
      nombre: typeof v.nombre === "string" ? v.nombre.slice(0, 60) : "",
      entrega: v.entrega === "DELIVERY" ? "DELIVERY" : "RETIRO",
      direccion:
        typeof v.direccion === "string" ? v.direccion.slice(0, 160) : "",
      nota: "",
    };
  } catch {
    return vacio;
  }
}

function sinMovimiento(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

function useAncho(min: number): boolean {
  const consulta = `(min-width: ${min}px)`;
  const [ancho, setAncho] = useState(() => {
    try {
      return window.matchMedia(consulta).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let m: MediaQueryList;
    try {
      m = window.matchMedia(consulta);
    } catch {
      return;
    }
    const alCambiar = () => setAncho(m.matches);
    m.addEventListener?.("change", alCambiar);
    return () => m.removeEventListener?.("change", alCambiar);
  }, [consulta]);
  return ancho;
}

function Trazo({
  d,
  color,
  size = 18,
  grosor = 2.2,
}: {
  d: string;
  color: string;
  size?: number;
  grosor?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICONO_MAS = "M12 5v14M5 12h14";
const ICONO_MENOS = "M5 12h14";
const ICONO_TACHO = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";
const ICONO_SEGUIR = "M9 6l6 6-6 6";
const ICONO_BOLSA = "M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2";

export default function PedidoPagina({
  negocio,
  color,
  destinos,
  pedido,
  sucursal,
  rubro,
  subdominio,
  asistente = false,
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
  /** El rubro de la página: en el instituto el local es una «sede» (Lista 2 #9). */
  rubro?: string | null;
  /** Para recordar nombre y dirección en este navegador. */
  subdominio?: string;
  /** Con el chat del asistente abajo a la derecha, la barra le deja su lugar. */
  asistente?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [destinoElegido, setDestino] = useState<string | null>(null);
  const [datos, setDatosCrudos] = useState<DatosPedido>(() =>
    leerDatos(subdominio),
  );
  const [intento, setIntento] = useState(false);
  const barra = useRef<HTMLButtonElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const ancho = useAncho(720);
  const { lineas } = pedido;
  const cantidad = cantidadTotal(lineas);
  const { total, aConfirmar } = totalPedido(lineas);
  // El color del negocio oscurecido: el blanco encima se lee siempre (lavanda, amarillo…).
  const fuerte = paleta(color).oscuro;
  const tinte = paleta(color).tinte;

  const setDatos = (d: DatosPedido) => {
    setDatosCrudos(d);
    if (!subdominio) return;
    try {
      localStorage.setItem(
        claveDatos(subdominio),
        JSON.stringify({
          nombre: d.nombre,
          entrega: d.entrega,
          direccion: d.direccion,
        }),
      );
    } catch {
      // Sin storage: se piden de nuevo la próxima vez.
    }
  };

  useEffect(() => {
    if (!abierto) return;
    cerrar.current?.focus();
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTecla);
    // Que la página de atrás no se mueva mientras se arma el pedido.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTecla);
      document.body.style.overflow = antes;
    };
  }, [abierto]);

  // Un saltito de la barra cada vez que suma algo: se nota que entró.
  const previa = useRef(cantidad);
  useEffect(() => {
    const subio = cantidad > previa.current;
    previa.current = cantidad;
    if (!subio || sinMovimiento()) return;
    barra.current?.animate?.(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.04)" },
        { transform: "scale(1)" },
      ],
      { duration: 260, easing: "ease-out" },
    );
  }, [cantidad]);

  // Se vació desde el panel: se cierra solo.
  useEffect(() => {
    if (abierto && !lineas.length) setAbierto(false);
  }, [abierto, lineas.length]);

  if (!cantidad && !abierto) return null;

  const totalTexto =
    total > 0
      ? `${formatoPrecio(total)}${aConfirmar ? " +" : ""}`
      : "a confirmar";
  // Se recuerda por URL: con otra sucursal elegida en el catálogo cambia la
  // lista, y una elección vieja no apunta a otro número.
  const destino =
    destinos.length === 1
      ? destinos[0]
      : (destinos.find((d) => d.url === destinoElegido) ?? null);
  // La sucursal del mensaje: la elegida en el catálogo o, si se eligió a qué
  // WhatsApp mandarlo, ésa (el general no es una sucursal).
  const sucursalMensaje =
    sucursal ??
    (destinos.length > 1 && destino && destino.etiqueta !== "General"
      ? destino.etiqueta
      : null);
  // «Sede» en el instituto, «sucursal» en los demás rubros (Lista 2 #9).
  const palabraSucursal = termino(rubro, "sucursal");
  const url = destino
    ? urlWhatsappConTexto(
        destino.url,
        mensajePedido(
          negocio,
          lineas,
          datos,
          sucursalMensaje,
          conMayuscula(palabraSucursal),
        ),
      )
    : undefined;
  const faltaDireccion =
    datos.entrega === "DELIVERY" && datos.direccion.trim().length < 5;
  const bloqueado = !lineas.length || faltaDireccion || !destino;
  // Qué falta, dicho: un botón gris sin explicación no ayuda a nadie.
  const falta = faltaDireccion
    ? "Escribí la dirección para el delivery."
    : !destino
      ? `Elegí a qué ${palabraSucursal} lo mandás.`
      : null;
  const etiquetaCantidad = `${cantidad} ${cantidad === 1 ? "producto" : "productos"}`;

  if (!abierto) {
    return (
      <button
        ref={barra}
        type="button"
        data-testid="barra-pedido"
        onClick={() => {
          setIntento(false);
          setAbierto(true);
        }}
        aria-label={`Ver tu pedido: ${etiquetaCantidad}, ${totalTexto}`}
        style={{
          position: "fixed",
          left: 12,
          right: asistente ? 88 : 12,
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          margin: "0 auto",
          maxWidth: 560,
          zIndex: 50,
          minHeight: 56,
          border: "none",
          borderRadius: 16,
          background: fuerte,
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px 8px 10px",
          boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
          fontFamily: FAMILIA,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "relative",
            width: 40,
            height: 40,
            flex: "none",
            borderRadius: 12,
            background: "rgba(255,255,255,0.16)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Trazo d={ICONO_BOLSA} color="#ffffff" size={22} />
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 20,
              height: 20,
              padding: "0 5px",
              boxSizing: "border-box",
              borderRadius: 999,
              background: "#ffffff",
              color: fuerte,
              fontSize: 12,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {cantidad}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            lineHeight: 1.2,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 800 }}>Ver tu pedido</span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            {etiquetaCantidad}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap" }}
        >
          {totalTexto === "a confirmar" ? "A confirmar" : totalTexto}
        </span>
        <Trazo d={ICONO_SEGUIR} color="#ffffff" size={18} grosor={2.6} />
      </button>
    );
  }

  const campo: CSSProperties = {
    border: "1px solid #D1D5DB",
    borderRadius: 12,
    padding: "12px 14px",
    // 16 px: con menos, el iPhone agranda la página al enfocar.
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    color: "#1F2937",
    background: "#ffffff",
  };
  const etiqueta: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: "#4B5563",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tu pedido"
      onClick={(e) => e.target === e.currentTarget && setAbierto(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(17,24,39,.5)",
        display: "flex",
        alignItems: ancho ? "center" : "flex-end",
        justifyContent: "center",
        padding: ancho ? 24 : 0,
      }}
    >
      <section
        style={{
          background: "#ffffff",
          width: "min(520px, 100%)",
          maxHeight: ancho ? "88dvh" : "94dvh",
          borderRadius: ancho ? 20 : "20px 20px 0 0",
          fontFamily: FAMILIA,
          color: "#1F2937",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 18px 12px",
            borderBottom: "1px solid #F1F2F4",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
              Tu pedido
            </h2>
            <span style={{ fontSize: 13, color: "#6B7280" }}>
              {etiquetaCantidad} · {negocio}
            </span>
          </div>
          <button
            ref={cerrar}
            type="button"
            aria-label="Cerrar el pedido"
            onClick={() => setAbierto(false)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "none",
              background: "#F3F4F6",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: "#374151",
            }}
          >
            ×
          </button>
        </header>

        <div
          style={{
            overflowY: "auto",
            padding: "14px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            flex: 1,
            minHeight: 0,
          }}
        >
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {lineas.map((l) => (
              <LineaCarrito
                key={l.id}
                l={l}
                fuerte={fuerte}
                tinte={tinte}
                pedido={pedido}
              />
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            style={{
              alignSelf: "flex-start",
              border: "none",
              background: "transparent",
              color: fuerte,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              padding: "2px 0",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "inherit",
            }}
          >
            <Trazo d={ICONO_MAS} color={fuerte} size={16} grosor={2.6} />
            Agregar más productos
          </button>

          <fieldset
            style={{
              border: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <legend style={{ ...etiqueta, marginBottom: 8, padding: 0 }}>
              ¿Cómo lo recibís?
            </legend>
            <div
              style={{
                display: "flex",
                gap: 6,
                background: "#F3F4F6",
                borderRadius: 14,
                padding: 4,
              }}
            >
              {(["RETIRO", "DELIVERY"] as const).map((e) => {
                const activo = datos.entrega === e;
                return (
                  <label
                    key={e}
                    style={{
                      flex: 1,
                      borderRadius: 11,
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontSize: 15,
                      fontWeight: activo ? 700 : 500,
                      textAlign: "center",
                      background: activo ? "#ffffff" : "transparent",
                      boxShadow: activo ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
                      color: activo ? fuerte : "#4B5563",
                      position: "relative",
                    }}
                  >
                    <input
                      type="radio"
                      name="entrega"
                      checked={activo}
                      onChange={() => setDatos({ ...datos, entrega: e })}
                      style={{
                        position: "absolute",
                        opacity: 0,
                        pointerEvents: "none",
                      }}
                    />
                    {e === "RETIRO" ? "Paso a recoger" : "Delivery"}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {datos.entrega === "DELIVERY" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={etiqueta}>Dirección de entrega</span>
              <input
                aria-label="Dirección de entrega"
                placeholder="Calle, número y una referencia"
                value={datos.direccion}
                maxLength={160}
                autoComplete="street-address"
                onChange={(e) =>
                  setDatos({ ...datos, direccion: e.target.value })
                }
                style={{
                  ...campo,
                  borderColor:
                    intento && faltaDireccion ? "#DC2626" : "#D1D5DB",
                }}
              />
            </label>
          )}
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={etiqueta}>Tu nombre (opcional)</span>
            <input
              aria-label="Tu nombre"
              placeholder="Para que sepan de quién es"
              value={datos.nombre}
              maxLength={60}
              autoComplete="name"
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
              style={campo}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={etiqueta}>Nota (opcional)</span>
            <input
              aria-label="Nota para el negocio"
              placeholder="Sin cebolla, extra crema…"
              value={datos.nota}
              maxLength={200}
              onChange={(e) => setDatos({ ...datos, nota: e.target.value })}
              style={campo}
            />
          </label>

          {destinos.length > 1 && (
            <ElegirDestino
              opciones={destinos}
              elegido={destino ? destinos.indexOf(destino) : null}
              onElegir={(i) => setDestino(destinos[i].url)}
              color={color}
              titulo={`¿A qué ${palabraSucursal} lo mandás?`}
            />
          )}
          <button
            type="button"
            onClick={() => pedido.vaciar()}
            style={{
              alignSelf: "center",
              border: "none",
              background: "transparent",
              color: "#6B7280",
              cursor: "pointer",
              fontSize: 13,
              textDecoration: "underline",
              fontFamily: "inherit",
            }}
          >
            Vaciar pedido
          </button>
        </div>

        <footer
          style={{
            borderTop: "1px solid #E5E7EB",
            padding: `12px 18px ${ancho ? 16 : 12}px`,
            paddingBottom: ancho
              ? 16
              : "calc(12px + env(safe-area-inset-bottom, 0px))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontWeight: 800,
              fontSize: 18,
            }}
          >
            <span>Total</span>
            <span>
              {total > 0 ? formatoPrecio(total) : "A confirmar"}
              {total > 0 && aConfirmar && (
                <span
                  style={{ fontWeight: 400, fontSize: 13, color: "#6B7280" }}
                >
                  {" "}
                  + a confirmar
                </span>
              )}
            </span>
          </div>
          {intento && falta && (
            <p
              role="alert"
              style={{
                margin: 0,
                fontSize: 14,
                color: "#B91C1C",
                fontWeight: 600,
              }}
            >
              {falta}
            </p>
          )}
          <a
            href={bloqueado ? undefined : url}
            // Sin href sigue siendo «el enlace de enviar»: se toca y dice qué falta.
            role="link"
            tabIndex={0}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={bloqueado}
            onClick={(e) => {
              if (bloqueado) {
                e.preventDefault();
                setIntento(true);
              }
            }}
            style={{
              border: "none",
              borderRadius: 14,
              background: VERDE_WHATSAPP,
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 16,
              minHeight: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              textDecoration: "none",
              cursor: "pointer",
              opacity: bloqueado ? 0.55 : 1,
            }}
          >
            <Trazo
              d={ICONO_RED.WHATSAPP}
              color="#ffffff"
              size={22}
              grosor={2}
            />
            Enviar pedido por WhatsApp
          </a>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#6B7280",
              textAlign: "center",
            }}
          >
            Se abre WhatsApp con tu pedido escrito: el negocio te confirma el
            total y la entrega.
          </p>
        </footer>
      </section>
    </div>
  );
}

function LineaCarrito({
  l,
  fuerte,
  tinte,
  pedido,
}: {
  l: LineaPedido;
  fuerte: string;
  tinte: string;
  pedido: Pedido;
}) {
  const foto = urlDeImagen(l.fotoUrl ?? null);
  const icono = foto ? null : iconoPorLlave(l.icono);
  const subtotal = subtotalLinea(l);
  const redondo: CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
  };
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          flex: "none",
          borderRadius: 12,
          overflow: "hidden",
          background: tinte,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: fuerte,
          fontWeight: 800,
          fontSize: 20,
        }}
      >
        {foto ? (
          <img
            src={foto}
            alt=""
            loading="lazy"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : icono ? (
          <img
            src={icono.src}
            alt=""
            loading="lazy"
            style={{
              width: "74%",
              height: "74%",
              objectFit: "contain",
              display: "block",
            }}
          />
        ) : (
          l.titulo.trim().charAt(0).toUpperCase()
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
          {l.titulo}
        </div>
        <div style={{ fontSize: 13, color: "#6B7280" }}>
          {formatoPrecio(l.precio, l.desde) ?? "Precio a consultar"}
          {subtotal != null && l.cantidad > 1 && (
            <span style={{ color: "#111827", fontWeight: 700 }}>
              {" "}
              · {formatoPrecio(subtotal)}
            </span>
          )}
        </div>
      </div>
      {l.servicio ? (
        // Un servicio va una vez: sólo se puede quitar.
        <button
          type="button"
          aria-label={`Quitar ${l.titulo} del pedido`}
          onClick={() => pedido.cambiar(l.id, -1)}
          style={{ ...redondo, background: tinte, flex: "none" }}
        >
          <Trazo d={ICONO_TACHO} color={fuerte} size={16} grosor={2.4} />
        </button>
      ) : (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: tinte,
            borderRadius: 999,
            padding: 3,
            flex: "none",
          }}
        >
          <button
            type="button"
            aria-label={`Quitar uno de ${l.titulo}`}
            onClick={() => pedido.cambiar(l.id, -1)}
            style={{ ...redondo, background: "#ffffff" }}
          >
            <Trazo
              d={l.cantidad === 1 ? ICONO_TACHO : ICONO_MENOS}
              color={fuerte}
              size={16}
              grosor={2.4}
            />
          </button>
          <span
            aria-label={`Cantidad de ${l.titulo}`}
            style={{
              minWidth: 22,
              textAlign: "center",
              fontWeight: 800,
              color: fuerte,
            }}
          >
            {l.cantidad}
          </span>
          <button
            type="button"
            aria-label={`Sumar uno de ${l.titulo}`}
            onClick={() => pedido.cambiar(l.id, 1)}
            style={{ ...redondo, background: fuerte }}
          >
            <Trazo d={ICONO_MAS} color="#ffffff" size={16} grosor={2.4} />
          </button>
        </div>
      )}
    </li>
  );
}
