import type { AnimadoMenu, LadoLogo, PantallaMenu } from "../../types/menuDigital";
import { categoriasDeBebidas, esBebida } from "./bebidas";
import { filasFotos, llenarColumnas, ordenar, type BloqueLista, type PlatoTv } from "./paginar";

/**
 * Los diseños animados del menú digital (Kevin, 8-nov: "muy estático, que
 * vaya cambiando de platos, mostrando cada uno a lo grande"). Los tres de
 * siempre (Fotos, Lista, Destacado) quedan como estaban.
 *
 * Una TV animada es una función que se repite: una lista de escenas, cada una
 * con su duración. Acá se arma la lista (puro, sin pantalla); la dibuja
 * `TableroAnimado` y la hace avanzar `useRelojEscenas`.
 *
 * - **Presentación:** el logo en grande con el nombre, después cada plato
 *   solo en toda la pantalla y, al final, las bebidas en grupo. Lo elaborado
 *   va primero aunque la categoría de bebidas esté antes: es lo que pidió.
 * - **Carrusel:** el Destacado que no se queda quieto. El protagonista pasa
 *   plato por plato y la lista de al lado marca cuál se está viendo.
 * - **Mosaico:** las tarjetas de Fotos que entran en cascada, con un foco que
 *   recorre una por una.
 *
 * En Carrusel y Mosaico, si la TV tiene platos Y bebidas, las bebidas pasan
 * por la cinta de abajo ("las bebidas en otro lado") y los platos quedan en
 * grande. Una TV de sólo bebidas las muestra arriba: si no, quedaría vacía.
 */

/** Los ajustes del 8-nov con su valor de fábrica (un backend anterior no los manda). */
export interface AjustesAnimados {
  animado: AnimadoMenu | null;
  intro: boolean;
  textoIntro: string;
  segPlato: number;
  bebidasEnCinta: boolean;
  ladoLogo: LadoLogo;
  orden: number[];
}

export function conAnimacion(p: PantallaMenu): AjustesAnimados {
  return {
    animado: p.animado ?? null,
    intro: p.intro ?? true,
    textoIntro: p.textoIntro ?? "",
    segPlato: p.segPlato ?? 6,
    bebidasEnCinta: p.bebidasEnCinta ?? true,
    ladoLogo: p.ladoLogo ?? "derecha",
    orden: p.orden ?? [],
  };
}

/**
 * El diseño quieto que queda guardado junto al animado: es el que dibuja una
 * pestaña de la web anterior a las animaciones (o una TV que no se recargó).
 */
export const DISENO_DE_RESPALDO: Record<AnimadoMenu, PantallaMenu["diseno"]> = {
  presentacion: "destacado",
  carrusel: "destacado",
  mosaico: "fotos",
};

/** Lo que dura cada cosa, en milisegundos. */
export const MS_INTRO = 6500;
export const MS_CATEGORIA = 2800;
/** Bebidas por grupo en Presentación: 4 × 2, que se leen de lejos. */
export const POR_GRUPO = 8;

/**
 * Renglones de la lista del Carrusel. Más que los del Destacado quieto: va sin
 * descripciones, y con los de aquél quedaba un tercio de la columna vacío
 * (medido en el lienzo: 52 px por renglón con la letra A).
 */
const RENGLONES_CARRUSEL = { s: 13, m: 12, l: 10 } as const;

interface Base {
  /** Para React: la misma escena en otra vuelta se vuelve a animar con la vuelta del reloj. */
  clave: string;
  ms: number;
}

export type Escena =
  | (Base & { tipo: "intro" })
  | (Base & { tipo: "categoria"; nombre: string; cuantos: number })
  | (Base & { tipo: "plato"; plato: PlatoTv; categoria: string; numero: number; de: number })
  | (Base & { tipo: "grupo"; titulo: string; platos: PlatoTv[]; parte: number; partes: number })
  | (Base & { tipo: "carrusel"; heroe: PlatoTv; columna: BloqueLista[] })
  | (Base & { tipo: "mosaico"; platos: PlatoTv[] });

export interface Animacion {
  escenas: Escena[];
  /** Lo que pasa por la cinta de abajo (las bebidas, en Carrusel y Mosaico). */
  cinta: PlatoTv[];
}

type Categoria = { id: number; nombre: string };

