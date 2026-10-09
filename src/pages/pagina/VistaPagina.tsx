import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { preload } from "react-dom";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { ICONO_ANUNCIO, ICONO_RESERVAR, iconoDe, mezcla, paleta, type Paleta } from "../../lib/pagina/aspecto";
import { enlaceWhatsapp, urlConsultaWhatsapp } from "../../lib/pagina/catalogo";
import {
  coloresAnuncio,
  estiloBotones,
  estiloLetra,
  GRIS_PAGINA,
  letraTitulo,
  SUPERFICIE_CLASICA,
  type Superficie,
} from "../../lib/pagina/estilos";
import { estiloPagina, tonosPagina } from "../../lib/pagina/estilosPagina";
import type { AnuncioPublico, EnlacePublico, PaginaPublica } from "../../lib/pagina/tipos";
import { urlTelefono } from "../../lib/pagina/vista";
import ArmadoEstilo, { type PiezasArmado } from "./ArmadosPagina";
import CatalogoPagina, { type AccionCatalogo, type AspectoCatalogo } from "./CatalogoPagina";
import { EstadoSucursal, SemanaSucursal } from "./HorarioSucursal";
import type { AccionPagina, DatosVisor } from "./piezasArmado";
import { Enlace, PiePagina, TarjetaSucursal, TituloSeccion, Trazo, type AccionSucursal } from "./piezasPagina";

// Las piezas chicas viven en piezasPagina.tsx; se siguen pidiendo de acá.
export { MarcaBamarDev, Trazo } from "./piezasPagina";

/**
 * La página del negocio tal como la ve su cliente (lienzo BioPublica / B4).
 *
 * Es presentacional a propósito: la usan la página pública (`/p/:subdominio`)
 * y la vista previa del editor, que le pasa lo que se está editando. Tiene dos
 * armados: celular (una columna) y computadora, según el ancho, y desde el
 * 09-oct uno por estilo de página (`estilosPagina.ts`): el Clásico es el de
 * siempre, tal cual; los demás, en ArmadosPagina.tsx (y los de la fase 2,
 * Postal, Carta, Dulce y Mosaico, en un archivo cada uno).
 * Estilos en línea y no clases del tema de la app: la página no lee la paleta
 * de la app (§1.5), sólo su muestra de color.
 */

const GRIS = GRIS_PAGINA;

/**
 * La marquesina se mueve con una animación CSS (no hay keyframes en línea).
 * Se detiene al pasar el mouse y, con "reducir movimiento", queda quieta y
 * en varias líneas: el texto nunca se pierde.
 */
const CSS_MARQUESINA = `@keyframes bm-marquesina{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.bm-marquesina-pista{animation:bm-marquesina linear infinite}
.bm-marquesina:hover .bm-marquesina-pista,.bm-marquesina:focus-within .bm-marquesina-pista{animation-play-state:paused}
@media (prefers-reduced-motion: reduce){.bm-marquesina-pista{animation:none;min-width:0!important;white-space:normal!important}.bm-marquesina-copia{display:none!important}}`;

/**
 * El anuncio destacado con el estilo y los colores que eligió el dueño (o
 * los automáticos). Sin estilo, la franja ámbar de siempre. `estatico`: para
 * las miniaturas del editor (la marquesina no se mueve). `superficie`: sobre
 * qué se pinta (la del estilo de página; sin ella, el gris de siempre).
 */
