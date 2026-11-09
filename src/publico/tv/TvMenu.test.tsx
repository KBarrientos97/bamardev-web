import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuPublicoApi, PantallaMenu } from "../../types/menuDigital";

/**
 * La TV del menú (`/tv/menu/<llave>/<n>`) como la abre la vista previa del
 * editor de Android (`?vista=previa`): la pantalla en edición se dibuja sin
 * esperar el guardado ni recargar la página, y una TV de verdad no tiene nada
 * de eso.
 */

vi.mock("./apiTv", async (importOriginal) => {
  const real = await importOriginal<typeof import("./apiTv")>();
  return { ...real, apiTv: { menu: vi.fn(), menus: vi.fn() } };
});

import { apiTv } from "./apiTv";
import RutasMenu from "./TvMenu";

const LLAVE = "Qm9sYS1vY2hvLWVuLWxhLXRyb25lcmEx";

const PANTALLA: PantallaMenu = {
  numero: 1,
  nombre: "TV 1",
  diseno: "fotos",
  tema: "rojo",
  colores: { fondo: "#A30000", acento: "#FFC800", texto: "#FFFFFF" },
  titulo: "Nuestro menú",
  subtitulo: "",
  cinta: "",
  categorias: [],
  ocultos: [],
  columnas: 4,
  tamano: "m",
  rotarSeg: 10,
  logo: false,
  fotos: true,
  descripciones: false,
  etiquetas: true,
  agotadosTachados: true,
};

function menu(): MenuPublicoApi {
  return {
    negocio: "Pollos Don Omar",
    moneda: "BOB",
    ahora: Date.now(),
    logo: null,
    pantalla: PANTALLA,
    categorias: [{ id: 1, nombre: "Pollos" }],
    platos: [
      {
        id: 10,
        nombre: "Brasa cuarto",
        precio: 26,
        categoriaId: 1,
        icono: null,
        foto: null,
        descripcion: null,
        etiqueta: null,
        destacado: false,
        agotado: false,
      },
    ],
  };
}

const menuMock = vi.mocked(apiTv.menu);

function abrir(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/tv/menu/*" element={<RutasMenu />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  menuMock.mockReset();
  menuMock.mockResolvedValue(menu());
});

afterEach(() => {
  delete window.bamardevTv;
});

describe("la TV del menú en la vista previa de la app", () => {
  it("dibuja la pantalla en edición al toque, sin volver a preguntar", async () => {
    abrir(`/tv/menu/${LLAVE}/1?vista=previa`);
    expect(await screen.findByText("Nuestro menú")).toBeInTheDocument();
    // La fase la copia un efecto, que corre un momento después de pintar: con
    // la máquina cargada (toda la suite a la vez) a veces todavía decía
    // "cargando" al preguntar. Se espera, como la espera la app.
    await waitFor(() => expect(window.bamardevTv?.fase()).toBe("lista"));

    act(() => {
      window.bamardevTv?.pantalla({ titulo: "Combos de hoy" });
    });

    expect(screen.getByText("Combos de hoy")).toBeInTheDocument();
    // Lo dibujó con lo que ya tenía: ni recarga ni otra pregunta al servidor.
    expect(menuMock).toHaveBeenCalledTimes(1);
  });

  it("después de guardar pregunta otra vez sin recargar la página", async () => {
    abrir(`/tv/menu/${LLAVE}/1?vista=previa`);
    await screen.findByText("Nuestro menú");

    await act(async () => {
      window.bamardevTv?.recargar();
    });

    expect(menuMock).toHaveBeenCalledTimes(2);
  });

  it("lo que manda la app queda encima aunque llegue una respuesta nueva", async () => {
    // El guardado tarda: la TV pudo preguntar antes de que llegara y traer
    // el título viejo. Lo que está en edición no se pierde por eso.
    abrir(`/tv/menu/${LLAVE}/1?vista=previa`);
    await screen.findByText("Nuestro menú");
    act(() => {
      window.bamardevTv?.pantalla({ titulo: "Combos de hoy" });
    });

    await act(async () => {
      window.bamardevTv?.recargar();
    });

    expect(screen.getByText("Combos de hoy")).toBeInTheDocument();
  });

  it("si en la app eligen otro diseño quieto, la TV animada se queda quieta al toque", async () => {
    // La app no conoce los diseños animados: manda sólo `diseno`. Sin la
    // regla, la vista previa seguía animada aunque el celular dijera "Lista".
    menuMock.mockResolvedValue({ ...menu(), pantalla: { ...PANTALLA, diseno: "destacado", animado: "carrusel", intro: false } });
    abrir(`/tv/menu/${LLAVE}/1?vista=previa`);
    // El carrusel no repite el título de la categoría arriba del plato: la lista sí.
    expect(await screen.findAllByText("Brasa cuarto")).toHaveLength(2);

    act(() => {
      window.bamardevTv?.pantalla({ diseno: "lista" });
    });

    // Lista: el plato una sola vez, en su renglón.
    expect(screen.getAllByText("Brasa cuarto")).toHaveLength(1);
  });

  it("una TV de verdad no le deja nada a la página que la contiene", async () => {
    abrir(`/tv/menu/${LLAVE}/1`);
    await screen.findByText("Nuestro menú");
    expect(window.bamardevTv).toBeUndefined();
  });
});

describe("la TV animada (8-nov)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arranca con el nombre del negocio en grande y después pasa sola a los platos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    menuMock.mockResolvedValue({ ...menu(), pantalla: { ...PANTALLA, animado: "presentacion" } });
    abrir(`/tv/menu/${LLAVE}/1`);

    // El nombre entra letra por letra, pero se lee entero.
    expect(await screen.findByRole("heading", { name: "Pollos Don Omar" })).toBeInTheDocument();
    expect(screen.queryByText("Brasa cuarto")).not.toBeInTheDocument();
    // El reloj se programa en un efecto, que React corre después de pintar:
    // se lo deja correr antes de adelantar el tiempo.
    await act(async () => {
      await Promise.resolve();
    });

    // Después de la presentación, el cartel de la categoría…
    await act(async () => {
      vi.advanceTimersByTime(6600);
    });
    expect(screen.getByRole("heading", { name: "Pollos" })).toBeInTheDocument();
    // …y el plato solo, en grande, con su precio.
    await act(async () => {
      vi.advanceTimersByTime(2900);
    });
    expect(screen.getByRole("heading", { name: "Brasa cuarto" })).toBeInTheDocument();
    expect(screen.getByText("26")).toBeInTheDocument();
  });

  it("un backend anterior no manda los campos nuevos: la TV sigue quieta como siempre", async () => {
    // `animado` ausente = el diseño de siempre. Si no, una TV vieja cambiaba
    // sola al publicar la web antes que el backend.
    abrir(`/tv/menu/${LLAVE}/1`);
    expect(await screen.findByText("Nuestro menú")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pollos Don Omar" })).not.toBeInTheDocument();
  });
});
