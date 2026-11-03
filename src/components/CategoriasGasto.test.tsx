import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoriaGasto } from "../types";

/**
 * El panel de categorías del formulario de gasto (G-03): lo que la app hace
 * desde su selector y la web del restaurante no tenía —crear una, renombrar o
 * retirar las propias y corregir fijo/variable de cualquiera—.
 */

// Once categorías con tres botones cada una: buscar por rol y nombre es lento
// en jsdom, y con la suite completa en paralelo algún test pasaba los 5 s.
vi.setConfig({ testTimeout: 60_000 });

vi.mock("../lib/api", () => ({
  api: {
    crearCategoriaGasto: vi.fn(),
    actualizarCategoriaGasto: vi.fn(),
    eliminarCategoriaGasto: vi.fn(async () => ({ codigo: "X", retirada: true })),
  },
}));

import { api } from "../lib/api";
import { CampoCategoria, PanelCategorias } from "./CategoriasGasto";

const del = (codigo: string, nombre: string, tipoCosto: "FIJO" | "VARIABLE" = "FIJO"): CategoriaGasto => ({
  codigo,
  nombre,
  propia: false,
  tipoCosto,
});

const musica: CategoriaGasto = {
  codigo: "MUSICA_EN_VIVO",
  nombre: "Música en vivo",
  propia: true,
  tipoCosto: "VARIABLE",
};

/** Más de diez, como el pack de verdad: así aparece el buscador. */
const catalogo: CategoriaGasto[] = [
  del("ALQUILER", "Alquiler"),
  del("SUELDOS", "Sueldos"),
  del("LUZ", "Luz"),
  del("AGUA", "Agua"),
  del("GAS", "Gas", "VARIABLE"),
  del("INTERNET", "Internet"),
  del("DESCARTABLES", "Descartables", "VARIABLE"),
  del("FUMIGACION", "Fumigación"),
  del("COMISION_DELIVERY", "Comisión delivery", "VARIABLE"),
  del("OTROS", "Otros"),
  musica,
];

beforeEach(() => {
  vi.clearAllMocks();
});

function abrir() {
  const onElegir = vi.fn();
  const onCatalogo = vi.fn();
  render(
    <PanelCategorias categorias={catalogo} elegida="ALQUILER" onElegir={onElegir} onCatalogo={onCatalogo} />,
  );
  return { onElegir, onCatalogo };
}

async function tocar(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

async function abrirAlta(nombre: string) {
  await tocar(screen.getByRole("button", { name: /Nueva categoría/ }));
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: nombre } });
}

describe("crear una categoría", () => {
  it("manda el nombre y si es fija o variable, y la deja elegida en el gasto", async () => {
    const peaje: CategoriaGasto = { codigo: "PEAJE", nombre: "Peaje", propia: true, tipoCosto: "VARIABLE" };
    vi.mocked(api.crearCategoriaGasto).mockResolvedValue(peaje);
    const { onElegir, onCatalogo } = abrir();
    await abrirAlta("Peaje");
    await tocar(screen.getByRole("radio", { name: /^Variable/ }));
    await tocar(screen.getByRole("button", { name: "Crear y elegir" }));
    expect(api.crearCategoriaGasto).toHaveBeenCalledWith({ nombre: "Peaje", tipoCosto: "VARIABLE" });
    // El catálogo que queda es el que contestó el backend, sin pedirlo de nuevo.
    expect(onCatalogo).toHaveBeenCalledWith([...catalogo, peaje]);
    expect(onElegir).toHaveBeenCalledWith(peaje);
  });

  it("un nombre que ya existe no se manda: con su mismo tipo la elige, con otro avisa sin tocarla", async () => {
    // El bug que ataja: el backend, ante un nombre que ya tiene, le cambia el
    // tipo al que se pidió. "gas" con el Fijo que viene marcado pasaba el Gas
    // del pack a fijo, y con él todos sus meses en el punto de equilibrio.
    const { onElegir } = abrir();
    await abrirAlta("gas");
    await tocar(screen.getByRole("button", { name: "Crear y elegir" }));
    expect(api.crearCategoriaGasto).not.toHaveBeenCalled();
    expect(onElegir).not.toHaveBeenCalled();
    expect(screen.getByText(/«Gas» ya existe y es variable/)).toBeInTheDocument();

    await tocar(screen.getByRole("radio", { name: /^Variable/ }));
    await tocar(screen.getByRole("button", { name: "Crear y elegir" }));
    expect(api.crearCategoriaGasto).not.toHaveBeenCalled();
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ codigo: "GAS" }));
  });

  it("un nombre de una letra no se manda", async () => {
    abrir();
    await abrirAlta("P");
    await tocar(screen.getByRole("button", { name: "Crear y elegir" }));
    expect(screen.getByText("El nombre tiene que tener al menos dos letras.")).toBeInTheDocument();
    expect(api.crearCategoriaGasto).not.toHaveBeenCalled();
  });

  it("un doble clic en Crear manda un solo pedido", async () => {
    // El backend no la duplica (índice único por código), pero el segundo POST
    // que llegaba junto chocaba contra ese índice y el panel mostraba un error
    // por una categoría que sí se había creado.
    let contestar!: (c: CategoriaGasto) => void;
    vi.mocked(api.crearCategoriaGasto).mockImplementation(
      () => new Promise((resolver) => (contestar = resolver)),
    );
    abrir();
    await abrirAlta("Peaje");
    const crear = screen.getByRole("button", { name: "Crear y elegir" });
    await act(async () => {
      fireEvent.click(crear);
      fireEvent.click(crear);
    });
    expect(api.crearCategoriaGasto).toHaveBeenCalledTimes(1);
    await act(async () => contestar({ codigo: "PEAJE", nombre: "Peaje", propia: true, tipoCosto: "FIJO" }));
  });
});

