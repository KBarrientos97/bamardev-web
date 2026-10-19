import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Input, Modal } from "../../components/ui";
import { quedoEnDuda } from "../../lib/cupo";
import { fmtMoney } from "../../lib/format";
import { useBloqueoCupo } from "../../lib/useBloqueoCupo";
import { precioFijo, precioHoras, promoPara } from "./calculo";
import { opcionesHoras } from "./ModalTiempo.datos";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { CambioDelCobro, FormCobro } from "./Cobro";
import { useCobro } from "./useCobro";
import { useAccion } from "./useAccion";
import { huellaExtension } from "./reintentos";
import { billar, tipoDe, useBillar } from "./store";
import type { Mesa, TipoMesa } from "./tipos";
import { BotonB, ErrorAccion, Nota, Segmentado } from "./ui";

/**
 * Abrir una mesa (§7.2) y extender su tiempo fijo (§7.3). Comparten el
 * selector de horas: 1, 2 y 3 h siempre, más los paquetes (`opcionesHoras`),
 * y "Otra cantidad" de 1 a 24 h con la combinación más barata.
 */

const MAX_HORAS = 24;

/**
 * "Cobrar Bs X y abrir" cambia el diálogo por el cobro, y el botón de
 * confirmar cae justo donde estaba el que se tocó: en el celular un doble
 * toque registraba efectivo justo sin que nadie viera el formulario. El de
 * confirmar no escucha durante este rato después de aparecer.
 */
const PAUSA_DOBLE_TOQUE_MS = 600;

