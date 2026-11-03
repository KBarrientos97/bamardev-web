import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PaginaPublica } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

/** El mapa de "Dónde estamos" (PLAN-PAGINA-WEB §3.1), en los 9 estilos. */

const PAGINA: PaginaPublica = {
  subdominio: "lospinos",
  nombre: "Pollería Los Pinos",
  rubro: "Restaurante",
  iniciales: "LP",
  descripcion: null,
  color: { clave: "TEJA", hex: "#B23A2E" },
  formaBotones: "REDONDEADO",
  tipografia: "MODERNA",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [],
  botones: [],
  sucursales: [
    {
      nombre: "Centro",
      reservaSlug: null,
      direccion: "Calle Junín 245",
      telefono: null,
      horario: null,
      mapaUrl: "https://www.google.com/maps/dir/?api=1&destination=-17.78,-63.18",
      ubicacion: { lat: -17.78, lng: -63.18 },
    },
    { nombre: "Norte", reservaSlug: null, direccion: "Av. Banzer", telefono: null, horario: null, mapaUrl: null },
  ],
  catalogo: null,
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "Pollería Los Pinos", descripcion: "", imagen: null, url: "" },
};

const ESTILOS = ["CLASICO", "VITRINA", "VIVO", "NOCHE", "BOUTIQUE", "POSTAL", "CARTA", "DULCE", "MOSAICO"] as const;

describe("mapa de la página", () => {
  for (const estilo of ESTILOS) {
    for (const modo of ["movil", "escritorio"] as const) {
      it(`${estilo} en ${modo}: el recuadro del mapa sale una vez, con el nombre de la sucursal`, () => {
        const { unmount } = render(<VistaPagina urlReservar="/r/lospinos/reservar" pagina={{ ...PAGINA, estilo }} modo={modo} />);
        expect(screen.getAllByRole("region", { name: "Mapa: Centro" })).toHaveLength(1);
        unmount();
      });
    }
  }

  it("con dos sucursales con pin, el mapa es de las sucursales", () => {
    const sucursales = PAGINA.sucursales.map((s) => ({ ...s, ubicacion: { lat: -17.7, lng: -63.1 } }));
    render(<VistaPagina urlReservar="/r/lospinos/reservar" pagina={{ ...PAGINA, sucursales }} />);
    expect(screen.getByRole("region", { name: "Mapa de las sucursales" })).toBeInTheDocument();
  });

  it("Lista 2 #9: en un instituto el mapa es de las sedes", () => {
    const sucursales = PAGINA.sucursales.map((s) => ({ ...s, ubicacion: { lat: -17.7, lng: -63.1 } }));
    render(<VistaPagina urlReservar="/r/lospinos/reservar" pagina={{ ...PAGINA, sucursales, rubroClave: "ACADEMIA" }} />);
    expect(screen.getByRole("region", { name: "Mapa de las sedes" })).toBeInTheDocument();
    expect(screen.queryByText(/sucursal/i)).not.toBeInTheDocument();
  });

  it("sin ninguna ubicación (o sin la feature: el backend no la manda) no hay mapa", () => {
    const sucursales = PAGINA.sucursales.map((s) => ({ ...s, ubicacion: null }));
    render(<VistaPagina urlReservar="/r/lospinos/reservar" pagina={{ ...PAGINA, sucursales }} />);
    expect(screen.queryByTestId("mapa-pagina")).not.toBeInTheDocument();
  });

  it("en las miniaturas del selector de estilo no se dibuja", () => {
    render(<VistaPagina urlReservar="/r/lospinos/reservar" pagina={PAGINA} miniatura />);
    expect(screen.queryByTestId("mapa-pagina")).not.toBeInTheDocument();
  });
});
