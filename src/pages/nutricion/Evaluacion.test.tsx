import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListaPacientes, Paciente, PacienteFila } from "../../lib/nutricion/tipos";
import { CATALOGO, paciente } from "../../test/nutricionFixtures";
import Evaluacion from "./Evaluacion";

/**
 * La etapa 1 de la evaluación (testing profundo, 23-nov): la talla escrita en
 * metros, el IMC imposible (QA: 127 kg con 80 cm de talla, IMC 198,4), un
 * entero con decimales que se redondeaba callado, el carnet repetido (lo
 * decide el servidor con `carnet=`) y el carnet que queda como lo guardó el
 * servidor («8958703 SC» → «8958703» con «SC» en Exp.).
 */

const servidor = vi.hoisted(() => ({
  delCarnet: [] as unknown[],
  carnetsPedidos: [] as string[],
  alta: null as unknown,
  altasPedidas: [] as unknown[],
}));

vi.mock("../../lib/nutricion/api", async (original) => ({
  ...(await original<typeof import("../../lib/nutricion/api")>()),
  apiNutricion: {
    catalogo: vi.fn(async () => CATALOGO),
    paciente: vi.fn(),
    delCarnet: vi.fn(async (carnet: string): Promise<ListaPacientes> => {
      servidor.carnetsPedidos.push(carnet);
      const items = servidor.delCarnet as PacienteFila[];
      return { total: items.length, pagina: 1, porPagina: 20, items };
    }),
    crear: vi.fn(async (cuerpo: unknown): Promise<Paciente> => {
      servidor.altasPedidas.push(cuerpo);
      return servidor.alta as Paciente;
    }),
    editar: vi.fn(),
    crearControl: vi.fn(),
    editarControl: vi.fn(),
  },
}));

function fila(datos: Partial<PacienteFila>): PacienteFila {
  return {
    id: 7,
    nombre: "María José Quispe Rojas",
    ci: null,
    telefono: null,
    sexo: "F",
    edad: 33,
    controles: 1,
    ultimoControl: "2026-11-01",
    pesoInicial: 70,
    pesoActual: 70,
    imc: 28,
    imcGrado: "SOBREPESO",
    activo: true,
    actualizadoEn: "2026-11-01T10:00:00.000Z",
    ...datos,
  };
}

async function abrirAlta(entrada = "/evaluacion/nuevo") {
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        {/* Las dos rutas con el mismo elemento, como en RutasNutricion: el alta sigue montada al pasar a editar. */}
        <Route path="/evaluacion/nuevo" element={<Evaluacion />} />
        <Route path="/evaluacion/:id/editar" element={<Evaluacion />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Litiasis vesicular");
}

const escribirYSalir = (campo: HTMLElement, valor: string) => {
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo);
};

