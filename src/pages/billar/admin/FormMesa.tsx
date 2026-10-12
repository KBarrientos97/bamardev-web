import { useState, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { Confirmar, Input } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { horaDe } from "../calculo";
import { CampoBs } from "../Cobro";
import { billar, siguienteNumero, tarifaVigente, useBillar } from "../store";
import { BotonB, Circulo, Nota, Segmentado } from "../ui";
import { borradorMesa, datosMesa, erroresMesa, type BorradorMesa, type EstadoAdmin } from "./borrador";
import { ErrorCampo, Etiqueta } from "./piezas";

/**
 * Nueva mesa / Editar mesa (§7.14): el formulario va ANTES de crear (no se
 * crea al tocar el botón). Con la mesa en juego sólo se cambian el apodo y la
 * tarifa —que corre desde la próxima vez que se abra—: el número, el tipo y
 * el estado esperan a que se cierre.
 *
 * La sucursal no se elige acá: la mesa se crea en el local en que se está,
 * como en Mesas del salón.
 */
export function FormMesa({
  mesaId,
  onCerrar,
  onListo,
}: {
  /** null = nueva. */
  mesaId: number | null;
  onCerrar: () => void;
  /** El mensaje para el aviso de la pantalla ("Mesa 9 creada."). */
  onListo: (mensaje: string) => void;
}) {
  const e = useBillar();
  const mesa = mesaId === null ? null : (e.admin.mesas.find((m) => m.id === mesaId) ?? null);
  const tipos = Object.values(e.tipos);
  const [inicial] = useState(() => borradorMesa(mesa, siguienteNumero(e.admin.mesas), tipos[0]?.id ?? ""));
  const [enviando, setEnviando] = useState(false);
  const [b, setB] = useState<BorradorMesa>(inicial);
  const [tocado, setTocado] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState("");
  const [confirmar, setConfirmar] = useState<"descartar" | "eliminar" | null>(null);

  const enJuego = mesa?.estado === "abierta";
  const errores = erroresMesa(b, e, mesaId);
  const hayErrores = Object.keys(errores).length > 0;
  const cambiado = JSON.stringify(b) !== JSON.stringify(inicial);
  const tipo = e.tipos[b.tipo] ?? tipos[0];
  const delTipo = tipo ? tarifaVigente(e, { tipo: tipo.id }) : null;
  const pierdeReserva = mesa?.estado === "reservada" && b.estado !== "activa";

  const poner = (cambio: Partial<BorradorMesa>) => {
    setErrorGuardar("");
    setB((x) => ({ ...x, ...cambio }));
  };

  const guardar = async () => {
    setTocado(true);
    if (hayErrores || enviando) return;
    const datos = datosMesa(b);
    setEnviando(true);
    const error = mesa ? await billar.editarMesa(mesa.id, datos) : await billar.crearMesa(datos);
    setEnviando(false);
    if (error) return setErrorGuardar(error);
    onListo(mesa ? `Mesa ${datos.numero} guardada.` : `Mesa ${datos.numero} creada.`);
  };

  const salir = () => (cambiado ? setConfirmar("descartar") : onCerrar());

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-borde px-5 py-4">
        <Circulo icono={mesa ? "edit" : "plus"} />
        <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold text-texto">
          {mesa ? `Editar Mesa ${mesa.id}` : "Nueva mesa"}
        </h2>
        <button
          type="button"
          onClick={salir}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-texto-3 ring-1 ring-inset ring-borde hover:bg-muted"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {enJuego && (
          <Nota tono="ambar" icono="bola">
            La Mesa {mesa.id} está en juego: el número, el tipo y el estado se cambian cuando se cierre. Si cambiás la
            tarifa, corre desde la próxima vez que se abra.
          </Nota>
        )}

        <div className="grid grid-cols-[6.5rem_1fr] gap-3">
          <div>
            <Etiqueta>Número</Etiqueta>
            <Input
              aria-label="Número"
              inputMode="numeric"
              value={b.numero}
              disabled={enJuego}
              onChange={(ev) => poner({ numero: ev.target.value.replace(/\D/g, "").slice(0, 3) })}
              className="tabular-nums"
            />
          </div>
          <div>
            <Etiqueta opcional>Apodo</Etiqueta>
            <Input
              aria-label="Apodo"
              value={b.alias}
              maxLength={30}
              placeholder="Ej. Mesa VIP, la del fondo"
              onChange={(ev) => poner({ alias: ev.target.value })}
            />
          </div>
          <div className="col-span-2 -mt-2">
            {tocado && errores.numero ? (
              <ErrorCampo>{errores.numero}</ErrorCampo>
            ) : (
              <p className="text-xs text-texto-4">El cajero ve el apodo debajo del número en el tablero.</p>
            )}
          </div>
        </div>

        <div>
          <Etiqueta>Tipo</Etiqueta>
          <fieldset disabled={enJuego} className={enJuego ? "opacity-60" : ""}>
            <Segmentado
              etiqueta="Tipo de mesa"
              opciones={tipos.map((t) => ({ valor: t.id, texto: t.nombre }))}
              valor={b.tipo}
              onCambiar={(v) => poner({ tipo: v })}
            />
          </fieldset>
        </div>

        <div>
          <Etiqueta>Tarifa</Etiqueta>
          <div role="radiogroup" aria-label="Tarifa" className="space-y-2">
            <OpcionTarifa
              activa={b.tarifaPropia === null}
              onElegir={() => poner({ tarifaPropia: null })}
              titulo={`Usar la del tipo · ${delTipo ? fmtMoney(delTipo.tarifa) : ""}/h`}
              texto={`Si cambiás la tarifa de ${tipo?.nombre ?? "este tipo"}, esta mesa la sigue.`}
            />
            <OpcionTarifa
              activa={b.tarifaPropia !== null}
              onElegir={() => b.tarifaPropia === null && poner({ tarifaPropia: "" })}
              titulo="Tarifa propia"
              texto="Solo para esta mesa."
            >
              {b.tarifaPropia !== null && (
                <div className="mt-3">
                  <CampoBs
                    etiqueta="Tarifa propia por hora"
                    valor={b.tarifaPropia}
                    onCambiar={(t) => poner({ tarifaPropia: t })}
                    placeholder={delTipo ? String(delTipo.tarifa) : ""}
                    autoFocus
                  />
                  {tocado && <ErrorCampo>{errores.tarifa}</ErrorCampo>}
                  <p className="mt-1 text-xs text-texto-4">Bs por hora. Las fracciones, el mínimo y los paquetes siguen siendo los del tipo.</p>
                </div>
              )}
            </OpcionTarifa>
          </div>
        </div>

        <div>
          <Etiqueta>Estado</Etiqueta>
          <fieldset disabled={enJuego} className={enJuego ? "opacity-60" : ""}>
            <Segmentado<EstadoAdmin>
              etiqueta="Estado"
              opciones={[
                { valor: "activa", texto: "Activa" },
                { valor: "fuera", texto: "Fuera de servicio" },
                { valor: "inactiva", texto: "Inactiva" },
              ]}
              valor={b.estado}
              onCambiar={(v) => poner({ estado: v })}
            />
          </fieldset>
          {b.estado === "inactiva" && (
            <p className="mt-1.5 text-xs text-texto-4">
              No sale en el tablero ni en la pantalla del salón. Queda acá para volver a activarla.
            </p>
          )}
        </div>

        {b.estado === "fuera" && (
          <div>
            <Etiqueta>Motivo</Etiqueta>
            <Input
              aria-label="Motivo"
              value={b.motivo}
              maxLength={60}
              disabled={enJuego}
              placeholder="Ej. Cambio de paño"
              onChange={(ev) => poner({ motivo: ev.target.value })}
            />
            <p className="mt-1 text-xs text-texto-4">El cajero lo ve en la tarjeta de la mesa.</p>
          </div>
        )}

        {pierdeReserva && mesa?.reserva && (
          <Nota tono="azul" icono="calendar">
            Tiene una reserva de <b>{mesa.reserva.nombre}</b> a las {horaDe(mesa.reserva.hora)}: se cancela al guardar.
          </Nota>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-borde px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {errorGuardar && (
          <Nota tono="rosa" icono="alert">
            {errorGuardar}
          </Nota>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {mesa && !enJuego && (
            <BotonB variante="rosa" icono="trash" onClick={() => setConfirmar("eliminar")} className="mr-auto">
              Eliminar
            </BotonB>
          )}
          <BotonB onClick={salir} className={mesa && !enJuego ? "" : "ml-auto"}>
            Cancelar
          </BotonB>
          <BotonB variante="verde" icono="check" onClick={() => void guardar()} disabled={(tocado && hayErrores) || enviando}>
            {enviando ? "Guardando…" : mesa ? "Guardar" : "Crear mesa"}
          </BotonB>
        </div>
      </div>

      <Confirmar
        abierto={confirmar === "descartar"}
        titulo="¿Descartar los cambios?"
        texto="Lo que cargaste en el formulario se pierde."
        etiquetaOk="Descartar"
        peligroso
        onCancel={() => setConfirmar(null)}
        onOk={onCerrar}
      />
      <Confirmar
        abierto={confirmar === "eliminar"}
        titulo={`¿Eliminar Mesa ${mesa?.id ?? ""}?`}
        texto="Desaparece del tablero y de la pantalla del salón. Las ventas hechas siguen en el historial. Si es por un arreglo, mejor ponela Fuera de servicio: vuelve cuando quieras."
        etiquetaOk="Eliminar"
        peligroso
        onCancel={() => setConfirmar(null)}
        onOk={async () => {
          if (!mesa || enviando) return;
          setConfirmar(null);
          setEnviando(true);
          const error = await billar.eliminarMesa(mesa.id);
          setEnviando(false);
          if (error) return setErrorGuardar(error);
          onListo(`Mesa ${mesa.id} eliminada.`);
        }}
      />
    </div>
  );
}

function OpcionTarifa({
  activa,
  onElegir,
  titulo,
  texto,
  children,
}: {
  activa: boolean;
  onElegir: () => void;
  titulo: string;
  texto: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-3.5 transition-colors ${
        activa ? "border-primary bg-primary-50/60" : "border-borde hover:bg-muted"
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={activa}
        aria-label={titulo}
        onClick={onElegir}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            activa ? "border-primary-boton" : "border-slate-300"
          }`}
        >
          {activa && <span className="h-2.5 w-2.5 rounded-full bg-primary-boton" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold text-texto">{titulo}</span>
          <span className="block text-[12px] text-texto-3">{texto}</span>
        </span>
      </button>
      {children}
    </div>
  );
}
