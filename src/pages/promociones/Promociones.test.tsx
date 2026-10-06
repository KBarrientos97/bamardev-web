import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Promocion } from "../../lib/promociones/tipos";

/** La pantalla de promociones con la API simulada. */

const sesion = vi.hoisted(() => ({ features: ["promociones", "cupones"] as string[] }));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Pollería", features: sesion.features } }),
}));
vi.mock("../../lib/api", () => ({
  api: {
    getProductos: vi.fn().mockResolvedValue([{ id: 5, nombre: "Gaseosa", habilitado: true }]),
    getCategorias: vi.fn().mockResolvedValue([{ id: 2, nombre: "Pollos" }]),
  },
}));
vi.mock("../../lib/promociones/apiPromociones", () => ({
  apiPromociones: {
    listar: vi.fn(),
    crear: vi.fn(),
    editar: vi.fn(),
    estado: vi.fn(),
    reporte: vi.fn(),
    enlace: vi.fn(),
    anunciar: vi.fn(),
    cupones: vi.fn(),
    disponibilidadCupon: vi.fn(),
    crearCupones: vi.fn(),
    anularCupon: vi.fn(),
    bajarCuponesCsv: vi.fn(),
  },
}));

import { apiPromociones } from "../../lib/promociones/apiPromociones";
import Promociones from "./Promociones";

const api = vi.mocked(apiPromociones);

function promo(cambios: Partial<Promocion> = {}): Promocion {
  return {
    id: 1,
    nombre: "2x1 los martes",
    descripcion: null,
    tipo: "NXM",
    disparo: "AUTOMATICA",
    alcance: "LINEA",
    valor: null,
    llevaN: 2,
    pagaM: 1,
    minimoCompra: null,
    topeDescuento: null,
    vigenciaDesde: null,
    vigenciaHasta: null,
    diasSemana: [2],
    horaDesde: null,
    horaHasta: null,
    usosMax: null,
    usosPorCliente: null,
    usos: 3,
    descontado: 75,
    acumulable: false,
    prioridad: 0,
    publica: true,
    slug: "2x1-los-martes",
    estado: "ACTIVA",
    estadoVisible: "ACTIVA",
    version: 1,
    productoIds: [],
    categoriaIds: [2],
    excluirProductoIds: [],
    cupones: 0,
    condiciones: ["2x1 en artículos seleccionados", "Sólo los martes"],
    urlPublica: "https://app-qa.bamardev.com/p/omar/promo/2x1-los-martes",
    creadoEn: "2026-10-06T00:00:00Z",
    ...cambios,
  };
}

/**
 * Lo que hace el navegador al teclear en el medio: cambia el valor y deja el
 * cursor donde quedó. El setter del prototipo, para que React vea el cambio.
 */
function escribirConCursor(campo: HTMLInputElement, valor: string, cursor: number) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(campo, valor);
    campo.setSelectionRange(cursor, cursor);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["promociones", "cupones"];
});

