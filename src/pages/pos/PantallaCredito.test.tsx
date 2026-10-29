import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteCredito, CreditoInput, FormaPago, PagoInput } from "../../types";

/**
 * La pantalla del fiado (venta a crédito), en paridad con
 * `VentaCreditoFragment` de la app.
 *
 * El fiado que pasa el techo del cliente pide la firma (PIN) de un encargado.
 * Pase de octubre: la firma se guardaba y se reusaba en silencio. Con un PIN
 * mal tipeado, cada "Registrar fiado" volvía a mandar el mismo PIN malo sin
 * mostrar el diálogo, hasta que el backend bloqueaba los PIN de ese cajero
 * por 15 minutos (429 PIN_BLOQUEADO), anular incluido.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 1, username: "omar", rol: "ADMIN", permisos: ["autorizar.pin"], permisosPropios: [] },
    incluye: () => true,
  }),
}));

// El QR de verdad no hace falta: alcanza con poder darlo por recibido.
vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: (p: { onConfirmar: () => void; monto: string; confirmado: boolean }) => (
    <button onClick={p.onConfirmar}>
      {p.confirmado ? `QR de ${p.monto} recibido` : `ya llegó el QR de ${p.monto}`}
    </button>
  ),
}));

/** Debe Bs 40 con un límite de Bs 50: cualquier fiado de más de Bs 10 lo pasa. */
const ROSA: ClienteCredito = {
  id: 5,
  nombre: "Rosa Mamani",
  telefono: null,
  nota: null,
  saldoTotal: 40,
  montoVencido: 0,
  creditosAbiertos: 1,
  vecesFiado: 3,
  limiteCredito: 50,
  disponible: 10,
};

vi.mock("../../lib/api", () => ({
  api: { getClientesCredito: vi.fn(async () => [ROSA]) },
}));

import { api } from "../../lib/api";
import PantallaCredito from "./PantallaCredito";

const FORMAS = [
  { id: 1, nombre: "Efectivo" },
  { id: 2, nombre: "QR" },
] as FormaPago[];

const onConfirmar = vi.fn<(credito: CreditoInput, pagos: PagoInput[]) => void>();

function pantalla({
  error = "",
  rechazosPorLimite,
}: { error?: string; rechazosPorLimite?: number } = {}) {
  return (
    <PantallaCredito
      total={100}
      formasPago={FORMAS}
      onAtras={() => {}}
      onConfirmar={onConfirmar}
      enviando={false}
      error={error}
      rechazosPorLimite={rechazosPorLimite}
    />
  );
}

async function montar(opciones?: Parameters<typeof pantalla>[0]) {
  const r = render(pantalla(opciones));
  await act(async () => {});
  return r;
}

const nombre = () => screen.getByLabelText("Nombre del cliente");
const registrar = () => fireEvent.click(screen.getByRole("button", { name: /Registrar fiado/ }));
const fechaDePago = () => screen.getByLabelText("Se compromete a pagar el") as HTMLInputElement;
const enBs = () => screen.getByLabelText("Adelanto en Bs") as HTMLInputElement;
const enPct = () => screen.getByLabelText("Adelanto en %") as HTMLInputElement;
const firmar = (pin = "1234") => {
  fireEvent.change(screen.getByLabelText("PIN"), { target: { value: pin } });
  fireEvent.click(screen.getByRole("button", { name: "Autorizar" }));
};
/** Lo que se mandó en el último "Registrar fiado". */
const enviado = () => onConfirmar.mock.calls[onConfirmar.mock.calls.length - 1];

beforeEach(() => {
  onConfirmar.mockClear();
  vi.mocked(api.getClientesCredito).mockClear();
  // Hoy es el 28-oct a las 15:00: de tarde, como el turno de la pollería.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 28, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fiado sobre el techo del cliente", () => {
  it("un PIN rechazado por el backend no se vuelve a mandar solo: se pide otra vez", async () => {
    const { rerender } = await montar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    registrar();

    // Firma el encargado (con un PIN equivocado).
    firmar("1111");
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(enviado()[0]).toMatchObject({ autorizadorUsername: "omar", autorizadorPin: "1111" });

    // El backend lo rechaza; la cajera vuelve a tocar "Registrar fiado".
    rerender(pantalla({ error: "Usuario o PIN incorrecto" }));
    registrar();
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Autorización del encargado")).toBeInTheDocument();
  });
});

