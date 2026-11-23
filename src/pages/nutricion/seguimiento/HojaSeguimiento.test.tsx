import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isoDia } from "../../../lib/format";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import { CATALOGO_SEGUIMIENTO, filaDe, hojaDe, pacientesDePrueba, pagosDe } from "../../../test/seguimientoFixtures";
import HojaSeguimiento from "./HojaSeguimiento";
import ListaSeguimiento from "./ListaSeguimiento";

/**
 * La hoja del paciente y la lista (CONTRATO-nutricion-seguimiento-23nov §4.1,
 * §4.2 y §5): con `seguimiento.editar` se carga y se corrige; sin él, todo de
 * sólo lectura (ni «Cargar semana», ni «Cargar», ni «Anotar pago», ni el menú).
 */

const sesion = vi.hoisted(() => ({ permisos: [] as string[], secciones: [] as string[] }));

// La hoja entera es pesada: con la máquina cargada (Vite, otra suite) pasaba los 5 s de fábrica.
vi.setConfig({ testTimeout: 20_000 });

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, username: "prueba", rol: "PROFESIONAL", rolNombre: "Médico", permisos: sesion.permisos, permisosPropios: [] },
    negocio: { tipoNegocio: "NUTRICION", features: ["nutricion"] },
    puede: (s: string) => sesion.secciones.includes(s),
  }),
}));

vi.mock("../../../lib/nutricion/seguimiento/api", async (original) => ({
  ...(await original<typeof import("../../../lib/nutricion/seguimiento/api")>()),
  apiSeguimiento: {
    catalogo: vi.fn(),
    hoja: vi.fn(),
    tratamiento: vi.fn(),
    pacientes: vi.fn(),
    pagosPendientes: vi.fn(),
    cargarSemana: vi.fn(),
    corregirRegistro: vi.fn(),
  },
}));

const HOY = isoDia(new Date());
const pacientes = pacientesDePrueba(HOY);
const MEDICO = ["nutricion.ver", "seguimiento.ver", "seguimiento.editar"];

beforeEach(() => {
  vi.mocked(apiSeguimiento.catalogo).mockResolvedValue(CATALOGO_SEGUIMIENTO);
  vi.mocked(apiSeguimiento.hoja).mockImplementation(async (id: number) => hojaDe(pacientes.find((p) => p.paciente.id === id)!));
  vi.mocked(apiSeguimiento.pagosPendientes).mockResolvedValue(pagosDe(pacientes));
  vi.mocked(apiSeguimiento.pacientes).mockImplementation(async (f) => {
    const items = pacientes.map((p) => filaDe(p)).filter((x) => !f.soloEnTratamiento || x.tratamiento);
    return { total: items.length, pagina: 1, porPagina: 20, items };
  });
  sesion.permisos = MEDICO;
  sesion.secciones = ["nutricion", "seguimiento"];
});

