import { beforeEach, describe, expect, it } from "vitest";
import {
  guardarDatosCliente,
  guardarPedidoEnCurso,
  leerDatosCliente,
  leerPedidoEnCurso,
  nuevoRequestId,
  olvidarPedidoEnCurso,
  telefonoDe8,
} from "./cliente";

describe("el WhatsApp del cliente", () => {
  it.each([
    ["71234567", "71234567"],
    ["712 34567", "71234567"],
    ["+591 71234567", "71234567"],
    ["591-61234567", "61234567"],
  ])("«%s» vale", (texto, esperado) => {
    expect(telefonoDe8(texto)).toBe(esperado);
  });

  it.each(["", "3123456", "31234567", "812345678", "7123456", "712345678"])("«%s» no vale", (texto) => {
    expect(telefonoDe8(texto)).toBeNull();
  });
});

describe("lo que el navegador recuerda", () => {
  beforeEach(() => localStorage.clear());

  it("los datos del cliente, con la misma clave del carrito de WhatsApp", () => {
    // Quien ya había pedido por WhatsApp conserva su nombre y su dirección.
    localStorage.setItem("pedido-datos:elganadero", JSON.stringify({ nombre: "Lucía", entrega: "RETIRO", direccion: "Calle 5" }));
    expect(leerDatosCliente("elganadero")).toMatchObject({ nombre: "Lucía", direccion: "Calle 5", tipo: "RECOGER", telefono: "" });
    guardarDatosCliente("elganadero", { nombre: "Lucía", telefono: "71234567", direccion: "Calle 5", referencia: "Portón", tipo: "DELIVERY" });
    expect(leerDatosCliente("elganadero")).toEqual({ nombre: "Lucía", telefono: "71234567", direccion: "Calle 5", referencia: "Portón", tipo: "DELIVERY" });
  });

  it("un valor roto no revienta: arranca vacío", () => {
    localStorage.setItem("pedido-datos:x", "{no es json");
    expect(leerDatosCliente("x")).toMatchObject({ nombre: "", telefono: "", tipo: "DELIVERY" });
  });

  it("el pedido en curso se guarda, se lee y se olvida", () => {
    expect(leerPedidoEnCurso("elganadero")).toBeNull();
    guardarPedidoEnCurso("elganadero", { token: "abc", numero: 7 });
    expect(leerPedidoEnCurso("elganadero")).toEqual({ token: "abc", numero: 7 });
    expect(leerPedidoEnCurso("otro")).toBeNull();
    olvidarPedidoEnCurso("elganadero");
    expect(leerPedidoEnCurso("elganadero")).toBeNull();
  });

  it("cada intento tiene su identificador", () => {
    expect(nuevoRequestId()).not.toBe(nuevoRequestId());
  });
});