describe("Promociones", () => {
  it("lista las promociones con sus condiciones y sus usos", async () => {
    api.listar.mockResolvedValue([promo()]);
    render(<Promociones />);
    expect(await screen.findByText("2x1 los martes")).toBeInTheDocument();
    expect(screen.getByText("Sólo los martes")).toBeInTheDocument();
    expect(screen.getByText(/3 usos · descontado/)).toBeInTheDocument();
    // Pública y activa: se puede compartir.
    expect(screen.getByRole("button", { name: /Compartir/ })).toBeInTheDocument();
  });

  it("sin promociones ofrece plantillas; sin cupones en el plan, no la de código", async () => {
    sesion.features = ["promociones"];
    api.listar.mockResolvedValue([]);
    render(<Promociones />);
    expect(await screen.findByText("Todavía no hay promociones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Happy hour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cupón de bienvenida" })).not.toBeInTheDocument();
  });

  it("una plantilla precarga el editor y guarda lo que manda el formulario", async () => {
    api.listar.mockResolvedValue([]);
    api.crear.mockResolvedValue(promo({ id: 9, nombre: "Happy hour" }));
    render(<Promociones />);
    fireEvent.click(await screen.findByRole("button", { name: "Happy hour" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByDisplayValue("Happy hour")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crear).toHaveBeenCalled());
    expect(api.crear.mock.calls[0][0]).toMatchObject({
      nombre: "Happy hour",
      tipo: "PORCENTAJE",
      valor: 20,
      horaDesde: "15:00",
      horaHasta: "18:00",
      disparo: "AUTOMATICA",
    });
    expect(await screen.findByText(/Se creó/)).toBeInTheDocument();
  });

  describe("código del cupón en la misma promoción (§12, decisión 8)", () => {
    async function abrirConCodigo() {
      api.listar.mockResolvedValue([]);
      render(<Promociones />);
      fireEvent.click(await screen.findByRole("button", { name: "Cupón de bienvenida" }));
      return screen.findByRole("dialog");
    }

    it("al elegir «Con código» lo pide, lo limpia y avisa que está libre", async () => {
      api.disponibilidadCupon.mockResolvedValue({ codigo: "VERANO20", disponible: true });
      api.crear.mockResolvedValue(promo({ id: 9, nombre: "Cupón de bienvenida", disparo: "CODIGO", cupones: 1 }));
      const dialogo = await abrirConCodigo();
      const campo = within(dialogo).getByLabelText(/Código del cupón/);
      fireEvent.change(campo, { target: { value: "verano 20%" } });
      expect(campo).toHaveValue("VERANO20");
      expect(await within(dialogo).findByText("Disponible.")).toBeInTheDocument();
      expect(api.disponibilidadCupon).toHaveBeenLastCalledWith("VERANO20");
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(api.crear).toHaveBeenCalled());
      expect(api.crear.mock.calls[0][0]).toMatchObject({ disparo: "CODIGO", codigo: "VERANO20" });
      expect(await screen.findByText(/con el código VERANO20/)).toBeInTheDocument();
    });

    it("si ya existe lo dice al instante y no deja guardar", async () => {
      api.disponibilidadCupon.mockResolvedValue({
        codigo: "VERANO20",
        disponible: false,
        motivo: "EXISTE",
        mensaje: 'Ya existe el cupón VERANO20 (promoción "Verano")',
      });
      const dialogo = await abrirConCodigo();
      fireEvent.change(within(dialogo).getByLabelText(/Código del cupón/), { target: { value: "VERANO20" } });
      expect(await within(dialogo).findByText(/Ya existe el cupón VERANO20/)).toBeInTheDocument();
      expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeDisabled();
    });

    it("con menos de 3 no consulta y no deja guardar; vacío sí (sólo lote)", async () => {
      const dialogo = await abrirConCodigo();
      const campo = within(dialogo).getByLabelText(/Código del cupón/);
      fireEvent.change(campo, { target: { value: "ab" } });
      expect(within(dialogo).getByText("Mínimo 3 letras o números.")).toBeInTheDocument();
      expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeDisabled();
      fireEvent.change(campo, { target: { value: "" } });
      expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeEnabled();
      expect(api.disponibilidadCupon).not.toHaveBeenCalled();
    });

    it("CUP-03: si al guardar vuelve 409 (otro lo tomó), el campo dice que está tomado y no deja guardar", async () => {
      api.disponibilidadCupon.mockResolvedValue({ codigo: "VERANO20", disponible: true });
      api.crear.mockRejectedValue(
        Object.assign(new Error("Ya existe un cupón VERANO20"), { status: 409, codigo: "CUPON_EXISTE" }),
      );
      const dialogo = await abrirConCodigo();
      const campo = within(dialogo).getByLabelText(/Código del cupón/);
      fireEvent.change(campo, { target: { value: "VERANO20" } });
      expect(await within(dialogo).findByText("Disponible.")).toBeInTheDocument();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeDisabled());
      expect(within(dialogo).queryByText("Disponible.")).not.toBeInTheDocument();
      expect(campo).toHaveAttribute("aria-invalid", "true");
      expect(within(dialogo).getAllByText("Ya existe un cupón VERANO20").length).toBeGreaterThan(0);
      // Otro código vuelve a consultar como siempre.
      fireEvent.change(campo, { target: { value: "VERANO21" } });
      expect(await within(dialogo).findByText("Disponible.")).toBeInTheDocument();
      expect(within(dialogo).getByRole("button", { name: "Guardar" })).toBeEnabled();
    });

    it("CUP-04: corregir en el medio no manda el cursor al final", async () => {
      const dialogo = await abrirConCodigo();
      const campo = within(dialogo).getByLabelText(/Código del cupón/) as HTMLInputElement;
      fireEvent.change(campo, { target: { value: "QAS2R1" } });
      campo.focus();
      // Lo que hace el navegador al teclear "x-y" después de "QA".
      escribirConCursor(campo, "QAx-yS2R1", 5);
      expect(campo).toHaveValue("QAXYS2R1");
      expect(campo.selectionStart).toBe(4);
      // Un guion solo no cambia lo limpio, pero el cursor tampoco salta.
      escribirConCursor(campo, "QA-XYS2R1", 3);
      expect(campo).toHaveValue("QAXYS2R1");
      expect(campo.selectionStart).toBe(2);
    });

    it("editar una que ya es con código no lo pide: sus cupones siguen en «Cupones»", async () => {
      api.listar.mockResolvedValue([promo({ disparo: "CODIGO", cupones: 2 })]);
      render(<Promociones />);
      fireEvent.click(await screen.findByRole("button", { name: "Editar" }));
      const dialogo = await screen.findByRole("dialog");
      expect(within(dialogo).queryByLabelText(/Código del cupón/)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cupones" })).toBeInTheDocument();
    });
  });

  describe("«Cupones» › Un código (CUP-05)", () => {
    async function abrirCupones() {
      api.listar.mockResolvedValue([promo({ disparo: "CODIGO", cupones: 0 })]);
      api.cupones.mockResolvedValue([]);
      render(<Promociones />);
      fireEvent.click(await screen.findByRole("button", { name: "Cupones" }));
      return screen.findByRole("dialog");
    }

    it("avisa al instante si el código ya existe y no deja crear", async () => {
      api.disponibilidadCupon.mockResolvedValue({
        codigo: "S2SEGR4",
        disponible: false,
        motivo: "EXISTE",
        mensaje: 'Ya existe el cupón S2SEGR4 (promoción "Otra")',
      });
      const dialogo = await abrirCupones();
      const campo = within(dialogo).getByLabelText("Código");
      fireEvent.change(campo, { target: { value: "s2seg-r4" } });
      expect(campo).toHaveValue("S2SEGR4");
      expect(await within(dialogo).findByText(/Ya existe el cupón S2SEGR4/)).toBeInTheDocument();
      expect(within(dialogo).getByRole("button", { name: "Crear" })).toBeDisabled();
      expect(api.crearCupones).not.toHaveBeenCalled();
    });

    it("el error de un modo no queda visible al pasar al otro", async () => {
      api.disponibilidadCupon.mockResolvedValue({ codigo: "NUEVO10", disponible: true });
      api.crearCupones.mockRejectedValue(
        Object.assign(new Error("Ya existe un cupón NUEVO10"), { status: 409, codigo: "CUPON_EXISTE" }),
      );
      const dialogo = await abrirCupones();
      fireEvent.change(within(dialogo).getByLabelText("Código"), { target: { value: "nuevo10" } });
      expect(await within(dialogo).findByText("Disponible.")).toBeInTheDocument();
      fireEvent.click(within(dialogo).getByRole("button", { name: "Crear" }));
      // El 409 queda en el campo, como en la promoción.
      await waitFor(() => expect(within(dialogo).getByRole("button", { name: "Crear" })).toBeDisabled());
      expect(within(dialogo).getAllByText("Ya existe un cupón NUEVO10").length).toBeGreaterThan(0);
      fireEvent.click(within(dialogo).getByRole("button", { name: "Lote para imprimir" }));
      expect(within(dialogo).queryByText("Ya existe un cupón NUEVO10")).not.toBeInTheDocument();
      expect(within(dialogo).getByRole("button", { name: "Crear" })).toBeEnabled();
    });
  });

  it("pausar llama al backend con el estado nuevo", async () => {
    api.listar.mockResolvedValue([promo()]);
    api.estado.mockResolvedValue(promo({ estado: "PAUSADA" }));
    render(<Promociones />);
    fireEvent.click(await screen.findByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(api.estado).toHaveBeenCalledWith(1, "PAUSADA"));
  });
});
