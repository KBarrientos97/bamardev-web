import type { Rubro } from "./rubro";
import { contiene } from "./texto";

/**
 * Los videos de la pantalla Tutoriales (pedido del dueño, 07-nov). Viven acá
 * y no en el backend: son pocos, cambian cuando se graba uno nuevo (y eso ya
 * pasa por un deploy), y sumar un video tiene que ser agregar una línea.
 *
 * - `id`: el de YouTube, lo que va después de `youtu.be/` o de `?v=`.
 * - `orden`: el lugar dentro de su sección. Manda sobre el orden del arreglo,
 *   así un video nuevo se puede meter entre dos sin mover los demás.
 * - `seccion`: el rótulo que los agrupa en la pantalla ("Recepción de la
 *   academia"). Sin ella, el video va en "Primeros pasos".
 * - `rubros`: quiénes lo ven. Sin `rubros` lo ven todos: un video de la
 *   academia en el restaurante sólo confunde ("¿y el docente?").
 */
export interface Tutorial {
  id: string;
  orden: number;
  titulo: string;
  descripcion: string;
  seccion?: string;
  rubros?: Rubro[];
}

/** Para los videos sin sección: los de uso general, que ve cualquier rubro. */
export const SECCION_GENERAL = "Primeros pasos";

export const TUTORIALES: Tutorial[] = [
  {
    id: "a2jPyD45a7U",
    orden: 1,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Empezar el turno en la recepción",
    descripcion:
      "Entrar con el nombre del instituto, tu usuario y tu contraseña; conocer tu menú; abrir la caja con el cambio con el que arrancás y marcar la llegada del docente.",
  },
  {
    id: "iHqDfGDvHtE",
    orden: 2,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Inscribir en el mostrador",
    descripcion:
      "Buscar al alumno por su carnet, cargar su ficha y las tres fotos, elegir el grupo y el plan, inscribir y cobrar el primer mes, y mandarle el recibo por WhatsApp.",
  },
  {
    id: "YyDaYN6VacA",
    orden: 3,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Menores y becas",
    descripcion:
      "Un menor necesita un tutor y los mensajes le llegan a él; cobrar sólo una parte con «Otro monto»; aplicar una beca que autoriza el administrador con su PIN.",
  },
  {
    id: "8xX_y2uaT4Q",
    orden: 4,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Cobrar una cuota",
    descripcion:
      "Cobrar desde Cobranza una parte en efectivo y el resto por QR, confirmando cuando el pago llegó; y ofrecer el curso completo con descuento a quien dejó un adelanto.",
  },
  {
    id: "MuM1MQdC_n4",
    orden: 5,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Inscripciones de la página",
    descripcion:
      "La bandeja de Inscripciones online: escribirle por WhatsApp, «Cobrar e inscribir» con todo ya cargado y descartar con su motivo a quien ya no viene.",
  },
  {
    id: "HUsVKSOTa2I",
    orden: 6,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Recordar a los que deben",
    descripcion:
      "Lo vencido, lo que vence pronto y los abonos a medias; mandar el recordatorio con el QR por WhatsApp (al tutor si es menor) y a varios a la vez.",
  },
  {
    id: "fm-ROfOKdMQ",
    orden: 7,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Vender un producto",
    descripcion:
      "Buscar los productos en el punto de venta, cobrar en efectivo con el cambio que calcula el sistema y mandar el recibo por WhatsApp. La venta entra en tu caja.",
  },
  {
    id: "2FvsPNp2evA",
    orden: 8,
    seccion: "Recepción de la academia",
    rubros: ["ACADEMIA"],
    titulo: "Cerrar la caja",
    descripcion:
      "Cuánto tendría que haber en el cajón (lo del QR no va ahí), contar el efectivo billete por billete, anotar qué pasó si no cuadra y cerrar la caja.",
  },
];

/** Los que le tocan a este negocio. Sin rubro (sesión vieja) sólo los generales. */
export function tutorialesDelRubro(
  rubro: string | null | undefined,
  lista: Tutorial[] = TUTORIALES,
): Tutorial[] {
  return lista.filter((t) => !t.rubros?.length || (!!rubro && t.rubros.includes(rubro as Rubro)));
}

/** Filtra por título y descripción, sin distinguir tildes ni mayúsculas. */
export function buscarTutoriales(lista: Tutorial[], busqueda: string): Tutorial[] {
  const q = busqueda.trim();
  if (!q) return lista;
  return lista.filter((t) => contiene(t.titulo, q) || contiene(t.descripcion, q));
}

export interface SeccionTutoriales {
  seccion: string;
  tutoriales: Tutorial[];
}

/**
 * Agrupa por sección y ordena por `orden` dentro de cada una. Las secciones
 * salen en el orden en que aparecen en `TUTORIALES`: quien arma la lista
 * decide qué se ve primero sin tener que numerar las secciones.
 */
export function porSeccion(lista: Tutorial[]): SeccionTutoriales[] {
  const grupos = new Map<string, Tutorial[]>();
  for (const t of lista) {
    const s = t.seccion?.trim() || SECCION_GENERAL;
    grupos.set(s, [...(grupos.get(s) ?? []), t]);
  }
  return Array.from(grupos, ([seccion, tutoriales]) => ({
    seccion,
    tutoriales: [...tutoriales].sort((a, b) => a.orden - b.orden),
  }));
}

/** La vista previa que publica YouTube para cada video (480×360, sin API). */
export const miniaturaDe = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

/**
 * El reproductor dentro de la app. `youtube-nocookie` no deja cookies de
 * YouTube hasta que se le da play; `autoplay` porque se abre al tocar el
 * video, y `rel=0` para que al terminar sugiera videos del mismo canal y no
 * cualquier cosa.
 */
export const reproductorDe = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;

export const enYoutubeDe = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
