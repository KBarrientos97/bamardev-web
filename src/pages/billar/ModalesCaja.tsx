import { useState } from "react";
import { Input, Modal } from "../../components/ui";
import { parsearMonto } from "../../lib/dinero";
import { audioBloqueado, desbloquearAudio, hablar, zumbido } from "./alertas";
import { billar, useBillar } from "./store";
import { BotonB, Circulo, Nota } from "./ui";

/** La caja cerrada tapa el tablero, el consumo, el cobro y la venta rápida (§7.13). */
export function CajaCerradaAviso() {
  const { mesas } = useBillar();
  const [inicial, setInicial] = useState("200");
  const monto = parsearMonto(inicial);
  const siguen = mesas.filter((m) => m.estado === "abierta").length;
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6 text-center">
        <div className="mx-auto w-fit">
          <Circulo icono="lock" tono="gris" size={56} />
        </div>
        <h2 className="mt-3 text-lg font-bold text-texto">Caja cerrada</h2>
        <p className="mt-1 text-[13px] text-texto-3">
          Para abrir mesas o vender, abrí la caja del turno con el efectivo que hay para dar cambio.
        </p>
        {siguen > 0 && (
          <div className="mt-4 text-left">
            <Nota tono="ambar" icono="bola">
              {siguen === 1 ? "Hay 1 mesa abierta" : `Hay ${siguen} mesas abiertas`} del turno anterior: siguen
              corriendo y se cobran en el turno que abras.
            </Nota>
          </div>
        )}
        <label className="mt-4 block text-left">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Monto inicial</span>
          <Input type="number" value={inicial} onChange={(ev) => setInicial(ev.target.value)} />
        </label>
        <BotonB
          variante="verde"
          grande
          icono="check"
          className="mt-4 w-full"
          disabled={monto === null || monto < 0}
          onClick={() => billar.abrirCaja(monto ?? 0)}
        >
          Abrir caja
        </BotonB>
      </div>
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
      subtitulo={`Avisa a los ${avisos.join(", ")} min antes y cuando se cumple el tiempo.`}
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
          etiqueta="Silenciar todo"
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
      <p className="mt-3 text-[12px] text-texto-4">Los minutos de aviso se cambian en Mesas de billar → Tarifas y paquetes.</p>
    </Modal>
  );
}
