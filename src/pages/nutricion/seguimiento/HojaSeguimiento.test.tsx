import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api";
import { isoDia } from "../../../lib/format";
import { apiSeguimiento } from "../../../lib/nutricion/seguimiento/api";
import type { ProductoSeguimiento } from "../../../lib/nutricion/seguimiento/tipos";
import { catalogoConLista, olvidarCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { CATALOGO_SEGUIMIENTO, filaDe, hojaDe, pacientesDePrueba, pagosDe } from "../../../test/seguimientoFixtures";
import HojaSeguimiento from "./HojaSeguimiento";
import ListaSeguimiento from "./ListaSeguimiento";
import PagosPendientes from "./PagosPendientes";

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
    productos: vi.fn(),
    agregarProducto: vi.fn(),
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
        <Route path="/seguimiento" element={<p>La lista del seguimiento</p>} />
      </Routes>
    </MemoryRouter>,
  );
  // 5 s: con la máquina cargada (Vite y Chrome andando) el primer render pasaba el segundo de fábrica.
  await screen.findByRole("heading", { level: 1 }, { timeout: 5000 });
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

  // §7 (Kevin, 23-nov): lo principal es lo de la semana, con palabras; el total, de dato secundario.
  it("«Kg bajado»: «Bajó 0,6» / «Subió 0,8» contra la semana anterior y, debajo, el total desde el inicio", async () => {
    await abrirHoja(12);
    const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");
    const fila = (n: number) => sinNb(within(screen.getByRole("table")).getByRole("button", { name: `Corregir la semana ${n}` }).closest("tr")!.cells[2].textContent);
    expect(fila(5)).toBe("Bajó 0,65,6 desde el inicio");
    expect(fila(7)).toBe("Subió 0,84,3 desde el inicio");
    // La tarjeta «Bajó»: el total y la última semana.
    expect(sinNb(screen.getByText(/^Última semana:/).textContent)).toBe("Última semana: subió 0,8 kg");
  });

  // §7.4: 17 UI con el vial de 30 mg/ml es el escalón de 5 mg (16,7 redondeado): la tabla y la tarjeta lo dicen así, sin «≈».
  it("la dosis de un escalón se lee con los valores del escalón: «17 UI» y «5 mg · 0,17 ml», no «≈ 5,1 mg»", async () => {
    await abrirHoja(12);
    const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");
    const fila = (n: number) => sinNb(within(screen.getByRole("table")).getByRole("button", { name: `Corregir la semana ${n}` }).closest("tr")!.cells[3].textContent);
    expect(fila(7)).toBe("17 UI5 mg · 0,17 ml");
    expect(sinNb(screen.getByText("Dosis actual").closest("div")!.parentElement!.textContent)).toContain("17 UI5 mg · 0,17 ml");
    expect(screen.queryByText(/5,1.mg/)).not.toBeInTheDocument();
  });

  // §7.1 y §7.2: el renglón de la marca en la tabla, con «Corregir»; y «Editar tratamiento» corrige el del inicio.
  it("el cambio de producto: su renglón en la tabla abre esa semana con el producto; «Editar tratamiento» es el del inicio", async () => {
    const lucia = structuredClone(pacientes.find((p) => p.paciente.id === 12)!);
    lucia.tratamientos[0].semanas = lucia.tratamientos[0].semanas.map((s) => (s.semana === 7 ? { ...s, producto: { nombre: "Tirze", vialMg: 10, vialMl: 0.5 } } : s));
    vi.mocked(apiSeguimiento.hoja).mockResolvedValueOnce(hojaDe(lucia));
    await abrirHoja(12);
    const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");
    const tabla = screen.getByRole("table");
    // En partes que bajan enteras (el «·» de cada una va escrito para el lector de pantalla).
    expect(sinNb(within(tabla).getByText(/^Desde la semana 7 usa/).parentElement!.textContent)).toBe("Desde la semana 7 usa Tirze · 10 mg en 0,5 ml · antes Tirzepatida");
    expect(sinNb(screen.getByText(/^Empezó con/).textContent)).toBe("Empezó con Tirzepatida · 15 mg en 0,5 ml · cambió de producto una vez");
    fireEvent.click(within(tabla).getByRole("button", { name: "Corregir el cambio de producto de la semana 7" }));
    const hoja = screen.getByRole("dialog", { name: "Semana 7" });
    expect(within(hoja).getByLabelText("Producto nuevo")).toHaveValue("Tirze");
    fireEvent.click(within(hoja).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Más acciones del tratamiento" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Editar tratamiento/ }));
    const editar = screen.getByRole("dialog", { name: "Editar tratamiento" });
    expect(within(editar).getByLabelText("Producto al empezar")).toHaveValue("Tirzepatida");
    expect(within(editar).getByLabelText("Miligramos del vial")).toHaveValue("15");
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

  // Probado en la tablet y en la PC (23-nov): desde la semana 10, «Semana» / «11» quedaba en dos renglones
  // en los renglones por cargar (la columna es de ancho fijo); los cargados ya iban sin partir.
  it("el nombre de una semana, cargada o por cargar, no se parte en dos renglones", async () => {
    await abrirHoja(12);
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Semana 9")).toHaveClass("whitespace-nowrap");
    expect(within(tabla).getByText("Semana 6")).toHaveClass("whitespace-nowrap");
  });

  it("«Ver la hoja» tras una semana repetida: cierra sin preguntar, relee la hoja y marca el mes de esa semana", async () => {
    await abrirHoja(12);
    // La semana 8 ya estaba guardada (la respuesta se perdió, u otra persona la cargó).
    const lucia = pacientes.find((p) => p.paciente.id === 12)!;
    const conLa8 = structuredClone(lucia);
    const ultima = conLa8.tratamientos[0].semanas.reduce((a, s) => (s.semana > a.semana ? s : a));
    conLa8.tratamientos[0].semanas.push({ ...ultima, id: undefined, semana: 8, observaciones: "La cargada antes" });
    vi.mocked(apiSeguimiento.cargarSemana).mockRejectedValue(new ApiError("Ya hay un registro de la semana 8.", 409, { codigo: "SEMANA_REPETIDA" }));
    const lecturas = vi.mocked(apiSeguimiento.hoja).mock.calls.length;
    vi.mocked(apiSeguimiento.hoja).mockResolvedValueOnce(hojaDe(conLa8));
    fireEvent.click(screen.getByRole("button", { name: "Mes 1" }));
    fireEvent.keyDown(document, { key: "n", code: "KeyN", altKey: true });
    const hoja = screen.getByRole("dialog", { name: "Semana 8" });
    fireEvent.change(within(hoja).getByLabelText("Peso de hoy"), { target: { value: "123" } });
    fireEvent.click(within(hoja).getByRole("button", { name: /^Guardar/ }));
    fireEvent.click(await within(hoja).findByRole("button", { name: "Ver la hoja" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiSeguimiento.hoja).mock.calls.length).toBe(lecturas + 1));
    // Con la hoja releída: el mes de la semana 8 marcado y la semana a la vista. (5 s: con todos los
    // archivos en paralelo, los dos re-render de la hoja entera pasaban el segundo de fábrica.)
    await waitFor(() => expect(screen.getByRole("button", { name: "Mes 2" })).toHaveAttribute("aria-pressed", "true"), { timeout: 5000 });
    expect(within(screen.getByRole("table")).getByText("La cargada antes")).toBeInTheDocument();
  });

  // Probado con dos personas contra el backend (23-nov): la otra borró la semana 6; el 404 se veía en la
  // hoja, pero al cerrarla la tabla seguía mostrando la semana borrada (y volver a tocarla, otro 404).
  it("si el servidor dice que la semana ya no existe (404), al cerrar la hoja se vuelve a leer", async () => {
    await abrirHoja(12);
    vi.mocked(apiSeguimiento.corregirRegistro).mockRejectedValue(new ApiError("Esa semana no existe.", 404, { codigo: "REGISTRO_NO_ENCONTRADO" }));
    const lecturas = vi.mocked(apiSeguimiento.hoja).mock.calls.length;
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Corregir la semana 6" }));
    const hoja = screen.getByRole("dialog", { name: "Semana 6" });
    fireEvent.change(within(hoja).getByLabelText("Observaciones de la semana"), { target: { value: "Otra cosa" } });
    fireEvent.click(within(hoja).getByRole("button", { name: /^Guardar/ }));
    expect(await within(hoja).findByText("Esa semana no existe.")).toBeInTheDocument();
    // Lo escrito sigue ahí mientras la hoja está abierta; todavía no se volvió a leer.
    expect(within(hoja).getByLabelText("Observaciones de la semana")).toHaveValue("Otra cosa");
    expect(vi.mocked(apiSeguimiento.hoja).mock.calls.length).toBe(lecturas);
    fireEvent.click(within(hoja).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin guardar" }));
    await waitFor(() => expect(vi.mocked(apiSeguimiento.hoja).mock.calls.length).toBe(lecturas + 1));
  });

  it("un error que no es de datos viejos (la red) no vuelve a leer la hoja al cerrar", async () => {
    await abrirHoja(12);
    vi.mocked(apiSeguimiento.corregirRegistro).mockRejectedValue(new Error("Sin conexión"));
    const lecturas = vi.mocked(apiSeguimiento.hoja).mock.calls.length;
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Corregir la semana 6" }));
    const hoja = screen.getByRole("dialog", { name: "Semana 6" });
    fireEvent.change(within(hoja).getByLabelText("Observaciones de la semana"), { target: { value: "Otra cosa" } });
    fireEvent.click(within(hoja).getByRole("button", { name: /^Guardar/ }));
    expect(await within(hoja).findByText("Sin conexión")).toBeInTheDocument();
    fireEvent.click(within(hoja).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sin guardar" }));
    expect(vi.mocked(apiSeguimiento.hoja).mock.calls.length).toBe(lecturas);
  });

  // Probado el 23-nov: con la nota del tratamiento a medio escribir, `Ctrl+K` se iba a la lista y la nota se perdía.
  it("`Ctrl+K` escribiendo la nota del tratamiento no se va de la hoja; afuera de un campo, sí", async () => {
    await abrirHoja(12);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const nota = screen.getByLabelText("Notas del tratamiento");
    fireEvent.change(nota, { target: { value: "A medio escribir" } });
    fireEvent.keyDown(nota, { key: "k", ctrlKey: true });
    expect(screen.getByLabelText("Notas del tratamiento")).toHaveValue("A medio escribir");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Lucía Paredes Soria");
    // Con la nota abierta pero el foco afuera (al cerrar otra hoja encima, el foco no vuelve a la nota).
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "/" });
    expect(screen.getByLabelText("Notas del tratamiento")).toHaveValue("A medio escribir");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(screen.getByText("La lista del seguimiento")).toBeInTheDocument();
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
    expect(within(hoja).getByLabelText("Peso de hoy")).toHaveValue("");
    expect(within(hoja).getByText(/^Último control de la evaluación: 92,4.kg/)).toBeInTheDocument();
    // El inicial es la semana de pago del mes 1.
    expect(within(hoja).getByText("Hoy toca el pago del mes 1")).toBeInTheDocument();
  });
});

// §9.2: la lista de tratamientos cambia desde «+ Agregar» con la hoja abierta.
describe("«+ Agregar» desde «Iniciar tratamiento»", () => {
  // El catálogo queda guardado entre pruebas: que las que siguen no vean el tratamiento agregado.
  afterEach(() => olvidarCatalogoSeguimiento());

  it("al volver, el botón nuevo está (el catálogo se vuelve a leer), no se elige solo y la hoja no se rearma", async () => {
    const deFabrica: ProductoSeguimiento[] = CATALOGO_SEGUIMIENTO.tratamientos.map((t) => ({
      id: null,
      nombre: t.nombre,
      deFabrica: true,
      cambiado: false,
      oculto: false,
      pasosMg: t.pasosMg,
      presentaciones: t.presentaciones,
    }));
    const conNuevo: ProductoSeguimiento[] = [...deFabrica, { ...deFabrica[2], id: 12, nombre: "Péptido nuevo", deFabrica: false }];
    vi.mocked(apiSeguimiento.productos).mockResolvedValue({ productos: deFabrica });
    vi.mocked(apiSeguimiento.agregarProducto).mockResolvedValue({ productos: conNuevo });
    await abrirHoja(20);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar tratamiento" }));
    const hoja = screen.getByRole("dialog", { name: "Iniciar tratamiento" });
    fireEvent.change(within(hoja).getByLabelText("Tratamiento"), { target: { value: "Escrito a mano" } });
    const lecturas = vi.mocked(apiSeguimiento.catalogo).mock.calls.length;
    vi.mocked(apiSeguimiento.catalogo).mockResolvedValue(catalogoConLista(CATALOGO_SEGUIMIENTO, conNuevo));
    fireEvent.click(within(hoja).getByRole("button", { name: "Agregar un tratamiento a la lista" }));
    const ventana = screen.getByRole("dialog", { name: "Agregar tratamiento" });
    fireEvent.change(within(ventana).getByLabelText("Nombre"), { target: { value: "Péptido nuevo" } });
    fireEvent.click(within(ventana).getByRole("button", { name: "Agregar" }));
    expect(await within(hoja).findByRole("button", { name: "Péptido nuevo" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Agregar tratamiento" })).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(apiSeguimiento.catalogo).mock.calls.length).toBe(lecturas + 1));
    expect(within(hoja).getByLabelText("Tratamiento")).toHaveValue("Escrito a mano");
    // La misma hoja (no se desmontó ni se volvió a armar).
    expect(screen.getByRole("dialog", { name: "Iniciar tratamiento" })).toBe(hoja);
    expect(within(hoja).getByRole("button", { name: "Péptido nuevo" })).toBeInTheDocument();
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
    // El PDF sí: con `seguimiento.ver` alcanza (§7.2).
    expect(screen.getByRole("button", { name: "Descargar PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar por WhatsApp" })).toBeInTheDocument();
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

describe("«Pagos pendientes» (§8.2)", () => {
  const renglonDe = async (nombre: string) => (await screen.findByRole("link", { name: nombre })).closest("li")!;
  const sinNb = (s: string | null) => (s ?? "").replace(/ /g, " ");

  it("el último pago en dos renglones: lo que pagó el MES entero y cuándo fue; sin pago, «Todavía no pagó nada»", async () => {
    render(
      <MemoryRouter>
        <PagosPendientes />
      </MemoryRouter>,
    );
    // Lucía pagó el mes 1 en dos visitas: 480 + 150 el inicial y 50 de «Otro» en la semana 4.
    const lucia = await renglonDe("Lucía Paredes Soria");
    expect(sinNb(within(lucia).getByText(/^El mes 1 pagó/).textContent)).toBe("El mes 1 pagó Bs 680");
    expect(sinNb(within(lucia).getByText(/^Último pago:/).textContent)).toMatch(/^Último pago: el \d\d\/\d\d\/\d{4}$/);
    // En «les toca pagar» también.
    const carla = await renglonDe("Carla Méndez Ruiz");
    expect(sinNb(within(carla).getByText(/^El mes 1 pagó/).textContent)).toBe("El mes 1 pagó Bs 630");
    expect(within(await renglonDe("Pedro Gutiérrez Cuéllar")).getByText("Todavía no pagó nada")).toBeInTheDocument();
  });
});
