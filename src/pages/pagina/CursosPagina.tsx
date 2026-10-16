import type { CSSProperties, ReactNode } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import type { TonosPagina } from "../../lib/pagina/estilosPagina";
import { fechaCorta, horarioGrupo } from "../../lib/academia/formato";
import type { CursoPublico } from "../../lib/academia/tipos";

/**
 * P1 · La sección Cursos de la página de un instituto (PLAN-ACADEMIAS-TECNICO
 * §9): una tarjeta por carrera publicada, con su foto, las horas, las
 * materias, "desde Bs X" y los próximos inicios por sede y turno. El botón
 * lleva al formulario de preinscripción (P2), donde se elige el horario.
 *
 * Va con los tonos del estilo de la página (estilos en línea, como el resto
 * de la vista): no es la app, es la vitrina del negocio.
 */
export default function CursosPagina({
  cursos,
  t,
  colorBoton,
  radio,
  titulo,
  urlInscribirme,
  escritorio,
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
  escritorio: boolean;
}) {
  const visibles = cursos.filter((c) => c.grupos.length > 0 || c.desde != null);
  if (!visibles.length) return null;
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
    </section>
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
  const primero = c.grupos[0];
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
            {c.horasTotales} h{c.materias.length ? ` · ${c.materias.join(" · ")}` : ""}
          </p>
        </div>
        {c.descripcion && <p style={{ margin: 0, fontSize: 14, color: t.texto2Tarjeta }}>{c.descripcion}</p>}
        {c.grupos.length > 0 && (
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: t.texto3Tarjeta }}>
              PRÓXIMOS INICIOS
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
              {c.grupos.map((g) => (
                <li key={g.id} style={{ fontSize: 14, color: t.textoTarjeta }}>
                  {fechaCorta(g.fechaInicio)} · {horarioGrupo(g)} · {g.sede.nombre}
                  {g.cuposLibres != null && g.cuposLibres <= 10 && (
                    <span style={{ color: t.texto3Tarjeta }}>
                      {" "}
                      · {g.cuposLibres > 0 ? `quedan ${g.cuposLibres}` : "lleno"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {c.desde != null && (
            <p style={{ margin: 0, fontSize: 14, color: t.texto2Tarjeta }}>
              Desde <strong style={{ color: t.precio }}>Bs {c.desde.toLocaleString("es-BO")}</strong>
            </p>
          )}
          {primero &&
            (urlInscribirme ? (
              <a href={urlInscribirme(primero.id)} style={estiloBoton}>
                Preinscribirme
              </a>
            ) : (
              <span style={estiloBoton}>Preinscribirme</span>
            ))}
        </div>
      </div>
    </article>
  );
}
