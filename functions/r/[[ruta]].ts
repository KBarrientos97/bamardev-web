// B06: la reserva online con su vista previa para WhatsApp y Facebook. La
// lógica está en src/vista-previa/og.ts.
import { manejarVistaPrevia, type ContextoPages } from "../../src/vista-previa/og";

export const onRequestGet = (ctx: ContextoPages) => manejarVistaPrevia(ctx);
