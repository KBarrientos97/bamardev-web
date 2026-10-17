import { desbloquearAudio, hablar, zumbido } from "../alertas";
import type { PinesBillar } from "../tipos";
import { BotonB, Nota, Tarjeta } from "../ui";
import { MINUTOS_AVISO, type BorradorTarifas, type ErroresTipo } from "./borrador";
import { AyudaAvisos, AyudaPines } from "./ayudas";
import { Casilla, Etiqueta } from "./piezas";
import { TarjetaJornada } from "./TarjetaJornada";
import { TarjetaTipo } from "./TarjetaTipo";

/**
 * Mesas de billar → Tarifas y paquetes (§7.14): un tipo de mesa por tarjeta y,
 * abajo, los ajustes generales (avisos y PIN). En las capturas los avisos y el
 * PIN van acá y no en una tercera pestaña como decía la spec: se siguió la
 * captura.
 *
 * Todo es un borrador que vive en la pantalla (cambiar de pestaña no lo
 * pierde) y se guarda junto con "Guardar cambios".
 */
export function TabTarifas({
  b,
  errores,
  mostrarErrores,
  onCambiar,
}: {
  b: BorradorTarifas;
  errores: Record<string, ErroresTipo>;
  mostrarErrores: boolean;
  onCambiar: (b: BorradorTarifas) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {b.tipos.map((t) => (
          <TarjetaTipo
            key={t.id}
            b={t}
            errores={errores[t.id] ?? {}}
            mostrarErrores={mostrarErrores}
            onCambiar={(nuevo) => onCambiar({ ...b, tipos: b.tipos.map((x) => (x.id === t.id ? nuevo : x)) })}
          />
        ))}
      </div>
      <AjustesGenerales b={b} onCambiar={onCambiar} />
      <TarjetaJornada b={b} onCambiar={onCambiar} />
    </div>
  );
}

// "Anular una venta" y "Aplicar un descuento" estaban en la maqueta y no
// hacían nada: anular una venta pide PIN siempre en todo el sistema, y el
// billar no tiene descuentos. Un control que no hace nada es peor que no
// tenerlo.
const PIN_SIEMPRE =
  "Anular una venta y corregir la hora de inicio de una mesa piden PIN siempre, como en todo el sistema.";

const PINES: { clave: keyof PinesBillar; texto: string; ayuda?: string }[] = [
  {
    clave: "pausar",
    texto: "Pausar una mesa",
    ayuda: "Mientras está en pausa el tiempo no se cobra.",
  },
  { clave: "anularConsumo", texto: "Anular un consumo de una mesa" },
  { clave: "anularMesa", texto: "Anular una mesa abierta" },
];

function AjustesGenerales({ b, onCambiar }: { b: BorradorTarifas; onCambiar: (b: BorradorTarifas) => void }) {
  const alternar = (min: number) =>
    onCambiar({
      ...b,
      avisos: (b.avisos.includes(min) ? b.avisos.filter((x) => x !== min) : [...b.avisos, min]).sort((x, y) => y - x),
    });

  // Prueba lo que está marcado, aunque todavía no se haya guardado.
  const probar = async () => {
    await desbloquearAudio();
    const dura = b.sonido ? zumbido(5) : 0;
    if (b.voz) hablar("Mesa 5. Le quedan 5 minutos.", dura);
  };

  return (
    <Tarjeta icono="perillas" titulo="Ajustes generales">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <Etiqueta ayuda={<AyudaAvisos />}>Avisos antes del fin del tiempo fijo</Etiqueta>
            <div className="flex flex-wrap gap-2">
              {MINUTOS_AVISO.map((min) => {
                const activo = b.avisos.includes(min);
                return (
                  <button
                    key={min}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternar(min)}
                    className={`min-h-10 rounded-full px-4 text-[13px] font-semibold tabular-nums transition-colors ${
                      activo
                        ? "bg-primary-boton text-white"
                        : "bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
                    }`}
                  >
                    {min} min
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-texto-4">
              {b.avisos.length === 0
                ? "Sin avisos antes: sólo avisa cuando se cumple el tiempo."
                : 'Con el primero la mesa pasa a "Por vencer". En cada uno suena un zumbido y una voz dice la mesa y el tiempo que queda.'}
            </p>
          </div>

          <div>
            <Etiqueta>Cómo avisa</Etiqueta>
            <Casilla marcada={b.sonido} onCambiar={(v) => onCambiar({ ...b, sonido: v })}>
              Zumbido
            </Casilla>
            <Casilla marcada={b.voz} onCambiar={(v) => onCambiar({ ...b, voz: v })}>
              Voz: "Mesa 5. Le quedan 5 minutos."
            </Casilla>
            <BotonB icono="bell" className="mt-1" onClick={probar} disabled={!b.sonido && !b.voz}>
              Probar aviso
            </BotonB>
          </div>

          <Nota tono="gris">
            El cajero abre, {b.pin.pausar ? "" : "pausa, "}reanuda, cambia y cierra mesas sin PIN. Sólo lo marcado en
            "Acciones que piden PIN" necesita el de un encargado.
          </Nota>
        </div>

        <div>
          <Etiqueta ayuda={<AyudaPines siempre={PIN_SIEMPRE} />}>Acciones que piden PIN</Etiqueta>
          {PINES.map((p) => (
            <Casilla
              key={p.clave}
              marcada={b.pin[p.clave]}
              ayuda={p.ayuda}
              onCambiar={(v) => onCambiar({ ...b, pin: { ...b.pin, [p.clave]: v } })}
            >
              {p.texto}
            </Casilla>
          ))}
          <p className="mt-2 text-[12px] text-texto-4">{PIN_SIEMPRE}</p>
        </div>
      </div>
    </Tarjeta>
  );
}
