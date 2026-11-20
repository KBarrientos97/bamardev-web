import { estiloLetra } from "../../lib/pagina/estilos";
import { ALBUM } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, conAlfa, inicialesNombre, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Álbum (maqueta aprobada el 20-nov): un álbum de recortes sobre una hoja
 * con puntitos del color. La portada es una foto instantánea un poco girada,
 * pegada con una cinta translúcida del color, con el nombre escrito a mano
 * abajo; sin portada, el recuadro va del tinte con las iniciales. El rubro
 * va resaltado con marcador y el anuncio, en un papelito amarillo pegado.
 */
function Cinta({ color, giro, izquierda }: { color: string; giro: number; izquierda: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ position: "absolute", top: -10, left: izquierda, width: 64, height: 20, background: color, transform: `rotate(${giro}deg)`, zIndex: 1 }}
    />
  );
}

export default function ArmadoAlbum(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const alto = escritorio ? 300 : chico ? 140 : 180;
  const hoja = {
    background: ALBUM.hoja,
    backgroundImage: `radial-gradient(${conAlfa(c.acento, 0.22)} 1.2px, transparent 1.6px)`,
    backgroundSize: "18px 18px",
  };
  // El papelito: el anuncio de la página, girado y con sombra, sin cambiar sus colores.
  const papelito = x.anuncio ? <div style={{ transform: "rotate(1.6deg)", filter: "drop-shadow(0 8px 10px rgba(0,0,0,0.18))" }}>{x.anuncio}</div> : null;
  return (
    <Raiz x={x} style={hoja}>
      <header style={{ ...columna, alignItems: "center", gap: 14, padding: escritorio ? "48px 24px 0" : "26px 18px 0", textAlign: "center" }}>
        <div
          style={{
            position: "relative",
            width: escritorio ? 420 : "82%",
            maxWidth: "100%",
            background: "#ffffff",
            padding: "10px 10px 0",
            boxShadow: "0 10px 22px -10px rgba(0,0,0,0.35)",
            transform: "rotate(-2.5deg)",
            boxSizing: "border-box",
          }}
        >
          <Cinta color={conAlfa(c.acento, 0.5)} giro={-6} izquierda="38%" />
          {x.portada ? (
            <img
              src={x.portada}
              alt=""
              width={800}
              height={600}
              decoding="async"
              fetchPriority={x.prioridad ? "high" : undefined}
              style={{ width: "100%", height: alto, objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ height: alto, background: c.tinte, display: "grid", placeItems: "center" }}>
              {x.logo ? (
                <LogoNegocio logo={x.logo} p={p} lado={chico ? 80 : 110} radio={12} fondoIniciales={c.acento} letra={x.letra} />
              ) : (
                <span aria-hidden="true" style={{ ...estiloLetra(x.letra, chico ? 60 : 84), color: c.oscuro }}>{inicialesNombre(p.nombre)}</span>
              )}
            </div>
          )}
          <T style={{ margin: 0, padding: "10px 4px 12px", ...estiloLetra(x.letra, tamanoNombre(p.nombre, escritorio ? 40 : chico ? 26 : 32)), lineHeight: 1.05, color: t.textoEncabezado, overflowWrap: "anywhere" }}>
            {p.nombre}
          </T>
        </div>
        {(p.rubro || p.descripcion) && (
          <p style={{ margin: 0, maxWidth: 460, fontSize: 15, lineHeight: 1.5, color: t.texto2Encabezado }}>
            {p.rubro && (
              <span style={{ background: `linear-gradient(transparent 58%, ${conAlfa(c.acento, 0.25)} 58%)`, color: t.texto, fontWeight: 600 }}>{p.rubro}.</span>
            )}{" "}
            {p.descripcion}
          </p>
        )}
        {p.redes.length > 0 && <RedesPagina redes={p.redes} variante="circulo" fondo={t.redFondo} trazo={t.redTrazo} clic={x.clic} />}
      </header>
      <ColumnaContenido x={{ ...x, anuncio: null }} antes={papelito} padding="20px 18px 28px" />
    </Raiz>
  );
}