describe("fijo o variable", () => {
  it("se corrige también en las del pack, avisando que mueve los meses pasados", async () => {
    vi.mocked(api.actualizarCategoriaGasto).mockResolvedValue({ ...del("GAS", "Gas"), tipoCosto: "FIJO" });
    const { onCatalogo } = abrir();
    await tocar(screen.getByRole("button", { name: "Variable: corregir si Gas es fijo o variable" }));
    expect(
      screen.getByText(/Cambiarlo mueve también los gastos que ya cargaste en esta categoría/),
    ).toHaveTextContent(/punto de equilibrio de los meses pasados va a dar distinto/);
    expect(api.actualizarCategoriaGasto).not.toHaveBeenCalled();

    await tocar(screen.getByRole("button", { name: /^Fijo/ }));
    expect(api.actualizarCategoriaGasto).toHaveBeenCalledWith("GAS", { tipoCosto: "FIJO" });
    expect(onCatalogo).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ codigo: "GAS", tipoCosto: "FIJO" })]),
    );
    expect(screen.getByText("«Gas» quedó como fijo")).toBeInTheDocument();
  });

  it("tocar el que ya tiene vuelve sin mandar nada", async () => {
    const { onCatalogo } = abrir();
    await tocar(screen.getByRole("button", { name: "Variable: corregir si Gas es fijo o variable" }));
    await tocar(screen.getByRole("button", { name: /^Variable/ }));
    expect(api.actualizarCategoriaGasto).not.toHaveBeenCalled();
    expect(onCatalogo).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "Categorías de gasto" })).toBeInTheDocument();
  });

  it("si el backend no deja, se ve su mensaje y el catálogo no cambia", async () => {
    vi.mocked(api.actualizarCategoriaGasto).mockRejectedValue(new Error("Esa categoría no existe"));
    const { onCatalogo } = abrir();
    await tocar(screen.getByRole("button", { name: "Variable: corregir si Gas es fijo o variable" }));
    await tocar(screen.getByRole("button", { name: /^Fijo/ }));
    expect(screen.getByText("Esa categoría no existe")).toBeInTheDocument();
    expect(onCatalogo).not.toHaveBeenCalled();
  });
});

