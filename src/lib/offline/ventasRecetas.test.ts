import { describe, expect, it } from "vitest";
import type { FormaPago, Producto, VentaInput } from "../../types";
import { cuerpoEncolado, reciboLocal } from "./ventas";

/**
 * El ticket de una venta que espera subir, con un plato con receta
 * (CONTRATO-recetas-plato §4.2): debajo del plato dice cómo se armó, con la
 * misma regla que el servidor, y el armado viaja en la cola tal cual.
 */

const cuarto = {
  id: 12,
  nombre: "Broaster cuarto",
  precio: 28,
  tipoProducto: "SERVICIO",
  stockTotal: 0,
  conReceta: true,
  receta: {
    presas: 2,
    partes: "POLLO_8",
    guarnicion: [
      { insumoId: 7, nombre: "Arroz", puro: true },
      { insumoId: 8, nombre: "Papa", puro: true },
      { insumoId: 9, nombre: "Fideo", puro: true },
    ],
    alcanza: null,
  },
} as unknown as Producto;
const gaseosa = { id: 2, nombre: "Gaseosa", precio: 10, tipoProducto: "ALMACENABLE", stockTotal: 5 } as unknown as Producto;
const formasPago: FormaPago[] = [{ id: 1, nombre: "Efectivo" }];

function venta(detalles: VentaInput["detalles"]): VentaInput & { clienteRequestId: string } {
  return { clienteRequestId: "req-1", detalles, pagos: [{ formaPagoId: 1, monto: 66, recibido: 66 }], tipoPedido: "LOCAL" };
}

describe("el ticket local con un plato con receta", () => {
  it("dice cómo se armó cada plato y el armado sigue en la cola para el servidor", () => {
    const armado = { piezas: { pierna: 1, contra: 1 }, sin: [9] };
    const c = cuerpoEncolado(
      venta([
        { productoId: 12, cantidad: 1, precio: 28, consumo: "MESA", armado },
        { productoId: 12, cantidad: 1, precio: 28, consumo: "MESA", armado: { puro: 8 } },
        { productoId: 2, cantidad: 1, precio: 10, consumo: "MESA" },
      ]),
    );
    expect(c.detalles[0].armado).toEqual(armado);
    const r = reciboLocal(c, { productos: [cuarto, gaseosa], formasPago });
    expect(r.detalles?.map((d) => d.armadoTexto ?? null)).toEqual(["Pierna y contra · Sin fideo", "Pura papa", null]);
    expect(r.total).toBe(66);
  });

  it("sin armado (o el plato ya no está en el catálogo) la línea es la de siempre", () => {
    const r = reciboLocal(
      cuerpoEncolado(
        venta([
          { productoId: 12, cantidad: 1, precio: 28, consumo: "MESA" },
          { productoId: 99, cantidad: 1, precio: 28, consumo: "MESA", armado: { sin: [9] } },
        ]),
      ),
      { productos: [cuarto], formasPago },
    );
    expect(r.detalles?.every((d) => !("armadoTexto" in d))).toBe(true);
  });
});
