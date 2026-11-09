import { describe, expect, it } from "vitest";
import {
  aPaginaSeo,
  descripcionSeo,
  esIndexable,
  horarioEnTexto,
  horarioSchema,
  inyectarSeo,
  jsonLd,
  MAX_ITEMS,
  precioEnTexto,
  tipoSchema,
  type PaginaSeo,
} from "./seo";
import { paginaDePrueba } from "./paginaDePrueba";

/** PLAN-PAGINA-PRO M0: la página escrita para buscadores y lectores de IA. */

const BASE = "https://api-qa.bamardev.com/api";
const INDEX = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="theme-color" content="#10B981" />
    <title>BamarDev — Inventario y Punto de Venta</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const pagina = (cambios: Record<string, unknown> = {}): PaginaSeo => {
  const p = aPaginaSeo(paginaDePrueba("https://link-qa.bamardev.com", cambios));
  if (!p) throw new Error("la página de prueba tiene que validar");
  return p;
};

/** El JSON-LD que quedó en el HTML, parseado. */
function ldDe(html: string): Record<string, unknown> {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("sin JSON-LD");
  return JSON.parse(m[1]);
}

describe("aPaginaSeo", () => {
  it("toma lo que la página muestra y descarta lo que no tiene forma", () => {
    const p = pagina();
    expect(p.nombre).toBe("Salón Bella Vista");
    expect(p.color).toBe("#DA2372");
    expect(p.sucursales).toHaveLength(2);
    expect(p.sucursales[0].horarioSemanal).toHaveLength(3);
    expect(p.catalogo?.items).toHaveLength(3);
    expect(p.redes[0].url).toBe("https://instagram.com/bellavista");
  });

  it("sin nombre, subdominio o URL no hay página", () => {
    expect(aPaginaSeo(null)).toBeNull();
    expect(aPaginaSeo({ algo: "raro" })).toBeNull();
    expect(aPaginaSeo(paginaDePrueba(undefined, { og: { url: "javascript:alert(1)" } }))).toBeNull();
  });

  it("limpia etiquetas, enlaces que no son web, horarios y ubicaciones rotas", () => {
    const p = pagina({
      descripcion: "<b>Lo mejor</b> del   barrio",
      redes: [
        { etiqueta: "Malo", url: "javascript:alert(1)" },
        { etiqueta: "Facebook", url: "https://facebook.com/bv" },
      ],
      sucursales: [
        {
          nombre: "Única",
          direccion: "Calle 1",
          horarioSemanal: [{ dia: 9, desde: "09:00", hasta: "10:00" }, { dia: 2, desde: "9", hasta: "10:00" }],
          ubicacion: { lat: 200, lng: 0 },
        },
      ],
    });
    expect(p.descripcion).toBe("Lo mejor del barrio");
    expect(p.redes.map((r) => r.etiqueta)).toEqual(["Facebook"]);
    expect(p.sucursales[0].horarioSemanal).toBeNull();
    expect(p.sucursales[0].ubicacion).toBeNull();
  });

  it("una carta larga se corta al tope", () => {
    const items = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => ({ titulo: `Plato ${i}`, precio: 10 }));
    expect(pagina({ catalogo: { titulo: "Carta", items } }).catalogo?.items).toHaveLength(MAX_ITEMS);
  });
});

