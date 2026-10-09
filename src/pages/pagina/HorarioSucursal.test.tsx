import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaginaPublica, Tramo } from "../../lib/pagina/tipos";
import VistaPagina from "./VistaPagina";

/**
 * El cartel "Abierto ahora" de las sucursales en la página pública, con el
 * reloj fijo. Los instantes van en UTC y se eligen por la hora de Bolivia
 * (UTC−4): el 12-oct-2026 es lunes.
 */

const LUN_A_VIE: Tramo[] = [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: "09:00", hasta: "21:00" }));

const PAGINA: PaginaPublica = {
  subdominio: "buensabor",
  nombre: "Pollería El Buen Sabor",
  rubro: "Restaurante",
  iniciales: "PB",
  descripcion: null,
  color: { clave: "NARANJA", hex: "#B4501A" },
  formaBotones: "PILDORA",
  tipografia: "FUERTE",
  logoUrl: null,
  portadaUrl: null,
  anuncio: null,
  reservar: false,
  destacado: null,
  redes: [],
  botones: [],
  sucursales: [
    {
      nombre: "Av. Banzer",
      reservaSlug: null,
      direccion: "Av. Banzer, 4to anillo",
      telefono: "33112233",
      horario: "Feriados cerrado",
      mapaUrl: null,
      horarioSemanal: [...LUN_A_VIE, { dia: 6, desde: "09:00", hasta: "13:00" }],
    },
    { nombre: "Norte", reservaSlug: null, direccion: "Calle 1", telefono: null, horario: "9 a 18", mapaUrl: null },
  ],
  catalogo: null,
  pie: { atribucionUrl: "https://bamardev.com" },
  og: { titulo: "", descripcion: "", imagen: null, url: "" },
};

const ESTILOS = ["CLASICO", "VITRINA", "VIVO", "NOCHE", "BOUTIQUE"] as const;
const MODOS = ["movil", "escritorio"] as const;

function montar(p: Partial<PaginaPublica> = {}, modo: (typeof MODOS)[number] = "movil") {
  return render(<VistaPagina pagina={{ ...PAGINA, ...p }} urlReservar="/r/buensabor" modo={modo} />);
}

const carteles = () => screen.queryAllByTestId("estado-sucursal");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("cartel de abierto/cerrado de la sucursal", () => {
  for (const estilo of ESTILOS) {
    for (const modo of MODOS) {
      it(`${estilo} en ${modo}: abierto dice a qué hora cierra; sólo la sucursal con horario por día lo lleva`, () => {
        vi.setSystemTime(new Date("2026-10-12T14:00:00Z")); // lunes 10:00 en Bolivia
        montar({ estilo }, modo);
        expect(carteles()).toHaveLength(1);
        expect(carteles()[0]).toHaveTextContent("Abierto ahora · cierra 21:00");
        expect(carteles()[0]).toHaveAttribute("data-abierto", "true");
        // Va en la tarjeta de su sucursal, y el texto libre sigue.
        const tarjeta = screen.getByText("Av. Banzer").closest("article")!;
        expect(within(tarjeta).getByTestId("estado-sucursal")).toBeInTheDocument();
        expect(within(tarjeta).getByText("Feriados cerrado")).toBeInTheDocument();
        expect(screen.getAllByText("Ver horario")).toHaveLength(1);
      });
    }
  }

  it("cerrado: dice cuándo vuelve a abrir, con la hora de Bolivia y no la UTC", () => {
    // 01:30 UTC del martes = 21:30 del lunes en Bolivia.
    vi.setSystemTime(new Date("2026-10-13T01:30:00Z"));
    montar();
    expect(carteles()[0]).toHaveTextContent("Cerrado · abre mañana 9:00");
    expect(carteles()[0]).toHaveAttribute("data-abierto", "false");
  });

  it("el sábado a la tarde: abre el lunes", () => {
    vi.setSystemTime(new Date("2026-10-17T20:00:00Z")); // sábado 16:00
    montar({ estilo: "NOCHE" });
    expect(carteles()[0]).toHaveTextContent("Cerrado · abre el lunes 9:00");
  });

  it("en Noche, el cartel es oscuro con letra clara", () => {
    vi.setSystemTime(new Date("2026-10-12T14:00:00Z"));
    montar({ estilo: "NOCHE" });
    expect(carteles()[0].style.background).toBe("rgb(18, 48, 31)");
    expect(carteles()[0].style.color).toBe("rgb(134, 239, 172)");
  });

  it("24 horas y a medianoche", () => {
    vi.setSystemTime(new Date("2026-10-12T14:00:00Z"));
    const siempre = [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, desde: "00:00", hasta: "24:00" }));
    const { unmount } = montar({ sucursales: [{ ...PAGINA.sucursales[0], horarioSemanal: siempre }] });
    expect(carteles()[0]).toHaveTextContent("Abierto las 24 horas");
    unmount();
    montar({ sucursales: [{ ...PAGINA.sucursales[0], horarioSemanal: [{ dia: 1, desde: "08:00", hasta: "24:00" }] }] });
    expect(carteles()[0]).toHaveTextContent("Abierto ahora · cierra a medianoche");
  });

  it("se actualiza solo al pasar el minuto", () => {
    vi.setSystemTime(new Date("2026-10-13T00:59:30Z")); // lunes 20:59:30
    montar({ estilo: "VIVO" });
    expect(carteles()[0]).toHaveTextContent("Abierto ahora · cierra 21:00");
    act(() => vi.advanceTimersByTime(30_000));
    expect(carteles()[0]).toHaveTextContent("Cerrado · abre mañana 9:00");
  });

  it("sin horario por día no hay cartel ni «Ver horario» (el texto libre sigue)", () => {
    vi.setSystemTime(new Date("2026-10-12T14:00:00Z"));
    for (const estilo of ESTILOS) {
      const { unmount } = montar({ estilo, sucursales: [{ ...PAGINA.sucursales[0], horarioSemanal: null }] });
      expect(carteles()).toHaveLength(0);
      expect(screen.queryByText("Ver horario")).not.toBeInTheDocument();
      expect(screen.getByText("Feriados cerrado")).toBeInTheDocument();
      unmount();
    }
  });

  it("Clásico sin horario por día queda idéntico a no mandarlo (un backend anterior)", () => {
    const sinCampo = PAGINA.sucursales.map((s) => ({ ...s, horarioSemanal: undefined }));
    const { container: a, unmount } = montar({ sucursales: sinCampo });
    const html = a.innerHTML;
    unmount();
    const { container: b } = montar({ sucursales: sinCampo.map((s) => ({ ...s, horarioSemanal: null })) });
    expect(b.innerHTML).toBe(html);
  });

  it("«Ver horario» despliega la semana agrupada", () => {
    vi.setSystemTime(new Date("2026-10-12T14:00:00Z"));
    montar({ estilo: "BOUTIQUE" });
    const resumen = screen.getByText("Ver horario");
    fireEvent.click(resumen);
    const semana = resumen.closest("details")!;
    expect(semana).toHaveAttribute("open");
    expect(within(semana).getByText("Lun a vie")).toBeInTheDocument();
    expect(within(semana).getByText("9:00–21:00")).toBeInTheDocument();
    expect(within(semana).getByText("Sáb")).toBeInTheDocument();
    expect(within(semana).getByText("9:00–13:00")).toBeInTheDocument();
    expect(within(semana).getByText("Dom")).toBeInTheDocument();
    expect(within(semana).getByText("Cerrado")).toBeInTheDocument();
  });
});

