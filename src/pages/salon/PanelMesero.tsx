import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import type { NombreIcono } from "../../components/Icon";
import type { Mesa } from "../../types/salon";
import { porServir } from "./logicaSalon";
import AbrirMesa from "./AbrirMesa";
import DetalleMesa from "./DetalleMesa";
import CobrarMesa from "./CobrarMesa";
import Entregas from "./Entregas";
import MiTurno from "./MiTurno";
import PorServir from "./PorServir";
import Salon, { type EstadoSalon } from "./Salon";
import TomarPedido from "./TomarPedido";
import PantallaApilada from "./PantallaApilada";
import { precargarCarta } from "./cartaGuardada";

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
  // `aviso`: lo que hay que leer al volver a la mesa (la cuenta cambió
  // mientras se cobraba). `conRecibo`: recién cobrada, con el recibo abierto.
  | { tipo: "detalle"; mesa: Mesa; aviso?: string; conRecibo?: boolean }
  // Las entregas de efectivo van como flujo y NO como cuarta pestaña: se entra
  // desde "Mi turno", se mira cuánto se debe y se vuelve. Una pestaña fija
  // sería un lugar más donde buscar con las manos ocupadas.
  | { tipo: "entregas" }
  // Cobrar la mesa: sólo existe si el negocio prendió `mesero_cobra`. Es la
  // MISMA pantalla de cobro del POS, no una copia: el vuelto, el QR y el pago
  // mixto ya están resueltos ahí, y un segundo cobro sería un segundo lugar
  // donde arreglar la plata cada vez que algo cambia.
  | { tipo: "cobrar"; mesa: Mesa }
  | null;

const PESTANAS: { id: Pestana; etiqueta: string; icono: NombreIcono }[] = [
  { id: "salon", etiqueta: "Salón", icono: "grid" },
  { id: "servir", etiqueta: "Por servir", icono: "bell" },
  { id: "turno", etiqueta: "Mi turno", icono: "trendingUp" },
];

