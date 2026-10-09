import { describe, expect, it } from "vitest";
import { puedeVer } from "../permisos";
import { contactoDe } from "./contacto";
import { esRutaDePaginaPublica } from "./rutas";
import { iconoDe, ICONO_BOTON, ICONO_RED, mezcla, paleta } from "./aspecto";
import { estiloBotones } from "./estilos";
import { medidas } from "./imagen";
import type { EstadoEditor } from "./tipos";
import { hoyBolivia, urlMapa, vistaDesdeEditor } from "./vista";

const MUESTRAS = [
  { clave: "CIRUELA", nombre: "Ciruela", hex: "#9B2C6B" },
  { clave: "NARANJA", nombre: "Naranja", hex: "#B4501A" },
];

function editor(cambios: Partial<EstadoEditor> = {}): EstadoEditor {
  return {
    subdominio: "bellavista",
    urlPublica: "https://app-qa.bamardev.com/p/bellavista",
    negocio: { nombre: "Salón Bella Vista", rubro: "PELUQUERIA", iniciales: "SB" },
    pagina: {
      publicada: true,
      bloqueada: false,
      motivoBloqueo: null,
      descripcion: "Cortes y color",
      colorClave: "NARANJA",
      formaBotones: "REDONDEADO",
      tipografia: "ELEGANTE",
      anuncioTexto: null,
      anuncioHasta: null,
      anuncioUrl: null,
      enlaceDestacadoId: 2,
      mostrarReservar: true,
      catalogoTitulo: null,
      actualizadoEn: "2026-10-06T00:00:00Z",
    },
    imagenes: { logo: null, portada: null },
    enlaces: [
      { id: 1, tipo: "INSTAGRAM", formato: "ICONO", etiqueta: "Instagram", valor: "@bv", url: "https://www.instagram.com/bv", icono: null, orden: 2, visible: true, clics: 0 },
      { id: 2, tipo: "WHATSAPP", formato: "BOTON", etiqueta: "Escribinos", valor: "70123456", url: "https://wa.me/59170123456", icono: null, orden: 1, visible: true, clics: 3 },
      { id: 3, tipo: "FACEBOOK", formato: "ICONO", etiqueta: "Facebook", valor: "bv", url: "https://www.facebook.com/bv", icono: null, orden: 3, visible: false, clics: 0 },
      { id: 4, tipo: "BOTON", formato: "BOTON", etiqueta: "Precios", valor: "https://bv.bo", url: "https://bv.bo/", icono: "promo", orden: 4, visible: true, clics: 0 },
    ],
    sucursales: [
      { id: 10, nombre: "Centro", direccion: "Junín 245", telefono: "33445566", esPrincipal: true, publicarEnPagina: true, horarioTexto: "9 a 20", mapsUrl: null },
      { id: 11, nombre: "Sur", direccion: null, telefono: null, esPrincipal: false, publicarEnPagina: false, horarioTexto: null, mapsUrl: null },
    ],
    reservaOnline: false,
    enlacesCortos: true,
    muestras: MUESTRAS,
    catalogo: [],
    topeCatalogo: 60,
    ...cambios,
  };
}

describe("apariencia", () => {
  it("el tinte y el oscuro salen de la muestra, como en el lienzo", () => {
    expect(mezcla("#000000", "#ffffff", 0.5)).toBe("#808080");
    const p = paleta("#9B2C6B");
    expect(p.acento).toBe("#9B2C6B");
    expect(p.tinte).toBe(mezcla("#9B2C6B", "#ffffff", 0.88));
    expect(p.oscuro).toBe(mezcla("#9B2C6B", "#000000", 0.35));
  });

  it("la forma de los botones y un valor desconocido", () => {
    const radio = (f: string) => estiloBotones(f, paleta("#9B2C6B")).principal.estilo.borderRadius;
    expect(radio("PILDORA")).toBe("999px");
    expect(radio("RECTO")).toBe("4px");
    expect(radio("OTRA")).toBe("14px");
  });

  it("el ícono es el de la red, salvo el botón libre que lleva el elegido", () => {
    expect(iconoDe("WHATSAPP", null)).toBe(ICONO_RED.WHATSAPP);
    expect(iconoDe("BOTON", "menu")).toBe(ICONO_BOTON.menu);
    expect(iconoDe("BOTON", null)).toBe(ICONO_BOTON.enlace);
    expect(iconoDe("RARO", null)).toBe(ICONO_RED.BOTON);
  });
});

