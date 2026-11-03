import { render, screen, within } from "@testing-library/react";
import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import { paleta } from "../../lib/pagina/aspecto";
import { estiloBotones } from "../../lib/pagina/estilos";
import { superficieSucursal, tonosPagina } from "../../lib/pagina/estilosPagina";
import type { FormaBotones, PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

/**
 * "Cómo llegar", "Llamar" y "Reservar" de cada sucursal (03-nov): son los
 * mismos botones de la página, con la forma, el color y la letra de Mi
 * página, y cambian cuando el dueño cambia esos ajustes (la vista previa del
 * editor es esta misma vista).
 */

const PAGINA: PaginaPublica = {
  subdominio: "buensabor",
  nombre: "Pollería El Buen Sabor",
  rubro: "Restaurante",
  iniciales: "PB",
  descripcion: null,
  color: { clave: "NARANJA", hex: "#B4501A" },
  formaBotones: "REDONDEADO",
  tipografia: "MODERNA",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: true,
  destacado: null,
  redes: [],
  botones: [{ id: 7, tipo: "INSTAGRAM", etiqueta: "Instagram", url: "https://instagram.com/buensabor", icono: null }],
  sucursales: [
    {
      nombre: "Av. Banzer",
      reservaSlug: "banzer",
      direccion: "Av. Banzer, 4to anillo",
      telefono: "33112233",
      horario: null,
      mapaUrl: "https://www.google.com/maps/dir/?api=1&destination=-17.78,-63.18",
    },
  ],
  catalogo: null,
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "", descripcion: "", imagen: null, url: "" },
};

const ESTILOS = ["CLASICO", "VITRINA", "VIVO", "NOCHE", "BOUTIQUE", "POSTAL", "CARTA", "DULCE", "MOSAICO"] as const;
const FORMAS: FormaBotones[] = ["REDONDEADO", "PILDORA", "RECTO", "CONTORNO", "TINTE", "SOMBRA_DURA", "DEGRADADO", "HOJA", "ESQUINA", "SUBRAYADO"];

function montar(p: Partial<PaginaPublica> = {}) {
  return render(<VistaPagina pagina={{ ...PAGINA, ...p }} urlReservar="/r/buensabor" modo="movil" />);
}

/** El botón de la tarjeta (en Carta, "Cómo llegar" también sale arriba, como mosaico). */
const deLaTarjeta = (texto: string) => within(screen.getByText("Av. Banzer").closest("article")!).getByRole("link", { name: texto });

const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * El botón tiene cada propiedad de la pieza. Se compara contra un elemento
 * pintado con la pieza sola: así React y jsdom dejan los dos igual (colores
 * en rgb, números en px).
 */
function esperarPieza(el: HTMLElement, estilo: CSSProperties) {
  const { container, unmount } = render(<span style={estilo} />);
  const esperado = (container.firstChild as HTMLElement).style;
  for (const k of Object.keys(estilo)) {
    expect(el.style.getPropertyValue(kebab(k)), k).toBe(esperado.getPropertyValue(kebab(k)));
  }
  unmount();
}

describe("botones de la tarjeta de sucursal", () => {
  for (const estilo of ESTILOS) {
    it(`${estilo}: con cada forma, "Cómo llegar" y "Llamar" son el botón secundario y "Reservar" el principal, pintados para la tarjeta`, { timeout: 30_000 }, () => {
      const c = paleta(PAGINA.color.hex);
      const sup = superficieSucursal(tonosPagina(estilo, c, false));
      for (const forma of FORMAS) {
        const { unmount } = montar({ estilo, formaBotones: forma });
        const b = estiloBotones(forma, c, sup);
        esperarPieza(deLaTarjeta("Cómo llegar"), b.secundario.estilo);
        esperarPieza(deLaTarjeta("Llamar"), b.secundario.estilo);
        esperarPieza(deLaTarjeta("Reservar"), b.principal.estilo);
        unmount();
      }
    });
  }

  it("cambiar la forma en el editor cambia también los de la sucursal (la vista previa se redibuja)", () => {
    const { rerender } = montar({ estilo: "VITRINA", formaBotones: "PILDORA" });
    expect(deLaTarjeta("Cómo llegar").style.borderRadius).toBe("999px");
    rerender(<VistaPagina pagina={{ ...PAGINA, estilo: "VITRINA", formaBotones: "RECTO" }} urlReservar="/r/buensabor" modo="movil" />);
    expect(deLaTarjeta("Cómo llegar").style.borderRadius).toBe("4px");
    rerender(<VistaPagina pagina={{ ...PAGINA, estilo: "VITRINA", formaBotones: "CONTORNO" }} urlReservar="/r/buensabor" modo="movil" />);
    // El contorno es del color de la página.
    expect(deLaTarjeta("Llamar").style.border).toBe("1.5px solid rgb(180, 80, 26)");
    rerender(<VistaPagina pagina={{ ...PAGINA, estilo: "VITRINA", formaBotones: "CONTORNO", color: { clave: "X", hex: "#0C7A55" } }} urlReservar="/r/buensabor" modo="movil" />);
    expect(deLaTarjeta("Llamar").style.border).toBe("1.5px solid rgb(12, 122, 85)");
    expect(deLaTarjeta("Reservar").style.border).toBe("2px solid rgb(12, 122, 85)");
  });

  it("en una página clara son iguales a los enlaces de arriba: misma caja, borde, forma y letra", { timeout: 30_000 }, () => {
    for (const forma of FORMAS) {
      const { unmount } = montar({ estilo: "VITRINA", formaBotones: forma });
      const enlace = screen.getByRole("link", { name: "Instagram" });
      const sucursal = deLaTarjeta("Cómo llegar");
      for (const prop of ["background", "border", "border-radius", "box-shadow", "clip-path", "color", "font-weight"]) {
        expect(sucursal.style.getPropertyValue(prop), `${forma} ${prop}`).toBe(enlace.style.getPropertyValue(prop));
      }
      unmount();
    }
  });

  it("en Vivo el principal de la tarjeta vuelve a ser del color: la tarjeta es blanca, no la página", () => {
    montar({ estilo: "VIVO" });
    expect(screen.getByRole("link", { name: /Reservar turno/ }).style.background).toBe("rgb(255, 255, 255)");
    expect(deLaTarjeta("Reservar").style.background).toBe("rgb(180, 80, 26)");
    expect(deLaTarjeta("Reservar").style.color).toBe("rgb(255, 255, 255)");
  });

  it("llevan su ícono como los enlaces (menos en Boutique, que no los usa)", () => {
    const { unmount } = montar({ estilo: "VITRINA" });
    for (const texto of ["Cómo llegar", "Llamar", "Reservar"]) expect(deLaTarjeta(texto).querySelector("svg")).not.toBeNull();
    unmount();
    montar({ estilo: "BOUTIQUE" });
    for (const texto of ["Cómo llegar", "Llamar", "Reservar"]) expect(deLaTarjeta(texto).querySelector("svg")).toBeNull();
  });
});
