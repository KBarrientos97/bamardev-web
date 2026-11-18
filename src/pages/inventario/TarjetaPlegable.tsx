import { useId, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";

/**
 * Una tarjeta de Configuración que se pliega (17-nov).
 *
 * Inventario y stock pasó de dos tarjetas a cuatro más «Cómo funciona», y con
 * todo abierto lo que el dueño venía a tocar quedaba tres pantallas más abajo.
 * Cerrada muestra sólo el título y un estado chico a la derecha («Prendido»,
 * «Apagado»): alcanza para saber cómo está sin abrirla.
 *
 * El contenido NO se desmonta al cerrar (sólo se esconde): las tarjetas que
 * piden sus datos a la red (Agregados, Conteo) los necesitan cargados para
 * poder escribir el estado en la cabecera, y abrirla no tiene que volver a
 * mostrar un «Cargando…».
 */
export default function TarjetaPlegable({
  titulo,
  estado,
  abiertaDeEntrada = false,
  children,
}: {
  titulo: string;
  /** Lo que se lee con la tarjeta cerrada; `verde` para lo prendido, `gris` para lo apagado. */
  estado?: { texto: string; tono: "verde" | "gris" };
  abiertaDeEntrada?: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaDeEntrada);
  const idCuerpo = useId();

  return (
    <section className="card p-4">
      <h2>
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={idCuerpo}
          onClick={() => setAbierta((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-[0.12em] text-texto-3">{titulo}</span>
          {estado && (
            // Con tope y recorte: el estado puede llevar un nombre que escribe el
            // dueño («Prendido · Envases descartables grandes») y, sin tope, en el
            // celular dejaba el título de la tarjeta partido en tres renglones.
            <span
              title={estado.texto}
              className={`max-w-[55%] shrink-0 truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal ${
                estado.tono === "verde" ? "bg-primary-50 text-primary-700" : "bg-muted text-texto-3"
              }`}
            >
              {estado.texto}
            </span>
          )}
          <Icon
            name="chevronDown"
            size={18}
            className={`shrink-0 text-texto-3 transition-transform duration-150 ${abierta ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      <div id={idCuerpo} hidden={!abierta} className="mt-3">
        {children}
      </div>
    </section>
  );
}