describe("CRE-4 / C-03: el cliente se reconoce aunque se escriba a mano", () => {
  it("con el nombre tecleado avisa su deuda y su límite, y pide la firma antes de mandar", async () => {
    // Antes, con "Cliente nuevo" y el nombre escrito, el fiado salía sin firma
    // y el backend (que sí lo reconoce por el nombre) lo frenaba con un 403.
    await montar();
    fireEvent.change(nombre(), { target: { value: "  rosa   MAMANÍ " } });

    expect(screen.getByText("Ya fió antes con este nombre.")).toBeInTheDocument();
    expect(screen.getByText("Ya debe Bs 40,00 en 1 cuenta.")).toBeInTheDocument();
    expect(screen.getByText(/Límite Bs 50,00 · le quedan/)).toBeInTheDocument();
    expect(screen.getByText(/lo pasa de su techo/)).toBeInTheDocument();

    registrar();
    expect(onConfirmar).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog", { name: "Autorización del encargado" });
    // El encargado ve de cuánto se pasa antes de firmar.
    expect(
      within(dialogo).getByText("Debe Bs 40,00 y quedaría en Bs 140,00, con un límite de Bs 50,00."),
    ).toBeInTheDocument();

    firmar();
    // La deuda va a la ficha por su id, y el nombre viaja igual (como Android):
    // el cierre de mesa del billar arma su aviso con él.
    expect(enviado()[0]).toMatchObject({
      clienteId: 5,
      clienteNombre: "rosa   MAMANÍ",
      autorizadorUsername: "omar",
      autorizadorPin: "1234",
    });
    expect(enviado()[0]).not.toHaveProperty("limiteCredito");
  });

  it("a un cliente cargado que nunca fió no le dice que ya fió", async () => {
    // Revisión del 28-oct: la lista trae a todos los clientes activos, también
    // a los de la agenda de belleza o de la academia, y a una clienta que
    // nunca fió le decía "Ya fió antes con este nombre".
    const LUCIA: ClienteCredito = {
      ...ROSA,
      id: 9,
      nombre: "Lucía Flores",
      saldoTotal: 0,
      creditosAbiertos: 0,
      vecesFiado: 0,
      limiteCredito: null,
      disponible: null,
    };
    vi.mocked(api.getClientesCredito).mockResolvedValueOnce([ROSA, LUCIA]);
    await montar();
    fireEvent.change(nombre(), { target: { value: "lucia flores" } });
    expect(screen.getByText("Ya figura como cliente con este nombre.")).toBeInTheDocument();
    expect(screen.queryByText("Ya fió antes con este nombre.")).not.toBeInTheDocument();

    registrar();
    expect(enviado()[0]).toMatchObject({ clienteId: 9, clienteNombre: "lucia flores" });
  });

  it("a un cliente que ya existe no se le ofrece un límite que el backend descarta", async () => {
    await montar();
    expect(screen.getByRole("group", { name: "Límite de crédito" })).toBeInTheDocument();
    fireEvent.change(nombre(), { target: { value: "Rosa Mamani" } });
    expect(screen.queryByRole("group", { name: "Límite de crédito" })).not.toBeInTheDocument();
  });

  it("un nombre que no es de nadie sigue siendo un cliente nuevo, con su límite", async () => {
    await montar();
    fireEvent.change(nombre(), { target: { value: "Rosa" } });
    expect(screen.queryByText("Ya fió antes con este nombre.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bs 200,00" }));
    registrar();
    expect(enviado()[0]).toMatchObject({ clienteNombre: "Rosa", limiteCredito: 200 });
    expect(enviado()[0]).not.toHaveProperty("clienteId");
  });
});

