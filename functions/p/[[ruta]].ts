// B06: la página del negocio (y la de una promo) con su vista previa para
// WhatsApp y Facebook. La lógica está en src/vista-previa/og.ts.
import { manejarVistaPrevia, type ContextoPages } from "../../src/vista-previa/og";

export const onRequestGet = (ctx: ContextoPages) => manejarVistaPrevia(ctx);
