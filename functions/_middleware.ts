// La página del negocio y su reserva con direcciones cortas en
// link(-qa).bamardev.com. En cualquier otro host sigue de largo enseguida. La
// lógica está en src/vista-previa/link.ts.
import { manejarLink, type ContextoMiddleware } from "../src/vista-previa/link";

export const onRequest = (ctx: ContextoMiddleware) => manejarLink(ctx);
