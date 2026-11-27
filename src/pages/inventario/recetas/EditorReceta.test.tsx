import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costoRenglon } from "../../../lib/recetas/calculo";
import type { GrupoReceta, InsumoReceta, LineaRecetaPlato, RecetaPlato } from "../../../lib/recetas/tipos";

/**
 * El editor de la receta del plato (CONTRATO-recetas-plato §3.4): lo que lleva
 * siempre, la guarnición y las presas; el costo en vivo con las cuentas del
 * backend; y «Guardar» manda la receta entera.
 */

// Un Modal ancho con todo adentro: con la máquina cargada, los 5 s de fábrica no alcanzan.
vi.setConfig({ testTimeout: 30_000 });

const sesion = vi.hoisted(() => ({
  recetas: { activas: true, elegirPresa: true, puroDoble: true },
}));

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { tipoNegocio: "RESTAURANTE", recetas: sesion.recetas } }),
}));

vi.mock("../../../lib/recetas/api", () => ({
  apiRecetas: { receta: vi.fn(), insumos: vi.fn(), guardar: vi.fn() },
}));

vi.mock("../../../lib/api", () => ({
  api: { getProductos: vi.fn(async () => []) },
}));

// La ruta de «Registrar compra» es de Movimientos (lo arma la otra mitad de la tanda).
vi.mock("../Movimientos", () => ({ RUTA_REGISTRAR_COMPRA: "/inventario/movimientos?nuevo=entrada" }));

import { apiRecetas } from "../../../lib/recetas/api";
import EditorReceta from "./EditorReceta";

const INSUMOS: InsumoReceta[] = [
  { id: 1, nombre: "Aceite", unidad: "Litro", porcionNombre: "porción", configurado: true, seCuenta: false, partes: null, costoPorcion: 0.62 },
  { id: 2, nombre: "Arroz", unidad: "Kilogramo", porcionNombre: "porción", configurado: true, seCuenta: false, partes: null, costoPorcion: 0.525 },
  { id: 3, nombre: "Papa", unidad: "Kilogramo", porcionNombre: "porción", configurado: true, seCuenta: false, partes: null, costoPorcion: 0.8 },
  { id: 4, nombre: "Plátano", unidad: "Unidad", porcionNombre: "porción", configurado: true, seCuenta: false, partes: null, costoPorcion: 1.25 },
  { id: 5, nombre: "Pollo para broaster", unidad: "Unidad", porcionNombre: "presa", configurado: true, seCuenta: true, partes: "POLLO_8", costoPorcion: 4.6125 },
  { id: 6, nombre: "Yuca", unidad: "Kilogramo", porcionNombre: "porción", configurado: true, seCuenta: false, partes: null, costoPorcion: null },
  { id: 7, nombre: "Comino", unidad: "Kilogramo", porcionNombre: null, configurado: false, seCuenta: false, partes: null, costoPorcion: null },
];

function linea(insumoId: number, grupo: GrupoReceta, porciones: number, puro = false): LineaRecetaPlato {
  const i = INSUMOS.find((x) => x.id === insumoId)!;
  return {
    insumoId,
    nombre: i.nombre,
    grupo,
    porciones,
    puro,
    porcionNombre: i.porcionNombre,
    partes: i.partes,
    seCuenta: i.seCuenta,
    costoPorcion: i.costoPorcion,
    costo: costoRenglon(i.costoPorcion, porciones),
  };
}

/** Broaster cuarto: aceite; arroz, papa (las dos pueden ir «puro») y plátano; dos presas. */
const RECETA: RecetaPlato = {
  platoId: 12,
  nombre: "Broaster cuarto",
  precio: 28,
  conReceta: true,
  lineas: [
    linea(1, "FIJO", 1),
    linea(2, "GUARNICION", 1, true),
    linea(3, "GUARNICION", 1, true),
    linea(4, "GUARNICION", 1),
    linea(5, "PRESA", 2),
  ],
  costo: 12.43,
  costoMinimo: 11.18,
  costoMaximo: 12.7,
  alcanza: 120,
  limite: "Pollo para broaster",
  sinCosto: [],
};

