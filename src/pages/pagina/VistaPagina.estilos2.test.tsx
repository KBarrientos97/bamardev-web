import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ItemCatalogoPublico, PaginaPublica } from "../../lib/pagina/tipos";
import { repartir } from "./piezasArmado";
import VistaPagina from "./VistaPagina";

/**
 * Los estilos de la fase 2 (09-oct): Postal, Carta, Dulce y Mosaico, cada
 * uno en celular y en computadora, con y sin portada, catálogo y sucursales.
 */

const ITEMS: ItemCatalogoPublico[] = [
  { id: 1, titulo: "Fade", descripcion: "Con navaja", precio: 50, precioDesde: false, fotoUrl: "/publico/pagina/elfilo/catalogo/1?v=1" },
  { id: 2, titulo: "Barba", descripcion: null, precio: 30, precioDesde: true, fotoUrl: null },
  { id: 3, titulo: "Cejas", descripcion: "Con hilo", precio: 15, precioDesde: false, fotoUrl: null },
];

const PAGINA: PaginaPublica = {
  subdominio: "elfilo",
  nombre: "Barbería El Filo",
  rubro: "Barbería",
  iniciales: "EF",
  descripcion: "Fade, clásico y barba. Sin apuro.",
  color: { clave: "TEJA", hex: "#B23A2E" },
  formaBotones: "REDONDEADO",
  tipografia: "MONTSERRAT",
  logoUrl: "/publico/pagina/elfilo/imagen/logo?v=1",
  portadaUrl: "/publico/pagina/elfilo/imagen/portada?v=1",
  anuncio: { texto: "Corte + barba a Bs 70", url: null },
  reservar: true,
  destacado: null,
  redes: [{ id: 1, tipo: "INSTAGRAM", etiqueta: "Instagram", url: "https://www.instagram.com/elfilo", icono: null }],
  botones: [{ id: 2, tipo: "BOTON", etiqueta: "Promos del mes", url: "https://elfilo.bo/promos", icono: "promo" }],
  sucursales: [
    { nombre: "Centro", reservaSlug: "centro", direccion: "Calle Sucre #312", telefono: "33112233", horario: "Lun a sáb 10 a 21", mapaUrl: "https://maps.app.goo.gl/x" },
    { nombre: "Norte", reservaSlug: null, direccion: "Av. Banzer 4to anillo", telefono: null, horario: null, mapaUrl: null },
  ],
  catalogo: { titulo: "Cortes", items: ITEMS },
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Barbería El Filo", descripcion: "", imagen: null, url: "" },
};

const ESTILOS = ["POSTAL", "CARTA", "DULCE", "MOSAICO"] as const;
const MODOS = ["movil", "escritorio"] as const;
/** El pie, con el texto de hoy o el que viene ("Powered by"). */
const PIE = /(Hecho con|Powered by) BamarDev/;

function montar(p: Partial<PaginaPublica>, modo: (typeof MODOS)[number]) {
  return render(<VistaPagina pagina={{ ...PAGINA, ...p }} urlReservar="/r/elfilo/reservar" urlPrivacidad="/p/elfilo/privacidad" modo={modo} />);
}

