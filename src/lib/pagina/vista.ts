import { urlRuta, type Ubicacion } from "../mapa";
import { TITULO_CATALOGO } from "./catalogo";
import type {
  CatalogoPublico,
  EnlaceEditor,
  EnlacePublico,
  EstadoEditor,
  ItemCatalogoPublico,
  PaginaPublica,
  SucursalEditor,
} from "./tipos";
import { numeroInternacional } from "./whatsapp";
import { iniciales } from "../format";

/** El `wa.me` del WhatsApp de una sucursal, como lo arma el backend. */
function urlWhatsappSucursal(numero: string | null | undefined): string | null {
  const n = numeroInternacional(numero);
  return n ? `https://wa.me/${n}` : null;
}

/** Día de hoy en Bolivia (UTC−4), como lo compara el backend. */
export function hoyBolivia(ahora = new Date()): string {
  return new Date(ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * URL de "Cómo llegar", como la arma el backend (`mapaDeSucursal`): la ruta a
 * la ubicación marcada o, sin ella, una búsqueda por dirección.
 */
export function urlMapa(direccion: string | null, ubicacion: Ubicacion | null = null): string | null {
  if (ubicacion) return urlRuta(ubicacion);
  if (!direccion) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
}

/** El punto marcado en la ficha de la sucursal (PLAN-PAGINA-WEB §3.1). */
function marcadaDe(s: SucursalEditor): Ubicacion | null {
  return s.latitud != null && s.longitud != null ? { lat: s.latitud, lng: s.longitud } : null;
}

/**
 * El catálogo como lo sirve el backend: uno u otro según el modo, sólo lo
 * visible, en orden; null si no queda nada. En "Mis productos" los ids son
 * los del producto (el backend manda los de la fila fijada): para la vista
 * previa da igual, sólo tienen que ser únicos.
 */
function catalogoVisible(e: EstadoEditor): CatalogoPublico | null {
  const titulo = e.pagina.catalogoTitulo?.trim() || TITULO_CATALOGO;
  if (e.pagina.catalogoModo === "PRODUCTOS") return productosVisibles(e, titulo);
  const items = (e.catalogo ?? [])
    .filter((x) => x.visible)
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
    .map((x) => ({
      id: x.id,
      titulo: x.titulo,
      descripcion: x.descripcion,
      precio: x.precio,
      precioDesde: x.precioDesde,
      fotoUrl: x.fotoUrl,
    }));
  if (items.length === 0) return null;
  return { titulo, items };
}

/**
 * «Mis productos» como los arma el backend (`armarProductosPublicos`): el
 * precio sale de las sucursales publicadas (la principal primero) o, si no se
 * publicó ninguna, de la principal; la excepción de la sucursal manda sobre
 * el precio de lista, y lo que ahí no se ofrece no sale. Con dos o más
 * publicadas, el detalle de cada una para el selector.
 */
function productosVisibles(e: EstadoEditor, titulo: string): CatalogoPublico | null {
  const publicadas = e.sucursales.filter((s) => s.publicarEnPagina);
  const principal = e.sucursales.find((s) => s.esPrincipal);
  const fuentes = publicadas.length ? publicadas : principal ? [principal] : [];
  const items: ItemCatalogoPublico[] = [];
  for (const x of [...(e.productosCatalogo ?? [])].filter((x) => x.vendible).sort((a, b) => a.orden - b.orden)) {
    const en = fuentes.map((s) => {
      const f = x.porSucursal?.find((p) => p.almacenId === s.id);
      const precio = f?.precio ?? x.precio;
      return { precio: precio != null && precio > 0 ? precio : null, disponible: f?.disponible ?? true };
    });
    if (en.length && !en.some((s) => s.disponible)) continue;
    const item: ItemCatalogoPublico = {
      id: x.id,
      titulo: x.nombre,
      descripcion: x.descripcion ?? null,
      precio: en.length ? en[0].precio : x.precio,
      precioDesde: false,
      fotoUrl: null,
      icono: x.icono,
      categoria: x.categoria,
    };
    items.push(fuentes.length > 1 ? { ...item, enSucursal: en } : item);
  }
  if (!items.length) return null;
  return fuentes.length > 1
    ? { titulo, items, sucursales: fuentes.map((s) => s.nombre), whatsapps: fuentes.map((s) => urlWhatsappSucursal(s.whatsapp)) }
    : { titulo, items };
}

/**
 * Arma, con lo que se está editando, la misma página que serviría el backend
 * (`pagina-publica.service.ts`, función `armar`). Es lo que alimenta la vista
 * previa en vivo: cada tecla se ve en el celular de al lado sin guardar.
 *
 * Si se toca una regla acá hay que tocarla allá (y al revés): la vista previa
 * tiene que mentir lo menos posible.
 */
export function vistaDesdeEditor(e: EstadoEditor, hoy = hoyBolivia()): PaginaPublica {
  const p = e.pagina;
  const conHorario = p.mostrarHorario !== false;
  const muestra = e.muestras.find((m) => m.clave === p.colorClave) ?? e.muestras[0];
  const visibles = [...e.enlaces].filter((x) => x.visible).sort((a, b) => a.orden - b.orden || a.id - b.id);
  const publico = (x: EnlaceEditor): EnlacePublico => ({
    id: x.id,
    tipo: x.tipo,
    etiqueta: x.etiqueta,
    url: x.url,
    icono: x.icono,
  });
  const reservar = e.reservaOnline && p.mostrarReservar;
  const destacadoFila = visibles.find((x) => x.id === p.enlaceDestacadoId) ?? null;
  const destacado = !reservar && destacadoFila ? publico(destacadoFila) : null;
  const botones = visibles
    .filter((x) => x.formato === "BOTON" && x.id !== destacado?.id)
    .sort((a, b) => (a.id === p.enlaceDestacadoId ? -1 : b.id === p.enlaceDestacadoId ? 1 : 0))
    .map(publico);
  const redes = visibles.filter((x) => x.formato !== "BOTON" && x.id !== destacado?.id).map(publico);
  const anuncioVigente = !!p.anuncioTexto?.trim() && (!p.anuncioHasta || p.anuncioHasta >= hoy);
  const descripcion = p.descripcion?.trim() || null;
  // El nombre propio de la página, si lo tiene (el `nombreEnPagina` del backend).
  const propio = p.nombrePublico?.trim() || null;
  return {
    subdominio: e.subdominio ?? "",
    nombre: propio ?? e.negocio.nombre,
    rubro: e.negocio.rubroNombre ?? "",
    // La clave, para hablar como el rubro ("Nuestras sedes" en un instituto).
    rubroClave: e.negocio.rubro,
    iniciales: propio ? iniciales(propio) : e.negocio.iniciales,
    descripcion,
    color: { clave: muestra?.clave ?? "VERDE", hex: muestra?.hex ?? "#0C7A55" },
    formaBotones: p.formaBotones,
    tipografia: p.tipografia,
    // Un backend anterior no manda el estilo: la página queda en Clásico.
    estilo: p.estiloClave ?? "CLASICO",
    logoUrl: e.imagenes.logo,
    portadaUrl: e.imagenes.portada,
    anuncio: anuncioVigente
      ? {
          texto: p.anuncioTexto!.trim(),
          url: p.anuncioUrl || null,
          estilo: p.anuncioEstilo ?? "SUAVE",
          colorFondo: p.anuncioColorFondo ?? null,
          colorTexto: p.anuncioColorTexto ?? null,
        }
      : null,
    reservar,
    destacado,
    redes,
    botones,
    sucursales: e.sucursales
      .filter((s) => s.publicarEnPagina)
      .map((s) => ({ s, marcada: marcadaDe(s) }))
      .map(({ s, marcada }) => ({
        nombre: s.nombre,
        reservaSlug: reservar && s.publicaReservas && s.slugReservas ? s.slugReservas : null,
        direccion: s.direccion,
        telefono: s.telefono,
        // Como el backend (`horarioDeSucursal`): el por día si el dueño no lo
        // ocultó; el texto de antes, sólo sin horario por día (02-nov).
        horario: conHorario && !s.horarioSemanal?.length ? s.horarioTexto?.trim() || null : null,
        // Como el backend (`mapaDeSucursal`, 03-nov): el pin sólo con el mapa a
        // la vista; "Cómo llegar" va al punto marcado aunque esté oculto.
        mapaUrl: urlMapa(s.direccion, marcada),
        ubicacion: p.mostrarMapa !== false ? marcada : null,
        horarioSemanal: conHorario && s.horarioSemanal?.length ? s.horarioSemanal : null,
        whatsappUrl: urlWhatsappSucursal(s.whatsapp),
      })),
    catalogo: catalogoVisible(e),
    pie: { atribucionUrl: "https://bamardev.com" },
    og: { titulo: e.negocio.nombre, descripcion: descripcion ?? "", imagen: null, url: e.urlPublica ?? "" },
  };
}

/** Teléfono a `tel:` (Bolivia por defecto). */
export function urlTelefono(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  return `tel:+${d.length === 8 ? `591${d}` : d}`;
}
