import { request } from "../api";
import type {
  Bandeja,
  ContadorPedidos,
  CuerpoAceptar,
  CuerpoRechazar,
  PedidoWeb,
  TarifaEnvio,
} from "./tipos";

/** La API con sesión de los pedidos web (CONTRATO-PEDIDOS-WEB §5), por el `request` de siempre. */
export const apiPedidosWeb = {
  bandeja: (almacenId?: number | null) =>
    request<Bandeja>(`/pedidos-web/bandeja${almacenId != null ? `?almacenId=${almacenId}` : ""}`),
  /** Liviano: la web lo pide cada 10 s. */
  contador: () => request<ContadorPedidos>("/pedidos-web/contador"),
  detalle: (id: number) => request<PedidoWeb>(`/pedidos-web/${id}`),
  aceptar: (id: number, cuerpo: CuerpoAceptar) =>
    request<PedidoWeb>(`/pedidos-web/${id}/aceptar`, { method: "POST", body: JSON.stringify(cuerpo) }),
  rechazar: (id: number, cuerpo: CuerpoRechazar) =>
    request<PedidoWeb>(`/pedidos-web/${id}/rechazar`, { method: "POST", body: JSON.stringify(cuerpo) }),
  tarifa: () => request<TarifaEnvio>("/pedidos-web/tarifa"),
  guardarTarifa: (tarifa: TarifaEnvio) =>
    request<TarifaEnvio>("/pedidos-web/tarifa", { method: "PUT", body: JSON.stringify(tarifa) }),
  /** El repartidor toca «Ya salí del local»: repetirlo no cambia la hora. */
  sali: (ventaId: number) => request<unknown>(`/pedidos-web/por-venta/${ventaId}/sali`, { method: "POST" }),
  /** La posición del repartidor; el backend tolera 1 cada 5 s por venta. */
  posicion: (ventaId: number, latitud: number, longitud: number, precisionM?: number) =>
    request<unknown>(`/pedidos-web/por-venta/${ventaId}/posicion`, {
      method: "POST",
      body: JSON.stringify({ latitud, longitud, ...(precisionM != null ? { precisionM: Math.round(precisionM) } : {}) }),
    }),
};
