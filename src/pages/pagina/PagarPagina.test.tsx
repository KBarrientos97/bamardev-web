import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoCuentaPublico, PagoPublico } from "../../lib/academia/tipos";

/**
 * P6 · Pagar: el estado de cuenta del enlace que manda la recepción (o al que
 * se llega con el carnet, M5). Lo próximo a pagar, qué se puede pagar y cómo
 * (QR fijo con comprobante, o «pagá en la academia»), y nada de carnet,
 * teléfono ni apellidos.
 */

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({ pagina: { nombre: "CCTP Horizonte", color: { clave: "INDIGO", hex: "#3B42A9" } }, error: null }),
}));

vi.mock("../../lib/academia/apiPublica", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiPublica")>();
  return { ...real, apiAcademiaPublica: { estadoCuenta: vi.fn(), subirComprobante: vi.fn() } };
});

// El canvas no existe en jsdom: la foto "achicada" es el mismo archivo.
vi.mock("../../lib/academia/fotos", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/fotos")>();
  return { ...real, prepararFoto: vi.fn(async (f: File) => new Blob([f], { type: "image/webp" })) };
});

import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import PagarPagina from "./PagarPagina";

const PAGO: PagoPublico = {
  estado: "ACTIVA",
  modo: "FIJO",
  grupoLleno: false,
  opciones: [
    { clave: "CUOTA", titulo: "Pagar M2 · Degradados", detalle: "La próxima cuota", monto: 500, ahorro: null, etiqueta: "M2 · Degradados", vence: "2026-10-10" },
  ],
  enRevision: null,
  rechazado: null,
};

const ESTADO: EstadoCuentaPublico = {
  instituto: { nombre: "CCTP Horizonte", logoUrl: null, telefono: "70000000" },
  alumno: { nombres: "Camila" },
  curso: "Barbería",
  grupo: { nombre: "L-M-V 09:00", sede: "Central" },
  cuotas: [
    { concepto: "M1 · Corte clásico", monto: 500, pagado: 500, saldo: 0, vence: "2026-09-10", vencida: false, estado: "PAGADA" },
    { concepto: "M2 · Degradados", monto: 500, pagado: 0, saldo: 500, vence: "2026-10-10", vencida: true, estado: "PENDIENTE" },
  ],
  proxima: { concepto: "M2 · Degradados", saldo: 500, vence: "2026-10-10", vencida: true },
  saldoTotal: 500,
  qr: { tipo: "FIJO", imagenUrl: "https://cdn.test/qr.png" },
  pago: PAGO,
};

/** Una preinscripción: todavía sin cuotas, con el completo y el primer mes. */
const PREINSCRITO: EstadoCuentaPublico = {
  ...ESTADO,
  cuotas: [],
  proxima: null,
  saldoTotal: 0,
  pago: {
    ...PAGO,
    estado: "PREINSCRITA",
    opciones: [
      { clave: "COMPLETO", titulo: "Pagar el curso completo", detalle: "Ahorrás Bs 150 contra pagar mes a mes", monto: 1350, ahorro: 150, etiqueta: "Pago completo", vence: null },
      { clave: "CUOTA", titulo: "Pagar el primer mes", detalle: "Es lo que asegura tu cupo", monto: 500, ahorro: null, etiqueta: "Primer mes", vence: null },
    ],
  },
};

async function montar() {
  render(
    <MemoryRouter initialEntries={["/p/horizonte/pagar/K7Q2abcdef"]}>
      <Routes>
        <Route path="/p/:subdominio/pagar/:token" element={<PagarPagina />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => vi.clearAllMocks());

describe("P6 · Pagar", () => {
  it("saluda, dice cuánto y cuándo venció, y muestra el QR fijo del instituto", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue(ESTADO);
    await montar();
    expect(apiAcademiaPublica.estadoCuenta).toHaveBeenCalledWith("horizonte", "K7Q2abcdef");
    expect(screen.getByRole("heading", { name: "Hola, Camila" })).toBeInTheDocument();
    expect(screen.getByText("Venció el 10-oct")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR de CCTP Horizonte/ })).toHaveAttribute("src", "https://cdn.test/qr.png");
    expect(screen.getByRole("region", { name: "Tu estado de cuenta" })).toHaveTextContent("Pagado");
  });

  it("sin QR configurado, pagá en el instituto", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({ ...ESTADO, qr: null, pago: { ...PAGO, modo: "NINGUNO" } });
    await montar();
    expect(screen.getByText("Pagá en el instituto")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar comprobante/ })).not.toBeInTheDocument();
  });

  it("un enlace que no existe no muestra nada del estudiante", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockRejectedValue(new ErrorPublico("No existe", 404));
    await montar();
    expect(screen.getByText("Este enlace no existe o ya no está activo")).toBeInTheDocument();
  });
});

