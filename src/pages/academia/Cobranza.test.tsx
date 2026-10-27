import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esperarDemora, relojDeLaDemora } from "../../test/demora";
import type { RespuestaCobranza } from "../../lib/academia/tipos";

/**
 * N7 · Cobranza: las pestañas son los indicadores (con cuánto y cuántos),
 * "Enviar QR" abre el panel y "Abrir WhatsApp" pide al backend el mensaje con
 * el enlace de pago (que deja anotado el recordatorio) y abre wa.me. Para
 * varios, "1 de N · Siguiente". Cobrar lleva a "Cobrar a estudiante" (A1) con la inscripción.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { cobranza: vi.fn(), recordatorio: vi.fn(), carreras: vi.fn(async () => []), ajustes: vi.fn(async () => null) },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { ApiError } from "../../lib/api";
import Cobranza from "./Cobranza";

const RESPUESTA: RespuestaCobranza = {
  totales: {
    vencido: 4320,
    vencidoCuotas: 9,
    vencidoAlumnos: 7,
    venceSemana: 1500,
    venceSemanaCuotas: 2,
    venceMes: 5000,
    venceMesCuotas: 14,
    cobradoMes: 21000,
    parciales: 333,
    parcialesCuotas: 1,
  },
  items: [
    {
      inscripcionId: 103,
      alumno: { id: 53, nombre: "Céspedes Molina, Joaquín", codigo: "2026-0103" },
      contacto: { nombre: "Rosa Molina", telefono: "71234567", esTutor: true },
      grupo: { id: 7, nombre: "Barbería · L-V 10:00" },
      sede: { id: 2, nombre: "Norte" },
      cuotas: [
        { id: 905, numero: 2, concepto: "Cuota 2/3", materiaOrdenes: [2], materias: [{ orden: 2, nombre: "Degradados" }], monto: 533, pagado: 200, saldo: 333, vence: "2026-09-17", estado: "PARCIAL", vencida: true, diasAtraso: 12, ultimoRecordatorioEn: null, recordatorios: 0 },
      ],
      saldo: 333,
      diasAtraso: 12,
      ultimoRecordatorioEn: null,
      recordatorios: 0,
    },
    {
      inscripcionId: 102,
      alumno: { id: 52, nombre: "Bustillos Rek, Camila", codigo: "2026-0102" },
      contacto: { nombre: "Camila", telefono: "75512340", esTutor: false },
      grupo: { id: 7, nombre: "Barbería · L-V 10:00" },
      sede: { id: 1, nombre: "Central" },
      cuotas: [
        { id: 902, numero: 2, concepto: "Cuota 2/3", materiaOrdenes: [2], materias: [{ orden: 2, nombre: "Degradados" }], monto: 500, pagado: 0, saldo: 500, vence: "2026-10-10", estado: "PENDIENTE", vencida: true, diasAtraso: 6, ultimoRecordatorioEn: "2026-10-13T12:00:00.000Z", recordatorios: 1 },
      ],
      saldo: 500,
      diasAtraso: 6,
      ultimoRecordatorioEn: "2026-10-13T12:00:00.000Z",
      recordatorios: 1,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
};

function DondeEstoy() {
  const l = useLocation();
  return <p data-testid="destino">{`${l.pathname}${l.search}`}</p>;
}

async function montar(ruta = "/academia/cobranza") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/academia/cobranza" element={<Cobranza />} />
        <Route path="*" element={<DondeEstoy />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  relojDeLaDemora();
  vi.clearAllMocks();
  vi.mocked(apiAcademia.cobranza).mockResolvedValue(RESPUESTA);
});

describe("D6 · la cuota con el nombre del módulo", () => {
  it("la fila dice «Cuota 2/3 · M2 Degradados» con las materias de la cuota, sin pedir el grupo", async () => {
    await montar();
    expect(screen.getAllByText(/Cuota 2\/3 · M2 Degradados/).length).toBeGreaterThan(0);
  });

  it("una respuesta sin materias (backend anterior) deja el código «M2»", async () => {
    const sinMaterias = structuredClone(RESPUESTA);
    for (const f of sinMaterias.items) for (const c of f.cuotas) delete c.materias;
    vi.mocked(apiAcademia.cobranza).mockResolvedValue(sinMaterias);
    await montar();
    expect(screen.getAllByText(/Cuota 2\/3 · M2(?! Degradados)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/M2 Degradados/)).not.toBeInTheDocument();
  });
});

describe("N7 · cobranza", () => {
  it("arranca en Vencidas: las pestañas dicen cuánto y cuántos, y la fila del tutor", async () => {
    await montar();
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.objectContaining({ tipo: "vencidas", page: 1, pageSize: 20 }));
    // Los indicadores son los filtros: tarjetas-botón, la elegida con aria-pressed.
    const filtros = screen.getByRole("group", { name: "Filtrar deudas" });
    expect(within(filtros).getByRole("button", { name: /Vencidas Bs\s?4\.320,00 · 9/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtros).getByRole("button", { name: /Abonos a medias Bs\s?333,00 · 1/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText(/tutor Rosa Molina/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/abonó Bs\s?200,00 de Bs\s?533,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("sin recordar").length).toBeGreaterThan(0);
  });

  it("U4: sin chips de antigüedad ni selector de curso", async () => {
    // Con 2 cursos antes aparecía el selector; ahora no se pide ni la lista de cursos.
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      { id: 1, nombre: "Barbería" },
      { id: 2, nombre: "Tatuaje" },
    ] as never);
    await montar();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // U1: el "⋯" tenía sólo opciones "Pronto"; vacío, desaparece.
    expect(screen.queryByRole("button", { name: /Más acciones de cobranza/ })).not.toBeInTheDocument();
    expect(screen.queryByText("1–7 días")).not.toBeInTheDocument();
    expect(screen.queryByText("Más de 30")).not.toBeInTheDocument();
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.not.objectContaining({ antiguedad: expect.anything() }));
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.not.objectContaining({ carreraId: expect.anything() }));
  });

  it("ronda 2 · T4: la pantalla muestra las filas en el orden que manda el backend (no reordena por su cuenta)", async () => {
    // Quien ordena por días de atraso es el backend, y sólo en «Vencidas». Antes este test
    // comprobaba que la pantalla respetara un orden que el propio mock traía hecho; acá se
    // prueba con DOS órdenes distintos, así que un reordenamiento propio (alfabético, por
    // atraso) haría fallar al menos uno.
    const orden = () => screen.getAllByText(/Céspedes Molina|Bustillos Rek/).map((n) => (/Céspedes/.test(n.textContent ?? "") ? "C" : "B"));
    await montar();
    const primero = orden()[0];
    cleanup();
    vi.mocked(apiAcademia.cobranza).mockResolvedValue({ ...RESPUESTA, items: [...RESPUESTA.items].reverse() });
    await montar();
    expect(orden()[0]).not.toBe(primero);
  });

  it("la pestaña viene de la dirección (desde Hoy)", async () => {
    await montar("/academia/cobranza?tipo=por-vencer");
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.objectContaining({ tipo: "por-vencer" }));
  });

  it("Enviar QR abre el panel; Abrir WhatsApp pide el mensaje con el enlace, abre wa.me y lo anota", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(apiAcademia.recordatorio).mockResolvedValue({
      telefono: "59171234567",
      texto: "Hola Rosa, pagá acá: https://app.bamardev.com/p/horizonte/pagar/K7Q2",
      url: "https://wa.me/59171234567?text=Hola",
      enlacePago: "https://app.bamardev.com/p/horizonte/pagar/K7Q2",
    });
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    const panel = screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" });
    expect(within(panel).getByText(/Rosa Molina \(tutor\)/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir WhatsApp" }));
    });
    expect(apiAcademia.recordatorio).toHaveBeenCalledWith(905);
    expect(abrir).toHaveBeenCalledWith("https://wa.me/59171234567?text=Hola", "_blank", "noopener,noreferrer");
    expect(within(panel).getByText(/pagar\/K7Q2/)).toBeInTheDocument();
    // La URL larga se corta dentro del globo en vez de salirse (QA ronda 2, B-20).
    expect(within(panel).getByText(/pagar\/K7Q2/).className).toContain("break-all");
    expect(within(panel).getByRole("status")).toHaveTextContent("Anotado: recordado hoy");
    abrir.mockRestore();
  });

  it("CUOTA_SIN_SALDO (400) al armar el recordatorio: el mensaje del backend tal cual y la lista se vuelve a pedir", async () => {
    const mensaje = "Esa cuota ya no tiene saldo: no hay nada que recordar.";
    vi.mocked(apiAcademia.recordatorio).mockRejectedValue(new ApiError(mensaje, 400, { codigo: "CUOTA_SIN_SALDO" }));
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    const panel = screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" });
    const pedidas = vi.mocked(apiAcademia.cobranza).mock.calls.length;
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir WhatsApp" }));
    });
    expect(within(panel).getByText(mensaje)).toBeInTheDocument();
    expect(vi.mocked(apiAcademia.cobranza).mock.calls.length).toBeGreaterThan(pedidas);
  });

  it("GRUPO_CANCELADO (400) al armar el recordatorio: el mensaje del backend tal cual", async () => {
    const mensaje = "Esa cuota es de un grupo cancelado: no se le manda recordatorio.";
    vi.mocked(apiAcademia.recordatorio).mockRejectedValue(new ApiError(mensaje, 400, { codigo: "GRUPO_CANCELADO" }));
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    const panel = screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir WhatsApp" }));
    });
    expect(within(panel).getByText(mensaje)).toBeInTheDocument();
  });

  it("varios marcados se recorren de a uno: 1 de 2 · Siguiente", async () => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    await montar();
    expect(screen.getByRole("button", { name: "Enviar QR a los marcados" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Marcar todos los de esta página" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Enviar QR a 2 marcados" }));
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente ›" }));
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Bustillos Rek, Camila" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("Cobrar, desde el panel, lleva a Cobrar a estudiante con la inscripción y la sede del grupo", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobranza/cobrar?inscripcion=103&sede=2&sedeNombre=Norte");
  });

  it("QA 23-oct: Cobrar también en la fila, sin abrir el panel", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar a Céspedes Molina, Joaquín" })[0]);
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobranza/cobrar?inscripcion=103&sede=2&sedeNombre=Norte");
  });

  it("26-oct: Cobrar ya no está aparte en el menú; arriba se cobra a cualquiera, esté o no en la lista", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar a un estudiante" }));
    expect(screen.getByTestId("destino")).toHaveTextContent(/^\/academia\/cobranza\/cobrar$/);
  });
  it("D10: el buscador manda `q` al servidor (con demora) y la lista, el contador y los totales son los de la respuesta", async () => {
    await montar();
    const buscador = screen.getByPlaceholderText("Nombre, CI, código o teléfono");
    expect(buscador).toHaveAccessibleName("Buscar estudiante");
    // Sin buscar, no se manda `q`.
    expect(vi.mocked(apiAcademia.cobranza).mock.calls[0][0].q).toBeUndefined();
    const soloCamila = {
      ...RESPUESTA,
      items: [RESPUESTA.items[1]],
      total: 1,
      totales: { ...RESPUESTA.totales, vencido: 500, vencidoCuotas: 1 },
    };
    vi.mocked(apiAcademia.cobranza).mockResolvedValue(soloCamila);
    fireEvent.change(buscador, { target: { value: "camila" } });
    // Antes de la demora no se pregunta (una tecla no es un pedido).
    expect(vi.mocked(apiAcademia.cobranza)).toHaveBeenCalledTimes(1);
    await esperarDemora();
    expect(apiAcademia.cobranza).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: "vencidas", q: "camila", page: 1 }));
    expect(screen.queryAllByText("Bustillos Rek, Camila").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Céspedes Molina, Joaquín")).toHaveLength(0);
    // Las tarjetas-filtro cuentan lo encontrado, no el total del negocio.
    expect(within(screen.getByRole("group", { name: "Filtrar deudas" })).getByRole("button", { name: /Vencidas Bs\s?500,00 · 1/ })).toBeInTheDocument();
  });

  it("ronda 2 · B7: con una sola letra no se manda `q`; con dos, sí", async () => {
    await montar();
    const buscador = screen.getByPlaceholderText("Nombre, CI, código o teléfono");
    vi.mocked(apiAcademia.cobranza).mockClear();
    fireEvent.change(buscador, { target: { value: "c" } });
    await esperarDemora();
    expect(apiAcademia.cobranza).not.toHaveBeenCalled();
    fireEvent.change(buscador, { target: { value: "ca" } });
    await esperarDemora();
    expect(apiAcademia.cobranza).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ca" }));
  });

  it("D10: ya no hay aviso de «busca sólo en esta página», aunque haya varias páginas", async () => {
    vi.mocked(apiAcademia.cobranza).mockResolvedValue({ ...RESPUESTA, total: 45 });
    await montar();
    fireEvent.change(screen.getByPlaceholderText("Nombre, CI, código o teléfono"), { target: { value: "camila" } });
    await esperarDemora();
    expect(screen.queryByText(/Busca entre las/)).not.toBeInTheDocument();
  });

  it("D10: sin resultados lo dice y el buscador sigue ahí; limpiar vuelve a la lista", async () => {
    await montar();
    vi.mocked(apiAcademia.cobranza).mockResolvedValue({ ...RESPUESTA, items: [], total: 0 });
    fireEvent.change(screen.getByPlaceholderText("Nombre, CI, código o teléfono"), { target: { value: "zzz" } });
    await esperarDemora();
    expect(screen.getByText(/Nadie con «zzz»/)).toBeInTheDocument();
    vi.mocked(apiAcademia.cobranza).mockResolvedValue(RESPUESTA);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    await esperarDemora();
    expect(apiAcademia.cobranza).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined }));
    expect(screen.queryAllByText("Céspedes Molina, Joaquín").length).toBeGreaterThan(0);
  });

  it("ronda 1 · D6: al limpiar una búsqueda sin resultados el buscador no desaparece mientras llega la lista", async () => {
    await montar();
    vi.mocked(apiAcademia.cobranza).mockResolvedValue({ ...RESPUESTA, items: [], total: 0 });
    fireEvent.change(screen.getByPlaceholderText("Nombre, CI, código o teléfono"), { target: { value: "zzz" } });
    await esperarDemora();
    expect(screen.getByText(/Nadie con «zzz»/)).toBeInTheDocument();
    // La lista completa tarda: el pedido queda en vuelo.
    vi.mocked(apiAcademia.cobranza).mockReturnValue(new Promise(() => undefined));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(screen.getByPlaceholderText("Nombre, CI, código o teléfono")).toBeInTheDocument();
    await esperarDemora();
    expect(screen.getByPlaceholderText("Nombre, CI, código o teléfono")).toBeInTheDocument();
  });

  it("ronda 1 · D5: la respuesta lenta de una búsqueda vieja no pisa los totales de la nueva", async () => {
    await montar();
    const conVencido = (vencido: number): RespuestaCobranza => ({ ...RESPUESTA, totales: { ...RESPUESTA.totales, vencido, vencidoCuotas: 1 } });
    let soltarVieja: (r: RespuestaCobranza) => void = () => undefined;
    vi.mocked(apiAcademia.cobranza)
      .mockReturnValueOnce(new Promise((r) => { soltarVieja = r; }))
      .mockResolvedValueOnce(conVencido(111));
    const buscador = screen.getByPlaceholderText("Nombre, CI, código o teléfono");
    fireEvent.change(buscador, { target: { value: "camila" } });
    await esperarDemora();
    fireEvent.change(buscador, { target: { value: "joaquin" } });
    await esperarDemora();
    const kpi = () => within(screen.getByRole("group", { name: "Filtrar deudas" }));
    expect(kpi().getByRole("button", { name: /Vencidas Bs\s?111,00/ })).toBeInTheDocument();
    // Ahora contesta la vieja, con otros totales: no deben verse.
    await act(async () => {
      soltarVieja(conVencido(999));
    });
    expect(kpi().getByRole("button", { name: /Vencidas Bs\s?111,00/ })).toBeInTheDocument();
    expect(kpi().queryByRole("button", { name: /999/ })).not.toBeInTheDocument();
  });

  it("D10: el CI del estudiante sale en la fila y en el panel cuando viene; si no viene, no se dibuja", async () => {
    vi.mocked(apiAcademia.cobranza).mockResolvedValue({
      ...RESPUESTA,
      items: [
        { ...RESPUESTA.items[0], alumno: { ...RESPUESTA.items[0].alumno, ci: "8123456" } },
        { ...RESPUESTA.items[1], alumno: { ...RESPUESTA.items[1].alumno, ci: null } },
      ],
    });
    await montar();
    expect(screen.getAllByText(/CI 8123456/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/CI null/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    const panel = screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" });
    expect(within(panel).getByText(/CI 8123456 · código 2026-0103/)).toBeInTheDocument();
  });
});