describe("evaluación, etapa 1", () => {
  beforeEach(() => {
    servidor.delCarnet = [];
    servidor.carnetsPedidos = [];
    servidor.alta = null;
    servidor.altasPedidas = [];
  });

  it("la talla queda en metros al salir del campo, se escriba «1.73» o «173» (QA, 24-nov)", async () => {
    await abrirAlta();
    const talla = screen.getByLabelText("Talla");
    escribirYSalir(talla, "1.73");
    expect(talla).toHaveValue("1,73");
    escribirYSalir(talla, "173");
    expect(talla).toHaveValue("1,73");
    escribirYSalir(talla, "1,8");
    expect(talla).toHaveValue("1,80");
    expect(screen.queryByText(/Entre 0,80 y 2,50/)).not.toBeInTheDocument();
    // Fuera de tope, el error habla en metros y lo escrito queda como está.
    escribirYSalir(talla, "58");
    expect(talla).toHaveValue("58");
    expect(screen.getByText(/Entre 0,80 y 2,50/)).toBeInTheDocument();
  });

  it("la unidad del campo pegada al número se acepta y se saca al salir («82,4 kg» → «82,4»)", async () => {
    await abrirAlta();
    const peso = screen.getByLabelText("Peso");
    escribirYSalir(peso, "82,4 kg");
    expect(peso).toHaveValue("82,4");
    const talla = screen.getByLabelText("Talla");
    escribirYSalir(talla, "180cm");
    expect(talla).toHaveValue("1,80");
    escribirYSalir(talla, "180 kg");
    expect(talla).toHaveValue("180 kg");
    expect(screen.getByText("Escribí sólo el número")).toBeInTheDocument();
  });

  it("el IMC imposible se avisa junto a la talla al salir del campo, no a mitad de escribir", async () => {
    await abrirAlta();
    const talla = screen.getByLabelText("Talla");
    const peso = screen.getByLabelText("Peso");
    fireEvent.change(peso, { target: { value: "127" } });
    fireEvent.change(talla, { target: { value: "80" } });
    expect(screen.queryByText(/Revisá la talla y el peso/)).not.toBeInTheDocument();
    fireEvent.blur(talla);
    expect(screen.getByText("Revisá la talla y el peso: el IMC da 198,4")).toBeInTheDocument();
    // Corregida la talla, el aviso se va.
    escribirYSalir(talla, "180");
    expect(screen.queryByText(/Revisá la talla y el peso/)).not.toBeInTheDocument();
  });

  it("un entero con decimales queda como se escribió, con su error (antes «2,5» hijos se volvía «3»)", async () => {
    await abrirAlta();
    const hijos = screen.getByLabelText("Hijos");
    escribirYSalir(hijos, "2,5");
    expect(hijos).toHaveValue("2,5");
    expect(screen.getByText("Sin decimales")).toBeInTheDocument();
  });

  it("el carnet repetido lo decide el servidor: se le pregunta con `carnet=` tal como se escribió", async () => {
    servidor.delCarnet = [fila({ ci: "8958704-1B", activo: false })];
    await abrirAlta();
    escribirYSalir(screen.getByLabelText("Carnet de identidad"), "8958704 1b");
    expect(await screen.findByText("Ya está registrado: María José Quispe Rojas")).toBeInTheDocument();
    expect(servidor.carnetsPedidos).toContain("8958704 1b");
  });

  it("si el servidor no devuelve a nadie, no hay aviso", async () => {
    await abrirAlta();
    escribirYSalir(screen.getByLabelText("Carnet de identidad"), "9900001");
    await vi.waitFor(() => expect(servidor.carnetsPedidos).toContain("9900001"));
    expect(screen.queryByText(/Ya está registrado/)).not.toBeInTheDocument();
  });

  it("después de guardar, el carnet y la expedición quedan como los devolvió el servidor", async () => {
    servidor.alta = paciente({ id: 90, nombre: "Lucía Paredes Soria", ci: "8958703", ciExpedido: "SC", controles: [] });
    await abrirAlta();
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "8958703 SC" } });
    fireEvent.change(screen.getByLabelText(/Nombre del paciente/), { target: { value: "Lucía Paredes Soria" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar y seguir/ }));
    await screen.findByText("Fecha de la evaluación");
    expect(servidor.altasPedidas).toEqual([expect.objectContaining({ ci: "8958703 SC" })]);
    fireEvent.click(screen.getByRole("button", { name: /Ficha/ }));
    expect(await screen.findByLabelText("Carnet de identidad")).toHaveValue("8958703");
    expect(screen.getByLabelText("Exp.")).toHaveValue("SC");
    // Lo de la pantalla es lo guardado: no queda «Sin guardar».
    expect(screen.getByText("Guardado")).toBeInTheDocument();
  });

  it("«Crear paciente «1112223 LP»» desde la lista: lo que empieza con un número va al carnet", async () => {
    await abrirAlta(`/evaluacion/nuevo?ci=${encodeURIComponent("1112223 LP")}`);
    expect(screen.getByLabelText("Carnet de identidad")).toHaveValue("1112223 LP");
    expect(screen.getByLabelText(/Nombre del paciente/)).toHaveValue("");
  });
});