describe("schema.org", () => {
  it("cada rubro con su tipo, y uno genérico si no se conoce", () => {
    expect(tipoSchema("RESTAURANTE")).toBe("Restaurant");
    expect(tipoSchema("FARMACIA")).toBe("Pharmacy");
    expect(tipoSchema("BARBERIA")).toBe("HairSalon");
    expect(tipoSchema("UNAS")).toBe("NailSalon");
    expect(tipoSchema("NUEVO")).toBe("LocalBusiness");
  });

  it("el horario: un tramo por objeto y la medianoche como 23:59", () => {
    expect(horarioSchema(pagina().sucursales[0].horarioSemanal)).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "09:00", closes: "13:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "15:00", closes: "21:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Saturday", opens: "09:00", closes: "23:59" },
    ]);
  });

  it("el negocio con su dirección, geo, redes, la otra sucursal y el catálogo en Bs", () => {
    const ld = jsonLd(pagina(), BASE) as Record<string, any>;
    expect(ld["@type"]).toBe("HairSalon");
    expect(ld.url).toBe("https://link-qa.bamardev.com/bellavista");
    expect(ld.address).toEqual({ "@type": "PostalAddress", streetAddress: "Av. Heroínas 123, Cochabamba", addressCountry: "BO" });
    expect(ld.geo).toEqual({ "@type": "GeoCoordinates", latitude: -17.39351, longitude: -66.15705 });
    expect(ld.telephone).toBe("4 4123456");
    expect(ld.image).toBe(`${BASE}/publico/pagina/bellavista/imagen/PORTADA?v=9`);
    expect(ld.sameAs).toEqual(["https://instagram.com/bellavista"]);
    expect(ld.department).toHaveLength(1);
    expect(ld.department[0].name).toBe("Salón Bella Vista · Norte");
    expect(ld.acceptsReservations).toBe(true);
    const [corte, color, peinado] = ld.hasOfferCatalog.itemListElement;
    // Belleza ofrece servicios, no productos.
    expect(corte).toMatchObject({ price: 60, priceCurrency: "BOB", itemOffered: { "@type": "Service", name: "Corte de dama" } });
    expect(color.priceSpecification).toEqual({ "@type": "PriceSpecification", minPrice: 150.5, priceCurrency: "BOB" });
    expect(color.itemOffered.image).toBe(`${BASE}/publico/pagina/bellavista/catalogo/2/foto?v=3`);
    expect(peinado.price).toBeUndefined();
    // Sin estrellas propias: Google no las muestra.
    expect(ld.aggregateRating).toBeUndefined();
  });

  it("un comercio ofrece productos", () => {
    const ld = jsonLd(pagina({ rubroClave: "MINIMARKET" }), BASE) as Record<string, any>;
    expect(ld["@type"]).toBe("ConvenienceStore");
    expect(ld.hasOfferCatalog.itemListElement[0].itemOffered["@type"]).toBe("Product");
  });
});

describe("cuándo se indexa", () => {
  it("con lugar, horario y algo que leer, sí", () => {
    expect(esIndexable(pagina())).toBe(true);
  });

  it("le falta cualquiera de los tres, no", () => {
    expect(esIndexable(pagina({ sucursales: [] }))).toBe(false);
    expect(
      esIndexable(pagina({ sucursales: [{ nombre: "A", direccion: "Calle 1", horario: null, horarioSemanal: null }] })),
    ).toBe(false);
    expect(esIndexable(pagina({ catalogo: null, descripcion: "Corta" }))).toBe(false);
    // Sin catálogo pero con una descripción de verdad, alcanza.
    expect(esIndexable(pagina({ catalogo: null }))).toBe(true);
  });
});

describe("textos", () => {
  it("horario por día, con los cerrados", () => {
    const dias = horarioEnTexto(pagina().sucursales[0].horarioSemanal);
    expect(dias[0]).toBe("Lunes 09:00–13:00 y 15:00–21:00");
    expect(dias[1]).toBe("Martes cerrado");
    expect(dias[5]).toBe("Sábado 09:00–24:00");
    expect(horarioEnTexto(null)).toEqual([]);
  });

  it("precios como en Bolivia", () => {
    expect(precioEnTexto(28)).toBe("28");
    expect(precioEnTexto(0.5)).toBe("0,50");
  });

  it("la descripción del dueño, o una armada con el rubro y la dirección", () => {
    expect(descripcionSeo(pagina())).toBe("Cortes, color y peinados en el centro de Cochabamba desde 2015.");
    expect(descripcionSeo(pagina({ descripcion: null }))).toBe(
      "Salón Bella Vista: Peluquería en Av. Heroínas 123, Cochabamba. Horarios, precios y contacto.",
    );
  });
});

