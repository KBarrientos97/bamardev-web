import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECIBO_DE_FABRICA } from "../../types/menuDigital";

/**
 * Lo que la caja recibe del diseño del recibo (15-nov): desde que «Ticket y
 * recibo» es de base en el restaurante, todo restaurante lo pide, pero sin los
 * extras de las TVs lo usa sólo si el negocio lo configuró.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  features: [] as string[],
  id: 1,
}));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { id: sesion.id, features: sesion.features }, rubro: sesion.rubro }),
}));

const recibo = vi.hoisted(() => vi.fn());
vi.mock("../apiMenuDigital", () => ({ apiMenuDigital: { recibo } }));

import { olvidarReciboNegocio, useReciboNegocio } from "./useReciboNegocio";

const DISENO = { ...RECIBO_DE_FABRICA, ancho: 58 as const };
const respuesta = (configurado?: boolean) => ({ recibo: DISENO, logo: null, ...(configurado === undefined ? {} : { configurado }) });

beforeEach(() => {
  olvidarReciboNegocio();
  recibo.mockReset();
  sesion.rubro = "RESTAURANTE";
  sesion.features = ["pos", "caja"];
  // Un negocio distinto por prueba: lo guardado en memoria es por negocio.
  sesion.id += 1;
});

describe("useReciboNegocio", () => {
  it("un restaurante sin TVs que nunca lo configuró: lo pide y sale el recibo de siempre", async () => {
    recibo.mockResolvedValue(respuesta(false));
    const { result } = renderHook(() => useReciboNegocio());
    await waitFor(() => expect(recibo).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it("un backend que todavía no manda `configurado`: también el de siempre", async () => {
    recibo.mockResolvedValue(respuesta(undefined));
    const { result } = renderHook(() => useReciboNegocio());
    await waitFor(() => expect(recibo).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it("un restaurante sin TVs que lo configuró: sale con su diseño", async () => {
    recibo.mockResolvedValue(respuesta(true));
    const { result } = renderHook(() => useReciboNegocio());
    await waitFor(() => expect(result.current?.recibo.ancho).toBe(58));
  });

  it("con los extras, como siempre: el diseño aunque no diga configurado", async () => {
    sesion.features = ["pos", "caja", "tickets_pedido"];
    recibo.mockResolvedValue(respuesta(false));
    const { result } = renderHook(() => useReciboNegocio());
    await waitFor(() => expect(result.current?.recibo.ancho).toBe(58));
  });

  it("guardado desde «Ticket y recibo» en este equipo, la caja lo toma sin esperar", () => {
    olvidarReciboNegocio({ recibo: DISENO, logo: null, configurado: true }, sesion.id);
    const { result } = renderHook(() => useReciboNegocio());
    expect(result.current?.recibo.ancho).toBe(58);
    expect(recibo).not.toHaveBeenCalled();
  });

  it.each(["FARMACIA", "MINIMARKET", "PELUQUERIA", "BILLAR", "ACADEMIA"])(
    "%s sin los extras no le pide nada al servidor, como siempre",
    async (rubro) => {
      sesion.rubro = rubro;
      recibo.mockResolvedValue(respuesta(true));
      const { result } = renderHook(() => useReciboNegocio());
      await act(async () => {});
      expect(recibo).not.toHaveBeenCalled();
      expect(result.current).toBeNull();
    },
  );
});