async function abrirHoja(id: number) {
  render(
    <MemoryRouter initialEntries={[`/seguimiento/${id}`]}>
      <Routes>
        <Route path="/seguimiento/:id" element={<HojaSeguimiento />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { level: 1 });
}

describe("la hoja del paciente, con permiso de cargar", () => {
  it("el tratamiento, los avisos de pago, las tarjetas y la tabla del mes del último registro", async () => {
    await abrirHoja(12);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Lucía Paredes Soria");
    expect(screen.getByText(/Vial de 15.mg en 0,5.ml · 1.UI = 0,3.mg/)).toBeInTheDocument();
    expect(screen.getByText(/Viene derivada por su médico/)).toBeInTheDocument();
    // Debe el pago de la semana 5: la franja con «Anotar pago».
    expect(screen.getByText(/^Falta el pago de la semana 5 \(desde el /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anotar pago" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cargar semana 8/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver evaluación/ })).toHaveAttribute("href", "/evaluacion/12");
    // Al entrar, el mes del último registro (Mes 2): sin el inicial a la vista.
    expect(screen.getByRole("button", { name: "Mes 2" })).toHaveAttribute("aria-pressed", "true");
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Mes 2 · Semanas 5 a 9")).toBeInTheDocument();
    expect(within(tabla).queryByText("Inicial")).not.toBeInTheDocument();
    // La semana «No se aplicó», con su motivo, y las observaciones enteras.
    expect(within(tabla).getByText("No se aplicó")).toBeInTheDocument();
    expect(within(tabla).getByText(/Retoma la semana que viene con la misma dosis, sin subir\.$/)).toBeInTheDocument();
    // Las semanas por cargar del mes, con «Cargar».
    expect(within(tabla).getByRole("button", { name: "Cargar la semana 9" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todo" }));
    expect(within(screen.getByRole("table")).getByText("Mes 1 · Inicial a semana 4")).toBeInTheDocument();
  });

  it("«Anotar pago» abre el último registro de ese mes con el foco en el medicamento", async () => {
    await abrirHoja(12);
    fireEvent.click(screen.getByRole("button", { name: "Anotar pago" }));
    expect(screen.getByRole("dialog", { name: "Semana 7" })).toBeInTheDocument();
  });

  it("tocar una semana cargada la abre para corregirla; una por cargar, para cargar esa", async () => {
    await abrirHoja(12);
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Corregir la semana 6" }));
    expect(screen.getByRole("dialog", { name: "Semana 6" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Cargar la semana 9" }));
    expect(screen.getByRole("dialog", { name: "Semana 9" })).toBeInTheDocument();
    expect(screen.getByLabelText("Semana")).toHaveValue("9");
  });

  it("`Alt+N` abre «Cargar semana N»", async () => {
    await abrirHoja(12);
    fireEvent.keyDown(document, { key: "n", code: "KeyN", altKey: true });
    expect(screen.getByRole("dialog", { name: "Semana 8" })).toBeInTheDocument();
  });

  it("sin tratamiento: el cartel y «Iniciar tratamiento», con los botones de unidad sin marcar", async () => {
    await abrirHoja(20);
    expect(screen.getByText("Rosa Vaca Gutiérrez todavía no tiene un tratamiento.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar tratamiento" }));
    const hoja = screen.getByRole("dialog", { name: "Iniciar tratamiento" });
    expect(within(hoja).getByLabelText("Tratamiento")).toHaveValue("");
    expect(within(hoja).getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    // El peso del último control se ofrece, no se precarga.
    expect(within(hoja).getByLabelText("Peso (kg)")).toHaveValue("");
    expect(within(hoja).getByText(/^Último control de la evaluación: 92,4.kg/)).toBeInTheDocument();
    // El inicial es la semana de pago del mes 1.
    expect(within(hoja).getByText("Hoy toca el pago del mes")).toBeInTheDocument();
  });
});

describe("el paciente archivado en la Evaluación", () => {
  it("su hoja se ve, con el cartel, y no se le ofrece «Iniciar tratamiento» (409 PACIENTE_ARCHIVADO)", async () => {
    const rosa = hojaDe(pacientes.find((p) => p.paciente.id === 20)!);
    vi.mocked(apiSeguimiento.hoja).mockResolvedValueOnce({ ...rosa, paciente: { ...rosa.paciente, activo: false } });
    await abrirHoja(20);
    expect(screen.getByText("Paciente archivado.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar tratamiento" })).not.toBeInTheDocument();
  });
});

describe("sólo lectura (sin `seguimiento.editar`)", () => {
  beforeEach(() => {
    sesion.permisos = ["seguimiento.ver"];
    sesion.secciones = ["seguimiento"];
  });

  it("se ve todo, pero no hay con qué cargar ni corregir", async () => {
    await abrirHoja(12);
    expect(screen.getByText(/^Falta el pago de la semana 5/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cargar semana/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anotar pago" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cargar la semana/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Corregir la semana/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Más acciones del tratamiento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar una nota/ })).not.toBeInTheDocument();
    // Sin `nutricion.ver`, sin «Ver evaluación».
    expect(screen.queryByRole("link", { name: /Ver evaluación/ })).not.toBeInTheDocument();
    // `Alt+N` no abre nada.
    fireEvent.keyDown(document, { key: "n", code: "KeyN", altKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Tocar una semana no abre nada.
    fireEvent.click(within(screen.getByRole("table")).getByText("Semana 6"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin tratamiento, tampoco hay «Iniciar tratamiento»", async () => {
    await abrirHoja(20);
    expect(screen.getByText("Rosa Vaca Gutiérrez todavía no tiene un tratamiento.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar tratamiento" })).not.toBeInTheDocument();
  });
});

describe("la lista", () => {
  it("de entrada, los que están en tratamiento, con sus avisos de pago y el botón «Pagos pendientes» con su número", async () => {
    render(
      <MemoryRouter>
        <ListaSeguimiento />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "En tratamiento" })).toHaveAttribute("aria-pressed", "true");
    const tabla = await screen.findByRole("table");
    expect(within(tabla).getAllByText("Lucía Paredes Soria").length).toBeGreaterThan(0);
    expect(within(tabla).queryByText("Rosa Vaca Gutiérrez")).not.toBeInTheDocument();
    expect(apiSeguimiento.pacientes).toHaveBeenCalledWith(expect.objectContaining({ soloEnTratamiento: true }));
    // Ana Lucía debe dos meses; Carla paga la próxima.
    expect(within(tabla).getByText("Falta pagar · 2")).toBeInTheDocument();
    expect(within(tabla).getAllByText("Toca pago").length).toBeGreaterThan(0);
    const pagos = await screen.findByRole("link", { name: /Pagos pendientes/ });
    expect(pagos).toHaveAttribute("href", "/seguimiento/pagos");
    expect(within(pagos).getByText("3")).toBeInTheDocument();
    // Con «Todos», también los que no tienen tratamiento.
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect((await within(await screen.findByRole("table")).findAllByText("Sin tratamiento")).length).toBeGreaterThan(0);
    // El Médico no registra pacientes: sin el engranaje si no puede cambiar los ajustes… (aquí sí puede, por el catálogo de prueba).
    expect(screen.getByRole("button", { name: "Ajustes del seguimiento" })).toBeInTheDocument();
  });
});
