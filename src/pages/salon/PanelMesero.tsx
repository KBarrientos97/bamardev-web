import { useState } from "react";
import { Icon } from "../../components/Icon";
import type { NombreIcono } from "../../components/Icon";
import type { Mesa } from "../../types/salon";
import AbrirMesa from "./AbrirMesa";
import DetalleMesa from "./DetalleMesa";
import MiTurno from "./MiTurno";
import PorServir from "./PorServir";
import Salon from "./Salon";
import TomarPedido from "./TomarPedido";

/**
 * El panel del mesero: la pantalla principal del rol MESERO.
 *
 * Tres pestañas y, por encima, el flujo de tomar un pedido. No tiene barra
 * lateral ni caja: **el mesero no cobra**, así que no hay nada de apertura ni
 * cierre de caja ni acceso al POS. Lo único que hace con la plata es mandar la
 * mesa a caja.
 *
 * Las tres son las tres cosas que hace un mesero en un turno: mirar el salón,
 * llevar lo que está listo y ver cómo le fue. No hay una cuarta a propósito —
 * cada pestaña de más es un lugar donde buscar con las manos ocupadas.
 */
type Pestana = "salon" | "servir" | "turno";

/**
 * Los flujos que van POR ENCIMA de las pestañas.
 *
 * Mientras se abre una mesa o se toma un pedido la barra de abajo no está: es
 * un flujo con principio y fin, no un lugar al que volver.
 */
type Flujo =
  | { tipo: "abrir"; mesa: Mesa }
  | { tipo: "pedido"; mesa: Mesa }
  | { tipo: "detalle"; mesa: Mesa }
  | null;

const PESTANAS: { id: Pestana; etiqueta: string; icono: NombreIcono }[] = [
  { id: "salon", etiqueta: "Salón", icono: "grid" },
  { id: "servir", etiqueta: "Por servir", icono: "bell" },
  { id: "turno", etiqueta: "Mi turno", icono: "trendingUp" },
];

export default function PanelMesero() {
  const [pestana, setPestana] = useState<Pestana>("salon");
  const [flujo, setFlujo] = useState<Flujo>(null);
  const [aviso, setAviso] = useState("");
  /** Fuerza a recargar el salón después de tocar una mesa. */
  const [version, setVersion] = useState(0);

  function volverAlSalon(mensaje = "") {
    setFlujo(null);
    setAviso(mensaje);
    setVersion((v) => v + 1);
    setPestana("salon");
    if (mensaje) setTimeout(() => setAviso(""), 3000);
  }

  if (flujo?.tipo === "abrir")
    return (
      <Pantalla>
        <AbrirMesa
          mesa={flujo.mesa}
          onAtras={() => setFlujo(null)}
          // Abrir y tomar el pedido son el mismo movimiento: se encadena con
          // la carta sin volver al salón en el medio.
          onAbierta={(m) => setFlujo({ tipo: "pedido", mesa: m })}
        />
      </Pantalla>
    );

  if (flujo?.tipo === "pedido")
    return (
      <Pantalla>
        <TomarPedido
          mesa={flujo.mesa}
          onAtras={() => setFlujo(null)}
          onEnviado={volverAlSalon}
        />
      </Pantalla>
    );

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-fondo">
      <main className="min-h-0 flex-1 overflow-hidden">
        {pestana === "salon" && (
          <Salon
            key={version}
            onAbrirMesa={(mesa) => setFlujo({ tipo: "abrir", mesa })}
            onVerMesa={(mesa) => setFlujo({ tipo: "detalle", mesa })}
            onIrAPorServir={() => setPestana("servir")}
            onIrAMiTurno={() => setPestana("turno")}
          />
        )}
        {pestana === "servir" && <PorServir key={version} />}
        {pestana === "turno" && <MiTurno key={version} />}
      </main>

      {/* Va SOBRE el salón: es una hoja, no otra pantalla. */}
      {flujo?.tipo === "detalle" && (
        <DetalleMesa
          mesa={flujo.mesa}
          onCerrar={() => setFlujo(null)}
          onCambio={(m, mensaje) => {
            // Liberar o pasar la mesa deja esta hoja sin sujeto: se cierra sola.
            if (m.estado === "LIBRE") volverAlSalon(mensaje);
            else {
              setFlujo({ tipo: "detalle", mesa: m });
              setAviso(mensaje);
              setVersion((v) => v + 1);
              setTimeout(() => setAviso(""), 3000);
            }
          }}
          onAgregarPedido={(m) => setFlujo({ tipo: "pedido", mesa: m })}
          onAbrirMesa={(m) => setFlujo({ tipo: "abrir", mesa: m })}
        />
      )}

      {aviso && (
        <p className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
          {aviso}
        </p>
      )}

      {/* Barra de pestañas. Va abajo y con el ícono arriba del texto: se toca
          con el pulgar, que es donde llega sin cambiar la mano de posición. */}
      <nav className="flex shrink-0 border-t border-borde bg-white pb-[max(0px,env(safe-area-inset-bottom))]">
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
                activa ? "text-primary" : "text-texto-3 hover:text-texto-2"
              }`}
            >
              <Icon name={p.icono} size={20} strokeWidth={activa ? 2.4 : 2} />
              {p.etiqueta}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Un flujo a pantalla completa: sin las pestañas de abajo. */
function Pantalla({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] overflow-hidden bg-fondo">{children}</div>;
}
