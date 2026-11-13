import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QrCobroInfo } from "../lib/api";

/**
 * La pantalla «QR de cobro» con el QR por sucursal (decisión del dueño,
 * 13-nov-2026): el check «Usar el mismo QR en todas las sucursales», el
 * selector de sede y lo que ve quien es de un local. Con un solo local, o sin
 * lo nuevo del backend, la pantalla es la de siempre.
 */

const est = vi.hoisted(() => ({
  modo: "una" as "una" | "asignado" | "organizacion",
  respuesta: (_sede?: number): unknown => ({}),
  cambiarModo: vi.fn(async (_b: boolean) => ({ mismoEnTodas: true })),
  propsCargar: [] as Array<Record<string, unknown>>,
}));

vi.mock("../lib/api", async (original) => {
  const real = await original<typeof import("../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      qrCobro: vi.fn(async (sede?: number) => est.respuesta(sede)),
      cambiarModoQrCobro: (b: boolean) => est.cambiarModo(b),
    },
  };
});

vi.mock("../store/AuthContext", async () => {
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      rubro: "RESTAURANTE",
      vocabulario: null,
      negocio: { alias: "prueba", features: [] },
      usuario: { rol: "ADMIN", ...permisosDe("ADMIN") },
    }),
  };
});

vi.mock("../lib/useSucursales", () => ({
  useSucursales: () => ({
    modo: est.modo,
    sucursales: [
      { id: 1, nombre: "Centro" },
      { id: 2, nombre: "Norte" },
    ],
  }),
}));

vi.mock("../components/QrCobro", () => ({
  CargarQrCobro: (p: Record<string, unknown>) => {
    est.propsCargar.push(p);
    return <div data-testid="cargar-qr" />;
  },
}));

import QrDeCobro from "./QrDeCobro";

const info = (extra: Partial<QrCobroInfo> = {}): QrCobroInfo => ({
  imagen: "data:image/png;base64,AAA",
  actualizadoEn: "2026-11-13T12:00:00.000Z",
  actualizadoPor: "admin",
  ...extra,
});

async function montar() {
  render(<QrDeCobro />);
  await act(async () => {});
}
const ultimasProps = () => est.propsCargar[est.propsCargar.length - 1];

beforeEach(() => {
  est.modo = "una";
  est.respuesta = () => info();
  est.cambiarModo.mockClear();
  est.propsCargar.length = 0;
});

describe("QR de cobro: pantalla", () => {
  it("un solo local: nada nuevo, aunque el negocio hubiera elegido un QR por sucursal", async () => {
    est.respuesta = () => info({ mismoEnTodas: false, origen: "general", sucursalId: null });
    await montar();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/QR general \(de respaldo\)/)).toBeNull();
    expect(screen.getByText(/en todas las cajas/)).toBeInTheDocument();
    expect(ultimasProps().sucursalId ?? null).toBeNull();
    expect(ultimasProps().soloLectura).toBe(false);
  });

  it("un backend anterior (sin los campos nuevos) deja la pantalla como siempre", async () => {
    est.modo = "organizacion";
    est.respuesta = () => info();
    await montar();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByText(/QR general \(de respaldo\)/)).toBeNull();
  });

  it("organización con 2+ locales y el mismo QR: casilla marcada, sin selector", async () => {
    est.modo = "organizacion";
    est.respuesta = () => info({ mismoEnTodas: true, origen: "general", sucursalId: null });
    await montar();
    expect(screen.getByRole("checkbox", { name: /Usar el mismo QR en todas las sucursales/ })).toBeChecked();
    expect(screen.queryByText("Norte")).toBeNull();
  });

  it("desmarcar la casilla elige «uno por sucursal» y vuelve a pedir el QR", async () => {
    est.modo = "organizacion";
    est.respuesta = () => info({ mismoEnTodas: true });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(est.cambiarModo).toHaveBeenCalledWith(true);
  });

  it("marcarla de nuevo elige «el mismo en todas»", async () => {
    est.modo = "organizacion";
    est.respuesta = () => info({ mismoEnTodas: false, origen: "general", sucursalId: null });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox"));
    });
    expect(est.cambiarModo).toHaveBeenCalledWith(false);
  });

  it("un QR por sucursal: selector con el general y cada local; una sede sin QR propio lo avisa y no deja quitar", async () => {
    est.modo = "organizacion";
    est.respuesta = (sede) =>
      sede === 2
        ? info({ mismoEnTodas: false, origen: "general", sucursalId: 2 })
        : info({ mismoEnTodas: false, origen: "general", sucursalId: null });
    await montar();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("QR general (de respaldo)")).toBeInTheDocument();
    expect(screen.getByText("Centro")).toBeInTheDocument();
    expect(ultimasProps().sucursalId ?? null).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText("Norte"));
    });
    expect(screen.getByText(/Norte no tiene QR propio/)).toBeInTheDocument();
    expect(ultimasProps().sucursalId).toBe(2);
    expect(ultimasProps().puedeQuitar).toBe(false);
  });

  it("una sede con QR propio no muestra el aviso y deja quitarlo", async () => {
    est.modo = "organizacion";
    est.respuesta = (sede) =>
      sede === 1
        ? info({ mismoEnTodas: false, origen: "sucursal", sucursalId: 1 })
        : info({ mismoEnTodas: false, origen: "general", sucursalId: null });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByText("Centro"));
    });
    expect(screen.queryByText(/no tiene QR propio/)).toBeNull();
    expect(ultimasProps().sucursalId).toBe(1);
    expect(ultimasProps().puedeQuitar).toBe(true);
  });

  it("quien es de un local, con el mismo QR para todas: lo ve pero no lo toca", async () => {
    est.modo = "asignado";
    est.respuesta = () => info({ mismoEnTodas: true, origen: "general", sucursalId: null });
    await montar();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(ultimasProps().soloLectura).toBe(true);
    expect(screen.getByText(/lo cambia la administración del negocio/)).toBeInTheDocument();
  });

  it("quien es de un local, con un QR por sucursal: cambia el de su sede, sin casilla ni selector", async () => {
    est.modo = "asignado";
    est.respuesta = () => info({ mismoEnTodas: false, origen: "sucursal", sucursalId: 1 });
    await montar();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("QR general (de respaldo)")).toBeNull();
    expect(ultimasProps().soloLectura).toBe(false);
    expect(ultimasProps().sucursalId ?? null).toBeNull();
  });
});