export function armarAnimacion(pantalla: PantallaMenu, platosSinOrden: PlatoTv[], categorias: Categoria[]): Animacion {
  const a = conAnimacion(pantalla);
  const deBebidas = categoriasDeBebidas(categorias, platosSinOrden);
  const bebida = (p: PlatoTv) => esBebida(p, deBebidas);
  // Lo elaborado primero, después las bebidas; adentro, el orden de la TV.
  const ordenados = ordenar(platosSinOrden, categorias, a.orden);
  const platos = [...ordenados.filter((p) => !bebida(p)), ...ordenados.filter(bebida)];
  const intro: Escena[] = a.intro ? [{ tipo: "intro", clave: "intro", ms: MS_INTRO }] : [];

  if (!platos.length) {
    // Sin platos la TV igual muestra la marca: mejor que una pantalla negra.
    return { escenas: [{ tipo: "intro", clave: "intro", ms: MS_INTRO }], cinta: [] };
  }

  if (a.animado === "presentacion") return { escenas: [...intro, ...presentacion(platos, categorias, bebida, a)], cinta: [] };

  const hayAmbos = platos.some(bebida) && platos.some((p) => !bebida(p));
  const aparte = hayAmbos && a.bebidasEnCinta;
  const arriba = aparte ? platos.filter((p) => !bebida(p)) : platos;
  const cinta = aparte ? platos.filter(bebida) : [];

  if (a.animado === "mosaico") {
    const porPagina = Math.max(1, pantalla.columnas * filasFotos(pantalla.tamano, pantalla.fotos));
    const escenas: Escena[] = [];
    for (let i = 0; i < arriba.length; i += porPagina) {
      const pagina = arriba.slice(i, i + porPagina);
      // El foco tiene que pasar por todas: 1,5 s cada una como mínimo.
      escenas.push({ tipo: "mosaico", clave: `m-${i}`, ms: Math.max(pantalla.rotarSeg * 1000, pagina.length * 1500), platos: pagina });
    }
    return { escenas: [...intro, ...escenas], cinta };
  }

  // Carrusel (y lo que no se reconozca): cada plato es protagonista una vez y
  // la columna de al lado es la página en la que está. La lista va sin
  // descripciones: la del plato ya se lee en grande, y así entran más.
  const columnas = llenarColumnas(arriba, categorias, RENGLONES_CARRUSEL[pantalla.tamano], false);
  const escenas: Escena[] = columnas.flatMap((columna) =>
    columna.flatMap((b) => b.platos.map((heroe) => ({ tipo: "carrusel" as const, clave: `c-${heroe.id}`, ms: a.segPlato * 1000, heroe, columna }))),
  );
  return { escenas: [...intro, ...escenas], cinta };
}

function presentacion(platos: PlatoTv[], categorias: Categoria[], bebida: (p: PlatoTv) => boolean, a: AjustesAnimados): Escena[] {
  const nombreDe = new Map(categorias.map((c) => [c.id, c.nombre]));
  // Los grupos seguidos de una misma categoría (ya vienen ordenados).
  const grupos: { nombre: string; platos: PlatoTv[]; bebidas: boolean }[] = [];
  for (const p of platos) {
    const nombre = nombreDe.get(p.categoriaId ?? -1) ?? "Otros";
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nombre === nombre) ultimo.platos.push(p);
    else grupos.push({ nombre, platos: [p], bebidas: bebida(p) });
  }
  const escenas: Escena[] = [];
  for (const g of grupos) {
    escenas.push({ tipo: "categoria", clave: `k-${g.nombre}`, ms: MS_CATEGORIA, nombre: g.nombre, cuantos: g.platos.length });
    if (g.bebidas) {
      // Las bebidas en grupo: de a una, veinte gaseosas son dos minutos de
      // botellas, y casi nunca tienen foto.
      const partes = Math.ceil(g.platos.length / POR_GRUPO);
      for (let i = 0; i < partes; i++) {
        const lote = g.platos.slice(i * POR_GRUPO, (i + 1) * POR_GRUPO);
        escenas.push({
          tipo: "grupo",
          clave: `g-${g.nombre}-${i}`,
          ms: Math.max(8000, a.segPlato * 1500),
          titulo: g.nombre,
          platos: lote,
          parte: i + 1,
          partes,
        });
      }
    } else {
      g.platos.forEach((plato, i) =>
        escenas.push({ tipo: "plato", clave: `p-${plato.id}`, ms: a.segPlato * 1000, plato, categoria: g.nombre, numero: i + 1, de: g.platos.length }),
      );
    }
  }
  return escenas;
}

/**
 * La escena de la miniatura (quieta): la primera con platos. La presentación o
 * el cartel "PLATOS" no dicen qué diseño es.
 */
export function escenaDeMuestra(escenas: Escena[]): Escena | undefined {
  return escenas.find((e) => e.tipo !== "intro" && e.tipo !== "categoria") ?? escenas[0];
}

/** Lo que se lee en el editor debajo de la TV: "Cuarto Brasa", "Bebidas (2 de 3)". */
export function nombreDeEscena(e: Escena): string {
  switch (e.tipo) {
    case "intro":
      return "Presentación con el logo";
    case "categoria":
      return `Título: ${e.nombre}`;
    case "plato":
      return e.plato.nombre;
    case "grupo":
      return e.partes > 1 ? `${e.titulo} (${e.parte} de ${e.partes})` : e.titulo;
    case "carrusel":
      return e.heroe.nombre;
    case "mosaico":
      return `${e.platos.length} ${e.platos.length === 1 ? "plato" : "platos"}`;
  }
}

/**
 * Lo que manda el editor de Android (vista previa) encima de lo guardado. La
 * app no conoce `animado`: si cambió el diseño quieto, eligió ése y la
 * animación se apaga, igual que lo hace el backend al guardar. Si no, la TV
 * seguiría animada hasta recargar aunque en el celular dijera "Lista".
 */
export function mezclarEdicion(guardada: PantallaMenu, edicion: Partial<PantallaMenu> | null): PantallaMenu {
  if (!edicion) return guardada;
  const mezcla = { ...guardada, ...edicion };
  if (!("animado" in edicion) && edicion.diseno !== undefined && edicion.diseno !== guardada.diseno) mezcla.animado = null;
  return mezcla;
}