describe("estilos de la fase 2", () => {
  for (const estilo of ESTILOS) {
    for (const modo of MODOS) {
      for (const conPortada of [true, false]) {
        it(`${estilo} en ${modo}, ${conPortada ? "con" : "sin"} portada: todo lo de la página, con un solo h1 y un main`, () => {
          const { unmount } = montar({ estilo, portadaUrl: conPortada ? PAGINA.portadaUrl : null }, modo);
          const vista = screen.getByTestId("vista-pagina");
          expect(vista).toHaveAttribute("data-estilo", estilo);
          expect(vista).toHaveAttribute("data-modo", modo);
          expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
          expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Barbería El Filo");
          expect(screen.getAllByRole("main")).toHaveLength(1);
          expect(screen.getByAltText("Logo de Barbería El Filo")).toBeInTheDocument();
          expect(screen.getByRole("link", { name: /Reservar turno/ })).toHaveAttribute("href", "/r/elfilo/reservar");
          expect(screen.getByRole("link", { name: /Promos del mes/ })).toHaveAttribute("href", "https://elfilo.bo/promos");
          expect(screen.getByRole("link", { name: "Instagram" })).toBeInTheDocument();
          expect(screen.getByRole("note")).toHaveTextContent("Corte + barba a Bs 70");
          expect(screen.getByRole("heading", { level: 2, name: "Cortes" })).toBeInTheDocument();
          expect(screen.getByRole("heading", { level: 2, name: /sucursales/i })).toBeInTheDocument();
          expect(screen.getByRole("link", { name: "Reservar" })).toHaveAttribute("href", "/r/elfilo/reservar/centro");
          // Carta repite "Llamar" en un mosaico de acción, además de en la tarjeta.
          for (const llamar of screen.getAllByRole("link", { name: "Llamar" })) expect(llamar).toHaveAttribute("href", "tel:+59133112233");
          expect(screen.getByRole("link", { name: PIE })).toBeInTheDocument();
          expect(screen.getByText("Norte")).toBeInTheDocument();
          // Los tres ítems del catálogo se pueden abrir (en el carrusel, los que no se ven quedan fuera del árbol hasta que pasan).
          for (const t of ["Fade", "Barba", "Cejas"]) {
            expect(vista.querySelector(`button[aria-label^="${t},"]`), t).toHaveAttribute("aria-haspopup", "dialog");
          }
          // Mosaico no usa la portada: ni siquiera la pide.
          expect(vista.innerHTML.includes("imagen/portada")).toBe(conPortada && estilo !== "MOSAICO");
          unmount();
        });
      }
    }
  }

  it("cada uno aguanta una página casi vacía y un nombre largo", () => {
    const vacia: Partial<PaginaPublica> = {
      nombre: "Peluquería y Centro de Estética Integral Las Hermanas Gutiérrez",
      descripcion: null,
      rubro: "",
      logoUrl: null,
      portadaUrl: null,
      anuncio: null,
      reservar: false,
      destacado: null,
      redes: [],
      botones: [],
      sucursales: [],
      catalogo: null,
    };
    for (const estilo of ESTILOS) {
      for (const modo of MODOS) {
        const { unmount } = montar({ ...vacia, estilo }, modo);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Hermanas Gutiérrez/);
        expect(screen.queryByRole("note")).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Llamar|Cómo llegar/ })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: PIE })).toBeInTheDocument();
        unmount();
      }
    }
  });

  it("Postal: la portada desenfocada de fondo, pedida primero y con medidas; todo adentro de la tarjeta blanca", () => {
    const { unmount } = montar({ estilo: "POSTAL" }, "movil");
    const vista = screen.getByTestId("vista-pagina");
    const fondo = vista.querySelector("img[src*='portada']")!;
    expect(fondo).toHaveAttribute("fetchpriority", "high");
    expect(fondo).toHaveAttribute("width", "1600");
    expect((fondo as HTMLElement).style.filter).toBe("blur(24px)");
    // En la página de verdad queda fijo mientras se baja.
    expect((fondo as HTMLElement).style.position).toBe("fixed");
    const tarjeta = screen.getByRole("heading", { level: 1 }).closest("header")!.parentElement!;
    expect(tarjeta.style.background).toBe("rgb(255, 255, 255)");
    expect(within(tarjeta).getByRole("main")).toBeInTheDocument();
    unmount();
    // Sin portada: el degradado diagonal del color al tinte.
    montar({ estilo: "POSTAL", portadaUrl: null }, "escritorio");
    const html = screen.getByTestId("vista-pagina").innerHTML;
    expect(html).toContain("linear-gradient(135deg, rgb(178, 58, 46), rgb(246, 231, 230))");
  });

  it("Carta: el catálogo como lista de menú, con el precio a la derecha; tocar un plato abre el visor", () => {
    montar({ estilo: "CARTA" }, "movil");
    const lista = screen.getByRole("list");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
    const barba = within(lista).getByRole("button", { name: /^Barba, Desde Bs 30/ });
    // "desde" chiquito arriba del número.
    expect(within(barba).getByText("desde")).toBeInTheDocument();
    expect(within(barba).getByText("Bs 30")).toBeInTheDocument();
    // El menú se lee de arriba abajo: no es un carrusel que pasa solo.
    expect(screen.queryByTestId("fila-catalogo")).not.toBeInTheDocument();
    fireEvent.click(barba);
    const visor = screen.getByRole("dialog", { name: "Barba" });
    expect(within(visor).getByText("2 de 3")).toBeInTheDocument();
    expect(within(visor).getByRole("link", { name: /Reservar/ })).toHaveAttribute("href", "/r/elfilo/reservar");
  });

  it("Carta: las acciones van como mosaicos parejos (principal, Llamar, Cómo llegar y los botones)", () => {
    montar({ estilo: "CARTA" }, "movil");
    const filas = Array.from(document.querySelectorAll<HTMLElement>("[data-fila-mosaicos]"));
    const enFilas = filas.map((f) => f.children.length);
    // 4 acciones de a 3 por fila = 2 y 2: ninguna fila con un hueco.
    expect(enFilas).toEqual([2, 2]);
    const primera = filas[0].children[0] as HTMLElement;
    expect(primera).toHaveTextContent("Reservar turno");
    expect(primera.style.background).toBe("rgb(178, 58, 46)");
    expect(within(filas[0]).getByRole("link", { name: "Llamar" })).toBeInTheDocument();
    expect(within(filas[1]).getByRole("link", { name: "Cómo llegar" })).toHaveAttribute("href", "https://maps.app.goo.gl/x");
  });

  it("Carta en computadora: la carta a la izquierda y el panel con el logo, el botón grande, los mosaicos y las sucursales", () => {
    const { unmount } = montar({ estilo: "CARTA" }, "escritorio");
    const panel = screen.getByRole("complementary", { name: "Contacto" });
    expect(within(panel).getByAltText("Logo de Barbería El Filo")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Reservar turno/ })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: /sucursales/i })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("list")).toBeInTheDocument();
    unmount();
    // Sin catálogo no hay carta que poner a la izquierda: una sola columna, sin hueco.
    montar({ estilo: "CARTA", catalogo: null }, "escritorio");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("link", { name: /Reservar turno/ })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("heading", { name: /sucursales/i })).toBeInTheDocument();
  });

  it("Carta sin portada: la banda es del color", () => {
    montar({ estilo: "CARTA", portadaUrl: null }, "movil");
    const banda = screen.getByTestId("vista-pagina").firstElementChild as HTMLElement;
    expect(banda.style.backgroundColor).toBe("rgb(178, 58, 46)");
  });

  it("Dulce: el fondo es el tinte, la portada termina en onda y tiene su prioridad", () => {
    const { unmount } = montar({ estilo: "DULCE" }, "movil");
    const vista = screen.getByTestId("vista-pagina");
    expect(vista.style.background).toBe("rgb(246, 231, 230)");
    const portada = vista.querySelector("img[src*='portada']")!;
    expect(portada).toHaveAttribute("fetchpriority", "high");
    expect(portada).toHaveAttribute("height", "600");
    expect(vista.querySelector("header svg path")).toHaveAttribute("fill", "#f6e7e6");
    unmount();
    // Sin portada: un bloque del color, con la misma onda.
    montar({ estilo: "DULCE", portadaUrl: null }, "escritorio");
    const header = screen.getByTestId("vista-pagina").querySelector("header")!;
    expect((header.firstElementChild as HTMLElement).style.background).toContain("linear-gradient");
    expect(header.querySelector("svg path")).toBeInTheDocument();
  });

  it("Mosaico: el primer ítem grande con título y precio encima; tocarlo abre el visor", () => {
    montar({ estilo: "MOSAICO", catalogo: { titulo: "Cortes", items: [...ITEMS, { ...ITEMS[2], id: 4, titulo: "Tinte" }] } }, "movil");
    const grande = screen.getByRole("button", { name: /^Fade, Bs 50 \(1 de 4\)/ });
    expect(within(grande).getByText("Fade")).toBeInTheDocument();
    expect(within(grande).getByText("Bs 50")).toBeInTheDocument();
    // El que no entra en la grilla se ve en el visor; el último chico lo avisa.
    expect(screen.getByText("Ver los 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tinte/ })).not.toBeInTheDocument();
    fireEvent.click(grande);
    const visor = screen.getByRole("dialog", { name: "Fade" });
    fireEvent.click(within(visor).getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("dialog", { name: "Barba" })).toBeInTheDocument();
  });

  it("Mosaico: la sucursal es un bloque oscuro con sus botones legibles", () => {
    montar({ estilo: "MOSAICO" }, "escritorio");
    const centro = screen.getByText("Centro").closest("article")!;
    expect(centro.style.background).toBe("rgb(28, 28, 31)");
    // El chico destacado (Reservar) y los chicos van con los colores de la superficie oscura.
    expect(within(centro).getByRole("link", { name: "Cómo llegar" }).style.background).toBe("rgb(38, 38, 42)");
  });

  it("Mosaico: ninguna combinación deja una celda vacía en la grilla", { timeout: 60_000 }, () => {
    const red = (id: number) => ({ id, tipo: "INSTAGRAM" as const, etiqueta: `Red ${id}`, url: `https://x.bo/${id}`, icono: null });
    const boton = (id: number) => ({ id, tipo: "BOTON" as const, etiqueta: `Botón ${id}`, url: `https://x.bo/b${id}`, icono: "promo" });
    for (const modo of MODOS) {
      for (const nRedes of [0, 1, 3]) {
        for (const nBotones of [0, 2]) {
          for (const nItems of [0, 1, 2, 5]) {
            for (const nSucursales of [0, 1, 3]) {
              // El anuncio, en la mitad de los casos: es un bloque ancho más.
              for (const anuncio of [(nRedes + nItems) % 2 ? PAGINA.anuncio : null]) {
                const { unmount } = montar(
                  {
                    estilo: "MOSAICO",
                    redes: Array.from({ length: nRedes }, (_, i) => red(100 + i)),
                    botones: Array.from({ length: nBotones }, (_, i) => boton(200 + i)),
                    catalogo: nItems ? { titulo: "Cortes", items: Array.from({ length: nItems }, (_, i) => ({ ...ITEMS[i % 3], id: 300 + i })) } : null,
                    sucursales: Array.from({ length: nSucursales }, (_, i) => ({ ...PAGINA.sucursales[1], nombre: `Sucursal ${i}` })),
                    anuncio,
                  },
                  modo,
                );
                const caso = `${modo} redes ${nRedes} botones ${nBotones} ítems ${nItems} sucursales ${nSucursales} anuncio ${!!anuncio}`;
                const filas = Array.from(document.querySelectorAll<HTMLElement>("[data-fila-mosaico]"));
                for (const f of filas) {
                  const n = f.children.length;
                  expect(n, caso).toBeGreaterThan(0);
                  expect(Number(f.dataset.filaMosaico), caso).toBe(n);
                  // Tantas columnas como bloques: la fila se llena entera.
                  expect(f.style.gridTemplateColumns, caso).toBe(`repeat(${n}, minmax(0, 1fr))`);
                  expect(n, caso).toBeLessThanOrEqual(modo === "escritorio" ? 4 : 2);
                }
                // Todos los enlaces están: las redes y los botones como cuadrados.
                expect(screen.queryAllByRole("link", { name: /^(Red|Botón) / }), caso).toHaveLength(nRedes + nBotones);
                unmount();
              }
            }
          }
        }
      }
    }
  });
});

describe("repartir", () => {
  it("filas parejas, sin huecos y sin pasarse del tope", () => {
    expect(repartir(4, 3)).toEqual([2, 2]);
    expect(repartir(5, 3)).toEqual([3, 2]);
    expect(repartir(7, 3)).toEqual([3, 2, 2]);
    expect(repartir(3, 2)).toEqual([2, 1]);
    expect(repartir(0, 4)).toEqual([]);
    for (let n = 1; n <= 20; n++) {
      for (const tope of [1, 2, 3, 4]) {
        const filas = repartir(n, tope);
        expect(filas.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...filas)).toBeLessThanOrEqual(tope);
        expect(Math.max(...filas) - Math.min(...filas)).toBeLessThanOrEqual(1);
      }
    }
  });
});
