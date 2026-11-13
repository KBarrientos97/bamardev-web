import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { ICONO_RED, paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { urlPaginaDe } from "../../lib/pagina/rutas";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { alDescansar, precargarMapa } from "../../lib/mapa";
import { ErrorPedido, apiPedidoPublico } from "../../lib/pedidosWeb/apiPublica";
import { olvidarPedidoEnCurso } from "../../lib/pedidosWeb/cliente";
import { teclasDeDialogo } from "../../lib/pedidosWeb/dialogo";
import { esFinal, fraseDe, pasoActual, pasosDe } from "../../lib/pedidosWeb/estado";
import type { Seguimiento } from "../../lib/pedidosWeb/tipos";
import { FAMILIA, Trazo } from "./PedidoPagina";

// MapLibre se baja recién cuando el pedido va en camino.
const pedazoMapa = () => import("./MapaSeguimiento");
const MapaSeguimiento = lazy(pedazoMapa);

/** Cada cuánto se vuelve a preguntar cómo va el pedido (la moto se mueve). */
export const REFRESCO_SEGUIMIENTO_MS = 10_000;

const ROJO = "#B91C1C";

/**
 * El seguimiento del pedido (pedidos web, 13-nov): `/p/<sub>/pedido/<token>`,
 * sin cuenta. Muestra en qué paso va (Recibido, Aceptado, En camino,
 * Entregado), y cuando va en camino, un mapa con la moto, la casa y el local
 * que se refresca cada 10 segundos. Con el color del negocio.
 *
 * Cada estado dice qué pasa y deja UNA acción principal abajo: escribirle al
 * local, o volver a la página cuando ya terminó. Si se corta la señal, queda
 * lo último que se supo, con un aviso: nunca un pedido en blanco.
 */
export default function SeguimientoPedido() {
  const { subdominio = "", token = "" } = useParams();
  const { pagina } = usePaginaPublica(subdominio);
  const [seg, setSeg] = useState<Seguimiento | null>(null);
  const [error, setError] = useState<{ mensaje: string; status: number } | null>(null);
  const [sinConexion, setSinConexion] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState("");
  const final = useRef(false);
  /**
   * El número de la última vuelta pedida: una respuesta lenta (hasta 20 s) que
   * llega después de otra más nueva, o después de cancelar, no pisa lo que ya
   * se ve (PW-09).
   */
  const vuelta = useRef(0);

  const hex = pagina?.color.hex ?? "#047857";
  const fuerte = paleta(hex).oscuro;
  const tinte = paleta(hex).tinte;
  const nombre = pagina?.nombre ?? subdominio;

  const cargar = useCallback(async () => {
    const n = ++vuelta.current;
    try {
      const s = await apiPedidoPublico.seguimiento(subdominio, token);
      if (n !== vuelta.current) return;
      setSeg(s);
      setError(null);
      setSinConexion(false);
      // Un pedido que terminó no vuelve a estar en curso: una vez final, final.
      if (esFinal(s.estado)) final.current = true;
      // Un pedido que terminó ya no es «en curso» en la página del local.
      if (final.current) olvidarPedidoEnCurso(subdominio);
    } catch (e) {
      if (n !== vuelta.current) return;
      const status = e instanceof ErrorPedido ? e.status : 0;
      // Sin respuesta (señal o servidor): queda lo último que se vio.
      if (status === 0 || status >= 500) setSinConexion(true);
      else setError({ mensaje: e instanceof Error ? e.message : "No pudimos abrir tu pedido.", status });
    }
  }, [subdominio, token]);

  useEffect(() => {
    void cargar();
    const id = window.setInterval(() => {
      // Pestaña en segundo plano: nadie mira, no vale el pedido. Y si ya terminó, tampoco.
      if (document.hidden || final.current) return;
      void cargar();
    }, REFRESCO_SEGUIMIENTO_MS);
    const alVolver = () => {
      if (!document.hidden && !final.current) void cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  // El pedido es de una persona: ni el buscador ni el chat de nadie lo indexa.
  useEffect(() => {
    const anterior = document.title;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.title = anterior;
      meta.remove();
    };
  }, []);
  useEffect(() => {
    if (seg) document.title = `Pedido N° ${String(seg.numero).padStart(2, "0")} · ${nombre}`;
  }, [seg, nombre]);

  // El mapa se adelanta cuando el pedido ya fue aceptado, para que al salir la moto esté listo.
  useEffect(() => {
    if (seg?.estado === "ACEPTADO" && seg.tipo === "DELIVERY") return alDescansar(() => precargarMapa(pedazoMapa));
  }, [seg?.estado, seg?.tipo]);

  async function cancelar() {
    setCancelando(true);
    setErrorCancelar("");
    try {
      const cancelado = await apiPedidoPublico.cancelar(subdominio, token);
      // Lo que estaba en vuelo es anterior a la cancelación: se descarta.
      vuelta.current++;
      setSeg(cancelado);
      final.current = true;
      olvidarPedidoEnCurso(subdominio);
      setConfirmando(false);
    } catch (e) {
      // 409: el local ya lo aceptó. Se muestra el motivo y se refresca el estado.
      setErrorCancelar(e instanceof Error ? e.message : "No pudimos cancelar tu pedido.");
      setConfirmando(false);
      void cargar();
    } finally {
      setCancelando(false);
    }
  }

  const fondo: CSSProperties = { minHeight: "100dvh", background: "#F6F7F9", fontFamily: FAMILIA, color: "#1F2937" };
  const volver = urlPaginaDe(subdominio);

  if (error && !seg) {
    return (
      <main style={{ ...fondo, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ maxWidth: 360, width: "100%", background: "#ffffff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 28, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{error.status === 404 ? "No encontramos este pedido" : "No pudimos abrir tu pedido"}</h1>
          <p style={{ fontSize: 14, color: "#4B5563", margin: "0 0 18px" }}>
            {error.status === 404 ? "Revisá que el enlace esté completo, tal como te lo mandamos." : error.mensaje}
          </p>
          <Link to={volver} style={{ color: fuerte, fontWeight: 700 }}>
            Ir a la página de {nombre}
          </Link>
        </div>
      </main>
    );
  }

  if (!seg) {
    return (
      <main style={{ ...fondo, padding: 16 }} aria-busy="true" aria-label="Cargando tu pedido">
        {sinConexion ? (
          <p role="alert" style={{ color: ROJO, fontSize: 14, fontWeight: 600 }}>
            Sin conexión. Seguimos intentando abrir tu pedido…
          </p>
        ) : (
          <div style={{ height: 120, borderRadius: 16, background: "#E5E7EB" }} />
        )}
      </main>
    );
  }

  const numero = String(seg.numero).padStart(2, "0");
  const pasos = pasosDe(seg.tipo);
  const actual = pasoActual(seg);
  const fin = esFinal(seg.estado);
  // Un pedido que no se tomó no cobra nada: ni «a pagar» ni «entrega en».
  const sinCobro = seg.estado === "RECHAZADO" || seg.estado === "VENCIDO" || seg.estado === "CANCELADO";
  const malo = seg.estado === "RECHAZADO" || seg.estado === "VENCIDO" || seg.estado === "CANCELADO";
  const whatsapp = seg.whatsappLocal;
  const puedeCancelar = seg.estado === "RECIBIDO";
  const enCamino = seg.estado === "EN_CAMINO";

  return (
    <main style={{ ...fondo, paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}>
      <header style={{ background: fuerte, color: "#ffffff", padding: "18px 16px 20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link to={volver} style={{ color: "#ffffff", opacity: 0.85, fontSize: 13, textDecoration: "none" }}>
            ← {nombre}
          </Link>
          <h1 style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 800 }}>Pedido N° {numero}</h1>
          {/* Cambia sola cuando el local acepta o el pedido sale: se anuncia (PW-24). */}
          <p role="status" aria-live="polite" style={{ margin: "4px 0 0", fontSize: 15, opacity: 0.95 }}>
            {fraseDe(seg)}
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {sinConexion && (
          <p role="status" style={{ margin: 0, fontSize: 13, color: "#92400E", background: "#FFFBEB", borderRadius: 12, padding: "10px 12px" }}>
            Sin conexión: te mostramos lo último que supimos. Seguimos intentando.
          </p>
        )}

        {malo ? (
          <section style={{ background: "#ffffff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: ROJO }}>
              {seg.estado === "RECHAZADO" ? "Pedido rechazado" : seg.estado === "VENCIDO" ? "El local no respondió" : "Pedido cancelado"}
            </h2>
            {seg.estado === "RECHAZADO" && seg.motivoRechazo && <p style={{ margin: "8px 0 0", fontSize: 15 }}>{seg.motivoRechazo}</p>}
            {seg.estado === "VENCIDO" && (
              <p style={{ margin: "8px 0 0", fontSize: 15 }}>Pasaron unos minutos y nadie del local pudo tomarlo. No se cobró nada.</p>
            )}
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "#4B5563" }}>
              {whatsapp ? "Podés escribirle al local por WhatsApp o volver a pedir." : "Podés volver a pedir desde la página."}
            </p>
          </section>
        ) : (
          <section aria-label="Cómo va tu pedido" style={{ background: "#ffffff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "16px 12px" }}>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", alignItems: "flex-start" }}>
              {pasos.map((p, i) => {
                const hecho = i <= actual;
                return (
                  <li key={p.estado} aria-current={i === actual ? "step" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative", textAlign: "center" }}>
                    {i > 0 && <span aria-hidden="true" style={{ position: "absolute", top: 13, right: "50%", width: "100%", height: 3, background: hecho ? fuerte : "#E5E7EB" }} />}
                    <span
                      aria-hidden="true"
                      style={{ position: "relative", zIndex: 1, width: 28, height: 28, borderRadius: 999, background: hecho ? fuerte : "#E5E7EB", color: "#ffffff", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: i === actual ? `0 0 0 5px ${tinte}` : "none" }}
                    >
                      {hecho && <Trazo d="M5 12l4.5 4.5L19 7" color="#ffffff" size={16} grosor={3} />}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: i === actual ? 800 : 500, color: hecho ? "#1F2937" : "#9CA3AF", lineHeight: 1.2 }}>{p.titulo}</span>
                  </li>
                );
              })}
            </ol>
            <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Estado: {pasos[actual].titulo}
            </span>
          </section>
        )}

        {enCamino && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              {seg.repartidor ? `${seg.repartidor.nombre} va con tu pedido` : "Tu pedido va en camino"}
            </p>
            <Suspense fallback={<div style={{ height: 300, borderRadius: 16, background: "#EEF0F3" }} />}>
              <MapaSeguimiento
                destino={seg.destino}
                local={seg.sucursal.latitud != null && seg.sucursal.longitud != null ? { latitud: seg.sucursal.latitud, longitud: seg.sucursal.longitud } : null}
                moto={seg.posicion}
                color={fuerte}
              />
            </Suspense>
            {!seg.posicion && <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>Esperando la ubicación del repartidor…</p>}
          </section>
        )}

        <section aria-label="Tu pedido" style={{ background: "#ffffff", border: "1px solid #E5E7EB", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {seg.lineas.map((l, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 15 }}>
                <span>
                  <strong>{l.cantidad}×</strong> {l.titulo}
                </span>
                <span style={{ fontWeight: 600 }}>{formatoPrecio(l.subtotal)}</span>
              </li>
            ))}
          </ul>
          <dl style={{ margin: 0, borderTop: "1px solid #F1F2F4", paddingTop: 10, display: "flex", flexDirection: "column", gap: 3, fontSize: 14, color: "#4B5563" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <dt>Productos</dt>
              <dd style={{ margin: 0 }}>{formatoPrecio(seg.subtotal)}</dd>
            </div>
            {seg.tipo === "DELIVERY" && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <dt>Envío</dt>
                <dd style={{ margin: 0 }}>{formatoPrecio(seg.envio)}</dd>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, color: "#1F2937" }}>
              <dt>{sinCobro ? "Total del pedido" : "Total a pagar"}</dt>
              <dd style={{ margin: 0 }}>{formatoPrecio(seg.total)}</dd>
            </div>
          </dl>
          {!sinCobro && (
            <>
              <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
                {seg.estado === "ENTREGADO"
                  ? seg.formaPago === "QR"
                    ? "Pagaste con QR."
                    : "Pagaste en efectivo."
                  : seg.formaPago === "QR"
                    ? "Pagás con QR al recibir."
                    : "Pagás en efectivo al recibir."}
                {seg.estado !== "ENTREGADO" && seg.formaPago === "EFECTIVO" && seg.pagaCon != null && (
                  <>
                    {" "}
                    Con {formatoPrecio(seg.pagaCon)}
                    {seg.faltan != null && seg.faltan > 0 ? (
                      <>
                        : <strong>faltan {formatoPrecio(seg.faltan)}</strong>, llevá un poco más.
                      </>
                    ) : (
                      seg.cambio != null &&
                      seg.cambio > 0 && (
                        <>
                          : te llevan <strong>{formatoPrecio(seg.cambio)}</strong> de cambio.
                        </>
                      )
                    )}
                  </>
                )}
              </p>
              {seg.tipo === "DELIVERY" ? (
                <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
                  Entrega en <strong>{seg.direccion}</strong>
                  {seg.referencia ? ` (${seg.referencia})` : ""}.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>
                  Retirás en <strong>{seg.sucursal.nombre}</strong>.
                </p>
              )}
            </>
          )}
        </section>

        {errorCancelar && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: ROJO, fontWeight: 600 }}>
            {errorCancelar}
          </p>
        )}
      </div>

      {/* La barra fija de abajo, como el panel de meseros: una acción principal. */}
      {(whatsapp || fin || puedeCancelar) && (
      <footer
        style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, background: "rgba(255,255,255,.96)", borderTop: "1px solid #E5E7EB", padding: "10px 16px calc(10px + env(safe-area-inset-bottom, 0px))", backdropFilter: "blur(6px)" }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              style={{ borderRadius: 14, background: fuerte, color: "#ffffff", fontWeight: 800, fontSize: 16, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, textDecoration: "none" }}
            >
              <Trazo d={ICONO_RED.WHATSAPP} color="#ffffff" size={22} grosor={2} />
              Escribir al local
            </a>
          ) : (
            fin && (
              <Link to={volver} style={{ borderRadius: 14, background: fuerte, color: "#ffffff", fontWeight: 800, fontSize: 16, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                Volver a la página
              </Link>
            )
          )}
          {whatsapp && fin && (
            <Link to={volver} style={{ textAlign: "center", fontSize: 14, color: fuerte, fontWeight: 700, padding: "6px 0", textDecoration: "none" }}>
              Volver a la página
            </Link>
          )}
          {puedeCancelar && (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              style={{ border: "none", background: "transparent", color: ROJO, fontWeight: 700, fontSize: 14, padding: "8px 0", cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancelar pedido
            </button>
          )}
        </div>
      </footer>
      )}

      {confirmando && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar el pedido"
          onClick={(e) => e.target === e.currentTarget && setConfirmando(false)}
          onKeyDown={(e) => teclasDeDialogo(e, () => setConfirmando(false))}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(17,24,39,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <section style={{ background: "#ffffff", width: "min(520px, 100%)", borderRadius: "20px 20px 0 0", padding: "20px 18px calc(18px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>¿Cancelar tu pedido?</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#4B5563" }}>El local todavía no lo aceptó, así que no pasa nada. Después ya no vas a poder cancelarlo por acá.</p>
            <button
              type="button"
              disabled={cancelando}
              onClick={cancelar}
              style={{ border: "none", borderRadius: 14, background: ROJO, color: "#ffffff", fontWeight: 800, fontSize: 16, minHeight: 52, cursor: "pointer", fontFamily: "inherit", opacity: cancelando ? 0.6 : 1 }}
            >
              {cancelando ? "Cancelando…" : "Sí, cancelar el pedido"}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmando(false)}
              style={{ border: "1.5px solid #D1D5DB", borderRadius: 14, background: "#ffffff", color: "#374151", fontWeight: 700, fontSize: 16, minHeight: 48, cursor: "pointer", fontFamily: "inherit" }}
            >
              No, seguir esperando
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
