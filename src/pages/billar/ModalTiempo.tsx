import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Input, Modal } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { precioFijo, promoPara } from "./calculo";
import { FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { billar, tipoDe, useBillar } from "./store";
import type { Mesa, TipoMesa } from "./tipos";
import { BotonB, Nota, Segmentado } from "./ui";

/**
 * Abrir una mesa (§7.2) y extender su tiempo fijo (§7.3). Comparten el
 * selector de horas: los paquetes, y "Otra cantidad" de 1 a 24 h con la
 * combinación más barata.
 */

const MAX_HORAS = 24;

function SelectorHoras({
  tipo,
  horas,
  otra,
  onElegir,
  prefijo = "",
}: {
  tipo: TipoMesa;
  horas: number;
  otra: boolean;
  onElegir: (horas: number, otra: boolean) => void;
  /** "+" al extender: "+1 h · Bs 20,00". */
  prefijo?: string;
}) {
  const precio = precioFijo(tipo, horas);
  const chip = (activo: boolean) =>
    `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition-colors ${
      activo ? "bg-primary-boton text-white" : "bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
    }`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tipo.paquetes.map((p) => (
          <button
            key={p.h}
            type="button"
            aria-pressed={!otra && horas === p.h}
            onClick={() => onElegir(p.h, false)}
            className={chip(!otra && horas === p.h)}
          >
            {prefijo}
            {p.h} h · {fmtMoney(precioFijo(tipo, p.h).precio)}
          </button>
        ))}
        <button type="button" aria-pressed={otra} onClick={() => onElegir(Math.max(horas, 4), true)} className={chip(otra)}>
          <Icon name="edit" size={14} />
          Otra cantidad
        </button>
      </div>
      {otra && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-full bg-white ring-1 ring-inset ring-borde">
            <button
              type="button"
              aria-label="Una hora menos"
              disabled={horas <= 1}
              onClick={() => onElegir(horas - 1, true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-texto-2 hover:bg-muted disabled:opacity-40"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="w-8 text-center text-base font-bold tabular-nums" aria-live="polite">
              {horas}
            </span>
            <button
              type="button"
              aria-label="Una hora más"
              disabled={horas >= MAX_HORAS}
              onClick={() => onElegir(horas + 1, true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-texto-2 hover:bg-muted disabled:opacity-40"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
          <span className="text-sm font-semibold text-texto-2">horas</span>
          <span className="ml-auto text-lg font-extrabold tabular-nums text-primary-700">
            {precio.promo && <s className="mr-2 text-sm font-semibold text-texto-4">{fmtMoney(precio.bruto)}</s>}
            {fmtMoney(precio.precio)}
          </span>
          {precio.partes.length > 1 && (
            <p className="w-full text-[12px] text-texto-3">Mejor precio con paquetes: {precio.partes.join(" + ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReglaTarifa({ tipo }: { tipo: TipoMesa }) {
  return (
    <Nota tono="gris">
      Se cobra cada {tipo.fraccion} min · mínimo {tipo.minimo} min · {tipo.tolerancia} min de tolerancia
    </Nota>
  );
}

function TarjetaRadio({
  activo,
  titulo,
  texto,
  onClick,
  children,
}: {
  activo: boolean;
  titulo: string;
  texto: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        activo ? "border-primary bg-primary-50/60" : "border-borde bg-white hover:bg-muted"
      }`}
    >
      <button type="button" role="radio" aria-checked={activo} onClick={onClick} className="flex w-full items-start gap-3 text-left">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            activo ? "border-primary-boton" : "border-slate-300"
          }`}
        >
          {activo && <span className="h-2.5 w-2.5 rounded-full bg-primary-boton" />}
        </span>
        <span>
          <span className="block text-[15px] font-bold text-texto">{titulo}</span>
          <span className="block text-[13px] text-texto-3">{texto}</span>
        </span>
      </button>
      {activo && children && <div className="mt-3 pl-8">{children}</div>}
    </div>
  );
}

type Garantia = "Ninguna" | "Carnet" | "Otro";

export function ModalAbrir({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const e = useBillar();
  const navigate = useNavigate();
  const tipo = tipoDe(e, mesa);
  const [modo, setModo] = useState<"libre" | "fijo">("libre");
  const [horas, setHoras] = useState(2);
  const [otra, setOtra] = useState(false);
  const [cliente, setCliente] = useState(mesa.reserva?.nombre ?? "");
  const [garantia, setGarantia] = useState<Garantia>("Ninguna");
  const [queDeja, setQueDeja] = useState("");
  const [nota, setNota] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const precio = precioFijo(tipo, horas);
  const cobro = useCobro(precio.precio);
  const promoLibre = promoPara(tipo, Number.POSITIVE_INFINITY);

  const abrirMesa = (conPago: boolean) => {
    billar.abrir(mesa.id, {
      modo,
      horas: modo === "fijo" ? horas : undefined,
      pago: conPago && cobro.pago ? cobro.pago : undefined,
      cliente,
      garantia: garantia === "Otro" ? queDeja.trim() || "Otro" : garantia,
      nota,
    });
    onClose();
    navigate(`/billar?mesa=${mesa.id}`, { replace: true });
  };

  const titulo = `Abrir Mesa ${mesa.id} · ${tipo.nombre} · ${fmtMoney(tipo.tarifa)}/h`;

  if (cobrando) {
    return (
      <Modal
        abierto
        titulo={`Cobrar tiempo fijo · Mesa ${mesa.id}`}
        subtitulo={`${horas} h · ${tipo.nombre}. Al confirmar, la mesa arranca.`}
        onClose={onClose}
        cerrarAlClicAfuera={false}
        ancho="max-w-lg"
        acciones={
          <>
            <BotonB icono="arrowLeft" onClick={() => setCobrando(false)}>
              Volver
            </BotonB>
            <BotonB variante="verde" icono="check" disabled={!cobro.pago} onClick={() => abrirMesa(true)}>
              Cobrar {fmtMoney(precio.precio)} y abrir
            </BotonB>
          </>
        }
      >
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-primary-boton to-primary-700 px-5 py-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Tiempo fijo Mesa {mesa.id}</p>
          <p className="text-3xl font-extrabold tabular-nums">{fmtMoney(precio.precio)}</p>
          <p className="text-[13px] text-white/85">
            {horas} h{precio.partes.length > 1 ? ` (${precio.partes.join(" + ")})` : ""}
          </p>
        </div>
        <FormCobro cobro={cobro} />
      </Modal>
    );
  }

  return (
    <Modal
      abierto
      titulo={titulo}
      subtitulo="Elegí cómo se cobra el tiempo."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-2xl"
      acciones={
        modo === "libre" ? (
          <>
            <BotonB onClick={onClose}>Cancelar</BotonB>
            <BotonB variante="verde" icono="play" onClick={() => abrirMesa(false)}>
              Abrir mesa y arrancar
            </BotonB>
          </>
        ) : (
          <>
            <BotonB onClick={onClose}>Cancelar</BotonB>
            <BotonB icono="clock" onClick={() => abrirMesa(false)}>
              Abrir · cobrar al final
            </BotonB>
            <BotonB variante="verde" icono="billetera" onClick={() => setCobrando(true)}>
              Cobrar {fmtMoney(precio.precio)} y abrir
            </BotonB>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Cómo se cobra" className="space-y-3">
          <TarjetaRadio
            activo={modo === "libre"}
            titulo="Tiempo libre"
            texto="Se cobra al cerrar, según lo jugado."
            onClick={() => setModo("libre")}
          />
          <TarjetaRadio
            activo={modo === "fijo"}
            titulo="Tiempo fijo"
            texto="Eligen cuántas horas. Corre la cuenta regresiva y avisa antes de terminar. Pueden pagar ahora o al final."
            onClick={() => setModo("fijo")}
          >
            <SelectorHoras
              tipo={tipo}
              horas={horas}
              otra={otra}
              onElegir={(h, o) => {
                setHoras(h);
                setOtra(o);
              }}
            />
          </TarjetaRadio>
        </div>

        {modo === "libre" && promoLibre && (
          <Nota icono="checkCirculo">
            <b>{promoLibre.nombre}:</b> si juegan {promoLibre.desde} h o más, el tiempo sale {promoLibre.pct} % más barato.
          </Nota>
        )}
        {modo === "fijo" && precio.promo && (
          <Nota icono="checkCirculo">
            <b>{precio.promo.nombre}:</b> {fmtMoney(precio.bruto)} → {fmtMoney(precio.precio)}
          </Nota>
        )}
        <ReglaTarifa tipo={tipo} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
              Cliente <span className="font-normal text-texto-4">(opcional)</span>
            </span>
            <Input value={cliente} onChange={(ev) => setCliente(ev.target.value)} placeholder="Nombre" />
          </label>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
              Garantía <span className="font-normal text-texto-4">(opcional)</span>
            </span>
            <Segmentado<Garantia>
              etiqueta="Garantía"
              valor={garantia}
              onCambiar={setGarantia}
              opciones={[
                { valor: "Ninguna", texto: "Ninguna" },
                { valor: "Carnet", texto: "Carnet" },
                { valor: "Otro", texto: "Otro" },
              ]}
            />
          </div>
        </div>
        {garantia === "Otro" && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">¿Qué deja en garantía?</span>
            <Input value={queDeja} onChange={(ev) => setQueDeja(ev.target.value)} placeholder="Ej. llaves, celular" />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
            Nota <span className="font-normal text-texto-4">(opcional)</span>
          </span>
          <Input value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Algo que el turno deba saber" />
        </label>
      </div>
    </Modal>
  );
}

export function ModalExtender({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const e = useBillar();
  const tipo = tipoDe(e, mesa);
  const [horas, setHoras] = useState(1);
  const [otra, setOtra] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const precio = precioFijo(tipo, horas);
  const cobro = useCobro(precio.precio);
  const s = mesa.sesion;

  const extender = (conPago: boolean) => {
    billar.extender(mesa.id, horas, conPago && cobro.pago ? cobro.pago : undefined);
    onClose();
  };

  if (!s?.prepago) return null;

  return (
    <Modal
      abierto
      titulo={`Extender Mesa ${mesa.id}`}
      subtitulo={`Tiene ${s.prepago.min / 60} h de tiempo fijo. Se suman las horas y los avisos vuelven a empezar.`}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      ancho="max-w-lg"
      acciones={
        cobrando ? (
          <>
            <BotonB icono="arrowLeft" onClick={() => setCobrando(false)}>
              Volver
            </BotonB>
            <BotonB variante="verde" icono="check" disabled={!cobro.pago} onClick={() => extender(true)}>
              Cobrar {fmtMoney(precio.precio)} y extender
            </BotonB>
          </>
        ) : (
          <>
            <BotonB onClick={onClose}>Cancelar</BotonB>
            <BotonB icono="clock" onClick={() => extender(false)}>
              Sumar · cobrar al final
            </BotonB>
            <BotonB variante="verde" icono="billetera" onClick={() => setCobrando(true)}>
              Cobrar {fmtMoney(precio.precio)} y extender
            </BotonB>
          </>
        )
      }
    >
      {cobrando ? (
        <FormCobro cobro={cobro} />
      ) : (
        <div className="space-y-4">
          <SelectorHoras
            tipo={tipo}
            horas={horas}
            otra={otra}
            prefijo="+"
            onElegir={(h, o) => {
              setHoras(h);
              setOtra(o);
            }}
          />
          <ReglaTarifa tipo={tipo} />
        </div>
      )}
    </Modal>
  );
}
