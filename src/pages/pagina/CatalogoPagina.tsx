import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as EventoPuntero } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import type { Paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { GRIS_PAGINA } from "../../lib/pagina/estilos";
import type { CatalogoPublico, ItemCatalogoPublico } from "../../lib/pagina/tipos";

/**
 * El catálogo de la página pública (08-oct): la grilla de fotos con título y
 * precio, y el visor que se abre al tocar una. Como VistaPagina, con estilos
 * en línea (la página no lee el tema de la app) y armado según el modo que
 * mide VistaPagina, no según la ventana: así sirve igual dentro del marco del
 * celular o de la computadora del editor.
 */

const GRIS = GRIS_PAGINA;

/** El botón del visor: "Reservar" o "Consultar por WhatsApp", con la forma de la página. */
export interface AccionCatalogo {
  texto: string;
  /** El trazo del ícono (24×24). */
  icono: string;
  /** A dónde lleva, según el ítem (el WhatsApp lleva el título en el mensaje). */
  href: (item: ItemCatalogoPublico) => string;
  alClic?: () => void;
}

interface Props {
  catalogo: CatalogoPublico;
  c: Paleta;
  escritorio: boolean;
  /** En el marco del editor: no se bloquea el scroll de la ventana del editor. */
  enMarco: boolean;
  /** Radio de las tarjetas, según la forma de los botones. */
  radio: CSSProperties["borderRadius"];
  accion: AccionCatalogo | null;
  /** El estilo del botón grande de la página (forma, color, tamaño). */
  estiloBoton: CSSProperties;
  colorIconoBoton: string;
}

function Icono({ d, color, size = 20 }: { d: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Sin foto: el tinte del color de la página con la inicial del título. */
function SinFoto({ item, c, tamano }: { item: ItemCatalogoPublico; c: Paleta; tamano: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        height: "100%",
        background: c.tinte,
        color: c.oscuro,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: tamano,
        fontWeight: 700,
      }}
    >
      {item.titulo.trim().charAt(0).toUpperCase()}
    </div>
  );
}

/** La descripción cortada en dos líneas (el resto, en el visor). */
const dosLineas: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

export default function CatalogoPagina({ catalogo, c, escritorio, enMarco, radio, accion, estiloBoton, colorIconoBoton }: Props) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const idTitulo = useId();
  const items = catalogo.items;
  // El catálogo cambia en vivo en la vista previa: un ítem que se oculta con
  // el visor abierto no lo deja apuntando a la nada.
  const indice = abierto != null && abierto < items.length ? abierto : null;

  return (
    <section aria-labelledby={idTitulo} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <h2
        id={idTitulo}
        style={{ margin: escritorio ? "8px 0 0" : "10px 0 0", fontSize: escritorio ? 20 : 17, fontWeight: 700, color: GRIS.texto }}
      >
        {catalogo.titulo}
      </h2>
      <Carrusel
        items={items}
        c={c}
        escritorio={escritorio}
        radio={radio}
        detenido={indice != null}
        onAbrir={setAbierto}
      />
      {indice != null && (
        <Visor
          items={items}
          indice={indice}
          onIndice={setAbierto}
          onCerrar={() => setAbierto(null)}
          c={c}
          escritorio={escritorio}
          enMarco={enMarco}
          accion={accion}
          estiloBoton={estiloBoton}
          colorIconoBoton={colorIconoBoton}
        />
      )}
    </section>
  );
}

/** Cada cuánto pasa solo a la siguiente (pedido del dueño, 09-oct). */
export const PASO_CARRUSEL_MS = 3000;
/** Con más posiciones que esto, los puntitos no entran: va "3 / 24". */
const MAX_PUNTOS = 10;
const ESPACIO = 16;