describe("inyectarSeo", () => {
  it("título, canónica, robots, color, JSON-LD y el contenido dentro de #root", () => {
    const html = inyectarSeo(INDEX, pagina(), { base: BASE, indexable: true });
    expect(html).toContain("<title>Salón Bella Vista · Peluquería</title>");
    expect(html).not.toContain("Inventario y Punto de Venta");
    expect(html).toContain('<link rel="canonical" href="https://link-qa.bamardev.com/bellavista" />');
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(html).toContain('<meta name="theme-color" content="#DA2372" />');
    expect(html).not.toContain("#10B981");
    expect(html).toContain('<meta property="og:locale" content="es_BO" />');
    expect(ldDe(html)["@type"]).toBe("HairSalon");
    // Lo visible: lo mismo que dibuja la SPA.
    expect(html).toContain("<h1>Salón Bella Vista</h1>");
    expect(html).toContain("<p>Dirección: Av. Heroínas 123, Cochabamba</p>");
    expect(html).toContain('<a href="tel:44123456">4 4123456</a>');
    expect(html).toContain("<li>Lunes 09:00–13:00 y 15:00–21:00</li>");
    expect(html).toContain("<p>Horario: Lun a Sáb 10 a 20</p>");
    expect(html).toContain("<li><strong>Corte de dama</strong> — Bs 60. Con lavado</li>");
    expect(html).toContain("<li><strong>Color</strong> — desde Bs 150,50</li>");
    expect(html).toContain('<a href="https://link-qa.bamardev.com/bellavista/reservar">Reservar turno</a>');
    expect(html).not.toContain('<div id="root"></div>');
  });

  it("noindex cuando no corresponde indexar", () => {
    const html = inyectarSeo(INDEX, pagina(), { base: BASE, indexable: false });
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
  });

  it("nada del dueño puede romper el HTML ni el JSON-LD", () => {
    const nombre = 'Bar "El</script><script>alert(1)</script>"';
    const html = inyectarSeo(INDEX, pagina({ nombre, descripcion: "Ver </script> y <img src=x onerror=alert(1)>" }), {
      base: BASE,
      indexable: true,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("onerror=alert(1)>");
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(ldDe(html).name).toBe('Bar "El alert(1) "');
  });
});

describe("el sitio del Profesional en el HTML (PLAN-PAGINA-PRO M1)", () => {
  const SITIO = {
    plantilla: "BELLEZA",
    bloques: [
      { tipo: "PORTADA", titulo: "Cortes con oficio", subtitulo: null, fotos: [] },
      {
        tipo: "QUIENES",
        titulo: "Quiénes somos",
        texto: "Empezamos en 2015 con <b>una</b> silla.\nHoy somos cuatro.",
        desde: 2015,
        datos: [{ valor: "4", etiqueta: "estilistas" }],
        foto: null,
      },
      {
        tipo: "PREGUNTAS",
        titulo: "Preguntas",
        items: [
          { pregunta: "¿Tengo que reservar?", respuesta: "Te recomendamos reservar." },
          { pregunta: "", respuesta: "sin pregunta no va" },
        ],
      },
    ],
  };

  it("sin sitio no cambia nada", () => {
    expect(pagina().sitio).toBeNull();
    expect(pagina({ sitio: null }).sitio).toBeNull();
  });

  it("valida quiénes somos y las preguntas como el resto: texto plano y lo que tiene forma", () => {
    const p = pagina({ sitio: SITIO });
    expect(p.sitio?.quienes).toEqual({
      titulo: "Quiénes somos",
      texto: "Empezamos en 2015 con una silla.\nHoy somos cuatro.",
      desde: 2015,
      datos: [{ valor: "4", etiqueta: "estilistas" }],
    });
    expect(p.sitio?.preguntas).toEqual({
      titulo: "Preguntas",
      items: [{ pregunta: "¿Tengo que reservar?", respuesta: "Te recomendamos reservar." }],
    });
  });

  it("los recorta a los topes del backend y descarta lo que no tiene forma", () => {
    const largo = "x".repeat(900);
    const items = Array.from({ length: 12 }, (_, i) => ({ pregunta: `P${i}`, respuesta: "R" }));
    const p = pagina({
      sitio: { plantilla: "COMERCIO", bloques: [{ tipo: "QUIENES", texto: largo, desde: "2015", datos: "no" }, { tipo: "PREGUNTAS", items }] },
    });
    expect(p.sitio?.quienes?.texto).toHaveLength(600);
    expect(p.sitio?.quienes?.desde).toBeNull();
    expect(p.sitio?.quienes?.datos).toEqual([]);
    expect(p.sitio?.preguntas?.items).toHaveLength(8);
    expect(pagina({ sitio: "raro" }).sitio).toBeNull();
    expect(pagina({ sitio: { bloques: [{ tipo: "GALERIA" }] } }).sitio).toBeNull();
  });

  it("va escrito en el HTML visible, escapado", () => {
    const html = inyectarSeo(INDEX, pagina({ sitio: SITIO }), { base: BASE, indexable: true });
    expect(html).toContain(
      "<h2>Quiénes somos</h2><p>Desde 2015.</p><p>Empezamos en 2015 con una silla.</p><p>Hoy somos cuatro.</p>",
    );
    expect(html).toContain("<li>4 estilistas</li>");
    expect(html).toContain("<h2>Preguntas</h2><dl><dt>¿Tengo que reservar?</dt><dd>Te recomendamos reservar.</dd></dl>");
    const raro = inyectarSeo(
      INDEX,
      pagina({ sitio: { plantilla: "COMERCIO", bloques: [{ tipo: "PREGUNTAS", items: [{ pregunta: "¿A & B?", respuesta: '"sí"' }] }] } }),
      { base: BASE, indexable: true },
    );
    expect(raro).toContain("<dt>¿A &amp; B?</dt><dd>&quot;sí&quot;</dd>");
  });

  it("un quiénes somos largo también cuenta como algo que leer", () => {
    const vacia = { descripcion: null, catalogo: null };
    expect(esIndexable(pagina(vacia))).toBe(false);
    expect(esIndexable(pagina({ ...vacia, sitio: SITIO }))).toBe(true);
  });
});
