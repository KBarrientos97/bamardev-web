import { estiloLetra } from "../../lib/pagina/estilos";
import { REVISTA } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, inicialesNombre, Portada, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Revista (maqueta aprobada el 20-nov): la tapa de una revista. Arriba la
 * franja con el rubro y la sucursal entre filetes; el nombre enorme partido en
 * renglones, con la última palabra en cursiva y del color; la bajada en
 * cursiva y la portada a sangre. Sin portada, una franja del color con las
 * iniciales grandes. En la compu, la tapa a la izquierda (fija) y el
 * contenido a la derecha, como una doble página.
 */
export default function ArmadoRevista(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const palabras = p.nombre.trim().split(/\s+/);
  const base = tamanoNombre(p.nombre, escritorio ? 76 : chico ? 46 : 56);
  const nombre = (
    <T
      style={{
        margin: 0,
        ...estiloLetra(x.letra, base),
        lineHeight: 0.9,
        letterSpacing: "-0.02em",
        color: t.textoEncabezado,
        overflowWrap: "anywhere",
      }}
    >
      {palabras.map((w, i) => (
        <span key={i} style={{ display: "block", ...(i === palabras.length - 1 && palabras.length > 1 ? { fontStyle: "italic", color: t.titulo } : {}) }}>
          {w}
          {/* El espacio queda en el texto: el lector de pantalla lee el nombre entero, no las palabras pegadas. */}
          {i < palabras.length - 1 ? " " : ""}
        </span>
      ))}
    </T>
  );
  const franja = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        borderBottom: `1px solid ${REVISTA.tinta}`,
        paddingBottom: 7,
        color: t.texto,
      }}
    >
      <span>{p.rubro ?? ""}</span>
      {p.sucursales[0]?.nombre && <span style={{ color: t.titulo }}>{p.sucursales[0].nombre}</span>}
    </div>
  );
  const tapa = (
    <header style={{ ...columna, gap: 14, padding: escritorio ? "40px 0 0" : "22px 20px 0" }}>
      {franja}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        {nombre}
        {x.logo && <LogoNegocio logo={x.logo} p={p} lado={chico ? 44 : 52} radio={4} fondoIniciales={c.acento} letra={x.letra} />}
      </div>
      {p.descripcion && (
        <p style={{ margin: 0, fontStyle: "italic", fontSize: escritorio ? 17 : 15, lineHeight: 1.45, color: t.texto2Encabezado, maxWidth: 420 }}>
          {p.descripcion}
        </p>
      )}
      {p.redes.length > 0 && <RedesPagina redes={p.redes} variante="plano" trazo={t.redTrazo} centradas={false} clic={x.clic} />}
      {x.portada ? (
        <Portada
          x={x}
          proporcion={escritorio ? "4 / 5" : "4 / 3"}
          ancho={1200}
          alto={900}
          style={{ margin: escritorio ? "6px 0 0" : "6px -20px 0", width: escritorio ? "100%" : "calc(100% + 40px)", maxWidth: "none" }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            borderTop: `6px solid ${c.acento}`,
            borderBottom: `1px solid ${REVISTA.tinta}`,
            padding: "10px 0",
            fontFamily: x.letra.familia,
            fontSize: 64,
            lineHeight: 0.85,
            color: t.titulo,
          }}
        >
          {inicialesNombre(p.nombre)}
        </div>
      )}
    </header>
  );

  if (escritorio) {
    return (
      <Raiz x={x}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 56,
            maxWidth: 1120,
            margin: "0 auto",
            padding: "0 40px",
            alignItems: "start",
          }}
        >
          <div style={{ position: "sticky", top: 0 }}>{tapa}</div>
          <ColumnaContenido x={{ ...x, escritorio: false }} ancho={520} padding="40px 0 40px" />
        </div>
      </Raiz>
    );
  }
  return (
    <Raiz x={x}>
      {tapa}
      <ColumnaContenido x={x} padding="22px 20px 26px" />
    </Raiz>
  );
}
