import { useState } from "react";
import { Modal } from "../../components/ui";
import AperturaCaja from "../pos/AperturaCaja";
import { audioBloqueado, desbloquearAudio, hablar, zumbido } from "./alertas";
import { billar, useBillar } from "./store";
import { BotonB, Nota } from "./ui";

/**
 * Sin caja abierta no se abre una mesa, no se carga ni se cobra (§7.13). La
 * caja es la del propio cajero, la misma del POS, y se abre con la misma
 * pantalla: el fondo, el corte de billetes y, si es del dueño, la sucursal.
 */
export function CajaCerradaAviso() {
  const { mesas, sucursalId } = useBillar();
  const siguen = mesas.filter((m) => m.estado === "abierta").length;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {siguen > 0 && (
        <div className="mx-auto max-w-lg px-4 pt-4">
          <Nota tono="ambar" icono="bola">
            {siguen === 1 ? "Hay 1 mesa en juego" : `Hay ${siguen} mesas en juego`}: siguen corriendo y se cobran
            cuando abras tu caja.
          </Nota>
        </div>
      )}
      {/* El dueño con varios locales: se propone el del tablero que está
          mirando, y si abre en otro, el tablero se va con la caja (es donde
          puede operar). Con un solo local es el recargar de siempre. */}
      <AperturaCaja sucursalInicial={sucursalId} onAbierta={(caja) => billar.seguirCaja(caja.almacenId)} />
    </div>
  );
}

function Interruptor({
  etiqueta,
  texto,
  activo,
  onCambiar,
  deshabilitado,
}: {
  etiqueta: string;
  texto: string;
  activo: boolean;
  onCambiar: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${deshabilitado ? "opacity-50" : ""}`}>
      <div>
        <p className="text-sm font-semibold text-texto">{etiqueta}</p>
        <p className="text-[12px] text-texto-3">{texto}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={deshabilitado}
        onClick={() => onCambiar(!activo)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${activo ? "bg-primary-boton" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${activo ? "left-6" : "left-1"}`}
        />
      </button>
    </div>
  );
}

/** La campana del tablero (§6): silencio, zumbido, voz y "Probar aviso". */
export function ModalAvisos({ onClose }: { onClose: () => void }) {
  const { ajustes } = useBillar();
  const [bloqueado, setBloqueado] = useState(audioBloqueado);
  const avisos = [...ajustes.avisos].sort((a, b) => b - a);

  const probar = async () => {
    const ok = await desbloquearAudio();
    setBloqueado(!ok);
    const dura = ajustes.sonido ? zumbido(5) : 0;
    if (ajustes.voz) hablar("Mesa 5. Le quedan 5 minutos.", dura);
  };

  return (
    <Modal
      abierto
      titulo="Avisos de tiempo fijo"
      // Con los avisos previos apagados decía "Avisa a los  min antes…".
      subtitulo={
        avisos.length
          ? `Avisa a los ${avisos.join(", ")} min antes y cuando se cumple el tiempo.`
          : "Avisa sólo cuando se cumple el tiempo."
      }
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <BotonB icono="bell" onClick={probar} disabled={ajustes.silencio}>
            Probar aviso
          </BotonB>
          <BotonB variante="verde" onClick={onClose}>
            Listo
          </BotonB>
        </>
      }
    >
      <div className="divide-y divide-borde-soft">
        <Interruptor
          etiqueta="Silenciar este equipo"
          texto="Siguen los avisos en pantalla, sin sonido ni voz."
          activo={ajustes.silencio}
          onCambiar={(v) => billar.ajustar({ silencio: v })}
        />
        <Interruptor
          etiqueta="Zumbido"
          texto="Más pulsos y más rápido a medida que se acerca el fin."
          activo={ajustes.sonido}
          deshabilitado={ajustes.silencio}
          onCambiar={(v) => billar.ajustar({ sonido: v })}
        />
        <Interruptor
          etiqueta="Voz"
          texto={'"Mesa 5. Le quedan 5 minutos."'}
          activo={ajustes.voz}
          deshabilitado={ajustes.silencio}
          onCambiar={(v) => billar.ajustar({ voz: v })}
        />
      </div>
      {bloqueado && !ajustes.silencio && (
        <div className="mt-3">
          <Nota tono="ambar" icono="alert">
            El navegador no deja sonar nada hasta que se toca la página. Tocá <b>Probar aviso</b> una vez al empezar el
            turno.
          </Nota>
        </div>
      )}
      <p className="mt-3 text-[12px] text-texto-4">
        Estos interruptores son de este equipo. Los minutos de aviso, y el zumbido y la voz de todos los equipos, se
        cambian en Mesas de billar → Tarifas y paquetes.
      </p>
    </Modal>
  );
}