const VACIA: RecetaPlato = {
  ...RECETA,
  platoId: 40,
  nombre: "Alitas",
  precio: 30,
  conReceta: false,
  lineas: [],
  costo: 0,
  costoMinimo: 0,
  costoMaximo: 0,
  alcanza: null,
  limite: null,
};

function Ubicacion() {
  const l = useLocation();
  return <p>ahora en {`${l.pathname}${l.search}`}</p>;
}

async function montar(receta: RecetaPlato, extra: { platos?: { id: number; nombre: string }[] } = {}) {
  vi.mocked(apiRecetas.receta).mockImplementation(async (id: number) => (id === receta.platoId ? receta : RECETA));
  const onClose = vi.fn();
  const onGuardada = vi.fn();
  render(
    <MemoryRouter initialEntries={["/inventario/productos"]}>
      <Routes>
        <Route
          path="/inventario/productos"
          element={
            <EditorReceta platoId={receta.platoId} onClose={onClose} onGuardada={onGuardada} platos={extra.platos} />
          }
        />
        <Route path="/inventario/movimientos" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Lo que lleva siempre" });
  await act(async () => {});
  return { onClose, onGuardada };
}

const fila = (nombre: string) => screen.getByText(nombre, { selector: "p" }).closest("li")!;
const cuanto = () => screen.getByRole("region", { name: "Cuánto te deja" });

beforeEach(() => {
  vi.clearAllMocks();
  sesion.recetas = { activas: true, elegirPresa: true, puroDoble: true };
  vi.mocked(apiRecetas.insumos).mockResolvedValue(INSUMOS);
  vi.mocked(apiRecetas.guardar).mockImplementation(async (platoId, input) => ({
    ...RECETA,
    platoId,
    conReceta: input.conReceta,
  }));
});

describe("EditorReceta", () => {
  it("arma la receta guardada en sus tres partes y dice cuánto deja", async () => {
    await montar(RECETA);

    expect(within(fila("Aceite")).getByText("1 porción · Bs 0,62 cada porción")).toBeInTheDocument();
    expect(within(fila("Aceite")).getByText("Bs 0,62")).toBeInTheDocument();
    // La guarnición: cada una con su «puro».
    expect(within(fila("Arroz")).getByRole("button", { name: "Se puede pedir «puro»: sí" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(fila("Plátano")).getByRole("button", { name: "Se puede pedir «puro»: no" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Las presas, con lo que pasa al vender (el ajuste de elegir la presa está prendido).
    expect(screen.getByText("2 presas de Pollo para broaster")).toBeInTheDocument();
    expect(screen.getByText(/^Al vender: «Ala» es pecho y ala; «Pierna» es pierna y contra/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-pressed", "true");

    const tarjeta = cuanto();
    expect(within(tarjeta).getByText("Bs 28,00")).toBeInTheDocument();
    expect(within(tarjeta).getByText("Costo del plato").nextSibling).toHaveTextContent("Bs 12,43");
    expect(within(tarjeta).getByText("Ganás por plato").nextSibling).toHaveTextContent("Bs 15,57");
    expect(within(tarjeta).getByText("De cada Bs 100 que cobrás, Bs 44 son costo y Bs 56 te quedan.")).toBeInTheDocument();
    expect(within(tarjeta).getByText(/te cuesta entre Bs 11,18 y Bs 12,70/)).toBeInTheDocument();
    expect(screen.getByText("Alcanza para 120 platos")).toBeInTheDocument();
    expect(screen.getByText("Lo primero que se acaba: Pollo para broaster.")).toBeInTheDocument();
    // Ya es «Con receta»: se puede volver atrás.
    expect(screen.getByRole("button", { name: "Volver a Elaborado" })).toBeInTheDocument();
  });

  it("el costo cambia en vivo, con las cuentas del backend", async () => {
    await montar(RECETA);

    fireEvent.click(screen.getByRole("button", { name: "Más Aceite" }));
    expect(within(fila("Aceite")).getByText("2 porciones · Bs 0,62 cada porción")).toBeInTheDocument();
    expect(within(fila("Aceite")).getByText("Bs 1,24")).toBeInTheDocument();
    // 12,43 + 0,62
    expect(within(cuanto()).getByText("Costo del plato").nextSibling).toHaveTextContent("Bs 13,05");
    // El stock no se sabe acá: se recalcula al guardar.
    expect(screen.getByText("Para cuántos platos alcanza se ve al guardar.")).toBeInTheDocument();

    // Sacar la papa: el rango ya no la cuenta.
    fireEvent.click(screen.getByRole("button", { name: "Sacar Papa de la receta" }));
    expect(screen.queryByText("Papa", { selector: "p" })).not.toBeInTheDocument();
    expect(within(cuanto()).getByText("Costo del plato").nextSibling).toHaveTextContent("Bs 12,25");
  });

  it("para sumar se ofrecen los insumos listos; el que no tiene rinde, apagado", async () => {
    await montar(RECETA);

    fireEvent.click(screen.getByRole("button", { name: "Agregar un insumo" }));
    // Ni lo que ya está en la receta ni el pollo (va en Presas).
    expect(screen.queryByRole("button", { name: "+ Arroz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Pollo para broaster" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comino.*Falta completar/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "+ Yuca" }));
    expect(within(fila("Yuca")).getByText("1 porción · falta su primera compra")).toBeInTheDocument();
    expect(within(fila("Yuca")).getByText("Sin costo")).toBeInTheDocument();
    expect(
      within(cuanto()).getByText(/^Costo incompleto: Yuca todavía no tiene ninguna compra, así que no entra en la cuenta/),
    ).toBeInTheDocument();
  });

  it("«Guardar» manda la receta entera, en orden, con el «puro» de cada guarnición", async () => {
    const { onGuardada } = await montar(RECETA);

    fireEvent.click(within(fila("Plátano")).getByRole("button", { name: "Se puede pedir «puro»: no" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });

    expect(apiRecetas.guardar).toHaveBeenCalledWith(12, {
      conReceta: true,
      lineas: [
        { insumoId: 1, porciones: 1, grupo: "FIJO", puro: false },
        { insumoId: 2, porciones: 1, grupo: "GUARNICION", puro: true },
        { insumoId: 3, porciones: 1, grupo: "GUARNICION", puro: true },
        { insumoId: 4, porciones: 1, grupo: "GUARNICION", puro: true },
        { insumoId: 5, porciones: 2, grupo: "PRESA", puro: false },
      ],
    });
    expect(onGuardada).toHaveBeenCalledWith(expect.objectContaining({ platoId: 12, conReceta: true }));
  });

  it("un plato sin receta avisa que pasa a «Con receta», y vacía no se guarda", async () => {
    await montar(VACIA);

    expect(screen.getByText(/^Al guardar, este plato pasa a «Con receta»/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Volver a Elaborado" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(screen.getByText("Agregá al menos un insumo a la receta.")).toBeInTheDocument();
    expect(apiRecetas.guardar).not.toHaveBeenCalled();
  });

  it("las presas: de qué pollo y cuántas, y lo que pasa al vender", async () => {
    await montar(VACIA);

    fireEvent.click(screen.getByRole("button", { name: "+ Pollo para broaster" }));
    expect(screen.getByText("Elegí cuántas presas lleva.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(screen.getByText("Elegí cuántas presas lleva el plato.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(screen.getByText("4 presas de Pollo para broaster")).toBeInTheDocument();
    expect(screen.getByText(/^Una de cada una: ala, pecho, pierna y contra/)).toBeInTheDocument();
    // 4 × 4,6125 = 18,45
    expect(within(cuanto()).getByText("Costo del plato").nextSibling).toHaveTextContent("Bs 18,45");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiRecetas.guardar).toHaveBeenCalledWith(40, {
      conReceta: true,
      lineas: [{ insumoId: 5, porciones: 4, grupo: "PRESA", puro: false }],
    });
  });

  it("sin el ajuste de elegir la presa, el de 1 o 2 sale de la que haya", async () => {
    sesion.recetas = { activas: true, elegirPresa: false, puroDoble: true };
    await montar(RECETA);
    expect(screen.getByText("No se pregunta al vender: sale de la presa que haya.")).toBeInTheDocument();
  });

  it("sin `costos.ver` no hay plata: ni «Cuánto te deja» ni costos en los renglones", async () => {
    const sinPlata: RecetaPlato = {
      ...RECETA,
      lineas: RECETA.lineas.map((l) => ({ ...l, costoPorcion: null, costo: null })),
      costo: null,
      costoMinimo: null,
      costoMaximo: null,
    };
    vi.mocked(apiRecetas.insumos).mockResolvedValue(INSUMOS.map((i) => ({ ...i, costoPorcion: null })));
    await montar(sinPlata);

    expect(screen.queryByRole("region", { name: "Cuánto te deja" })).not.toBeInTheDocument();
    expect(within(fila("Aceite")).getByText("1 porción")).toBeInTheDocument();
    expect(within(fila("Aceite")).queryByText(/Bs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin costo|Costo incompleto/)).not.toBeInTheDocument();
    // Lo del stock no es plata: se sigue viendo.
    expect(screen.getByText("Alcanza para 120 platos")).toBeInTheDocument();
  });

  it("«Volver a Elaborado» pide confirmación y guarda sin la receta", async () => {
    const { onGuardada } = await montar(RECETA);

    fireEvent.click(screen.getByRole("button", { name: "Volver a Elaborado" }));
    const dialogo = screen.getByRole("dialog", { name: "Volver a Elaborado" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Volver a Elaborado" }));
    });
    expect(apiRecetas.guardar).toHaveBeenCalledWith(12, expect.objectContaining({ conReceta: false }));
    expect(vi.mocked(apiRecetas.guardar).mock.calls[0][1].lineas).toHaveLength(5);
    expect(onGuardada).toHaveBeenCalledWith(expect.objectContaining({ conReceta: false }));
  });

  it("copiar la receta de otro plato reemplaza los renglones", async () => {
    await montar(VACIA, { platos: [{ id: 12, nombre: "Broaster cuarto" }, { id: 40, nombre: "Alitas" }] });

    // El plato que se edita no se ofrece.
    expect(screen.queryByRole("button", { name: "Alitas" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Broaster cuarto" }));
    });
    expect(apiRecetas.receta).toHaveBeenLastCalledWith(12, undefined);
    expect(screen.getByText("Copiaste la receta de Broaster cuarto: revisala y guardá.")).toBeInTheDocument();
    expect(fila("Aceite")).toBeInTheDocument();
    expect(screen.getByText("2 presas de Pollo para broaster")).toBeInTheDocument();
  });

  it("«Registrar la compra» lleva a Movimientos; con cambios sin guardar, primero pregunta", async () => {
    const conYuca: RecetaPlato = { ...RECETA, lineas: [...RECETA.lineas, linea(6, "FIJO", 1)], sinCosto: ["Yuca"] };
    await montar(conYuca);

    fireEvent.click(screen.getByRole("button", { name: "Más Aceite" }));
    fireEvent.click(within(cuanto()).getByRole("button", { name: "Registrar la compra" }));
    const dialogo = screen.getByRole("dialog", { name: "Salir sin guardar" });
    expect(screen.queryByText(/ahora en/)).not.toBeInTheDocument();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Salir sin guardar" }));
    expect(await screen.findByText("ahora en /inventario/movimientos?nuevo=entrada")).toBeInTheDocument();
  });

  it("un insumo dado de baja queda marcado y no deja guardar hasta sacarlo", async () => {
    vi.mocked(apiRecetas.insumos).mockResolvedValue(INSUMOS.filter((i) => i.id !== 4));
    await montar(RECETA);

    expect(within(fila("Plátano")).getByText(/Ya no está entre tus insumos listos para recetas/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(screen.getByText(/^«Plátano» ya no está entre tus insumos/)).toBeInTheDocument();
    expect(apiRecetas.guardar).not.toHaveBeenCalled();
  });
});
