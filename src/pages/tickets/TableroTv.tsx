import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { minutosDesde, numeroTicket, paletaTv } from "../../lib/tickets/llamado";
import type { AjustesTicketsTv } from "../../types/tickets";

/**
 * La TV de tickets: los números listos para entregar y los que se preparan.
 *
 * Se dibuja UNA vez, sobre un lienzo fijo de 1600 × 900, y se escala entero a
 * lo que haya: el televisor, la tablet o la vista previa de Tickets y pedidos.
 * Así lo que el encargado ve en la vista previa es exactamente lo que ve el
 * local, y la cantidad de números que entran en la columna es siempre la
 * misma (la maqueta, dibujada con medidas de pantalla, dejaba el 0080 encima
 * del pie en una TV más baja).
 *
 * Sólo números: ni mesa ni llevar (un pedido mixto confundía), ni nombres, ni
 * montos. No importa nada de la app: la usa también la TV pública, que vive
 * fuera de la sesión (ver App.tsx).
 */

export const ANCHO_TV = 1600;
export const ALTO_TV = 900;

/** Cuántos números entran en la columna "En preparación" (medido en el lienzo). */
const FILAS_PREPARACION = 5;
/** Cuántos listos, además del grande, entran como fichas debajo. */
const FICHAS_LISTOS = 6;

export interface DatosTableroTv {
  negocio: string;
  /** La hora del servidor, para el reloj y los minutos de espera. */
  ahora: number;
  preparando: { numero: number; desde: number }[];
  /** Del llamado más nuevo al más viejo. */
  listos: { numero: number; llamadoEn: number | null }[];
}

