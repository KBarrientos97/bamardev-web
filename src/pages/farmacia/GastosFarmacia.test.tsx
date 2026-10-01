import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoriaGasto, Gasto, ResumenGastos } from "../../types";

/**
 * Gastos operativos de la farmacia: cada gasto se toca y lo que se hace con él
 * vive en el popup; las categorías se filtran con chips y se administran desde
 * la misma pantalla.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ usuario: { rol: "ADMIN", sucursalId: null } }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    getResumenGastos: vi.fn(),
    getGastos: vi.fn(),
    getCategoriasGasto: vi.fn(),
    getSucursales: vi.fn(async () => []),
    eliminarGasto: vi.fn(async () => ({ mensaje: "Gasto eliminado" })),
    crearCategoriaGasto: vi.fn(async () => ({})),
    actualizarCategoriaGasto: vi.fn(async () => ({})),
    eliminarCategoriaGasto: vi.fn(async () => ({ mensaje: "ok" })),
    getPlantillasGasto: vi.fn(async () => []),
  },
}));

import { api } from "../../lib/api";
import GastosFarmacia from "./GastosFarmacia";

function gasto(datos: Partial<Gasto>): Gasto {
  return {
    id: 1,
    concepto: "Alquiler del local",
    categoria: "ALQUILER",
    categoriaNombre: "Alquiler",
    tipoCosto: "FIJO",
    monto: 3500,
    pagado: 3500,
    saldo: 0,
    estado: "PAGADO",
    fecha: "2026-09-05",
    fechaVencimiento: null,
    vencido: false,
    diasAtraso: 0,
    diasParaVencer: 0,
    metodoPago: "TRANSFERENCIA",
    beneficiario: null,
    nota: null,
    sucursalId: null,
    sucursal: null,
    recurrente: true,
    numeroFactura: null,
    nit: null,
    ...datos,
  };
}

const luz = gasto({
  id: 2,
  concepto: "Luz · DELAPAZ",
  categoria: "LUZ",
  categoriaNombre: "Luz",
  monto: 420,
  pagado: 200,
  saldo: 220,
  estado: "PARCIAL",
  fechaVencimiento: "2026-09-18",
  vencido: true,
  diasAtraso: 8,
  metodoPago: null,
  recurrente: false,
  nota: "Incluye la heladera de la cadena de frío",
});

const resumen: ResumenGastos = {
  total: 3920,
  pagado: 3700,
  pendiente: 220,
  vencido: 220,
  cantidad: 2,
  cantidadPendientes: 1,
  cantidadVencidos: 1,
  cantidadPagados: 1,
  ventasPeriodo: 0,
};

const categorias: CategoriaGasto[] = [
  { codigo: "ALQUILER", nombre: "Alquiler", propia: false, tipoCosto: "FIJO" },
  { codigo: "GAS", nombre: "Gas", propia: false, tipoCosto: "VARIABLE" },
  { codigo: "REGENTE", nombre: "Regente", propia: true, tipoCosto: "FIJO" },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getResumenGastos).mockResolvedValue(resumen);
  vi.mocked(api.getGastos).mockResolvedValue([gasto({}), luz]);
  vi.mocked(api.getCategoriasGasto).mockResolvedValue(categorias);
});

async function abrir() {
  render(
    <MemoryRouter>
      <GastosFarmacia />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Luz · DELAPAZ")).toBeInTheDocument();
}

async function tocar(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe("la lista", () => {
  it("dice lo vencido con el saldo que falta, y los vencidos arriba en los números", async () => {
    await abrir();
    expect(screen.getByText(/Venció hace 8 días · saldo Bs 220,00/)).toBeInTheDocument();
    expect(screen.getByText(/1 vencidos · Bs 220,00/)).toBeInTheDocument();
  });

  it("los chips de categoría son sólo las del mes, y filtran sin volver a pedir", async () => {
    await abrir();
    const pedidos = vi.mocked(api.getGastos).mock.calls.length;
    // "Gas" existe como categoría pero no tiene gastos este mes: no hay chip.
    expect(screen.queryByRole("button", { name: "Gas" })).not.toBeInTheDocument();
    await tocar(screen.getByRole("button", { name: "Luz" }));
    expect(screen.queryByText("Alquiler del local")).not.toBeInTheDocument();
    expect(screen.getByText("Luz · DELAPAZ")).toBeInTheDocument();
    expect(vi.mocked(api.getGastos).mock.calls.length).toBe(pedidos);
  });
});

describe("el detalle", () => {
  it("tocar un gasto abre lo que se sabe de él y lo que se puede hacer", async () => {
    await abrir();
    await tocar(screen.getByText("Luz · DELAPAZ"));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("Pagado Bs 200,00 · falta Bs 220,00");
    expect(dialogo).toHaveTextContent("Incluye la heladera de la cadena de frío");
    expect(within(dialogo).getByRole("button", { name: "Registrar pago" })).toBeInTheDocument();
  });

  it("uno saldado no ofrece registrar pago", async () => {
    await abrir();
    await tocar(screen.getByText("Alquiler del local"));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    expect(dialogo).toHaveTextContent("Automático, cada mes");
  });

  it("eliminar pide confirmar antes de borrar", async () => {
    await abrir();
    await tocar(screen.getByText("Luz · DELAPAZ"));
    await tocar(screen.getByRole("button", { name: /Eliminar/ }));
    expect(api.eliminarGasto).not.toHaveBeenCalled();
    await tocar(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(api.eliminarGasto).toHaveBeenCalledWith(2);
  });
});

describe("las categorías", () => {
  async function abrirCategorias() {
    await abrir();
    await tocar(screen.getByRole("button", { name: /Categorías/ }));
    return screen.getByRole("dialog");
  }

  it("retirar una no la borra: se pide por código", async () => {
    const dialogo = await abrirCategorias();
    await tocar(within(dialogo).getByRole("button", { name: "Retirar Gas" }));
    expect(api.eliminarCategoriaGasto).toHaveBeenCalledWith("GAS");
  });

  it("agregar una propia manda el nombre y si es fija o variable", async () => {
    const dialogo = await abrirCategorias();
    fireEvent.change(within(dialogo).getByLabelText("Nombre de la categoría nueva"), {
      target: { value: "SEDES" },
    });
    await tocar(within(dialogo).getByRole("button", { name: /Agregar/ }));
    expect(api.crearCategoriaGasto).toHaveBeenCalledWith({ nombre: "SEDES", tipoCosto: "FIJO" });
  });

  it("tocar fijo/variable lo da vuelta", async () => {
    const dialogo = await abrirCategorias();
    const fila = within(dialogo).getByText("Gas").closest("li")!;
    await tocar(within(fila).getByRole("button", { name: "Variable" }));
    expect(api.actualizarCategoriaGasto).toHaveBeenCalledWith("GAS", { tipoCosto: "FIJO" });
  });
});

describe("los gastos automáticos", () => {
  it("lo que se va a cargar solo se avisa arriba de la lista, sin sumarlo", async () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const en3 = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    vi.mocked(api.getPlantillasGasto).mockResolvedValue([
      {
        id: 9,
        concepto: "Sueldo del regente",
        categoria: "SUELDOS",
        categoriaNombre: "Sueldos",
        frecuencia: "MENSUAL",
        diaDelMes: d.getDate(),
        monto: 4200,
        activa: true,
        motivoPausa: null,
        beneficiario: null,
        nota: null,
        sucursalId: null,
        sucursal: null,
        proximaCarga: en3,
        ultimaCarga: null,
      },
    ]);
    await abrir();
    const aviso = await screen.findByRole("region", { name: "Próximos gastos automáticos" });
    expect(aviso).toHaveTextContent("Sueldo del regente");
    // El total del mes sigue siendo el de los gastos que ya existen.
    expect(screen.getByText("Total del mes").parentElement).toHaveTextContent(/3.?920,00/);
  });
});
