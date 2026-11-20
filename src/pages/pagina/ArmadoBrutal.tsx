import { estiloLetra } from "../../lib/pagina/estilos";
import { BRUTAL } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, conAlfa, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Brutal (maqueta aprobada el 20-nov): bordes negros de 3 px, sombras duras
 * corridas y un sticker amarillo torcido con el rubro, sobre el tinte del
 * color con una cuadrícula fina. El encabezado es una caja blanca con la
 * portada arriba y el nombre en mayúsculas apretadas.
 */
export default function ArmadoBrutal(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const borde = `3px solid ${BRUTAL.tinta}`;
  const cuadricula = {
    backgroundImage: `linear-gradient(${conAlfa(c.acento, 0.12)} 1px, transparent 1px), linear-gradient(90deg, ${conAlfa(c.acento, 0.12)} 1px, transparent 1px)`,
    backgroundSize: "22px 22px",
  };
  const altoFoto = escritorio ? 300 : chico ? 120 : 170;
  return (
    <Raiz x={x} style={cuadricula}>
      <header style={{ maxWidth: escritorio ? 640 : 480, margin: "0 auto", padding: escritorio ? "44px 0 0" : "24px 18px 0", boxSizing: "border-box", width: "100%" }}>
        <div style={{ position: "relative", background: "#ffffff", border: borde, boxShadow: `5px 5px 0 ${BRUTAL.tinta}` }}>
          {x.portada && (
            <img
              src={x.portada}
              alt=""
              width={1200}
              height={700}
              decoding="async"
              fetchPriority={x.prioridad ? "high" : undefined}
              style={{ width: "100%", height: altoFoto, objectFit: "cover", display: "block", borderBottom: borde }}
            />
          )}
          <div style={{ ...columna, gap: 10, padding: "16px 16px 18px" }}>
            {x.logo && <LogoNegocio logo={x.logo} p={p} lado={chico ? 44 : 54} radio={0} fondoIniciales={c.acento} letra={x.letra} estilo={{ border: borde }} />}
            <T
              style={{
                margin: 0,
                ...estiloLetra(x.letra, tamanoNombre(p.nombre, escritorio ? 52 : chico ? 30 : 38)),
                textTransform: "uppercase",
                lineHeight: 0.95,
                letterSpacing: "-0.035em",
                color: t.textoEncabezado,
                overflowWrap: "anywhere",
              }}
            >
              {p.nombre}
            </T>
            {p.descripcion && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: t.texto2Encabezado }}>{p.descripcion}</p>}
            {p.redes.length > 0 && <RedesPagina redes={p.redes} variante="cuadrado" fondo="#ffffff" borde={BRUTAL.tinta} trazo={BRUTAL.tinta} centradas={false} clic={x.clic} />}
          </div>
          {p.rubro && (
            <span
              style={{
                position: "absolute",
                right: -10,
                top: x.portada ? altoFoto - 22 : -16,
                background: BRUTAL.sticker,
                color: BRUTAL.tinta,
                border: borde,
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
                fontSize: 12.5,
                transform: "rotate(7deg)",
                boxShadow: `3px 3px 0 ${BRUTAL.tinta}`,
                maxWidth: "70%",
              }}
            >
              {p.rubro}
            </span>
          )}
        </div>
      </header>
      <ColumnaContenido x={x} padding="22px 18px 30px" gap={16} />
    </Raiz>
  );
}