describe("CRE-4 / BUG-cobro-2: si el backend igual frena el fiado por el límite", () => {
  const RECHAZO =
    "El cliente pasa su límite de crédito (debe Bs 45.00 y quedaría en Bs 145.00, con un límite de Bs 50.00): hace falta la autorización de un encargado";

  it("abre la firma ahí mismo con los números del backend y reintenta con ella", async () => {
    // Otro cajero le fió en el medio: con la lista de antes no pasaba el
    // techo, el fiado salió sin firma y el backend respondió 403
    // LIMITE_CREDITO. Antes sólo se pintaba el texto y volver a tocar
    // "Registrar fiado" rebotaba igual.
    const { rerender } = await montar();
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    registrar();
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(enviado()[0]).not.toHaveProperty("autorizadorPin");

    rerender(pantalla({ error: RECHAZO, rechazosPorLimite: 1 }));
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Autorización del encargado" });
    expect(within(dialogo).getByText(RECHAZO)).toBeInTheDocument();
    // Y se trae la deuda de ahora, para que la pantalla diga lo mismo que el backend.
    expect(api.getClientesCredito).toHaveBeenCalledTimes(2);

    firmar();
    expect(onConfirmar).toHaveBeenCalledTimes(2);
    expect(enviado()[0]).toMatchObject({
      clienteNombre: "Juan Pérez",
      autorizadorUsername: "omar",
      autorizadorPin: "1234",
    });
  });

  it("si releer los clientes falla, el cliente elegido sigue elegido para el reintento firmado", async () => {
    const JUAN: ClienteCredito = { ...ROSA, id: 6, nombre: "Juan Pérez", saldoTotal: 0, limiteCredito: null, disponible: null };
    vi.mocked(api.getClientesCredito)
      .mockResolvedValueOnce([ROSA, JUAN])
      .mockRejectedValueOnce(new Error("Sin conexión"));
    const { rerender } = await montar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "6" } });
    registrar();

    rerender(pantalla({ error: RECHAZO, rechazosPorLimite: 1 }));
    await act(async () => {});
    firmar();
    expect(enviado()[0]).toMatchObject({ clienteId: 6, autorizadorPin: "1234" });
  });

  it("al volver a la pantalla no reabre la firma de un rechazo de antes", async () => {
    await montar({ error: "", rechazosPorLimite: 1 });
    expect(screen.queryByText("Autorización del encargado")).not.toBeInTheDocument();
  });

  it("si ya iba firmado y el backend igual dice que no, no la pide sola (no hay bucle)", async () => {
    const { rerender } = await montar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    registrar();
    firmar();
    expect(onConfirmar).toHaveBeenCalledTimes(1);

    rerender(pantalla({ error: RECHAZO, rechazosPorLimite: 1 }));
    await act(async () => {});
    expect(screen.queryByText("Autorización del encargado")).not.toBeInTheDocument();
    expect(screen.getByText(RECHAZO)).toBeInTheDocument();
  });

  it("guarda del billar: sin `rechazosPorLimite`, un error no abre la firma", async () => {
    // El cierre de mesa del billar usa esta pantalla y maneja sus rechazos
    // (MESA_CAMBIO) por su cuenta: nada de eso le cambia.
    const { rerender } = await montar();
    rerender(pantalla({ error: "La cuenta de la Mesa 5 cambió mientras cobrabas" }));
    await act(async () => {});
    expect(screen.queryByText("Autorización del encargado")).not.toBeInTheDocument();
    expect(api.getClientesCredito).toHaveBeenCalledTimes(1);
  });
});

describe("BUG-cobro-1: «Fin de mes» de tarde no cae un día antes", () => {
  it("el 28-oct a las 15:00 se compromete al 31-oct", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Fin de mes" }));
    expect(fechaDePago().value).toBe("2026-10-31");

    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    registrar();
    // Al final del día pactado, en hora local.
    expect(enviado()[0].fechaCompromiso).toMatch(/^2026-10-31T23:59:59[+-]\d{2}:\d{2}$/);
  });

  it("el anteúltimo día de tarde no salta al mes siguiente", async () => {
    vi.setSystemTime(new Date(2026, 9, 30, 15, 0));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Fin de mes" }));
    expect(fechaDePago().value).toBe("2026-10-31");
  });
});