describe("vista previa desde el editor", () => {
  it("arma la página como el backend: destacado arriba, ocultos fuera, sucursales marcadas", () => {
    const v = vistaDesdeEditor(editor());
    expect(v.color).toEqual({ clave: "NARANJA", hex: "#B4501A" });
    expect(v.reservar).toBe(false);
    expect(v.destacado?.id).toBe(2);
    expect(v.redes.map((r) => r.id)).toEqual([1]);
    expect(v.botones.map((b) => b.id)).toEqual([4]);
    expect(v.sucursales).toEqual([
      expect.objectContaining({
        nombre: "Centro",
        horario: "9 a 20",
        // Sin reserva online no hay "Reservar" en la tarjeta (B07).
        reservaSlug: null,
        mapaUrl: expect.stringContaining("query=Jun%C3%ADn%20245"),
      }),
    ]);
  });

  it("con la reserva online, Reservar va arriba y el destacado encabeza los botones", () => {
    const v = vistaDesdeEditor(editor({ reservaOnline: true }));
    expect(v.reservar).toBe(true);
    expect(v.destacado).toBeNull();
    expect(v.botones.map((b) => b.id)).toEqual([2, 4]);
  });

  it("el anuncio vencido no se ve; el vigente sí", () => {
    const base = editor();
    const vencido = vistaDesdeEditor({ ...base, pagina: { ...base.pagina, anuncioTexto: "2x1", anuncioHasta: "2020-01-01" } });
    expect(vencido.anuncio).toBeNull();
    const vigente = vistaDesdeEditor(
      { ...base, pagina: { ...base.pagina, anuncioTexto: " 2x1 ", anuncioHasta: "2026-10-06" } },
      "2026-10-06",
    );
    // Sin estilo guardado (backend anterior): la franja de siempre.
    expect(vigente.anuncio).toEqual({ texto: "2x1", url: null, estilo: "SUAVE", colorFondo: null, colorTexto: null });
  });

  it("el catálogo: sólo los visibles, en orden, y sin ítems no hay sección", () => {
    expect(vistaDesdeEditor(editor()).catalogo).toBeNull();
    const item = (id: number, orden: number, visible = true) => ({
      id,
      titulo: `Ítem ${id}`,
      descripcion: null,
      precio: 80,
      precioDesde: false,
      visible,
      orden,
      fotoUrl: null,
    });
    const v = vistaDesdeEditor(editor({ catalogo: [item(1, 2), item(2, 1), item(3, 3, false)] }));
    expect(v.catalogo?.titulo).toBe("Catálogo");
    expect(v.catalogo?.items.map((x) => x.id)).toEqual([2, 1]);
    expect(v.catalogo?.items[0]).not.toHaveProperty("visible");
    // El título del borrador, recortado.
    const base = editor({ catalogo: [item(1, 1)] });
    const conTitulo = vistaDesdeEditor({ ...base, pagina: { ...base.pagina, catalogoTitulo: " Menú " } });
    expect(conTitulo.catalogo?.titulo).toBe("Menú");
    // Todos ocultos: como si no hubiera.
    expect(vistaDesdeEditor(editor({ catalogo: [item(1, 1, false)] })).catalogo).toBeNull();
  });

  it("hoy en Bolivia es UTC−4", () => {
    expect(hoyBolivia(new Date("2026-10-07T03:00:00Z"))).toBe("2026-10-06");
    expect(hoyBolivia(new Date("2026-10-07T05:00:00Z"))).toBe("2026-10-07");
  });

  it("el mapa: el pegado o una búsqueda por dirección", () => {
    expect(urlMapa("https://maps.app.goo.gl/x", "Junín")).toBe("https://maps.app.goo.gl/x");
    expect(urlMapa(null, null)).toBeNull();
  });
});

