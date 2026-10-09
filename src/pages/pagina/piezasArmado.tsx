import type { CSSProperties, ReactNode, RefObject } from "react";
import type { Paleta } from "../../lib/pagina/aspecto";
import { estiloLetra, type EstiloBotones, type Letra } from "../../lib/pagina/estilos";
import type { EstiloPagina, TonosPagina } from "../../lib/pagina/estilosPagina";
import type { EnlacePublico, PaginaPublica } from "../../lib/pagina/tipos";
import type { AccionCatalogo } from "./CatalogoPagina";

/**
 * Lo que comparten los armados de los estilos de página (ArmadosPagina.tsx y
 * los de la fase 2, uno por archivo): las piezas ya hechas que les pasa
 * `VistaPagina` y los ladrillos chicos (la raíz, el nombre, la portada).
 */

/** Un botón de la página como dato: los armados que no lo dibujan como botón (Carta, Mosaico) lo arman a su modo. */
export interface AccionPagina {
  clave: string;
  texto: string;
  /** El trazo del ícono (24×24). */
  icono: string;
  href: string;
  onClick?: () => void;
  /** El botón grande (reservar o el destacado). */
  principal: boolean;
}

/** Lo que necesita el visor del catálogo cuando el armado dibuja los ítems por su cuenta (Mosaico). */
export interface DatosVisor {
  items: NonNullable<PaginaPublica["catalogo"]>["items"];
  titulo: string;
  c: Paleta;
  familia: string;
  escritorio: boolean;
  enMarco: boolean;
  accion: AccionCatalogo | null;
  estiloBoton: CSSProperties;
  colorIconoBoton: string;
}

export interface PiezasArmado {
  p: PaginaPublica;
  c: Paleta;
  t: TonosPagina;
  estilo: EstiloPagina;
  letra: Letra;
  escritorio: boolean;
  /** El celular del editor o una miniatura: encabezados más bajos. */
  chico: boolean;
  enMarco: boolean;
  logo: string | null;
  portada: string | null;
  /** La portada se pide primero (no en las miniaturas del editor). */
  prioridad: boolean;
  Titulo: "h1" | "h2";
  Principal: "main" | "section";
  etiquetaPrincipal?: string;
  raiz: RefObject<HTMLDivElement | null>;
  testId: string;
  raizEstilo: CSSProperties;
  /** El alto de la pantalla: el de la ventana o el del marco de la computadora del editor. */
  altoPantalla: number | string;
  anuncio: ReactNode;
  principal: ReactNode;
  botones: ReactNode[];
  catalogo: ReactNode;
  sucursales: ReactNode;
  pie: ReactNode;
  clic: (e: EnlacePublico) => () => void;
  /** Los botones de la página con la forma elegida, sobre la superficie del estilo. */
  b: EstiloBotones;
  /** El radio de las tarjetas, según la forma de los botones. */
  radio: CSSProperties["borderRadius"];
  /** El botón grande (si hay) y los secundarios, como datos. */
  acciones: AccionPagina[];
  /** Cada sucursal en su tarjeta, sin el título ni la grilla (Mosaico las reparte). */
  tarjetasSucursal: ReactNode[];
  /** "Dónde estamos" o "Nuestras sucursales". */
  tituloSucursales: string;
  /** null si no hay catálogo. */
  visor: DatosVisor | null;
}

export function conAlfa(hex: string, alfa: number): string {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alfa})`;
}

export const columna: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };

/**
 * La portada como imagen (Vivo, Boutique, Carta, Dulce): con su proporción y
 * medidas, para que la página no salte al llegar, y pedida antes que el resto.
 */
export function Portada({
  x,
  proporcion,
  ancho,
  alto,
  style,
}: {
  x: PiezasArmado;
  proporcion?: string;
  ancho: number;
  alto: number;
  style: CSSProperties;
}) {
  if (!x.portada) return null;
  return (
    <img
      src={x.portada}
      alt=""
      width={ancho}
      height={alto}
      decoding="async"
      fetchPriority={x.prioridad ? "high" : undefined}
      style={{ width: "100%", height: "auto", aspectRatio: proporcion, objectFit: "cover", display: "block", ...style }}
    />
  );
}

/** La raíz de cada armado: mide el ancho (celular o computadora) y dice qué estilo es. */
export function Raiz({ x, style, children }: { x: PiezasArmado; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      ref={x.raiz}
      data-testid={x.testId}
      data-modo={x.escritorio ? "escritorio" : "movil"}
      data-estilo={x.estilo.clave}
      style={{ ...x.raizEstilo, ...style }}
    >
      {children}
    </div>
  );
}

export function BotonesEnGrilla({ botones, dos }: { botones: ReactNode[]; dos: boolean }) {
  if (botones.length === 0) return null;
  return (
    <div
      style={
        dos
          ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }
          : { display: "flex", flexDirection: "column", gap: 12 }
      }
    >
      {botones}
    </div>
  );
}

/** El nombre del negocio: un solo h1 en la página (h2 dentro del editor). */
export function Nombre({ x, tamano, style }: { x: PiezasArmado; tamano: number; style?: CSSProperties }) {
  const T = x.Titulo;
  return (
    <T style={{ margin: 0, overflowWrap: "anywhere", ...estiloLetra(x.letra, tamano), ...style }}>{x.p.nombre}</T>
  );
}

/** Un nombre largo baja de tamaño: en las letras grandes de Noche y Vitrina ocuparía media pantalla. */
export function tamanoNombre(nombre: string, grande: number): number {
  return nombre.length > 34 ? Math.round(grande * 0.7) : nombre.length > 22 ? Math.round(grande * 0.84) : grande;
}

/** "Peluquería · Color, corte y uñas, con calma." en una línea (o dos). */
export function rubroYDescripcion(p: PaginaPublica): string {
  return [p.rubro, p.descripcion].filter(Boolean).join(" · ");
}

/**
 * Cómo repartir `n` piezas en filas de a lo sumo `porFila` sin dejar huecos:
 * las filas salen parejas (7 de a 3 = 3, 2, 2 y no 3, 3, 1) y cada una se
 * estira a todo el ancho. Lo usan los mosaicos de Carta y los bloques de
 * Mosaico: una celda vacía al final de una grilla se ve rota.
 */
export function repartir(n: number, porFila: number): number[] {
  if (n <= 0 || porFila <= 0) return [];
  const filas = Math.ceil(n / porFila);
  const base = Math.floor(n / filas);
  const sobran = n % filas;
  return Array.from({ length: filas }, (_, i) => base + (i < sobran ? 1 : 0));
}

/** Corta una lista según `repartir`: cada fila con sus piezas. */
export function enFilas<T>(lista: T[], porFila: number): T[][] {
  let desde = 0;
  return repartir(lista.length, porFila).map((k) => {
    const fila = lista.slice(desde, desde + k);
    desde += k;
    return fila;
  });
}
