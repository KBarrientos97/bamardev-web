import { estiloLetra } from "../../lib/pagina/estilos";
import { luzNeon, NEON } from "../../lib/pagina/estilosPagina";
import { ColumnaContenido, columna, conAlfa, Raiz, tamanoNombre, type PiezasArmado } from "./piezasArmado";
import { LogoNegocio, RedesPagina } from "./piezasPagina";

/**
 * Neón (maqueta aprobada el 20-nov): un letrero de tubos encendido sobre una
 * pared oscura con juntas de ladrillo. El nombre brilla con el color del
 * negocio (casi blanco en el centro, el color alrededor) dentro de un marco
 * de tubo, y la tercera letra titila de vez en cuando (no con «reducir
 * movimiento»). La portada, si hay, va arriba apagada y se funde con la pared.
 */
const TITILEO = `@keyframes neon-titila{0%,92%,100%{opacity:1}93%{opacity:.35}95%{opacity:1}96%{opacity:.5}}
.neon-titila{animation:neon-titila 4.5s infinite}
@media (prefers-reduced-motion: reduce){.neon-titila{animation:none}}`;

export default function ArmadoNeon(x: PiezasArmado) {
  const { p, c, t, escritorio, chico } = x;
  const T = x.Titulo;
  const luz = luzNeon(c);
  const brillo = `0 0 6px ${conAlfa(c.acento, 0.9)}, 0 0 18px ${conAlfa(c.acento, 0.8)}, 0 0 38px ${conAlfa(c.acento, 0.6)}`;
  const letras = [...p.nombre];
  const pared = {
    background: NEON.pared,
    backgroundImage: `repeating-linear-gradient(0deg, transparent 0 23px, ${conAlfa("#ffffff", 0.035)} 23px 24px), repeating-linear-gradient(90deg, transparent 0 47px, ${conAlfa("#ffffff", 0.03)} 47px 48px)`,
  };
  return (
    <Raiz x={x} style={pared}>
      <style>{TITILEO}</style>
      <header style={{ ...columna, gap: 16, maxWidth: escritorio ? 760 : 480, margin: "0 auto", padding: escritorio ? "48px 24px 0" : "24px 16px 0", boxSizing: "border-box", width: "100%" }}>
        {x.portada && (
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", marginBottom: -42 }}>
            <img
              src={x.portada}
              alt=""
              width={1200}
              height={600}
              decoding="async"
              fetchPriority={x.prioridad ? "high" : undefined}
              style={{ width: "100%", height: escritorio ? 260 : chico ? 120 : 150, objectFit: "cover", display: "block", filter: "grayscale(1) brightness(0.55)" }}
            />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${conAlfa(c.acento, 0.35)}, ${NEON.pared})` }} />
          </div>
        )}
        <div
          style={{
            ...columna,
            position: "relative",
            alignItems: "center",
            gap: 6,
            textAlign: "center",
            border: `2px solid ${luz}`,
            borderRadius: 22,
            padding: escritorio ? "28px 24px" : "20px 12px 16px",
            boxShadow: `${brillo}, inset ${brillo}`,
            background: conAlfa(NEON.pared, 0.75),
          }}
        >
          {x.logo && <LogoNegocio logo={x.logo} p={p} lado={chico ? 48 : 56} radio={999} fondoIniciales={c.acento} letra={x.letra} estilo={{ border: `2px solid ${luz}`, boxShadow: brillo }} />}
          {p.rubro && (
            <span style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: "#F5E7B8", textShadow: "0 0 8px rgba(255,214,120,0.8)" }}>{p.rubro}</span>
          )}
          <T style={{ margin: 0, ...estiloLetra(x.letra, tamanoNombre(p.nombre, escritorio ? 60 : chico ? 34 : 44)), lineHeight: 1.05, color: t.textoEncabezado, textShadow: brillo, overflowWrap: "anywhere" }}>
            {letras.map((l, i) => (i === 2 && l.trim() ? <span key={i} className="neon-titila">{l}</span> : l))}
          </T>
        </div>
        {p.descripcion && <p style={{ margin: 0, textAlign: "center", color: t.texto2Encabezado, fontSize: 15, lineHeight: 1.5 }}>{p.descripcion}</p>}
        {p.redes.length > 0 && <RedesPagina redes={p.redes} variante="circulo" fondo={null} borde={luz} trazo={luz} clic={x.clic} />}
      </header>
      <ColumnaContenido x={x} padding="18px 16px 26px" />
    </Raiz>
  );
}