describe("imágenes", () => {
  it("el logo se recorta al cuadrado del centro y no pasa de 512", () => {
    expect(medidas("logo", 1200, 800)).toEqual({ ancho: 512, alto: 512, sx: 200, sy: 0, sw: 800, sh: 800 });
    expect(medidas("logo", 300, 400)).toMatchObject({ ancho: 300, alto: 300, sy: 50 });
  });

  it("la portada sólo se achica a 1600 de ancho", () => {
    expect(medidas("portada", 4000, 2000)).toMatchObject({ ancho: 1600, alto: 800 });
    expect(medidas("portada", 1000, 500)).toMatchObject({ ancho: 1000, alto: 500 });
  });

  it("la foto del catálogo conserva la proporción: lado mayor 1200, nunca se agranda", () => {
    expect(medidas("catalogo", 4000, 3000)).toEqual({ ancho: 1200, alto: 900, sx: 0, sy: 0, sw: 4000, sh: 3000 });
    // Vertical: manda el alto.
    expect(medidas("catalogo", 3000, 4000)).toMatchObject({ ancho: 900, alto: 1200 });
    expect(medidas("catalogo", 800, 600)).toMatchObject({ ancho: 800, alto: 600 });
    // Una panorámica no queda con el lado corto bajo los 200 que pide el backend.
    expect(medidas("catalogo", 4000, 500)).toMatchObject({ ancho: 1600, alto: 200 });
  });
});

describe("rutas y permisos", () => {
  it("sólo /p/<negocio> y su privacidad son públicas", () => {
    expect(esRutaDePaginaPublica("/p/bellavista")).toBe(true);
    expect(esRutaDePaginaPublica("/p/bellavista/privacidad")).toBe(true);
    expect(esRutaDePaginaPublica("/p/")).toBe(false);
    expect(esRutaDePaginaPublica("/pos")).toBe(false);
    expect(esRutaDePaginaPublica("/p/bv/otra")).toBe(false);
  });

  it("Mi página: con negocio.configurar y sólo con la feature (sin fallar abierto)", () => {
    const base = { rubro: "RESTAURANTE", permisos: ["negocio.configurar"] };
    expect(puedeVer({ ...base, features: ["pos", "pagina_publica"] }, "mi_pagina")).toBe(true);
    expect(puedeVer({ ...base, features: ["pos"] }, "mi_pagina")).toBe(false);
    // Lista vacía: el resto de la app falla abierto, la página no.
    expect(puedeVer({ ...base, features: [] }, "mi_pagina")).toBe(false);
    expect(puedeVer({ ...base, permisos: ["ventas.vender"], features: ["pagina_publica"] }, "mi_pagina")).toBe(false);
    expect(puedeVer({ ...base, features: ["pagina_publica"] }, "mis_enlaces")).toBe(false);
    expect(puedeVer({ ...base, features: ["enlaces_cortos"] }, "mis_enlaces")).toBe(true);
  });
});

describe("privacidad del cliente", () => {
  it("el contacto es el WhatsApp de la página, si no el teléfono de una sucursal", () => {
    const v = vistaDesdeEditor(editor());
    // Con el número a la vista (B08).
    expect(contactoDe(v)).toEqual({ texto: "por WhatsApp al 70123456", url: "https://wa.me/59170123456" });
    const sinWa = { ...v, destacado: null, botones: [], redes: [] };
    expect(contactoDe(sinWa)).toEqual({ texto: "al 33445566", url: "tel:33445566" });
    expect(contactoDe({ ...sinWa, sucursales: [] })).toBeNull();
  });
});