export function AnuncioPagina({
  anuncio,
  paleta: c,
  estatico,
  superficie = SUPERFICIE_CLASICA,
}: {
  anuncio: AnuncioPublico;
  paleta: Paleta;
  estatico?: boolean;
  superficie?: Superficie;
}) {
  const estilo = anuncio.estilo ?? "SUAVE";
  const k = coloresAnuncio(estilo, anuncio.colorFondo, anuncio.colorTexto, c, superficie);
  const lleno = !["SUAVE", "CONTORNO", "TARJETA", "MINIMAL"].includes(estilo);
  const letra: CSSProperties = { fontSize: 14, color: k.texto, fontWeight: lleno ? 600 : undefined };
  const texto = anuncio.url ? (
    <a href={anuncio.url} rel="noopener noreferrer" style={letra}>
      {anuncio.texto}
    </a>
  ) : (
    <span style={letra}>{anuncio.texto}</span>
  );
  const icono = <Trazo d={ICONO_ANUNCIO} color={k.icono} />;
  const franja: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    padding: "10px 14px",
  };

  if (estilo === "MARQUESINA" && !estatico) {
    const copia = (oculta: boolean) => (
      <span
        className="bm-marquesina-copia"
        aria-hidden={oculta || undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: 10, flex: "1 0 auto", padding: "0 40px 0 14px" }}
      >
        <Trazo d={ICONO_ANUNCIO} color={k.icono} />
        <span style={letra}>{anuncio.texto}</span>
      </span>
    );
    const pista = (
      <div
        className="bm-marquesina-pista"
        style={{
          display: "flex",
          width: "max-content",
          minWidth: "200%",
          whiteSpace: "nowrap",
          animationDuration: `${Math.max(10, anuncio.texto.length * 0.35)}s`,
        }}
      >
        {copia(false)}
        {copia(true)}
      </div>
    );
    return (
      <div
        role="note"
        className="bm-marquesina"
        style={{ background: k.color, borderRadius: 12, overflow: "hidden", padding: "10px 0" }}
      >
        <style>{CSS_MARQUESINA}</style>
        {anuncio.url ? (
          <a href={anuncio.url} rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>
            {pista}
          </a>
        ) : (
          pista
        )}
      </div>
    );
  }

  let caja: CSSProperties;
  switch (estilo) {
    case "SOLIDO":
      caja = { ...franja, background: k.color };
      break;
    case "MARQUESINA":
      // Quieta (miniatura del editor): una línea llena, cortada con "…".
      caja = { ...franja, background: k.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
      break;
    case "CONTORNO":
      caja = { ...franja, background: k.caja, border: `2px solid ${k.color}` };
      break;
    case "PILDORA":
      return (
        <div role="note" style={{ display: "flex", justifyContent: "center" }}>
          <div
            style={{
              ...franja,
              display: "inline-flex",
              maxWidth: "100%",
              boxSizing: "border-box",
              borderRadius: 999,
              padding: "8px 18px",
              background: k.color,
              textAlign: "center",
            }}
          >
            {icono}
            {texto}
          </div>
        </div>
      );
    case "CINTA":
      caja = {
        ...franja,
        borderRadius: "6px 0 0 6px",
        background: k.color,
        padding: "10px 34px 10px 14px",
        clipPath: "polygon(0 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%)",
      };
      break;
    case "ICONO":
      return (
        <div role="note" style={{ ...franja, gap: 12, padding: 12, borderRadius: 16, background: k.color }}>
          <span
            style={{
              width: 44,
              height: 44,
              flex: "none",
              borderRadius: 999,
              background: mezcla(k.color, k.texto, 0.18),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trazo d={ICONO_ANUNCIO} color={k.icono} size={24} ancho={2} />
          </span>
          {texto}
        </div>
      );
    case "TARJETA":
      caja = {
        ...franja,
        background: k.caja,
        borderRadius: 16,
        borderLeft: `5px solid ${k.color}`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
        padding: "12px 14px",
      };
      break;
    case "DEGRADADO":
      caja = { ...franja, background: `linear-gradient(135deg, ${k.color}, ${k.color2})` };
      break;
    case "MINIMAL":
      caja = {
        ...franja,
        justifyContent: "center",
        borderRadius: 0,
        padding: "8px 4px",
        borderBottom: `2px solid ${k.color}`,
        textAlign: "center",
      };
      break;
    default:
      // SUAVE: la franja de siempre (con los colores elegidos, si hay).
      caja = { ...franja, background: k.color, border: `1px solid ${k.borde}` };
  }
  return (
    <div role="note" style={caja}>
      {icono}
      {texto}
    </div>
  );
}

/** Desde este ancho la página se arma en dos columnas (computadora). */
export const ANCHO_ESCRITORIO = 900;

/**
 * El alto de la "pantalla" de la computadora en la vista previa del editor:
 * ahí la foto fija de Vitrina no puede medir el alto de la ventana.
 */
export const ALTO_PANTALLA_PC = 800;

export type ModoVista = "auto" | "movil" | "escritorio";

/**
 * En "auto" mide el ancho real de la página (no el de la ventana): así la
 * misma vista sirve en el navegador y adentro de un marco del editor. Sin
 * ResizeObserver (jsdom) cae a los cambios de tamaño de la ventana.
 */
function useEsEscritorio(modo: ModoVista, ref: RefObject<HTMLDivElement | null>): boolean {
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    if (modo !== "auto") return;
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [modo, ref]);
  return modo === "escritorio" || (modo === "auto" && ancho >= ANCHO_ESCRITORIO);
}

export interface PropsVista {
  pagina: PaginaPublica;
  /** A dónde lleva "Reservar turno" (la reserva online vive en `/r/...`). */
  urlReservar: string;
  /** La política de privacidad para el cliente del negocio. */
  urlPrivacidad?: string;
  alClic?: (enlace: EnlacePublico) => void;
  /** Dentro de un marco del editor: sin alto mínimo de pantalla ni otro main/h1. */
  enMarco?: boolean;
  /**
   * "auto" (la página de verdad): celular o computadora según el ancho.
   * El editor fuerza uno u otro para la vista previa.
   */
  modo?: ModoVista;
  /**
   * Una miniatura del editor (la fila y el popup de estilos): la marquesina
   * quieta y otro `data-testid`, para no confundirla con la vista previa.
   */
  miniatura?: boolean;
}

export default function VistaPagina({
  pagina: p,
  urlReservar,
  urlPrivacidad,
  alClic,
  enMarco,
  modo = "auto",
  miniatura,
}: PropsVista) {
  const raiz = useRef<HTMLDivElement>(null);
  const escritorio = useEsEscritorio(modo, raiz);
  // El marco del celular del editor achica la portada y el logo; el de la
  // computadora no (es la página a tamaño real, escalada).
  const chico = (!!enMarco || !!miniatura) && !escritorio;
  const enCaja = !!enMarco || !!miniatura;
  const c = paleta(p.color.hex);
  const estilo = estiloPagina(p.estilo);
  const clasico = estilo.clave === "CLASICO";
  const logo = urlDeImagen(p.logoUrl);
  const portada = urlDeImagen(p.portadaUrl);
  const t = tonosPagina(estilo.clave, c, !!portada);
  // La portada es lo más grande que se pinta arriba: se pide antes que el
  // resto. Donde es fondo de CSS (Clásico, Vitrina, Noche) el navegador la
  // descubre tarde; el preload la adelanta sin tocar cómo se ve. Donde es
  // <img> (Vivo, Boutique) lleva `fetchpriority` ella misma.
  const portadaDeFondo = ["CLASICO", "VITRINA", "NOCHE"].includes(estilo.clave);
  if (portada && portadaDeFondo && !miniatura) preload(portada, { as: "image", fetchPriority: "high" });
  // La forma decide fondo, borde, sombra y radio; el tamaño y el armado son de
  // acá. La superficie (el fondo del estilo) decide cómo se leen sobre él.
  const b = estiloBotones(p.formaBotones, c, t.superficie);
  // Los botones chicos van en la tarjeta de la sucursal: si es de otra
  // familia que la página (el bloque oscuro de Mosaico), con la suya.
  const bTarjeta = t.superficieTarjeta ? estiloBotones(p.formaBotones, c, t.superficieTarjeta) : b;
  const letraNombre = letraTitulo(p.tipografia);
  const clic = (e: EnlacePublico) => () => alClic?.(e);
  // Los que van en mayúsculas espaciadas: el botón grande de Noche y de Boutique.
  const mayusculas: CSSProperties =
    estilo.clave === "NOCHE"
      ? { textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 15 }
      : estilo.clave === "BOUTIQUE"
        ? { textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 13, fontWeight: 600 }
        : {};

  const tamanoPrincipal: CSSProperties = {
    minHeight: 56,
    boxSizing: "border-box",
    width: "100%",
    fontSize: 16,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "0 16px",
    textDecoration: "none",
    textAlign: "center",
  };
  const botonPrincipal: CSSProperties = { ...tamanoPrincipal, ...mayusculas, ...b.principal.estilo };
  // Boutique: los botones sin ícono ni flecha y con el texto al medio.
  const centrados = estilo.clave === "BOUTIQUE";
  const botonSecundario: CSSProperties = {
    minHeight: 52,
    boxSizing: "border-box",
    fontSize: 15,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 16px",
    textDecoration: "none",
    ...(centrados ? { justifyContent: "center", textAlign: "center" } : {}),
    ...b.secundario.estilo,
  };
  const botonChico = (destacado = false): CSSProperties => ({
    minHeight: 44,
    fontSize: 13,
    fontWeight: destacado ? 500 : 400,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: "0 6px",
    ...(destacado ? bTarjeta.chicoDestacado : bTarjeta.chico).estilo,
  });

  const unaSucursal = p.sucursales.length === 1;
  // Dentro del editor la vista previa vive adentro del <main> de la app: ahí
  // no puede abrir otro <main> ni otro <h1> (B24, doble landmark y doble h1).
  const Principal = enCaja ? "section" : "main";
  const Titulo = enCaja ? "h2" : "h1";

  const anuncio = p.anuncio && <AnuncioPagina anuncio={p.anuncio} paleta={c} estatico={miniatura} superficie={t.superficie} />;

  // El botón grande es opcional: reservar, el enlace que eligió el dueño
  // (su WhatsApp, su menú, el que sea) o ninguno.
  const principal = p.reservar ? (
    <a href={urlReservar} style={botonPrincipal}>
      <Trazo d={ICONO_RESERVAR} color={b.principal.icono} ancho={2} />
      Reservar turno
    </a>
  ) : p.destacado ? (
    <Enlace href={p.destacado.url} onClick={clic(p.destacado)} style={botonPrincipal}>
      <Trazo d={iconoDe(p.destacado.tipo, p.destacado.icono)} color={b.principal.icono} />
      {p.destacado.etiqueta}
    </Enlace>
  ) : null;

  // Los mismos botones como datos, para los armados que los dibujan a su
  // modo (los mosaicos de acción de Carta, los bloques de Mosaico).
  const acciones: AccionPagina[] = [
    ...(p.reservar
      ? [{ clave: "reservar", texto: "Reservar turno", icono: ICONO_RESERVAR, href: urlReservar, principal: true }]
      : p.destacado
        ? [
            {
              clave: `enlace-${p.destacado.id}`,
              texto: p.destacado.etiqueta,
              icono: iconoDe(p.destacado.tipo, p.destacado.icono),
              href: p.destacado.url,
              onClick: clic(p.destacado),
              principal: true,
            },
          ]
        : []),
    ...p.botones.map((x) => ({
      clave: `enlace-${x.id}`,
      texto: x.etiqueta,
      icono: iconoDe(x.tipo, x.icono),
      href: x.url,
      onClick: clic(x),
      principal: false,
    })),
  ];

  const botones = p.botones.map((x) =>
    centrados ? (
      <Enlace key={x.id} href={x.url} onClick={clic(x)} style={botonSecundario}>
        {x.etiqueta}
      </Enlace>
    ) : (
      <Enlace key={x.id} href={x.url} onClick={clic(x)} style={botonSecundario}>
        <Trazo d={iconoDe(x.tipo, x.icono)} color={b.secundario.icono} size={18} />
        <span style={{ flex: 1 }}>{x.etiqueta}</span>
        <Trazo d="m9 6 6 6-6 6" color={b.flecha} size={16} ancho={2} />
      </Enlace>
    ),
  );

  const accionesDe = (s: PaginaPublica["sucursales"][number]): AccionSucursal[] =>
    [
      s.mapaUrl && { texto: "Cómo llegar", href: s.mapaUrl, destacado: false },
      s.telefono && { texto: "Llamar", href: urlTelefono(s.telefono), destacado: false },
      // La reserva de ESA sucursal, por su slug (B07): `?sucursal=<id>`
      // no lo leía nadie y exponía el id del almacén.
      p.reservar &&
        s.reservaSlug && {
          texto: "Reservar",
          href: `${urlReservar}/${encodeURIComponent(s.reservaSlug)}`,
          destacado: true,
        },
    ].filter(Boolean) as AccionSucursal[];

  // Las tarjetas siguen la forma de los botones, sin llegar a píldora.
  const radioTarjeta: CSSProperties["borderRadius"] = ["RECTO", "ESQUINA", "SUBRAYADO"].includes(p.formaBotones)
    ? 4
    : p.formaBotones === "HOJA"
      ? "20px 4px 20px 4px"
      : estilo.clave === "DULCE"
        ? 24 // Dulce: todo bien redondo.
        : 16;

  // El botón del visor del catálogo: reservar si la página reserva; si no,
  // consultar por el WhatsApp del negocio con el ítem en el mensaje.
  const whatsapp = p.reservar ? null : enlaceWhatsapp(p);
  const accionCatalogo: AccionCatalogo | null = p.reservar
    ? { texto: "Reservar", icono: ICONO_RESERVAR, href: () => urlReservar }
    : whatsapp
      ? {
          texto: "Consultar por WhatsApp",
          icono: iconoDe("WHATSAPP", null),
          href: (it) => urlConsultaWhatsapp(whatsapp.url, it.titulo),
          alClic: clic(whatsapp),
        }
      : null;
  // El visor es siempre blanco: su botón va con la forma sobre fondo claro
  // (el invertido de Vivo, blanco sobre blanco, no se vería).
  const bVisor = t.superficie.tipo === "clara" ? b : estiloBotones(p.formaBotones, c);
  // La lista de menú (Carta) va directo sobre la página, sin tarjeta.
  const menu = estilo.catalogo.presentacion === "menu";
  const aspectoCatalogo: AspectoCatalogo | undefined = clasico
    ? undefined
    : {
        ...estilo.catalogo,
        tarjeta: t.tarjeta,
        borde: t.borde,
        sombra: t.sombra,
        texto: menu ? t.texto : t.textoTarjeta,
        texto3: menu ? t.texto3 : t.texto3Tarjeta,
        linea: t.linea,
        precioItem: menu ? { ...estiloLetra(letraNombre, 17), textTransform: undefined, letterSpacing: undefined } : undefined,
        precio: t.precio,
        sinFotoFondo: t.sinFotoFondo,
        sinFotoTexto: t.sinFotoTexto,
        puntoOn: t.puntoOn,
        puntoOff: t.puntoOff,
        contador: t.texto3,
        tituloItem: estilo.catalogo.sinCaja
          ? { ...estiloLetra(letraNombre, 19), textTransform: undefined, letterSpacing: undefined, color: t.textoTarjeta }
          : undefined,
        familia: t.familia,
      };
  const catalogo = p.catalogo && p.catalogo.items.length > 0 && (
    <CatalogoPagina
      catalogo={p.catalogo}
      c={c}
      escritorio={escritorio}
      enMarco={enCaja}
      radio={radioTarjeta}
      accion={accionCatalogo}
      estiloBoton={{ ...tamanoPrincipal, ...bVisor.principal.estilo }}
      colorIconoBoton={bVisor.principal.icono}
      aspecto={aspectoCatalogo}
      renderTitulo={
        clasico
          ? undefined
          : (id, texto) => (
              <TituloSeccion id={id} estilo={estilo.clave} t={t} letra={letraNombre} escritorio={escritorio}>
                {texto}
              </TituloSeccion>
            )
      }
    />
  );

  const visor: DatosVisor | null =
    p.catalogo && p.catalogo.items.length > 0
      ? {
          items: p.catalogo.items,
          titulo: p.catalogo.titulo,
          c,
          familia: t.familia,
          escritorio,
          enMarco: enCaja,
          accion: accionCatalogo,
          estiloBoton: { ...tamanoPrincipal, ...bVisor.principal.estilo },
          colorIconoBoton: bVisor.principal.icono,
        }
      : null;

  const pie = <PiePagina p={p} urlPrivacidad={urlPrivacidad} color={t.texto3} />;
  const etiquetaPrincipal = enCaja ? "Vista previa de la página" : undefined;
  const testId = miniatura ? "miniatura-pagina" : "vista-pagina";

  if (!clasico) {
    const tituloSucursales = unaSucursal ? "Dónde estamos" : "Nuestras sucursales";
    // En las columnas angostas de computadora (la tarjeta de Postal, la columna
    // de Dulce, el panel de Carta junto a la lista) dos tarjetas por fila no
    // dejan entrar los botones.
    const angosta = ["POSTAL", "DULCE"].includes(estilo.clave) || (estilo.clave === "CARTA" && !!catalogo);
    const tarjetasSucursal = p.sucursales.map((s, i) => (
      <TarjetaSucursal
        key={`${s.nombre}-${i}`}
        s={s}
        acciones={accionesDe(s)}
        estiloAccion={botonChico}
        t={t}
        letra={letraNombre}
        presentacion={estilo.sucursales}
        radio={radioTarjeta}
        primera={i === 0}
        estado={<EstadoSucursal tramos={s.horarioSemanal} t={t} />}
      />
    ));
    const piezas: PiezasArmado = {
      p,
      c,
      t,
      estilo,
      letra: letraNombre,
      escritorio,
      chico,
      enMarco: enCaja,
      logo,
      portada,
      prioridad: !miniatura,
      Titulo,
      Principal,
      etiquetaPrincipal,
      raiz,
      testId,
      raizEstilo: {
        background: t.fondo,
        color: t.texto,
        fontFamily: t.familia,
        // En el marco de la computadora llena la "pantalla" aunque sea corta.
        minHeight: enCaja ? (escritorio ? "100%" : undefined) : "100dvh",
      },
      altoPantalla: enCaja ? ALTO_PANTALLA_PC : "100dvh",
      anuncio,
      principal,
      botones,
      catalogo,
      sucursales:
        p.sucursales.length > 0 ? (
          <>
            <TituloSeccion estilo={estilo.clave} t={t} letra={letraNombre} escritorio={escritorio}>
              {tituloSucursales}
            </TituloSeccion>
            <div
              style={
                escritorio && estilo.sucursales === "tarjeta" && !unaSucursal && !angosta
                  ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }
                  : { display: "flex", flexDirection: "column", gap: estilo.sucursales === "texto" ? 0 : 12 }
              }
            >
              {tarjetasSucursal}
            </div>
          </>
        ) : null,
      pie,
      clic,
      b,
      radio: radioTarjeta,
      acciones,
      tarjetasSucursal,
      tituloSucursales,
      visor,
    };
    return <ArmadoEstilo {...piezas} />;
  }

  // ── Clásico: el armado de siempre, sin tocar un píxel ─────────────────────

  const fondoPortada: CSSProperties = {
    width: "100%",
    position: "relative",
    backgroundColor: portada ? "#1F2937" : c.barra,
    backgroundImage: portada
      ? `url("${portada}")`
      : "repeating-linear-gradient(135deg,rgba(255,255,255,0.06) 0 14px,rgba(255,255,255,0) 14px 28px)",
    backgroundSize: portada ? "cover" : undefined,
    backgroundPosition: "center",
  };
  // Capa oscura automática: el texto blanco siempre se lee (§1.5).
  const capaPortada = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.45))",
      }}
    />
  );

  const ladoLogo = chico ? 80 : 104;
  const circuloLogo = (
    <div
      style={{
        marginTop: chico ? -40 : -52,
        width: ladoLogo,
        height: ladoLogo,
        flex: "none",
        borderRadius: 999,
        background: "#ffffff",
        padding: 4,
        boxSizing: "border-box",
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        position: "relative",
      }}
    >
      {logo ? (
        <img
          src={logo}
          alt={`Logo de ${p.nombre}`}
          style={{ width: "100%", height: "100%", borderRadius: 999, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 999,
            background: c.acento,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            ...estiloLetra(letraNombre, chico ? 26 : 34),
            // Sin el ajuste de tamaño ni las mayúsculas del nombre: el círculo
            // es chico y las iniciales tienen que entrar.
            fontSize: chico ? 26 : 34,
          }}
        >
          {p.iniciales}
        </div>
      )}
    </div>
  );

  const identidad = (
    <>
      <Titulo
        style={{
          margin: "12px 20px 0",
          lineHeight: 1.15,
          textAlign: "center",
          ...estiloLetra(letraNombre, 26 + (escritorio ? 2 : 0)),
        }}
      >
        {p.nombre}
      </Titulo>
      {p.rubro && <span style={{ fontSize: 13, color: GRIS.texto3, marginTop: 2 }}>{p.rubro}</span>}
      {p.descripcion && (
        <p style={{ margin: "8px 24px 0", fontSize: 14, color: GRIS.texto2, textAlign: "center", lineHeight: 1.45 }}>
          {p.descripcion}
        </p>
      )}
      {p.redes.length > 0 && (
        <nav
          aria-label="Redes sociales"
          style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, margin: "14px 16px 0" }}
        >
          {p.redes.map((r) => (
            <Enlace
              key={r.id}
              href={r.url}
              onClick={clic(r)}
              etiqueta={r.etiqueta}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: c.tinte,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trazo d={iconoDe(r.tipo, r.icono)} color={c.oscuro} />
            </Enlace>
          ))}
        </nav>
      )}
    </>
  );

  const tituloSucursales = p.sucursales.length > 0 && (
    <h2 style={{ margin: "10px 0 0", fontSize: 13, letterSpacing: "0.06em", color: GRIS.texto3, fontWeight: 700 }}>
      {unaSucursal ? "DÓNDE ESTAMOS" : "NUESTRAS SUCURSALES"}
    </h2>
  );
  const sucursales = p.sucursales.map((s, i) => {
    const acciones = accionesDe(s);
    return (
      <article
        key={`${s.nombre}-${i}`}
        style={{
          background: "#ffffff",
          border: `1px solid ${GRIS.borde}`,
          borderRadius: 16,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Con horario por día, el cartel al lado del nombre; sin él, lo de siempre (ni un píxel distinto). */}
        {s.horarioSemanal?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <strong style={{ fontSize: 16 }}>{s.nombre}</strong>
            <EstadoSucursal tramos={s.horarioSemanal} t={t} />
          </div>
        ) : (
          <strong style={{ fontSize: 16 }}>{s.nombre}</strong>
        )}
        {s.direccion && <span style={{ fontSize: 14, color: "#4B5563" }}>{s.direccion}</span>}
        {s.horario && <span style={{ fontSize: 13, color: GRIS.texto3 }}>{s.horario}</span>}
        <SemanaSucursal tramos={s.horarioSemanal} t={t} />
        {acciones.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))`,
              gap: 8,
              // En dos columnas las tarjetas se estiran a la misma altura: los
              // botones van abajo de todo, alineados entre tarjetas.
              marginTop: "auto",
              paddingTop: 6,
            }}
          >
            {acciones.map((a) => (
              <a key={a.texto} href={a.href} rel="noopener noreferrer" style={botonChico(a.destacado)}>
                {a.texto}
              </a>
            ))}
          </div>
        )}
      </article>
    );
  });

  const raizEstilo: CSSProperties = {
    background: GRIS.fondo,
    color: GRIS.texto,
    fontFamily: "Roboto, system-ui, sans-serif",
    // En el marco de la computadora llena la "pantalla" aunque sea corta.
    minHeight: enCaja ? (escritorio ? "100%" : undefined) : "100dvh",
  };

  if (escritorio) {
    // Computadora: la portada a todo el ancho; a la izquierda la tarjeta del
    // negocio (logo, nombre, redes y el botón grande) y a la derecha el resto,
    // con los botones y las sucursales en dos columnas. Si no hay nada para la
    // derecha, la tarjeta va sola y centrada: media pantalla vacía parece rota.
    const hayDerecha = !!anuncio || botones.length > 0 || sucursales.length > 0;
    return (
      <div ref={raiz} data-testid={testId} data-modo="escritorio" data-estilo="CLASICO" style={raizEstilo}>
        <div style={{ ...fondoPortada, height: 300 }}>{capaPortada}</div>
        <Principal aria-label={etiquetaPrincipal} style={{ maxWidth: 1120, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: hayDerecha ? "340px minmax(0, 1fr)" : "minmax(0, 400px)",
              justifyContent: "center",
              gap: 32,
              alignItems: "start",
            }}
          >
            <header
              style={{
                marginTop: -110,
                position: "relative",
                background: "#ffffff",
                border: `1px solid ${GRIS.borde}`,
                borderRadius: 20,
                boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                padding: "0 4px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {circuloLogo}
              {identidad}
              {principal && (
                <div style={{ width: "100%", boxSizing: "border-box", padding: "20px 20px 0" }}>{principal}</div>
              )}
            </header>
            {hayDerecha && (
              <div style={{ paddingTop: 28, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                {anuncio}
                {botones.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    {botones}
                  </div>
                )}
                {tituloSucursales}
                {sucursales.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    {sucursales}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* El catálogo, debajo de las dos columnas y a todo el ancho. */}
          {catalogo && <div style={{ paddingTop: 36 }}>{catalogo}</div>}
        </Principal>
        <div style={{ padding: "24px 32px 40px" }}>{pie}</div>
      </div>
    );
  }

  return (
    <div ref={raiz} data-testid={testId} data-modo="movil" data-estilo="CLASICO" style={raizEstilo}>
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...fondoPortada, height: chico ? 130 : 200 }}>{capaPortada}</div>
          {circuloLogo}
          {identidad}
        </header>

        <Principal
          aria-label={etiquetaPrincipal}
          style={{ padding: "18px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {anuncio}
          {principal}
          {botones}
          {catalogo}
          {tituloSucursales}
          {sucursales}
          {pie}
        </Principal>
      </div>
    </div>
  );
}