function prefiereSinMovimiento(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * El catálogo como carrusel y no como grilla de tienda (09-oct: "no debe
 * verse como un ecommerce"): en el celular se ve uno solo y en computadora
 * hasta tres, y pasan de a uno cada 3 s. Tocarlo (o deslizarlo, o usar los
 * puntitos o las flechas) lo deja quieto ahí: el que tocó está mirando algo y
 * no se le tiene que ir. En computadora, además, se queda quieto mientras el
 * mouse o el foco están encima. Quien pidió menos movimiento al sistema no lo
 * ve pasar solo.
 */
function Carrusel({
  items,
  c,
  escritorio,
  radio,
  detenido,
  onAbrir,
}: {
  items: ItemCatalogoPublico[];
  c: Paleta;
  escritorio: boolean;
  radio: CSSProperties["borderRadius"];
  /** El visor está abierto: no pasa nada por debajo. */
  detenido: boolean;
  onAbrir: (i: number) => void;
}) {
  const n = items.length;
  const porVista = escritorio ? Math.min(3, n) : 1;
  const ultimo = Math.max(0, n - porVista);
  const [inicioCrudo, setInicio] = useState(0);
  // En la vista previa los ítems cambian en vivo: nunca queda corrido de más.
  const inicio = Math.min(inicioCrudo, ultimo);
  const [quieto, setQuieto] = useState(false);
  const [encima, setEncima] = useState(false);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const deslizo = useRef(false);

  const pasa = ultimo > 0 && !quieto && !encima && !detenido && !prefiereSinMovimiento();
  useEffect(() => {
    if (!pasa) return;
    const t = window.setInterval(() => setInicio((i) => (Math.min(i, ultimo) >= ultimo ? 0 : i + 1)), PASO_CARRUSEL_MS);
    return () => window.clearInterval(t);
  }, [pasa, ultimo]);

  const irA = (i: number) => {
    setQuieto(true);
    setInicio(Math.max(0, Math.min(ultimo, i)));
  };

  // Deslizar con el dedo: sólo cuenta un gesto bien horizontal; el vertical
  // sigue siendo el scroll de la página.
  const empezarToque = (e: EventoPuntero<HTMLDivElement>) => {
    setQuieto(true);
    toque.current = { x: e.clientX, y: e.clientY };
    deslizo.current = false;
  };
  const terminarToque = (e: EventoPuntero<HTMLDivElement>) => {
    const t = toque.current;
    toque.current = null;
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      deslizo.current = true;
      irA(inicio + (dx < 0 ? 1 : -1));
    }
  };

  // Ancho de cada tarjeta y cuánto se corre la fila: en % del ancho visible.
  const ancho = `calc((100% - ${(porVista - 1) * ESPACIO}px) / ${porVista})`;
  const corrimiento = `translateX(calc(${-inicio} * ((100% - ${(porVista - 1) * ESPACIO}px) / ${porVista} + ${ESPACIO}px)))`;
  const posiciones = ultimo + 1;
  const flecha = (lado: "izq" | "der"): CSSProperties => ({
    ...botonRedondo,
    width: 40,
    height: 40,
    position: "absolute",
    top: "38%",
    [lado === "izq" ? "left" : "right"]: -14,
    transform: "translateY(-50%)",
    zIndex: 1,
  });

  return (
    <div
      aria-roledescription="carrusel"
      onMouseEnter={() => setEncima(true)}
      onMouseLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}
    >
      <div style={{ position: "relative", minWidth: 0 }}>
        <div
          onPointerDown={empezarToque}
          onPointerUp={terminarToque}
          onPointerCancel={() => (toque.current = null)}
          style={{ overflow: "hidden", touchAction: "pan-y", borderRadius: radio }}
        >
          <div
            data-testid="fila-catalogo"
            style={{
              display: "flex",
              gap: ESPACIO,
              transform: corrimiento,
              transition: prefiereSinMovimiento() ? undefined : "transform 450ms ease",
            }}
          >
            {items.map((it, i) => {
              const precio = formatoPrecio(it.precio, it.precioDesde);
              const foto = urlDeImagen(it.fotoUrl);
              const visible = i >= inicio && i < inicio + porVista;
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-haspopup="dialog"
                  aria-roledescription="diapositiva"
                  aria-label={`${precio ? `${it.titulo}, ${precio}` : it.titulo} (${i + 1} de ${n})`}
                  aria-hidden={!visible}
                  tabIndex={visible ? 0 : -1}
                  onClick={() => {
                    // Al soltar un deslizamiento el navegador manda igual el clic.
                    if (deslizo.current) {
                      deslizo.current = false;
                      return;
                    }
                    setQuieto(true);
                    onAbrir(i);
                  }}
                  style={{
                    flex: `0 0 ${ancho}`,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    padding: 0,
                    margin: 0,
                    textAlign: "left",
                    background: "#ffffff",
                    border: `1px solid ${GRIS.borde}`,
                    borderRadius: radio,
                    overflow: "hidden",
                    cursor: "pointer",
                    font: "inherit",
                    color: GRIS.texto,
                    userSelect: "none",
                  }}
                >
                  {/* La foto va absoluta: una vertical no estira el recuadro. */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: escritorio ? "1 / 1" : "4 / 3",
                      overflow: "hidden",
                      background: c.tinte,
                    }}
                  >
                    {foto ? (
                      <img
                        src={foto}
                        alt={it.titulo}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <SinFoto item={it} c={c} tamano={56} />
                    )}
                  </div>
                  <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <strong
                      style={{ fontSize: 15, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {it.titulo}
                    </strong>
                    {precio && <span style={{ fontSize: 15, fontWeight: 700, color: c.oscuro }}>{precio}</span>}
                    {it.descripcion && (
                      <span style={{ ...dosLineas, fontSize: 13, lineHeight: 1.4, color: GRIS.texto3 }}>{it.descripcion}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* Flechas sólo en computadora: en el celular se desliza con el dedo. */}
        {escritorio && posiciones > 1 && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              disabled={inicio === 0}
              onClick={() => irA(inicio - 1)}
              style={{ ...flecha("izq"), opacity: inicio === 0 ? 0 : 1 }}
            >
              <Icono d="m15 6-6 6 6 6" color={GRIS.texto} />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              disabled={inicio === ultimo}
              onClick={() => irA(inicio + 1)}
              style={{ ...flecha("der"), opacity: inicio === ultimo ? 0 : 1 }}
            >
              <Icono d="m9 6 6 6-6 6" color={GRIS.texto} />
            </button>
          </>
        )}
      </div>

      {posiciones > 1 &&
        (posiciones <= MAX_PUNTOS ? (
          <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
            {Array.from({ length: posiciones }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ver ${items[i].titulo}`}
                aria-current={i === inicio ? "true" : undefined}
                onClick={() => irA(i)}
                // El punto se ve chico, pero el área para tocarlo no.
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: i === inicio ? 18 : 8,
                    height: 8,
                    borderRadius: 999,
                    background: i === inicio ? c.oscuro : "#B8BEC7",
                    transition: "width 200ms ease",
                  }}
                />
              </button>
            ))}
          </div>
        ) : (
          <span aria-live="off" style={{ textAlign: "center", fontSize: 13, color: GRIS.texto3 }}>
            {inicio + 1} / {posiciones}
          </span>
        ))}
    </div>
  );
}

const ENFOCABLES = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const botonRedondo: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.92)",
  color: GRIS.texto,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
  boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
};

/**
 * El visor: la foto grande y entera, el detalle y el botón de acción. Va con
 * `position: fixed`; dentro del editor, el marco de la vista previa es su
 * bloque contenedor (VistaPrevia), así que tapa el celular y no el editor.
 */
function Visor({
  items,
  indice,
  onIndice,
  onCerrar,
  c,
  escritorio,
  enMarco,
  accion,
  estiloBoton,
  colorIconoBoton,
}: {
  items: ItemCatalogoPublico[];
  indice: number;
  onIndice: (i: number) => void;
  onCerrar: () => void;
  c: Paleta;
  escritorio: boolean;
  enMarco: boolean;
  accion: AccionCatalogo | null;
  estiloBoton: CSSProperties;
  colorIconoBoton: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const deslizo = useRef(false);
  const item = items[indice];
  const n = items.length;
  const hayAnterior = indice > 0;
  const haySiguiente = indice < n - 1;
  const ir = (delta: number) => {
    const j = indice + delta;
    if (j >= 0 && j < n) onIndice(j);
  };
  // Las teclas leen siempre lo último sin volver a colgar el listener.
  const teclas = useRef({ ir, onCerrar });
  teclas.current = { ir, onCerrar };

  // Foco adentro al abrir y de vuelta en la tarjeta al cerrar.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cerrar.current?.focus();
    return () => {
      if (previo && document.contains(previo)) previo.focus();
    };
  }, []);

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        teclas.current.onCerrar();
      } else if (e.key === "ArrowLeft") teclas.current.ir(-1);
      else if (e.key === "ArrowRight") teclas.current.ir(1);
      else if (e.key === "Tab") {
        // El foco no se escapa a la página de atrás.
        const lista = Array.from(caja.current?.querySelectorAll<HTMLElement>(ENFOCABLES) ?? []);
        if (lista.length === 0) return;
        const primero = lista[0];
        const ultimo = lista[lista.length - 1];
        const activo = document.activeElement;
        if (!caja.current?.contains(activo)) {
          e.preventDefault();
          primero.focus();
        } else if (e.shiftKey && activo === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && activo === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, []);

  // En la página de verdad, la de atrás no se mueve mientras el visor está
  // abierto. En el editor no: es la ventana del editor, no la del cliente.
  useEffect(() => {
    if (enMarco) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, [enMarco]);

  // Deslizar con el dedo: sólo cuenta un gesto bien horizontal.
  const empezarToque = (e: EventoPuntero<HTMLDivElement>) => {
    toque.current = { x: e.clientX, y: e.clientY };
    deslizo.current = false;
  };
  const terminarToque = (e: EventoPuntero<HTMLDivElement>) => {
    const t = toque.current;
    toque.current = null;
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      deslizo.current = true;
      ir(dx < 0 ? 1 : -1);
    }
  };
  const alFondo = (e: React.MouseEvent) => {
    if (deslizo.current) {
      deslizo.current = false;
      return;
    }
    if (e.target === e.currentTarget) onCerrar();
  };

  const precio = formatoPrecio(item.precio, item.precioDesde);
  const foto = urlDeImagen(item.fotoUrl);
  const href = accion?.href(item);

  return (
    <div
      ref={caja}
      role="dialog"
      aria-modal="true"
      aria-label={item.titulo}
      onClick={alFondo}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(17,24,39,0.97)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Roboto, system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", color: "#ffffff" }}>
        <span aria-live="polite" style={{ fontSize: 14, fontWeight: 600, paddingLeft: 6 }}>
          {indice + 1} de {n}
        </span>
        <button ref={cerrar} type="button" aria-label="Cerrar" onClick={onCerrar} style={botonRedondo}>
          <Icono d="M6 6l12 12M18 6 6 18" color={GRIS.texto} />
        </button>
      </div>

      <div
        onClick={alFondo}
        onPointerDown={empezarToque}
        onPointerUp={terminarToque}
        onPointerCancel={() => (toque.current = null)}
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: escritorio ? "8px 72px" : "8px 12px",
          // El scroll vertical sigue siendo del navegador; el horizontal, nuestro.
          touchAction: "pan-y",
        }}
      >
        {foto ? (
          <img
            key={item.id}
            src={foto}
            alt={item.titulo}
            decoding="async"
            draggable={false}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", borderRadius: 8, userSelect: "none" }}
          />
        ) : (
          <div style={{ width: "min(70%, 320px)", aspectRatio: "1 / 1", borderRadius: 16, overflow: "hidden" }}>
            <SinFoto item={item} c={c} tamano={96} />
          </div>
        )}
        {n > 1 && (
          <>
            <button
              type="button"
              aria-label="Anterior"
              disabled={!hayAnterior}
              onClick={() => ir(-1)}
              style={{ ...botonRedondo, position: "absolute", left: escritorio ? 16 : 8, top: "50%", transform: "translateY(-50%)", opacity: hayAnterior ? 1 : 0.35 }}
            >
              <Icono d="m15 6-6 6 6 6" color={GRIS.texto} />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              disabled={!haySiguiente}
              onClick={() => ir(1)}
              style={{ ...botonRedondo, position: "absolute", right: escritorio ? 16 : 8, top: "50%", transform: "translateY(-50%)", opacity: haySiguiente ? 1 : 0.35 }}
            >
              <Icono d="m9 6 6 6-6 6" color={GRIS.texto} />
            </button>
          </>
        )}
      </div>

      <div
        style={{
          background: "#ffffff",
          color: GRIS.texto,
          borderRadius: escritorio ? 20 : "20px 20px 0 0",
          width: "100%",
          maxWidth: escritorio ? 640 : undefined,
          boxSizing: "border-box",
          margin: escritorio ? "0 auto 24px" : 0,
          padding: "16px 20px 20px",
          maxHeight: "45%",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.3, fontWeight: 700 }}>{item.titulo}</h2>
        {precio && <span style={{ fontSize: 16, fontWeight: 700, color: c.oscuro }}>{precio}</span>}
        {item.descripcion && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: GRIS.texto2, whiteSpace: "pre-line" }}>{item.descripcion}</p>
        )}
        {accion && href && (
          <a
            href={href}
            rel="noopener noreferrer"
            onClick={accion.alClic}
            style={{ ...estiloBoton, marginTop: 10, minHeight: 52 }}
          >
            <Icono d={accion.icono} color={colorIconoBoton} />
            {accion.texto}
          </a>
        )}
      </div>
    </div>
  );
}
