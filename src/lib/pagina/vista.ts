import type { EnlaceEditor, EnlacePublico, EstadoEditor, PaginaPublica } from "./tipos";

/** Día de hoy en Bolivia (UTC−4), como lo compara el backend. */
export function hoyBolivia(ahora = new Date()): string {
  return new Date(ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** URL de "Cómo llegar": el mapa pegado o una búsqueda por dirección. */
export function urlMapa(mapsUrl: string | null, direccion: string | null): string | null {
  if (mapsUrl) return mapsUrl;
  if (!direccion) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
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
  return {
    subdominio: e.subdominio ?? "",
    nombre: e.negocio.nombre,
    rubro: e.negocio.rubroNombre ?? "",
    iniciales: e.negocio.iniciales,
    descripcion,
    color: { clave: muestra?.clave ?? "VERDE", hex: muestra?.hex ?? "#0C7A55" },
    formaBotones: p.formaBotones,
    tipografia: p.tipografia,
    logoUrl: e.imagenes.logo,
    portadaUrl: e.imagenes.portada,
    anuncio: anuncioVigente ? { texto: p.anuncioTexto!.trim(), url: p.anuncioUrl || null } : null,
    reservar,
    destacado,
    redes,
    botones,
    sucursales: e.sucursales
      .filter((s) => s.publicarEnPagina)
      .map((s) => ({
        nombre: s.nombre,
        reservaSlug: reservar && s.publicaReservas && s.slugReservas ? s.slugReservas : null,
        direccion: s.direccion,
        telefono: s.telefono,
        horario: s.horarioTexto,
        mapaUrl: urlMapa(s.mapsUrl, s.direccion),
      })),
    pie: { atribucionUrl: "https://bamardev.com" },
    og: { titulo: e.negocio.nombre, descripcion: descripcion ?? "", imagen: null, url: e.urlPublica ?? "" },
  };
}

/** Teléfono a `tel:` (Bolivia por defecto). */
export function urlTelefono(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  return `tel:+${d.length === 8 ? `591${d}` : d}`;
}
