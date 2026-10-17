import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/Icon";
import { Modal } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { round2 } from "../calculo";
import type { TipoMesa } from "../tipos";
import { BotonB, Nota } from "../ui";
import {
  TIPO_EJEMPLO,
  bloque,
  ejemploConCentavos,
  ejemploExcedente,
  ejemploMinimo,
  ejemploPaquete,
  ejemploPromo,
  ejemplosFraccion,
  ejemplosTolerancia,
  minimoEfectivo,
  type Ejemplo,
} from "./ayudas.datos";

/**
 * El "?" al lado de un rótulo de la configuración del billar: abre una
 * ventana con qué es, cómo cobra y un ejemplo con la tarifa cargada. Pedido
 * del 17-oct: "Cobro por fracción" no se entendía la primera vez, y el texto
 * chiquito debajo del campo no alcanza para explicar el redondeo con la
 * tolerancia y el mínimo.
 *
 * Va en un portal: el rótulo es un `<p>`, y el Modal (un `<div>`) adentro de
 * un `<p>` es HTML inválido. Los eventos no suben de la ventana al rótulo: en
 * React un portal los sigue pasando a sus padres, y el "Entendido" no tiene
 * por qué llegarle a la tarjeta.
 */
export function Ayuda({ titulo, children }: { titulo: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`Qué es «${titulo}»`}
        aria-haspopup="dialog"
        className="-my-1.5 ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full align-middle text-texto-4 transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:text-primary-700"
      >
        <Icon name="pregunta" size={16} />
      </button>
      {abierta &&
        createPortal(
          <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <Modal
              abierto
              titulo={titulo}
              onClose={cerrar}
              ancho="max-w-md"
              acciones={
                <BotonB variante="verde" onClick={cerrar}>
                  Entendido
                </BotonB>
              }
            >
              <div className="space-y-3 text-[14px] leading-relaxed text-texto-2">{children}</div>
            </Modal>
          </div>,
          document.body,
        )}
    </>
  );
}

