import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearXlsx } from "../../lib/planilla";
import type { ImportarMedicamentosInput, RespuestaImportacion } from "../../types";

/**
 * La carga desde Excel: primero se revisa sin escribir nada, y recién al
 * confirmar se cargan los nuevos. Lo que ya está no se manda, y si la carga
 * se corta se dice cuánto entró y que alcanza con volver a subir el archivo.
 */

const sesion = vi.hoisted(() => ({ sucursalId: null as number | null }));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({ usuario: { rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: sesion.sucursalId } }),
  };
});

vi.mock("../../lib/api", () => ({
  api: { getAlmacenes: vi.fn(), importarMedicamentos: vi.fn() },
}));

import { api } from "../../lib/api";
import ImportarMedicamentos from "./ImportarMedicamentos";

const importar = vi.mocked(api.importarMedicamentos);

/** El Excel que sube el dueño: dos nuevos, uno que ya está y uno con problema. */
function excel(): File {
  const libro = crearXlsx([
    {
      nombre: "Medicamentos",
      filas: [
        ["Código de barras", "Nombre *", "Precio de venta *", "Cantidad", "Lote", "Vencimiento (MM/AAAA)"],
        ["777001", "Ibuprofeno 400 mg", 2.5, 100, "IBU-1", "04/2028"],
        ["777001", "Ibuprofeno 400 mg", 2.5, 40, "IBU-2", "09/2027"],
        ["", "Omeprazol", 3, 10, "OM-1", ""],
        ["", "Paracetamol 500 mg", 1, "", "", ""],
        ["", "Alcohol en gel", 15, "", "", ""],
      ],
    },
  ]);
  return new File([libro as BlobPart], "inventario.xlsx");
}

/** El servidor: el Paracetamol ya está en el catálogo. */
function servidor(input: ImportarMedicamentosInput): Promise<RespuestaImportacion> {
  return Promise.resolve({
    resultados: input.medicamentos.map((m) => ({
      fila: m.fila,
      estado: m.nombre.startsWith("Paracetamol")
        ? "EXISTE"
        : input.soloRevisar
          ? "LISTO"
          : "CREADO",
    })),
    movimientoId: input.soloRevisar ? null : 77,
  });
}

async function montar() {
  render(
    <MemoryRouter>
      <ImportarMedicamentos />
    </MemoryRouter>,
  );
  await act(async () => {});
}

async function subir(archivo = excel()) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Archivo de medicamentos"), {
      target: { files: [archivo] },
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.sucursalId = null;
  vi.mocked(api.getAlmacenes).mockResolvedValue([
    { id: 9, nombre: "Depósito", tipo: "DEPOSITO", activo: true },
    { id: 4, nombre: "Sucursal Centro", esPrincipal: true, activo: true },
    { id: 5, nombre: "Sucursal Equipetrol", activo: true },
  ] as never);
  importar.mockImplementation(servidor);
});

describe("cargar medicamentos desde Excel", () => {
  it("revisar no carga nada y dice qué va a pasar con cada fila", async () => {
    await montar();
    // Arranca en la principal, no en el depósito que viene primero.
    expect(screen.getByRole("combobox")).toHaveValue("4");
    await subir();

    expect(importar).toHaveBeenCalledTimes(1);
    const revisado = importar.mock.calls[0][0];
    expect(revisado).toMatchObject({ almacenId: 4, soloRevisar: true });
    // Los dos lotes del ibuprofeno viajan juntos, en un solo medicamento.
    expect(revisado.medicamentos.map((m) => [m.nombre, m.lotes.length])).toEqual([
      ["Ibuprofeno 400 mg", 2],
      ["Paracetamol 500 mg", 0],
      ["Alcohol en gel", 0],
    ]);

    const numero = (etiqueta: string) =>
      screen.getByText(etiqueta).closest(".card")!.querySelector("p")!.textContent;
    expect(numero("Para cargar")).toBe("2");
    expect(numero("Ya están")).toBe("1");
    expect(numero("Con problemas")).toBe("1");
    expect(screen.getByText("1 con stock · 140 unidades")).toBeInTheDocument();
    expect(screen.getByText("Fila 4")).toBeInTheDocument();
    expect(screen.getByText("El lote OM-1 no tiene vencimiento (MM/AAAA).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cargar 2 medicamentos en Sucursal Centro/ })).toBeEnabled();
  });

  it("al confirmar manda sólo los nuevos y dice cuánto entró", async () => {
    await montar();
    await subir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cargar 2 medicamentos/ }));
    });

    expect(importar).toHaveBeenCalledTimes(2);
    const cargado = importar.mock.calls[1][0];
    expect(cargado.soloRevisar).toBeUndefined();
    expect(cargado.medicamentos.map((m) => m.nombre)).toEqual(["Ibuprofeno 400 mg", "Alcohol en gel"]);
    expect(screen.getByText("2 medicamentos nuevos en Sucursal Centro")).toBeInTheDocument();
    expect(screen.getByText(/Entraron 140 unidades al stock/)).toBeInTheDocument();
    expect(screen.getByText("1 ya estaba en el catálogo y no se tocó.")).toBeInTheDocument();
  });

  it("dos clics en el mismo tick cargan una sola vez", async () => {
    // M4: el doble envío creó dos "Ibuprofeno" con 15 u. cada uno; el
    // servidor no tiene unicidad que lo ataje.
    await montar();
    await subir();
    await act(async () => {
      const cargar = screen.getByRole("button", { name: /Cargar 2 medicamentos/ });
      fireEvent.click(cargar);
      fireEvent.click(cargar);
    });
    // Una revisión y UNA carga.
    expect(importar).toHaveBeenCalledTimes(2);
    expect(importar.mock.calls.filter(([i]) => !i.soloRevisar)).toHaveLength(1);
  });

  it("si la carga se corta, dice cuánto entró y que alcanza con volver a subirlo", async () => {
    await montar();
    await subir();
    importar.mockRejectedValueOnce(new Error("Sin conexión con el servidor."));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cargar 2 medicamentos/ }));
    });
    expect(
      screen.getByText(/Se cargaron 0 de 2\. Lo que sigue no entró: Sin conexión con el servidor\./),
    ).toHaveTextContent("Volvé a subir el mismo archivo: lo que ya entró se saltea solo.");
  });

  it("un archivo sin los títulos obligatorios lo dice y no llama al servidor", async () => {
    await montar();
    const libro = crearXlsx([{ nombre: "Hoja1", filas: [["Producto", "Stock"], ["Ibuprofeno", 10]] }]);
    await subir(new File([libro as BlobPart], "otro.xlsx"));
    expect(screen.getByText(/No encontré los títulos "Nombre" y "Precio de venta"/)).toBeInTheDocument();
    expect(importar).not.toHaveBeenCalled();
  });

  it("quien es de una sucursal sólo puede cargar en la suya", async () => {
    sesion.sucursalId = 5;
    await montar();
    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toEqual(["Sucursal Equipetrol"]);
    expect(screen.getByRole("combobox")).toHaveValue("5");
  });
});
