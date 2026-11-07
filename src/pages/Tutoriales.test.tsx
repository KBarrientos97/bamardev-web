import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tutorial } from "../lib/tutoriales";

/**
 * La pantalla Tutoriales (07-nov): los videos en orden, con buscador, los de
 * la academia sólo para la academia, y el reproductor dentro de la app.
 */

const sesion = vi.hoisted(() => ({ rubro: "ACADEMIA" as string | undefined }));
const datos = vi.hoisted(() => ({ lista: null as Tutorial[] | null }));

vi.mock("../store/AuthContext", () => ({ useAuth: () => ({ rubro: sesion.rubro }) }));

// La lista de verdad, salvo en los casos que necesitan varios videos.
vi.mock("../lib/tutoriales", async (original) => {
  const real = await original<typeof import("../lib/tutoriales")>();
  return {
    ...real,
    get TUTORIALES() {
      return datos.lista ?? real.TUTORIALES;
    },
  };
});

import Tutoriales from "./Tutoriales";

const RECEPCION = "Recepción de la academia";
/** Desordenados a propósito: manda `orden`, no el lugar en el arreglo. */
const VARIOS: Tutorial[] = [
  {
    id: "bbbbbbbbbbb",
    orden: 2,
    seccion: RECEPCION,
    rubros: ["ACADEMIA"],
    titulo: "Cobrar una cuota",
    descripcion: "Buscar al estudiante y registrar el pago.",
  },
  {
    id: "a2jPyD45a7U",
    orden: 1,
    seccion: RECEPCION,
    rubros: ["ACADEMIA"],
    titulo: "Empezar el turno en la recepción",
    descripcion: "Abrir la caja con el cambio con el que arrancás.",
  },
  { id: "ccccccccccc", orden: 1, titulo: "Instalar la app", descripcion: "En el celular o la computadora." },
];

/** Los títulos de las tarjetas, en el orden en que se ven. */
const titulos = () => screen.queryAllByRole("button", { name: /^Ver «/ }).map((b) => b.getAttribute("aria-label"));

beforeEach(() => {
  sesion.rubro = "ACADEMIA";
  datos.lista = null;
});

describe("Tutoriales", () => {
  it("la academia ve el video de la recepción, con su vista previa, título y descripción", () => {
    render(<Tutoriales />);
    const seccion = screen.getByRole("region", { name: RECEPCION });
    const tarjeta = within(seccion).getByRole("button", { name: "Ver «Empezar el turno en la recepción»" });
    expect(tarjeta.querySelector("img")).toHaveAttribute("src", "https://i.ytimg.com/vi/a2jPyD45a7U/hqdefault.jpg");
    expect(tarjeta).toHaveTextContent(/abrir la caja con el cambio con el que arrancás/i);
  });

  it("en otro rubro el video de la academia no aparece y dice que todavía no hay", () => {
    sesion.rubro = "RESTAURANTE";
    render(<Tutoriales />);
    expect(screen.queryByRole("button", { name: /Empezar el turno/ })).toBeNull();
    expect(screen.getByText("Todavía no hay tutoriales")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Buscar tutoriales" })).toBeNull();
  });

  it("lista en orden dentro de cada sección; los de todos los rubros también los ve otro rubro", () => {
    datos.lista = VARIOS;
    const { unmount } = render(<Tutoriales />);
    expect(titulos()).toEqual([
      "Ver «Empezar el turno en la recepción»",
      "Ver «Cobrar una cuota»",
      "Ver «Instalar la app»",
    ]);
    unmount();
    sesion.rubro = "FARMACIA";
    render(<Tutoriales />);
    expect(titulos()).toEqual(["Ver «Instalar la app»"]);
  });

  it("el buscador filtra por título y descripción sin distinguir tildes ni mayúsculas", () => {
    datos.lista = VARIOS;
    render(<Tutoriales />);
    const buscador = screen.getByRole("textbox", { name: "Buscar tutoriales" });

    fireEvent.change(buscador, { target: { value: "RECEPCION" } });
    expect(titulos()).toEqual(["Ver «Empezar el turno en la recepción»"]);

    // En la descripción, y con la tilde que el texto no tiene.
    fireEvent.change(buscador, { target: { value: "computadóra" } });
    expect(titulos()).toEqual(["Ver «Instalar la app»"]);

    fireEvent.change(buscador, { target: { value: "inventario" } });
    expect(titulos()).toEqual([]);
    expect(screen.getByText("No encontramos tutoriales")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos los tutoriales" }));
    expect(titulos()).toHaveLength(3);
  });

  it("tocar un video lo reproduce dentro de la app, con el enlace a YouTube", () => {
    render(<Tutoriales />);
    fireEvent.click(screen.getByRole("button", { name: "Ver «Empezar el turno en la recepción»" }));
    const dialogo = screen.getByRole("dialog", { name: "Empezar el turno en la recepción" });
    const video = within(dialogo).getByTitle("Empezar el turno en la recepción");
    expect(video.tagName).toBe("IFRAME");
    expect(video.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/a2jPyD45a7U\?/);
    const enlace = within(dialogo).getByRole("link", { name: /Ver en YouTube/ });
    expect(enlace).toHaveAttribute("href", "https://www.youtube.com/watch?v=a2jPyD45a7U");
    expect(enlace).toHaveAttribute("target", "_blank");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