describe("CRE-1 / C-09: fecha de pago libre, desde mañana", () => {
  it("«Otra fecha» con el calendario: el día pactado es el que viaja", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Otra fecha" }));
    expect(screen.getByRole("button", { name: "Otra fecha" })).toHaveAttribute("aria-pressed", "true");
    // El calendario arranca en la fecha que estaba elegida (7 días) y no deja
    // ir más atrás de mañana.
    expect(fechaDePago().value).toBe("2026-11-04");
    expect(fechaDePago().min).toBe("2026-10-29");

    fireEvent.change(fechaDePago(), { target: { value: "2026-11-05" } });
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    registrar();
    expect(enviado()[0].fechaCompromiso).toMatch(/^2026-11-05T23:59:59/);
  });

  it("tocar la fecha directamente también la cambia, como en la app", async () => {
    await montar();
    fireEvent.change(fechaDePago(), { target: { value: "2026-11-15" } });
    expect(screen.getByRole("button", { name: "Otra fecha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7 días" })).toHaveAttribute("aria-pressed", "false");
  });

  it("una fecha de hoy o pasada no se manda: la cuenta nacería vencida", async () => {
    await montar();
    fireEvent.change(fechaDePago(), { target: { value: "2026-10-28" } });
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    registrar();
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText("La fecha de pago tiene que ser desde mañana.")).toBeInTheDocument();
  });

  it("sin fecha elegida, pide el calendario", async () => {
    await montar();
    fireEvent.change(fechaDePago(), { target: { value: "" } });
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    registrar();
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText(/Elegí en el calendario/)).toBeInTheDocument();
  });
});

describe("CRE-2: el adelanto en Bs o en %, con «Sin adelanto» y «Mitad»", () => {
  it("el % escribe los Bs y los Bs escriben el %", async () => {
    await montar();
    fireEvent.change(enPct(), { target: { value: "25" } });
    expect(enBs().value).toBe("25,00");
    expect(screen.getByText(/adelanta Bs 25,00/)).toBeInTheDocument();
    expect(screen.getByText("Bs 75,00")).toBeInTheDocument();

    fireEvent.change(enBs(), { target: { value: "40" } });
    expect(enPct().value).toBe("40");
  });

  it("«Mitad» y «Sin adelanto» llenan y vacían los dos campos", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Mitad" }));
    expect(enBs().value).toBe("50,00");
    expect(enPct().value).toBe("50");
    expect(screen.getByRole("button", { name: "Mitad" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Sin adelanto" }));
    expect(enBs().value).toBe("");
    expect(enPct().value).toBe("");
    expect(screen.getByRole("button", { name: "Sin adelanto" })).toHaveAttribute("aria-pressed", "true");
  });

  it("la mitad en efectivo viaja como un pago de la venta", async () => {
    await montar();
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    fireEvent.click(screen.getByRole("button", { name: "Mitad" }));
    registrar();
    expect(enviado()[1]).toEqual([{ formaPagoId: 1, monto: 50, recibido: 50 }]);
  });

  it("cambiar el % después de confirmar el QR deja de darlo por recibido", async () => {
    // El QR confirmado era por otro monto: dar por cobrado un adelanto que no
    // llegó deja al cliente debiendo de menos.
    await montar();
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    fireEvent.change(enBs(), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "QR" }));
    fireEvent.click(screen.getByRole("button", { name: "ya llegó el QR de Bs 50,00" }));
    fireEvent.change(enPct(), { target: { value: "60" } });
    registrar();
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirmá que el pago por QR llegó/)).toBeInTheDocument();
  });
});

describe("el adelanto en mixto", () => {
  it("el adelanto es el entero: se dice cuánto va por QR y el resto es efectivo", async () => {
    await montar();
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    fireEvent.change(enBs(), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /Mixto/i }));
    fireEvent.change(screen.getByLabelText(/^Parte pagada por QR/), { target: { value: "30" } });

    // Arriba, el adelanto entero (con sólo el efectivo no cerraba con el saldo).
    expect(screen.getByText(/adelanta Bs 50,00/)).toBeInTheDocument();
    expect(screen.getByText("Bs 20,00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ya llegó el QR de Bs 30,00" }));
    registrar();
    expect(enviado()[1]).toEqual([
      { formaPagoId: 1, monto: 20, recibido: 20 },
      { formaPagoId: 2, monto: 30 },
    ]);
  });

  it("por QR no puede ir más que el adelanto", async () => {
    await montar();
    fireEvent.change(nombre(), { target: { value: "Juan Pérez" } });
    fireEvent.change(enBs(), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /Mixto/i }));
    fireEvent.change(screen.getByLabelText(/^Parte pagada por QR/), { target: { value: "30" } });
    registrar();
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText(/Por QR no puede ir más que el adelanto/)).toBeInTheDocument();
  });
});