describe("M5 · Pagar desde la página", () => {
  it("una preinscripción no se dice «al día»: es donde paga para asegurar su lugar", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue(PREINSCRITO);
    await montar();
    expect(screen.queryByText(/Estás al día/)).not.toBeInTheDocument();
    expect(screen.getByText(/Estás preinscrito/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tu estado de cuenta" })).not.toBeInTheDocument();
    // Las dos formas con el monto que calculó el servidor.
    expect(screen.getByRole("radio", { name: /Pagar el curso completo.*Bs 1\.350/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Pagar el primer mes.*Bs 500/ })).not.toBeChecked();
    expect(screen.getByText("Ahorrás Bs 150", { selector: "span" })).toBeInTheDocument();
  });

  it("el QR pide el monto de lo que eligió, y el comprobante se manda con ESA opción (el monto no viaja)", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue(PREINSCRITO);
    vi.mocked(apiAcademiaPublica.subirComprobante).mockResolvedValue({ ok: true, monto: 500, etiqueta: "Primer mes" });
    await montar();
    fireEvent.click(screen.getByRole("radio", { name: /Pagar el primer mes/ }));
    expect(screen.getByText(/y pagá Bs 500$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ya pagué Bs 500/ })).toBeInTheDocument();

    const archivo = new File(["x"], "captura.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Foto o captura del comprobante"), { target: { files: [archivo] } });
    });
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({
      ...PREINSCRITO,
      pago: { ...PREINSCRITO.pago, enRevision: { monto: 500, etiqueta: "Primer mes", enviadoEn: "2026-11-03T12:00:00Z" } },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ya pagué Bs 500/ }));
    });
    expect(apiAcademiaPublica.subirComprobante).toHaveBeenCalledTimes(1);
    const [sub, token, cuerpo, foto] = vi.mocked(apiAcademiaPublica.subirComprobante).mock.calls[0];
    expect([sub, token]).toEqual(["horizonte", "K7Q2abcdef"]);
    expect(cuerpo).toEqual({ opcion: "CUOTA" });
    expect(foto).toBeInstanceOf(Blob);
    // La página pide el estado de nuevo y ahora dice que lo están revisando.
    expect(apiAcademiaPublica.estadoCuenta).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Recibimos tu comprobante")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar comprobante/ })).not.toBeInTheDocument();
  });

  it("sin la foto no se manda nada", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue(PREINSCRITO);
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Ya pagué Bs 1\.350/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Subí la foto o la captura de tu comprobante");
    expect(apiAcademiaPublica.subirComprobante).not.toHaveBeenCalled();
  });

  it("un rechazo del servidor se muestra y deja volver a intentar", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue(PREINSCRITO);
    vi.mocked(apiAcademiaPublica.subirComprobante).mockRejectedValue(new ErrorPublico("El comprobante tiene que ser PNG, JPG o WebP", 400, "COMPROBANTE_INVALIDO"));
    await montar();
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Foto o captura del comprobante"), { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /enviar comprobante/ }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("tiene que ser PNG, JPG o WebP");
    expect(screen.getByRole("button", { name: /enviar comprobante/ })).toBeEnabled();
  });

  it("con el comprobante en revisión no se ofrece pagar otra vez", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({
      ...ESTADO,
      pago: { ...PAGO, enRevision: { monto: 500, etiqueta: "M2 · Degradados", enviadoEn: "2026-11-03T12:00:00Z" } },
    });
    await montar();
    expect(screen.getByText("Recibimos tu comprobante")).toBeInTheDocument();
    expect(screen.getByText(/M2 · Degradados · Bs 500/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR de/ })).not.toBeInTheDocument();
  });

  it("si lo rechazaron, dice por qué, que la deuda sigue y deja subir otro", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({
      ...ESTADO,
      pago: { ...PAGO, rechazado: { motivo: "No vemos el pago en la cuenta del instituto", monto: 500, etiqueta: "M2 · Degradados", en: "2026-11-03T12:00:00Z" } },
    });
    await montar();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos confirmar tu último comprobante");
    expect(screen.getByRole("alert")).toHaveTextContent("No vemos el pago en la cuenta del instituto");
    expect(screen.getByRole("button", { name: /enviar comprobante/ })).toBeInTheDocument();
  });

  it("sin QR, una preinscripción queda preinscrita y paga en la academia (con los montos)", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({ ...PREINSCRITO, qr: null, pago: { ...PREINSCRITO.pago, modo: "NINGUNO" } });
    await montar();
    expect(screen.getByText("Quedaste preinscrito; pagá en la academia")).toBeInTheDocument();
    expect(screen.getByText("Bs 1.350")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar comprobante/ })).not.toBeInTheDocument();
  });

  it("con el grupo lleno una preinscripción no puede pagar: se comunica con la academia", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({ ...PREINSCRITO, pago: { ...PREINSCRITO.pago, grupoLleno: true, opciones: [] } });
    await montar();
    expect(screen.getByText("El grupo está lleno, comunicate con la academia")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR de/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /WhatsApp/ })[0]).toHaveAttribute("href", "https://wa.me/59170000000");
  });
});