describe("cartel de abierto/cerrado en los estilos de la fase 2", () => {
  const FASE2 = ["POSTAL", "CARTA", "DULCE", "MOSAICO"] as const;
  for (const estilo of FASE2) {
    for (const modo of MODOS) {
      it(`${estilo} en ${modo}: el cartel va en la tarjeta de la sucursal con su «Ver horario»`, () => {
        vi.setSystemTime(new Date("2026-10-12T14:00:00Z")); // lunes 10:00 en Bolivia
        montar({ estilo }, modo);
        expect(carteles()).toHaveLength(1);
        expect(carteles()[0]).toHaveTextContent("Abierto ahora · cierra 21:00");
        const tarjeta = screen.getByText("Av. Banzer").closest("article")!;
        expect(within(tarjeta).getByTestId("estado-sucursal")).toBeInTheDocument();
        expect(within(tarjeta).getByText("Feriados cerrado")).toBeInTheDocument();
        expect(within(tarjeta).getByText("Ver horario")).toBeInTheDocument();
      });
    }
  }

  it("Carta: el encabezado lleva el cartel de la sucursal principal (la primera); sin su horario, nada", () => {
    vi.setSystemTime(new Date("2026-10-13T01:30:00Z")); // lunes 21:30
    const { unmount } = montar({ estilo: "CARTA" });
    const encabezado = screen.getByTestId("estado-encabezado");
    expect(encabezado).toHaveTextContent("Cerrado · abre mañana 9:00");
    expect(encabezado.closest("article")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toContainElement(encabezado);
    unmount();
    // La principal sin horario por día: no se toma el de otra sucursal.
    montar({ estilo: "CARTA", sucursales: [PAGINA.sucursales[1], PAGINA.sucursales[0]] });
    expect(screen.queryByTestId("estado-encabezado")).not.toBeInTheDocument();
    expect(carteles()).toHaveLength(1);
  });

  it("Mosaico: el cartel oscuro del bloque de la sucursal", () => {
    vi.setSystemTime(new Date("2026-10-12T14:00:00Z"));
    montar({ estilo: "MOSAICO" });
    expect(carteles()[0].style.background).toBe("rgb(18, 48, 31)");
    expect(carteles()[0].style.color).toBe("rgb(134, 239, 172)");
  });
});