/** "Si juegan → se cobra → Bs", una fila por ejemplo. */
function TablaEjemplos({ filas }: { filas: Ejemplo[] }) {
  return (
    <table className="w-full overflow-hidden rounded-xl text-[13px] ring-1 ring-borde">
      <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-texto-3">
        <tr>
          <th className="px-3 py-2 font-bold">Si juegan</th>
          <th className="px-3 py-2 font-bold">Se cobra</th>
          <th className="px-3 py-2 text-right font-bold">Sale</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {filas.map((f) => (
          <tr key={f.juegan} className="border-t border-borde-soft">
            <td className="px-3 py-2">{f.juegan}</td>
            <td className="px-3 py-2 font-semibold text-texto">{f.cobra}</td>
            <td className="px-3 py-2 text-right font-semibold text-primary-700">{f.bs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fraccionTexto = (f: number) => (f === 1 ? "por minuto" : `de a ${f} min`);

/**
 * "Con lo que tenés cargado (Bs 20/h, de a 15 min…)" o, con la tarifa a medio
 * completar, el aviso de que el ejemplo usa una típica.
 */
function ConQue({ tipo, partes }: { tipo: TipoMesa | null; partes: (t: TipoMesa) => string[] }) {
  if (!tipo) {
    return (
      <p className="text-[13px] text-texto-3">
        Ejemplo con una tarifa típica ({partes(TIPO_EJEMPLO).join(", ")}). Cuando completes la tuya, sale con la tuya.
      </p>
    );
  }
  return <p className="text-[13px] text-texto-3">Con lo que tenés cargado ({partes(tipo).join(", ")}):</p>;
}

const tarifaTexto = (t: TipoMesa) => `${fmtMoney(t.tarifa)} la hora`;

export function AyudaPrecio({ tipo, nombre }: { tipo: TipoMesa | null; nombre: string }) {
  const t = tipo ?? TIPO_EJEMPLO;
  return (
    <Ayuda titulo="Precio por hora">
      <p>
        Lo que cuesta una hora de juego en las mesas <b>{nombre}</b>. El tiempo se cobra en proporción: con{" "}
        {fmtMoney(t.tarifa)} la hora, media hora sale {fmtMoney(round2(t.tarifa / 2))} y una hora y media,{" "}
        {fmtMoney(round2(t.tarifa * 1.5))}.
      </p>
      <p>Cómo se redondean los minutos lo deciden la fracción, la tolerancia y el mínimo: cada uno tiene su «?».</p>
      <p>
        Si una mesa tiene que cobrar distinto que las demás, se le pone una <b>tarifa propia</b> en la pestaña Mesas →
        Editar. Lo demás (fracción, mínimo, paquetes y promociones) lo sigue tomando de acá.
      </p>
    </Ayuda>
  );
}

export function AyudaFraccion({ tipo }: { tipo: TipoMesa | null }) {
  const t = tipo ?? TIPO_EJEMPLO;
  const b = bloque(t);
  const ejemplos = ejemplosFraccion(t);
  const conCentavos = ejemploConCentavos(t);
  return (
    <Ayuda titulo="Cobro por fracción">
      <p>
        Es <b>de a cuántos minutos</b> se cobra el tiempo. El reloj cuenta cada segundo, pero el tiempo se cobra por
        bloques, y un bloque empezado se cobra entero (pasada la tolerancia).
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b>Por minuto:</b> se cobra lo jugado, minuto a minuto.
        </li>
        <li>
          <b>15 min:</b> se cobra de a cuartos de hora. Si juegan 1:05, se cobra 1:15.
        </li>
      </ul>
      <ConQue
        tipo={tipo}
        partes={(x) => [tarifaTexto(x), fraccionTexto(x.fraccion), ...(x.fraccion > 1 ? [`tolerancia ${x.tolerancia} min`] : [])]}
      />
      <TablaEjemplos filas={ejemplos} />
      <p className="text-[13px]">
        {t.fraccion === 1 ? "Cada minuto" : `Cada bloque de ${t.fraccion} min`} vale <b>{fmtMoney(b.bs)}</b>.
      </p>
      {b.conCentavos && (
        <Nota tono="ambar" icono="alert">
          Con {fmtMoney(b.bs)} por {t.fraccion === 1 ? "minuto" : "bloque"} los cobros van a tener centavos que no hay en
          monedas{conCentavos && ` (como ${conCentavos})`}, y dar el cambio justo se complica.
          {b.redonda && (
            <>
              {" "}
              Cobrando de a {b.redonda.fraccion} min, cada bloque vale {fmtMoney(b.redonda.bs)}.
            </>
          )}
        </Nota>
      )}
      <p className="text-[13px] text-texto-3">Probá otros tiempos en el simulador, al final de la tarjeta.</p>
    </Ayuda>
  );
}

export function AyudaTolerancia({ tipo }: { tipo: TipoMesa | null }) {
  const t = tipo ?? TIPO_EJEMPLO;
  const ej = ejemplosTolerancia(t);
  return (
    <Ayuda titulo="Tolerancia">
      <p>
        Son <b>minutos de gracia</b> antes de cobrar el bloque siguiente: para no cobrar un bloque entero por un minuto
        de más mientras terminan la partida o pagan.
      </p>
      {ej ? (
        <>
          <ConQue tipo={tipo} partes={(x) => [fraccionTexto(x.fraccion), `tolerancia ${x.tolerancia} min`]} />
          <TablaEjemplos filas={[ej.dentro, ej.pasado]} />
          <p className="text-[13px]">
            {t.tolerancia > 0
              ? `Hasta ${ej.dentro.juegan} se cobra ${ej.dentro.cobra}; pasado ese minuto, ya se cobra ${ej.pasado.cobra}.`
              : `Sin tolerancia, apenas pasa ${ej.dentro.juegan} ya se cobra ${ej.pasado.cobra}.`}
          </p>
        </>
      ) : (
        <p>
          Cobrando <b>por minuto</b> no hay tolerancia: se cobra cada minuto empezado.
        </p>
      )}
      <p className="text-[13px] text-texto-3">Tiene que ser menos que la fracción. 0 = sin tolerancia.</p>
    </Ayuda>
  );
}

export function AyudaMinimo({ tipo }: { tipo: TipoMesa | null }) {
  const t = tipo ?? TIPO_EJEMPLO;
  const ej = ejemploMinimo(t);
  const efectivo = minimoEfectivo(t);
  return (
    <Ayuda titulo="Mínimo">
      <p>
        Lo <b>menos que se cobra</b> por abrir la mesa, aunque jueguen menos. Pasado el mínimo se cobra normal, por
        fracción. Con 0 no hay mínimo.
      </p>
      <ConQue tipo={tipo} partes={(x) => [`mínimo ${x.minimo} min`, fraccionTexto(x.fraccion)]} />
      <TablaEjemplos filas={[ej]} />
      {efectivo !== t.minimo && (
        <Nota tono="ambar" icono="alert">
          El mínimo de {t.minimo} min no es justo de bloques de {t.fraccion}: se completa el bloque y se cobra como{" "}
          {efectivo} min.
        </Nota>
      )}
      <p className="text-[13px] text-texto-3">
        Si pasan la cuenta a otra mesa, el mínimo se cobra una sola vez. Lo que se pasa de un tiempo fijo no tiene
        mínimo.
      </p>
    </Ayuda>
  );
}

export function AyudaPaquetes({ tipo }: { tipo: TipoMesa | null }) {
  const t = tipo ?? TIPO_EJEMPLO;
  const p = ejemploPaquete(t);
  const exc = ejemploExcedente(t);
  return (
    <Ayuda titulo="Paquetes de tiempo fijo">
      <p>
        Precios cerrados por una cantidad de horas, para el que ya sabe cuánto va a jugar. Con tiempo fijo, el reloj de
        la mesa cuenta para atrás y avisa antes de que se cumpla. Se puede cobrar al abrir o al final.
      </p>
      <p>
        Si piden una cantidad que no tiene paquete, se arma <b>la combinación más barata</b> de paquetes y horas
        sueltas.
      </p>
      {!tipo && <ConQue tipo={null} partes={(x) => [tarifaTexto(x), "paquetes de 1, 2 y 3 h"]} />}
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] tabular-nums">
        {p.horas} h = {p.partes} → <b className="text-primary-700">{p.bs}</b>
        {p.promo && <span className="text-texto-3"> (con la {p.promo})</span>}
      </p>
      <p>
        Si siguen jugando cuando se cumple, lo de más se cobra con el precio por hora y la fracción, sin mínimo: si se
        pasan {exc.juegan}, se cobran {exc.cobra} más ({exc.bs}).
      </p>
      <p className="text-[13px] text-texto-3">
        Un paquete que sale más caro que juntar otros nunca se usa: si pasa, te lo avisamos debajo.
      </p>
    </Ayuda>
  );
}

export function AyudaPromos({ tipo }: { tipo: TipoMesa | null }) {
  const ej = tipo ? ejemploPromo(tipo) : null;
  return (
    <Ayuda titulo="Promociones por tiempo">
      <p>
        Un descuento en el tiempo de mesa para el que juega muchas horas. Por ejemplo «desde 3 h, 10 %»: si juegan 3 h o
        más, todo el tiempo se cobra con 10 % menos.
      </p>
      {ej && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13px] tabular-nums">
          Con «{ej.nombre}»: si juegan {ej.juegan}, el tiempo sale {ej.bruto} y se cobra{" "}
          <b className="text-primary-700">{ej.total}</b> ({ej.pct} % menos).
        </p>
      )}
      <ul className="list-disc space-y-1 pl-5">
        <li>No toca los consumos.</li>
        <li>Si alcanzan dos, va la de mayor descuento.</li>
        <li>
          En tiempo fijo sólo cuenta si marcás «También en tiempo fijo»: el paquete ya trae su precio.
        </li>
        <li>Con «Activa» la apagás sin borrarla.</li>
        <li>
          Si pasan la cuenta a una mesa de otro tipo, lo que ya jugaron conserva la promo que tenían ganada.
        </li>
      </ul>
    </Ayuda>
  );
}

export function AyudaSimulador() {
  return (
    <Ayuda titulo="Simulador">
      <p>
        Para probar la tarifa <b>antes de guardarla</b>: escribí cuánto juegan, en horas y minutos (por ejemplo 1:32), y
        te dice cuánto tiempo se cobra y cuánto sale.
      </p>
      <p>
        Usa lo que está cargado en la tarjeta aunque todavía no lo hayas guardado, y hace la misma cuenta que la mesa al
        cobrar. Es para tiempo libre: el tiempo fijo cobra el precio del paquete.
      </p>
    </Ayuda>
  );
}

export function AyudaAvisos() {
  return (
    <Ayuda titulo="Avisos del tiempo fijo">
      <p>
        Sólo para mesas con <b>tiempo fijo</b>: el tiempo libre no tiene fin, así que no avisa.
      </p>
      <p>
        Elegí cuántos minutos antes querés el aviso; se pueden marcar varios (por ejemplo 10 y 5). Con el primero la mesa
        pasa a «Por vencer». Cuando se cumple el tiempo avisa siempre, aunque no marques ninguno.
      </p>
      <p>
        En «Cómo avisa» elegís el zumbido, la voz que dice la mesa y lo que le queda, o los dos. Probalo con «Probar
        aviso»: algunos navegadores no dejan sonar hasta que se toca la pantalla una vez.
      </p>
    </Ayuda>
  );
}

export function AyudaPines({ siempre }: { siempre: string }) {
  return (
    <Ayuda titulo="Acciones que piden PIN">
      <p>
        El PIN es <b>la firma del encargado</b>. Cuando una acción lo pide, el cajero no la puede hacer solo: un encargado
        o el administrador escribe su usuario y su PIN en esa pantalla.
      </p>
      <p>
        Queda registrado quién la hizo, quién la autorizó y por qué, en Reportes → Billar → <b>Pausas y ajustes</b>.
      </p>
      <p>{siempre}</p>
      <Nota tono="ambar" icono="key">
        El PIN de cada encargado lo asigna el administrador en Usuarios. Que no lo sepa el cajero: si lo sabe, el control
        no sirve.
      </Nota>
    </Ayuda>
  );
}

export function AyudaTarifaMesa() {
  return (
    <Ayuda titulo="Tarifa de la mesa">
      <p>
        Cada mesa cobra la tarifa de su <b>tipo</b> (Pool, Carambola…), que se arma en la pestaña Tarifas y paquetes. Si
        cambiás la del tipo, todas las mesas de ese tipo la siguen.
      </p>
      <p>
        <b>Tarifa propia:</b> para una mesa que cobra distinto que las demás de su tipo. Sólo cambia el precio por hora:
        la fracción, el mínimo, los paquetes y las promociones siguen siendo los del tipo.
      </p>
      <p className="text-[13px] text-texto-3">Con la mesa en juego, la tarifa nueva corre desde la próxima vez que se abra.</p>
    </Ayuda>
  );
}

export function AyudaEstadoMesa() {
  return (
    <Ayuda titulo="Estado de la mesa">
      <ul className="space-y-2">
        <li>
          <b>Activa:</b> se abre y se cobra normal.
        </li>
        <li>
          <b>Fuera de servicio:</b> sigue en el tablero y en la pantalla del salón, marcada «Fuera de servicio» con el
          motivo, y no se puede abrir. Para un arreglo pasajero, como un cambio de paño.
        </li>
        <li>
          <b>Inactiva:</b> desaparece del tablero y de la pantalla del salón, pero queda guardada acá para volver a
          activarla. Para una mesa que no se va a usar por un tiempo.
        </li>
      </ul>
      <p className="text-[13px] text-texto-3">Con la mesa en juego, el estado se cambia cuando se cierre.</p>
    </Ayuda>
  );
}