function useCobroSinDobleToque() {
  const [cobrando, setCobrandoInterno] = useState(false);
  const desde = useRef(0);
  const setCobrando = (v: boolean) => {
    desde.current = Date.now();
    setCobrandoInterno(v);
  };
  const recienAbierto = () => Date.now() - desde.current < PAUSA_DOBLE_TOQUE_MS;
  return { cobrando, setCobrando, recienAbierto };
}

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
  const opciones = opcionesHoras(tipo);
  const elegida = otra ? null : opciones.find((o) => o.h === horas);
  const chip = (activo: boolean) =>
    `inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold tabular-nums transition-colors ${
      activo ? "bg-primary-boton text-white" : "bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
    }`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => {
          const activo = !otra && horas === o.h;
          return (
            <button key={o.h} type="button" aria-pressed={activo} onClick={() => onElegir(o.h, false)} className={chip(activo)}>
              {prefijo}
              {o.h} h · {fmtMoney(o.precio)}
              {/* El paquete con precio especial se marca: es la oferta que armó el negocio. */}
              {o.especial && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold uppercase leading-[18px] tracking-wide ${
                    activo ? "bg-white/25 text-white" : "bg-primary-50 text-primary-700"
                  }`}
                >
                  Paquete
                </span>
              )}
            </button>
          );
        })}
        <button type="button" aria-pressed={otra} onClick={() => onElegir(Math.max(horas, 4), true)} className={chip(otra)}>
          <Icon name="edit" size={14} />
          Otra cantidad
        </button>
      </div>
      {elegida && elegida.ahorro > 0 && (
        <p className="text-[12px] text-texto-3">
          {elegida.paquete ? `Paquete de ${elegida.h} h` : `Con paquetes (${precioHoras(tipo, elegida.h).partes.join(" + ")})`}:
          ahorran {fmtMoney(elegida.ahorro)} contra la tarifa por hora.
        </p>
      )}
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
  const { cobrando, setCobrando, recienAbierto } = useCobroSinDobleToque();
  const precio = precioFijo(tipo, horas);
  const cobro = useCobro(precio.precio);
  const promoLibre = promoPara(tipo, Number.POSITIVE_INFINITY);
  const accion = useAccion();
  // El mismo id si se reintenta la MISMA apertura: si la primera entró y se
  // perdió la respuesta, el backend devuelve la mesa ya abierta en vez de
  // decir "ocupada" (y no cobra dos veces el tiempo fijo).
  const intento = useIntentoDeCobro();
  /**
   * Plan Emprendedor (D29): abrir una mesa ocupa un lugar del cupo de ventas
   * del día, como cobrar en el POS (el cierre después no consume ni se
   * rechaza nunca). Sin lugar ni créditos se abre la misma hoja de comprar
   * créditos que en el POS y no se manda nada. Sin cupo (Básico,
   * Profesional) deja pasar todo y no pide nada: el billar queda como siempre.
   */
  const {
    verificar: hayLugarParaAbrir,
    manejarError: rechazoPorCupo,
    registrar: registrarConsumo,
  } = useBloqueoCupo("VENTA", { refrescarAlMontar: true });
  // El intento anterior quedó sin respuesta (corte, 5xx): pudo haber abierto
  // la mesa con el último lugar del día. El reintento lleva el mismo
  // `clienteRequestId` y el backend devuelve la mesa ya abierta sin consumir
  // de nuevo, así que va al servidor aunque el contador diga lleno (como en el POS).
  const abrirEnDuda = useRef(false);
  /**
   * Bloqueado por el cupo, este diálogo se cierra y queda sólo la hoja de
   * compra: una sola capa. Con "Abrir Mesa N" abierto detrás, al cerrar la
   * hoja el cajero volvía a un diálogo sin saber por qué (QA del 19-oct).
   * Después de comprar, vuelve a tocar "Abrir mesa".
   */
  const hayLugar = () => {
    if (abrirEnDuda.current || hayLugarParaAbrir()) return true;
    onClose();
    return false;
  };

  const abrirMesa = async (conPago: boolean) => {
    if (!hayLugar()) return;
    const pago = conPago && cobro.pago ? cobro.pago : undefined;
    const ok = await accion.ejecutar(
      async () => {
        const r = await billar.abrir(mesa.id, {
          modo,
          horas: modo === "fijo" ? horas : undefined,
          pago,
          cliente,
          garantia: garantia === "Otro" ? queDeja.trim() || "Otro" : garantia,
          nota,
          clienteRequestId: intento.actual(`abrir:${mesa.idInterno}:${modo}:${modo === "fijo" ? horas : 0}:${!!pago}`),
        });
        registrarConsumo(r);
      },
      (err) => {
        abrirEnDuda.current = quedoEnDuda(err);
        // Otro equipo usó el último lugar del día (403 CUPO_AGOTADO): la hoja
        // de compra en vez del cartel rojo y, como en el chequeo local, el
        // diálogo se cierra (ver `hayLugar`). No se abrió nada: no hay intento
        // que conservar.
        if (!rechazoPorCupo(err)) return false;
        onClose();
        return true;
      },
    );
    if (!ok) return;
    abrirEnDuda.current = false;
    intento.registrado();
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
            <CambioDelCobro cobro={cobro} />
            <BotonB icono="arrowLeft" onClick={() => setCobrando(false)}>
              Volver
            </BotonB>
            <BotonB variante="verde" icono="check" disabled={!cobro.pago || accion.enviando} onClick={() => !recienAbierto() && abrirMesa(true)}>
              {accion.enviando ? "Abriendo…" : `Cobrar ${fmtMoney(precio.precio)} y abrir`}
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
        <FormCobro cobro={cobro} cambioEnElPie />
        <ErrorAccion texto={accion.error} />
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
            <BotonB variante="verde" icono="play" disabled={accion.enviando} onClick={() => abrirMesa(false)}>
              {accion.enviando ? "Abriendo…" : "Abrir mesa y arrancar"}
            </BotonB>
          </>
        ) : (
          <>
            <BotonB onClick={onClose}>Cancelar</BotonB>
            <BotonB icono="clock" disabled={accion.enviando} onClick={() => abrirMesa(false)}>
              {accion.enviando ? "Abriendo…" : "Abrir · cobrar al final"}
            </BotonB>
            {/* Sin lugar en el cupo, la hoja de compra (y el diálogo se cierra)
                antes de pasar al cobro: no hacerle cargar el pago al cajero
                para rebotar al final. */}
            <BotonB variante="verde" icono="billetera" onClick={() => hayLugar() && setCobrando(true)}>
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
      <ErrorAccion texto={accion.error} />
    </Modal>
  );
}

export function ModalExtender({ mesa, onClose }: { mesa: Mesa; onClose: () => void }) {
  const e = useBillar();
  const tipo = tipoDe(e, mesa);
  const [horas, setHoras] = useState(1);
  const [otra, setOtra] = useState(false);
  const { cobrando, setCobrando, recienAbierto } = useCobroSinDobleToque();
  const precio = precioFijo(tipo, horas);
  const cobro = useCobro(precio.precio);
  const s = mesa.sesion;
  const accion = useAccion();
  // El mismo id si se reintenta la MISMA extensión: con wifi malo la
  // respuesta se perdía, el cajero volvía a tocar y se sumaban las horas (y
  // su cobro) dos veces.
  const intento = useIntentoDeCobro();

  const extender = async (conPago: boolean) => {
    if (!s) return;
    const pago = conPago && cobro.pago ? cobro.pago : undefined;
    const clave = intento.actual(huellaExtension(s.id, horas, pago));
    if (!(await accion.ejecutar(() => billar.extender(mesa.id, horas, pago, clave)))) return;
    intento.registrado();
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
            <CambioDelCobro cobro={cobro} />
            <BotonB icono="arrowLeft" onClick={() => setCobrando(false)}>
              Volver
            </BotonB>
            <BotonB variante="verde" icono="check" disabled={!cobro.pago || accion.enviando} onClick={() => !recienAbierto() && extender(true)}>
              {accion.enviando ? "Extendiendo…" : `Cobrar ${fmtMoney(precio.precio)} y extender`}
            </BotonB>
          </>
        ) : (
          <>
            <BotonB onClick={onClose}>Cancelar</BotonB>
            <BotonB icono="clock" disabled={accion.enviando} onClick={() => extender(false)}>
              {accion.enviando ? "Extendiendo…" : "Sumar · cobrar al final"}
            </BotonB>
            <BotonB variante="verde" icono="billetera" onClick={() => setCobrando(true)}>
              Cobrar {fmtMoney(precio.precio)} y extender
            </BotonB>
          </>
        )
      }
    >
      {cobrando ? (
        <FormCobro cobro={cobro} cambioEnElPie />
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
      <ErrorAccion texto={accion.error} />
    </Modal>
  );
}
