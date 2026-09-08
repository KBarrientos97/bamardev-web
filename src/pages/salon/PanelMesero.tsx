import { useState } from "react";
import { Icon } from "../../components/Icon";
import type { NombreIcono } from "../../components/Icon";
import type { Mesa } from "../../types/salon";
import Salon from "./Salon";

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

const PESTANAS: { id: Pestana; etiqueta: string; icono: NombreIcono }[] = [
  { id: "salon", etiqueta: "Salón", icono: "grid" },
  { id: "servir", etiqueta: "Por servir", icono: "alert" },
  { id: "turno", etiqueta: "Mi turno", icono: "trendingUp" },
];

export default function PanelMesero() {
  const [pestana, setPestana] = useState<Pestana>("salon");

  /**
   * La mesa sobre la que está trabajando el flujo de abrir/tomar pedido. Va
   * por encima de las pestañas: mientras se toma un pedido, la barra de abajo
   * no está — es un flujo, no un lugar al que volver.
   */
  const [, setMesaEnCurso] = useState<Mesa | null>(null);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-fondo">
      <main className="min-h-0 flex-1 overflow-hidden">
        {pestana === "salon" && (
          <Salon
            onAbrirMesa={setMesaEnCurso}
            onVerMesa={setMesaEnCurso}
            onIrAPorServir={() => setPestana("servir")}
            onIrAMiTurno={() => setPestana("turno")}
          />
        )}
        {pestana === "servir" && <EnConstruccion nombre="Por servir" />}
        {pestana === "turno" && <EnConstruccion nombre="Mi turno" />}
      </main>

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

/** Placeholder de las pestañas que todavía no están. */
function EnConstruccion({ nombre }: { nombre: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="text-[13px] text-texto-3">{nombre} — en construcción.</p>
    </div>
  );
}
