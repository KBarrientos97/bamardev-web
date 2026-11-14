import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { urlPedidoDe } from "../../lib/pagina/rutas";
import { apiPedidoPublico } from "../../lib/pedidosWeb/apiPublica";
import { leerPedidoEnCurso, olvidarPedidoEnCurso, type PedidoEnCurso } from "../../lib/pedidosWeb/cliente";
import { esFinal } from "../../lib/pedidosWeb/estado";
import { FAMILIA } from "./PedidoPagina";

/**
 * Las dos franjas de arriba de la página del local (pedidos web, 13-nov):
 *
 * - «Tenés un pedido en curso»: si el cliente vuelve a la página después de
 *   pedir, el navegador recuerda su token y le deja el enlace al seguimiento.
 *   Se va sola cuando el pedido terminó (entregado, rechazado, vencido…).
 * - «Ahora no estamos recibiendo pedidos»: se dice antes de que arme todo.
 */
export default function FranjasPedido({
  subdominio,
  fuerte,
  aviso,
}: {
  subdominio: string;
  /** El color del negocio oscurecido. */
  fuerte: string;
  /** Por qué hoy no se puede pedir (`avisoSinPedidos`), o null. */
  aviso: string | null;
}) {
  const [curso, setCurso] = useState<PedidoEnCurso | null>(() => leerPedidoEnCurso(subdominio));

  // Un pedido que ya terminó deja de ser «en curso». Si no se puede saber
  // (sin red), la franja queda: es mejor que perder el enlace.
  useEffect(() => {
    const p = leerPedidoEnCurso(subdominio);
    if (!p) return;
    let vivo = true;
    apiPedidoPublico
      .seguimiento(subdominio, p.token)
      .then((s) => {
        if (!vivo || !esFinal(s.estado)) return;
        olvidarPedidoEnCurso(subdominio);
        setCurso(null);
      })
      .catch((e: unknown) => {
        // Un 404: ese pedido no existe más.
        if (vivo && e instanceof Error && "status" in e && (e as { status: number }).status === 404) {
          olvidarPedidoEnCurso(subdominio);
          setCurso(null);
        }
      });
    return () => {
      vivo = false;
    };
  }, [subdominio]);

  if (!curso && !aviso) return null;
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 45, fontFamily: FAMILIA, display: "flex", flexDirection: "column" }}>
      {curso && (
        <Link
          to={urlPedidoDe(subdominio, curso.token)}
          style={{ background: fuerte, color: "#ffffff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, textDecoration: "none", minHeight: 48 }}
        >
          <span style={{ flex: 1 }}>Tenés un pedido en curso · N° {String(curso.numero).padStart(2, "0")}</span>
          <span style={{ textDecoration: "underline", whiteSpace: "nowrap" }}>Seguirlo</span>
        </Link>
      )}
      {aviso && (
        <div role="status" style={{ background: "#FFFBEB", color: "#92400E", padding: "10px 16px", fontSize: 14, fontWeight: 600, textAlign: "center" }}>
          {aviso}
        </div>
      )}
    </div>
  );
}
