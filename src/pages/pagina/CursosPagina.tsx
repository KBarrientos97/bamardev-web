import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../components/Icon";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import type { TonosPagina } from "../../lib/pagina/estilosPagina";
import { fechaCorta, horarioGrupo } from "../../lib/academia/formato";
import type { CursoPublico } from "../../lib/academia/tipos";

/**
 * P1 · La sección Cursos de la página de un instituto (PLAN-ACADEMIAS-TECNICO
 * §9, ronda 2): una tarjeta por curso publicado, con su foto, sus módulos, el
 * precio de las dos formas ("Bs 500 por módulo · o Bs 1.350 todo junto") con
 * lo que se ahorra, y el próximo inicio con los lugares que quedan. El botón
 * lleva a inscribirse (P2), donde se elige el horario. Un grupo lleno ya no
 * recibe preinscripciones (M5): si todos lo están, en lugar del botón dice que
 * se comuniquen con la academia. Al pie, «Pagar mi inscripción»: entrar con el
 * carnet para pagar (M5).
 *
 * Va con los tonos del estilo de la página (estilos en línea, como el resto
 * de la vista): no es la app, es la vitrina del negocio.
 */
/**
 * Un velo del color del texto de la tarjeta: el recuadro del precio y las
 * líneas de los horarios salen del mismo tono en una tarjeta clara o en una
 * oscura (Noche, Mosaico), sin depender de los tonos de la página.
 */