export function TableroTv({
  ajustes,
  datos,
  llamando,
  logoUrl,
}: {
  ajustes: AjustesTicketsTv;
  datos: DatosTableroTv;
  /** El número que se está llamando ahora: el grande late y el título cambia. */
  llamando: number | null;
  logoUrl?: string | null;
}) {
  const p = paletaTv(ajustes);
  const t = ajustes.textos;
  const destacado = llamando ?? datos.listos[0]?.numero ?? null;
  const fichas = datos.listos.filter((l) => l.numero !== destacado).slice(0, FICHAS_LISTOS);
  const muchos = datos.preparando.length > FILAS_PREPARACION;
  const enColumna = datos.preparando.slice(0, muchos ? FILAS_PREPARACION - 1 : FILAS_PREPARACION);
  const sobrePanel = p.fila;

  return (
    <div
      className="flex flex-col"
      style={{
        width: ANCHO_TV,
        height: ALTO_TV,
        padding: "40px 56px",
        background: p.fondo,
        color: p.texto,
        fontFamily: "inherit",
      }}
    >
      <style>{ANIMACIONES}</style>
      <header className="flex shrink-0 items-center justify-between" style={{ height: 80 }}>
        {ajustes.logo && logoUrl ? (
          <img src={logoUrl} alt={datos.negocio} style={{ height: 80, maxWidth: 360, objectFit: "contain" }} />
        ) : (
          <p className="truncate font-black" style={{ fontSize: 40, maxWidth: 900 }}>
            {datos.negocio}
          </p>
        )}
        {ajustes.reloj && (
          <p className="font-extrabold tabular-nums" style={{ fontSize: 48, opacity: 0.92 }}>
            {horaCorta(datos.ahora)}
          </p>
        )}
      </header>

      <main className="flex min-h-0 flex-1" style={{ gap: 32, marginTop: 24 }}>
        <section
          className="flex min-w-0 flex-1 flex-col"
          style={{ background: p.panel, borderRadius: 40, padding: 32 }}
        >
          <TituloPanel
            texto={llamando != null && t.llamando ? t.llamando : t.listos}
            cuantos={datos.listos.length}
            acento={p.acento}
          />
          {destacado != null ? (
            <>
              <div
                className="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
                style={{
                  background: p.acento,
                  color: p.sobreAcento,
                  borderRadius: 32,
                  marginTop: 20,
                  animation: llamando != null ? "tv-borde 1.1s ease-in-out infinite" : undefined,
                }}
              >
                {t.etiqueta && (
                  <p
                    className="flex items-center font-extrabold uppercase"
                    style={{ fontSize: 34, letterSpacing: "0.3em", gap: 14 }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        animation: llamando != null ? "tv-campana 1s ease-in-out infinite" : undefined,
                      }}
                    >
                      <Icon name="bell" size={38} strokeWidth={2.6} />
                    </span>
                    {t.etiqueta}
                  </p>
                )}
                <p
                  className="font-black tabular-nums"
                  style={{
                    fontSize: fichas.length ? 230 : 270,
                    lineHeight: 1,
                    marginTop: 6,
                    animation: llamando != null ? "tv-latido 1.1s ease-in-out infinite" : undefined,
                  }}
                >
                  {numeroTicket(destacado)}
                </p>
                {t.frase && (
                  <p className="font-semibold" style={{ fontSize: 36, marginTop: 12 }}>
                    {t.frase}
                  </p>
                )}
              </div>
              {fichas.length > 0 && (
                <div className="flex shrink-0 flex-wrap" style={{ gap: 16, marginTop: 20 }}>
                  {fichas.map((f) => (
                    <span
                      // Con la hora del llamado: después de reiniciar la
                      // numeración puede haber dos 0001 listos a la vez.
                      key={`${f.numero}-${f.llamadoEn}`}
                      className="font-black tabular-nums"
                      style={{
                        background: p.acento,
                        color: p.sobreAcento,
                        borderRadius: 20,
                        padding: "4px 26px",
                        fontSize: 58,
                        lineHeight: 1.2,
                      }}
                    >
                      {numeroTicket(f.numero)}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div
              className="flex flex-1 flex-col items-center justify-center text-center"
              style={{ marginTop: 20, borderRadius: 32, background: sobrePanel, opacity: 0.85 }}
            >
              <Icon name="ticket" size={84} strokeWidth={1.6} />
              <p className="font-semibold" style={{ fontSize: 40, marginTop: 18 }}>
                Aún no hay pedidos listos
              </p>
            </div>
          )}
        </section>

        {ajustes.mostrarPreparacion && (
          <section
            className="flex shrink-0 flex-col"
            style={{ width: 520, background: p.panelPreparacion, borderRadius: 40, padding: 28 }}
          >
            <TituloPanel texto={t.preparacion} cuantos={datos.preparando.length} acento={p.acento} />
            <div className="flex min-h-0 flex-1 flex-col" style={{ gap: 12, marginTop: 18 }}>
              {enColumna.map((x) => (
                <div
                  key={`${x.numero}-${x.desde}`}
                  className="flex shrink-0 items-center justify-between"
                  style={{ height: 86, borderRadius: 20, padding: "0 26px", background: sobrePanel }}
                >
                  <span className="font-black tabular-nums" style={{ fontSize: 62, color: p.acento }}>
                    {numeroTicket(x.numero)}
                  </span>
                  {ajustes.mostrarMinutos && (
                    <span className="font-semibold tabular-nums" style={{ fontSize: 26, opacity: 0.85 }}>
                      {minutosDesde(x.desde, datos.ahora)} min
                    </span>
                  )}
                </div>
              ))}
              {muchos && (
                <div
                  className="flex shrink-0 items-center justify-center font-bold"
                  style={{ height: 86, borderRadius: 20, background: sobrePanel, fontSize: 32 }}
                >
                  y {datos.preparando.length - enColumna.length} más
                </div>
              )}
              {datos.preparando.length === 0 && (
                <p className="text-center font-semibold" style={{ fontSize: 28, opacity: 0.7, marginTop: 24 }}>
                  Nada en preparación
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      {(t.pieIzquierda || t.pieDerecha) && (
        <footer
          className="flex shrink-0 items-center justify-between font-semibold"
          style={{
            height: 64,
            marginTop: 20,
            borderTop: `2px solid ${conAlfa(p.texto, 0.22)}`,
            fontSize: 26,
            gap: 32,
          }}
        >
          <span className="truncate">{t.pieIzquierda}</span>
          <span className="truncate text-right">{t.pieDerecha}</span>
        </footer>
      )}
    </div>
  );
}

function TituloPanel({ texto, cuantos, acento }: { texto: string; cuantos: number; acento: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between" style={{ height: 44 }}>
      <p className="truncate font-extrabold uppercase" style={{ fontSize: 30, letterSpacing: "0.14em", color: acento }}>
        {texto}
      </p>
      <span
        className="font-black tabular-nums"
        style={{ fontSize: 28, minWidth: 56, textAlign: "center", borderRadius: 999, padding: "2px 16px", background: "rgba(0,0,0,0.18)", color: acento }}
      >
        {cuantos}
      </span>
    </div>
  );
}

/**
 * El lienzo escalado: en `pantalla` llena la ventana (centrado, con el fondo
 * del tema en los bordes que sobran si la TV no es 16:9); en `previa` ocupa el
 * ancho de su lugar y alto proporcional.
 */
export function LienzoTv({
  modo,
  fondo,
  children,
}: {
  modo: "pantalla" | "previa";
  fondo: string;
  children: ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(modo === "pantalla" ? 1 : 0.4);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      const e = modo === "pantalla" ? Math.min(r.width / ANCHO_TV, r.height / ALTO_TV) : r.width / ANCHO_TV;
      if (e > 0) setEscala(e);
    };
    medir();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [modo]);

  if (modo === "pantalla") {
    return (
      <div ref={caja} className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: fondo }}>
        <div style={{ width: ANCHO_TV * escala, height: ALTO_TV * escala }}>
          <div style={{ transform: `scale(${escala})`, transformOrigin: "top left" }}>{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div ref={caja} className="w-full overflow-hidden rounded-2xl" style={{ height: ALTO_TV * escala, background: fondo }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: ANCHO_TV, height: ALTO_TV }}>
        {children}
      </div>
    </div>
  );
}

function horaCorta(ms: number): string {
  // En la hora del negocio (la misma `ZONA_NEGOCIO` de la agenda), no la del
  // aparato: un TV box que viene en UTC mostraba cuatro horas de más.
  return new Date(ms).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: "America/La_Paz" });
}

/** "#FFFFFF" + 0.2 → "rgba(255,255,255,0.2)". Lo que no es un hex de 6 queda gris. */
function conAlfa(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(128,128,128,${alfa})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}


const ANIMACIONES = `
@keyframes tv-campana { 0%,100% { transform: rotate(0) } 15% { transform: rotate(16deg) } 30% { transform: rotate(-13deg) } 45% { transform: rotate(9deg) } 60% { transform: rotate(-6deg) } 75% { transform: rotate(3deg) } }
@keyframes tv-latido { 0%,100% { transform: scale(1) } 50% { transform: scale(1.05) } }
@keyframes tv-borde { 0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0) } 50% { box-shadow: 0 0 0 16px rgba(255,255,255,0.55) } }
`;