describe("las que creó el negocio", () => {
  it("se renombran: el código no cambia y los gastos la siguen teniendo", async () => {
    vi.mocked(api.actualizarCategoriaGasto).mockResolvedValue({ ...musica, nombre: "Banda en vivo" });
    const { onCatalogo } = abrir();
    await tocar(screen.getByRole("button", { name: "Editar Música en vivo" }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Banda en vivo" } });
    await tocar(screen.getByRole("button", { name: "Guardar nombre" }));
    expect(api.actualizarCategoriaGasto).toHaveBeenCalledWith("MUSICA_EN_VIVO", { nombre: "Banda en vivo" });
    expect(onCatalogo).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ codigo: "MUSICA_EN_VIVO", nombre: "Banda en vivo" })]),
    );
    expect(screen.getByText("Ahora se llama «Banda en vivo»")).toBeInTheDocument();
  });

  it("se retiran por código, sin borrar nada", async () => {
    const { onCatalogo } = abrir();
    await tocar(screen.getByRole("button", { name: "Editar Música en vivo" }));
    expect(screen.getByText(/Para recuperarla, volvé a crearla con el mismo nombre/)).toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: /Quitar de la lista/ }));
    expect(api.eliminarCategoriaGasto).toHaveBeenCalledWith("MUSICA_EN_VIVO");
    expect(onCatalogo).toHaveBeenCalledWith(catalogo.filter((c) => c.codigo !== "MUSICA_EN_VIVO"));
    expect(screen.getByText("«Música en vivo» ya no se ofrece")).toBeInTheDocument();
  });

  it("las del pack no se renombran ni se retiran: no tienen lápiz", () => {
    abrir();
    expect(screen.queryByRole("button", { name: "Editar Gas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar Alquiler" })).not.toBeInTheDocument();
  });
});

describe("la lista", () => {
  it("el buscador ignora tildes y mayúsculas, y sin resultados ofrece crearla con ese nombre", async () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Buscar categoría"), { target: { value: "fumigacion" } });
    const lista = screen.getByRole("list", { name: "Categorías de gasto" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    expect(within(lista).getByText("Fumigación")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Buscar categoría"), { target: { value: "Peaje" } });
    await tocar(screen.getByRole("button", { name: "Crear «Peaje»" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Peaje");
  });

  it("tocar una la elige", async () => {
    const { onElegir } = abrir();
    await tocar(screen.getByRole("button", { name: "Luz" }));
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ codigo: "LUZ" }));
  });
});

describe("el campo del formulario", () => {
  it("sin la puerta al panel se dibuja como siempre (la farmacia)", () => {
    render(
      <CampoCategoria
        categorias={catalogo}
        valor="ALQUILER"
        onChange={vi.fn()}
        original={{ codigo: "ALQUILER", nombre: "Alquiler" }}
      />,
    );
    expect(screen.getByLabelText("Categoría")).toHaveDisplayValue("Alquiler (Fijo)");
    expect(screen.queryByRole("button", { name: /Crear o corregir categorías/ })).not.toBeInTheDocument();
  });

  it("un gasto en una categoría retirada la muestra, no «Elegí una categoría»", () => {
    // Retirada deja de ofrecerse, pero el gasto viejo la conserva: el
    // desplegable decía "Elegí una categoría" sobre un gasto que sí tenía una.
    render(
      <CampoCategoria
        categorias={catalogo}
        valor="FUMIGACION_VIEJA"
        onChange={vi.fn()}
        original={{ codigo: "FUMIGACION_VIEJA", nombre: "Fumigación vieja" }}
        onAdministrar={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Categoría")).toHaveDisplayValue("Fumigación vieja (ya no se ofrece)");
    expect(screen.getByRole("button", { name: /Crear o corregir categorías/ })).toBeInTheDocument();
  });

  it("con otra elegida, la retirada que tenía el gasto se sigue pudiendo volver a elegir", () => {
    // El bug: la opción existía sólo mientras era la elegida. Cambiar el
    // desplegable por error la borraba, y volver a ella exigía cancelar todo.
    const onChange = vi.fn();
    render(
      <CampoCategoria
        categorias={catalogo}
        valor="LUZ"
        onChange={onChange}
        original={{ codigo: "FUMIGACION_VIEJA", nombre: "Fumigación vieja" }}
        onAdministrar={vi.fn()}
      />,
    );
    const desplegable = screen.getByLabelText("Categoría");
    expect(desplegable).toHaveDisplayValue("Luz (Fijo)");
    fireEvent.change(desplegable, { target: { value: "FUMIGACION_VIEJA" } });
    expect(onChange).toHaveBeenCalledWith("FUMIGACION_VIEJA");
  });
});