function velo(color: string, alfa: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return `color-mix(in srgb, ${color} ${Math.round(alfa * 100)}%, transparent)`;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alfa})`;
}

export default function CursosPagina({
  cursos,
  t,
  colorBoton,
  radio,
  titulo,
  urlInscribirme,
  urlMiCuenta,
  escritorio,
  compacta = false,
}: {
  cursos: CursoPublico[];
  t: TonosPagina;
  /** El fondo del botón: el tono oscuro de la marca, con contraste para el blanco. */
  colorBoton: string;
  radio: CSSProperties["borderRadius"];
  /** El título de la sección, con la letra del estilo. */
  titulo: ReactNode;
  /** Sin esto (la vista previa del editor) el botón se dibuja pero no lleva a ningún lado. */
  urlInscribirme?: (grupoId: number) => string;
  /** «Pagar mi inscripción» (M5). Sin esto (la vista previa) no se dibuja. */
  urlMiCuenta?: string;
  escritorio: boolean;
  /**
   * Hay lugar a lo ancho (computadora y un estilo de una columna ancha): con
   * un solo curso, «Pagar mi inscripción» va a su lado y no debajo, con media
   * fila vacía al costado del curso (04-nov).
   */
  compacta?: boolean;
}) {
  const visibles = cursos.filter((c) => c.grupos.length > 0 || c.desde != null);
  if (!visibles.length) return null;
  if (compacta && escritorio && visibles.length === 1 && urlMiCuenta) {
    return (
      <section aria-label="Cursos" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {titulo}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, alignItems: "stretch" }}>
          <TarjetaCurso c={visibles[0]} t={t} colorBoton={colorBoton} radio={radio} urlInscribirme={urlInscribirme} />
          <SeccionPagar url={urlMiCuenta} t={t} colorBoton={colorBoton} radio={radio} escritorio={escritorio} enColumna />
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Cursos" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {titulo}
      <div
        style={
          escritorio
            ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }
            : { display: "flex", flexDirection: "column", gap: 14 }
        }
      >
        {visibles.map((c) => (
          <TarjetaCurso key={c.id} c={c} t={t} colorBoton={colorBoton} radio={radio} urlInscribirme={urlInscribirme} />
        ))}
      </div>
      {urlMiCuenta && <SeccionPagar url={urlMiCuenta} t={t} colorBoton={colorBoton} radio={radio} escritorio={escritorio} />}
    </section>
  );
}

/**
 * «Pagar mi inscripción» como sección propia y no un enlace al pie: es la
 * puerta de los que ya se preinscribieron, y un renglón subrayado no se veía.
 * En la compu, el texto a la izquierda y el botón a la derecha; en el celular,
 * uno debajo del otro. Los tres pasos dicen qué va a pasar antes de entrar.
 */
function SeccionPagar({
  url,
  t,
  colorBoton,
  radio,
  escritorio,
  enColumna = false,
}: {
  url: string;
  t: TonosPagina;
  colorBoton: string;
  radio: CSSProperties["borderRadius"];
  escritorio: boolean;
  /** Al lado del curso (04-nov): media fila, así que los pasos y el botón van uno debajo del otro. */
  enColumna?: boolean;
}) {
  // En la columna, el armado del celular pero con el aire de la compu.
  const fila = escritorio && !enColumna;
  const pasos = ["Entrá con tu carnet", "Elegí qué pagar", "Pagá con QR y subí el comprobante"];
  return (
    <div
      aria-labelledby="t-pagar-inscripcion"
      role="region"
      // La misma tarjeta que las de curso (fondo, borde, sombra y radio del
      // estilo), sin franja de color: el dueño la quería igual a las demás.
      style={{
        marginTop: enColumna ? 0 : 8,
        display: enColumna ? "flex" : undefined,
        flexDirection: enColumna ? "column" : undefined,
        justifyContent: enColumna ? "center" : undefined,
        background: t.tarjeta,
        border: t.borde ? `1px solid ${t.borde}` : undefined,
        boxShadow: t.sombra ?? undefined,
        borderRadius: radio,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: escritorio ? "22px 26px" : 18,
          display: "flex",
          flexDirection: fila ? "row" : "column",
          alignItems: fila ? "center" : "stretch",
          gap: fila ? 28 : 16,
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 44,
              height: 44,
              borderRadius: 12,
              background: colorBoton,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="qr" size={22} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: t.texto3Tarjeta }}>¿YA TE PREINSCRIBISTE?</p>
            <h3 id="t-pagar-inscripcion" style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 700, color: t.textoTarjeta }}>
              Pagá tu inscripción o tus cuotas desde acá
            </h3>
            <ol
              style={{
                margin: "10px 0 0",
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: fila ? "row" : "column",
                flexWrap: "wrap",
                gap: fila ? "6px 18px" : 6,
              }}
            >
              {pasos.map((p, i) => (
                <li key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: t.texto2Tarjeta }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: velo(t.textoTarjeta, 0.08),
                      color: t.textoTarjeta,
                      fontSize: 12,
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  {p}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <a
          href={url}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: colorBoton,
            color: "#ffffff",
            fontWeight: 600,
            fontSize: 15,
            padding: fila ? "13px 24px" : "13px 0",
            borderRadius: 12,
            textDecoration: "none",
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)",
          }}
        >
          Pagar mi inscripción
          <Icon name="arrowRight" size={16} />
        </a>
      </div>
    </div>
  );
}

function TarjetaCurso({
  c,
  t,
  colorBoton,
  radio,
  urlInscribirme,
}: {
  c: CursoPublico;
  t: TonosPagina;
  colorBoton: string;
  radio: CSSProperties["borderRadius"];
  urlInscribirme?: (grupoId: number) => string;
}) {
  const foto = urlDeImagen(c.fotoUrl);
  // M5: un grupo lleno ya no recibe preinscripciones; se manda al primero con lugar.
  const primero = c.grupos.find((g) => g.cuposLibres !== 0);
  const todosLlenos = c.grupos.length > 0 && !primero;
  const modulos = c.modulos?.length ? c.modulos : c.materias;
  const n = modulos.length;
  const bs = (x: number) => `Bs ${x.toLocaleString("es-BO")}`;
  const estiloBoton: CSSProperties = {
    display: "block",
    textAlign: "center",
    background: colorBoton,
    color: "#ffffff",
    fontWeight: 600,
    fontSize: 15,
    padding: "12px 0",
    borderRadius: 12,
    textDecoration: "none",
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)",
  };
  return (
    <article
      style={{
        background: t.tarjeta,
        border: t.borde ? `1px solid ${t.borde}` : undefined,
        boxShadow: t.sombra ?? undefined,
        borderRadius: radio,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {foto && <img src={foto} alt="" loading="lazy" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover" }} />}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.textoTarjeta }}>{c.nombre}</h3>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: t.texto3Tarjeta }}>
            {c.precioModulo != null && n
              ? `${n} ${n === 1 ? "módulo" : "módulos"}${modulos.length ? ` · ${modulos.join(" · ")}` : ""}`
              : `${c.horasTotales} h${modulos.length ? ` · ${modulos.join(" · ")}` : ""}`}
          </p>
        </div>
        {c.descripcion && <p style={{ margin: 0, fontSize: 14, color: t.texto2Tarjeta }}>{c.descripcion}</p>}
        {c.grupos.length > 0 && (
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: t.texto3Tarjeta }}>
              PRÓXIMOS INICIOS
            </p>
            {/* Cada horario en su renglón enmarcado, con los lugares en una pastilla: se lee de un vistazo. */}
            <ul style={{ margin: 0, padding: 0, listStyle: "none", border: `1px solid ${velo(t.textoTarjeta, 0.14)}`, borderRadius: 12, overflow: "hidden" }}>
              {c.grupos.map((g, i) => (
                <li
                  key={g.id}
                  style={{
                    fontSize: 14,
                    color: t.textoTarjeta,
                    padding: "9px 12px",
                    borderTop: i ? `1px solid ${velo(t.textoTarjeta, 0.14)}` : undefined,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "4px 8px",
                  }}
                >
                  <span>
                    <strong style={{ fontWeight: 600 }}>{fechaCorta(g.fechaInicio)}</strong> · {horarioGrupo(g)} · {g.sede.nombre}
                  </span>
                  {g.cuposLibres != null && g.cuposLibres <= 10 && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: t.textoTarjeta,
                        background: velo(t.textoTarjeta, 0.08),
                        borderRadius: 999,
                        padding: "2px 9px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {g.cuposLibres > 0 ? `quedan ${g.cuposLibres}` : "lleno"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {c.precioModulo != null ? (
            // El precio en su recuadro: lo primero que se busca en un curso.
            <div style={{ background: velo(t.textoTarjeta, 0.05), borderRadius: 12, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontSize: 14, color: t.texto2Tarjeta }}>
                <strong style={{ color: t.precio, fontSize: 18 }}>{bs(c.precioModulo)}</strong> por módulo
                {c.precioCompleto != null && <> · o {bs(c.precioCompleto)} todo junto</>}
              </p>
              {c.ahorro != null && c.ahorro > 0 && (
                <p
                  style={{
                    margin: "6px 0 0",
                    display: "inline-block",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#047857",
                    background: "#ECFDF5",
                    borderRadius: 999,
                    padding: "2px 10px",
                  }}
                >
                  Pagando todo junto ahorrás {bs(c.ahorro)}
                </p>
              )}
            </div>
          ) : (
            c.desde != null && (
              <div style={{ background: velo(t.textoTarjeta, 0.05), borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ margin: 0, fontSize: 14, color: t.texto2Tarjeta }}>
                  Desde <strong style={{ color: t.precio, fontSize: 18 }}>{bs(c.desde)}</strong>
                </p>
              </div>
            )
          )}
          {!primero && !todosLlenos && (
            <p style={{ margin: 0, fontSize: 13, color: t.texto3Tarjeta }}>Próximo grupo por confirmar.</p>
          )}
          {todosLlenos && (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t.textoTarjeta }}>
              Los grupos están llenos, comunicate con la academia.
            </p>
          )}
          {primero &&
            (urlInscribirme ? (
              <a href={urlInscribirme(primero.id)} style={estiloBoton}>
                Inscribirme
              </a>
            ) : (
              <span style={estiloBoton}>Inscribirme</span>
            ))}
        </div>
      </div>
    </article>
  );
}
