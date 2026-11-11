import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEGUNDOS_POR_TANDA } from "../../lib/tickets/fichasTv";
import { AJUSTES_TV_DE_FABRICA, type AjustesTicketsTv } from "../../types/tickets";
import { TableroTv, type DatosTableroTv } from "./TableroTv";

const TANDA_MS = SEGUNDOS_POR_TANDA * 1000;

/** `cuantos` listos, del más nuevo (`desde`) al más viejo, como los manda el servidor. */
function datosCon(cuantos: number, ahora = 0, desde = 65): DatosTableroTv {
  return {
    negocio: "Local de prueba",
    ahora,
    preparando: [{ numero: desde + 1, desde: ahora }],
    listos: Array.from({ length: cuantos }, (_, i) => ({ numero: desde - i, llamadoEn: ahora - i * 60_000 })),
  };
}

function fichas(ajustes: AjustesTicketsTv, datos: DatosTableroTv): string[] {
  render(<TableroTv ajustes={ajustes} datos={datos} llamando={null} />);
  return within(screen.getByTestId("fichas-listos"))
    .getAllByText(/^\d+$/)
    .map((e) => e.textContent ?? "");
}

describe("la TV de tickets con muchos listos", () => {
  it("las fichas van en una sola fila, las que entran al lado de En preparación", () => {
    // QA 10-nov: con 30 listos iban 6 fichas, la sexta bajaba a otra fila y
    // el amarillo del número grande se achicaba hasta dejar "TICKET" y "Su
    // pedido está listo" la mitad afuera.
    expect(fichas(AJUSTES_TV_DE_FABRICA, datosCon(30))).toEqual(["064", "063", "062", "061", "060"]);
  });

  it("sin la columna de preparación la fila es más larga y entran más", () => {
    const ajustes = { ...AJUSTES_TV_DE_FABRICA, mostrarPreparacion: false };
    expect(fichas(ajustes, datosCon(30))).toHaveLength(8);
  });

  it("con números de cuatro cifras entran menos, para que no se aprieten", () => {
    expect(fichas(AJUSTES_TV_DE_FABRICA, datosCon(30, 0, 1065))).toHaveLength(4);
  });

  it("los que no entran pasan después, y el grande sigue siendo el último llamado", () => {
    const datos = datosCon(30, TANDA_MS);
    expect(fichas(AJUSTES_TV_DE_FABRICA, datos)).toEqual(["059", "058", "057", "056", "055"]);
    expect(screen.getByText("065")).toBeInTheDocument();
  });

  it("con varias tandas hay un puntito por tanda", () => {
    render(<TableroTv ajustes={AJUSTES_TV_DE_FABRICA} datos={datosCon(30)} llamando={null} />);
    // 29 fichas de a 5: 6 tandas, y se ve la primera.
    expect(screen.getByLabelText("Tanda 1 de 6")).toBeInTheDocument();
  });

  it("con pocos listos no hay tandas ni puntitos", () => {
    expect(fichas(AJUSTES_TV_DE_FABRICA, datosCon(4))).toEqual(["064", "063", "062"]);
    expect(screen.queryByLabelText(/^Tanda/)).not.toBeInTheDocument();
  });
});
