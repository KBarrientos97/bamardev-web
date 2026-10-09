import { useEffect, useState, type CSSProperties } from "react";
import { agruparSemana, estadoHorario, textoEstado, type Tramo } from "../../lib/pagina/horario";
import type { TonosPagina } from "../../lib/pagina/estilosPagina";

/**
 * El cartel "Abierto ahora · cierra 21:00" de cada sucursal y su semana
 * desplegable. Va en la página pública y en la vista previa del editor, así
 * que no puede importar nada de la app (separacion.test.ts).
 */

/**
 * La hora, renovada al empezar cada minuto: el cartel pasa de "Abierto" a
 * "Cerrado" solo, sin recargar. Un timer por cartel alcanza (son pocas
 * sucursales) y el primer salto se alinea al minuto para no atrasar.
 */
function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | undefined;
    const alMinuto = setTimeout(
      () => {
        setAhora(new Date());
        intervalo = setInterval(() => setAhora(new Date()), 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      clearTimeout(alMinuto);
      if (intervalo) clearInterval(intervalo);
    };
  }, []);
  return ahora;
}

/** El cartel, o nada si la sucursal no tiene horario por día. */
export function EstadoSucursal({ tramos, t }: { tramos: Tramo[] | null | undefined; t: TonosPagina }) {
  if (!tramos?.length) return null;
  return <Cartel tramos={tramos} t={t} />;
}

function Cartel({ tramos, t }: { tramos: Tramo[]; t: TonosPagina }) {
  const ahora = useAhora();
  const estado = estadoHorario(tramos, ahora);
  const texto = textoEstado(estado);
  if (!texto) return null;
  const k = estado.abierto ? t.estado.abierto : t.estado.cerrado;
  return (
    <span
      data-testid="estado-sucursal"
      data-abierto={estado.abierto}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background: k.fondo,
        color: k.texto,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.35,
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, flex: "none", borderRadius: 999, background: k.punto }} />
      {texto}
    </span>
  );
}

/**
 * "Ver horario": la semana agrupada como en el editor ("Lun a vie
 * 9:00–20:00"), cerrada de entrada. Un `<details>` nativo: abre con teclado y
 * lector de pantalla sin código.
 */
export function SemanaSucursal({
  tramos,
  t,
  centrada = false,
}: {
  tramos: Tramo[] | null | undefined;
  t: TonosPagina;
  centrada?: boolean;
}) {
  const grupos = agruparSemana(tramos);
  if (grupos.length === 0) return null;
  const fila: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16 };
  return (
    <details style={{ fontSize: 13, color: t.texto2Tarjeta, alignSelf: centrada ? "center" : "stretch" }}>
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          padding: "4px 0",
          // Que el triángulo y el texto queden juntos aunque la tarjeta sea ancha.
          width: "fit-content",
          margin: centrada ? "0 auto" : undefined,
        }}
      >
        Ver horario
      </summary>
      {/* Con tope de ancho: en la tarjeta ancha de la computadora el día y su hora no quedan a media pantalla. */}
      <dl
        style={{
          margin: "4px 0 2px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: centrada ? 220 : undefined,
          maxWidth: 340,
        }}
      >
        {grupos.map((g) => (
          <div key={g.dias} style={fila}>
            <dt>{g.dias}</dt>
            <dd style={{ margin: 0, textAlign: "right" }}>{g.horas ?? "Cerrado"}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