export default function PanelMesero() {
  const [pestana, setPestana] = useState<Pestana>("salon");
  /**
   * Las pestañas ya abiertas quedan vivas (escondidas) al cambiar: así vuelven
   * con su scroll y sin "Cargando". Antes se desmontaban y se armaban de cero
   * cada vez (UX nativa, 10-nov). Se montan recién la primera vez que se
   * entra, para no pedir al servidor lo que nadie miró.
   */
  const [abiertas, setAbiertas] = useState<ReadonlySet<Pestana>>(() => new Set(["salon"]));
  const [flujo, setFlujo] = useState<Flujo>(null);
  const [aviso, setAviso] = useState("");
  /**
   * Sube después de tocar una mesa: las pestañas se actualizan (sin
   * desmontarse) y la carta se vuelve a adelantar con el stock nuevo.
   */
  const [version, setVersion] = useState(0);
  /** Las mesas que cargó el salón: el detalle las usa para pasar/juntar. */
  const [mesas, setMesas] = useState<Mesa[]>([]);
  /**
   * Cómo viene la carga del salón. "Por servir" usa las mismas mesas y no las
   * vuelve a pedir: eran dos pedidos iguales al servidor.
   */
  const [salonVivo, setSalonVivo] = useState<EstadoSalon>({
    cargando: true,
    error: "",
    recargar: () => {},
  });
  /**
   * Si el negocio dejó que el mesero cobre sus mesas.
   *
   * Decide dos cosas: el botón de cobrar en el detalle de la mesa, y el acceso
   * a las entregas desde "Mi turno". Sin esto el mesero nunca tiene efectivo
   * encima y las dos cosas sobran.
   */
  const [meserosCobran, setMeserosCobran] = useState(false);
  /** Lo que falta llevar: va como badge sobre la pestaña "Por servir". */
  const pendientes = porServir(mesas).length;

  // La carta, adelantada: "Agregar pedido" abre al instante (`cartaGuardada`).
  useEffect(() => {
    precargarCarta();
  }, [version]);

  function irA(p: Pestana) {
    setPestana(p);
    setAbiertas((a) => (a.has(p) ? a : new Set(a).add(p)));
  }

  function volverAlSalon(mensaje = "") {
    setFlujo(null);
    setAviso(mensaje);
    setVersion((v) => v + 1);
    setPestana("salon");
    if (mensaje) setTimeout(() => setAviso(""), 3000);
  }

  /** Vuelve a la hoja de una mesa (con el salón de atrás recargado). */
  function volverALaMesa(detalle: Extract<Flujo, { tipo: "detalle" }>, mensaje = "") {
    setFlujo(detalle);
    setAviso(mensaje);
    setVersion((v) => v + 1);
    setPestana("salon");
    if (mensaje) setTimeout(() => setAviso(""), 3000);
  }

  /**
   * De qué local es una mesa. La que devuelve el backend al abrirla, unirla o
   * separarla no lo trae (lo agrega la web a las del salón): se lo busca ahí.
   */
  const localDe = (m: Mesa) => m.sucursalId ?? mesas.find((x) => x.id === m.id)?.sucursalId ?? null;

  /** Abrir mesa, el pedido, cobrar y las entregas: se apilan sobre el panel. */
  const apilada = flujo && flujo.tipo !== "detalle" ? flujo : null;

  function contenidoApilado(f: NonNullable<typeof apilada>, salir: (despues?: () => void) => void) {
    if (f.tipo === "abrir")
      return (
        <AbrirMesa
          mesa={f.mesa}
          mesasDelSalon={mesas}
          onAtras={() => salir()}
          // Unir o separar deja OTRA mesa: la pantalla se repinta con la que
          // devolvió el backend, sin volver al salón en el medio.
          onMesaCambiada={(m) => setFlujo({ tipo: "abrir", mesa: m })}
          // Abrir y tomar el pedido son el mismo movimiento: se encadena con
          // la carta sin volver al salón en el medio.
          onAbierta={(m) => setFlujo({ tipo: "pedido", mesa: m })}
        />
      );
    if (f.tipo === "pedido")
      return (
        <TomarPedido
          mesa={f.mesa}
          sucursalId={localDe(f.mesa)}
          onAtras={() => salir()}
          onEnviado={(mensaje) => salir(() => volverAlSalon(mensaje))}
        />
      );
    if (f.tipo === "entregas") return <Entregas onVolver={() => salir()} />;
    return (
      <CobrarMesa
        mesa={f.mesa}
        sucursalId={localDe(f.mesa)}
        onAtras={() => salir()}
        onCobrada={(mensaje, cobrada) =>
          salir(() => {
            // El cliente acaba de pagar y el mesero está a su lado: se le
            // abre el recibo para dárselo, sobre la mesa ya cobrada (su paso
            // siguiente es levantarla). Volvía al salón y el recibo había que
            // ir a buscarlo. Sin el cobro en la mesa releída el papel saldría
            // a medio llenar: ahí sólo se vuelve al salón, como antes.
            if (cobrada?.cobro)
              volverALaMesa({ tipo: "detalle", mesa: cobrada, conRecibo: true }, mensaje);
            else volverAlSalon(mensaje);
          })
        }
        onCuentaCambiada={(mesa, avisoCuenta) =>
          salir(() => volverALaMesa({ tipo: "detalle", mesa, aviso: avisoCuenta }))
        }
      />
    );
  }

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-fondo">
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className={pestana === "salon" ? "h-full" : "hidden"}>
          <Salon
            refrescar={version}
            onAbrirMesa={(mesa) => setFlujo({ tipo: "abrir", mesa })}
            onVerMesa={(mesa) => setFlujo({ tipo: "detalle", mesa })}
            onIrAPorServir={() => irA("servir")}
            onIrAMiTurno={() => irA("turno")}
            onMesas={setMesas}
            onEstado={setSalonVivo}
            onMeserosCobran={setMeserosCobran}
          />
        </div>
        {abiertas.has("servir") && (
          <div className={pestana === "servir" ? "h-full" : "hidden"}>
            <PorServir
              mesas={mesas}
              cargando={salonVivo.cargando}
              error={salonVivo.error}
              onRecargar={salonVivo.recargar}
            />
          </div>
        )}
        {abiertas.has("turno") && (
          <div className={pestana === "turno" ? "h-full" : "hidden"}>
            <MiTurno
              refrescar={version}
              onIrAEntregas={meserosCobran ? () => setFlujo({ tipo: "entregas" }) : undefined}
            />
          </div>
        )}
      </main>

      {/* Va SOBRE el salón: es una hoja, no otra pantalla. */}
      {flujo?.tipo === "detalle" && (
        <DetalleMesa
          mesa={flujo.mesa}
          mesasDelSalon={mesas}
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
          onCobrarMesa={
            meserosCobran ? (m) => setFlujo({ tipo: "cobrar", mesa: m }) : undefined
          }
          aviso={flujo.aviso}
          abrirRecibo={flujo.conRecibo}
        />
      )}

      {aviso && (
        <p className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary-boton px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
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
              onClick={() => irA(p.id)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors active:bg-muted ${
                activa ? "text-primary-700" : "text-texto-3 hover:text-texto-2"
              }`}
            >
              <span className="relative">
                <Icon name={p.icono} size={20} strokeWidth={activa ? 2.4 : 2} />
                {/* Cuántos pedidos esperan: es lo único de la barra que exige
                    moverse ahora mismo. */}
                {p.id === "servir" && pendientes > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-text px-1 text-[10px] font-bold text-white">
                    {pendientes}
                  </span>
                )}
              </span>
              {p.etiqueta}
            </button>
          );
        })}
      </nav>

      {/* Abrir mesa, el pedido, cobrar y las entregas van ENCIMA del panel,
          que sigue vivo abajo: entran desde la derecha y se vuelve
          arrastrando desde el borde, viendo el salón detrás. Una pantalla
          nueva (de abrir la mesa al pedido) entra con su propia animación. */}
      {apilada && (
        <PantallaApilada
          key={`${apilada.tipo}-${"mesa" in apilada ? apilada.mesa.id : ""}`}
          onVolver={() => setFlujo(null)}
        >
          {(salir) => contenidoApilado(apilada, salir)}
        </PantallaApilada>
      )}
    </div>
  );
}
