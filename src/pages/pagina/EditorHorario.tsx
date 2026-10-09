import { useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Modal, Select } from "../../components/ui";
import type { Paleta } from "../../lib/pagina/aspecto";
import {
  agregarCorte,
  errorDelDia,
  horaCorta,
  NOMBRE_DIA,
  NOMBRE_DIA_MAYUSCULA,
  normalizarHorario,
  opcionesHora,
  resumenHorario,
  semanaDesdeTramos,
  TRAMO_POR_DEFECTO,
  tramosDesdeSemana,
  type DiaEditor,
  type Tramo,
} from "../../lib/pagina/horario";

/**
 * El horario por día de una sucursal en "Mi página". Como lo pidió el dueño:
 * en la pantalla, una fila con el resumen ("Lun a vie 9:00–20:00 · Sáb
 * 9:00–13:00"); al tocarla, el popup con los 7 días. "Listo" lo lleva al
 * borrador de la sucursal y se guarda con "Guardar cambios", como el resto.
 */
export default function EditorHorario({
  nombre,
  valor,
  c,
  onCambio,
}: {
  /** El de la sucursal: va en el título del popup y en las etiquetas. */
  nombre: string;
  valor: Tramo[] | null;
  /** El color de la página: el switch prendido en el acento, los enlaces en el oscuro (se leen). */
  c: Paleta;
  onCambio: (tramos: Tramo[] | null) => void;
}) {
  const [semana, setSemana] = useState<DiaEditor[] | null>(null);
  const resumen = resumenHorario(valor);

  const abrir = () => setSemana(semanaDesdeTramos(valor));
  const cerrar = () => setSemana(null);

  const cambiarDia = (dia: number, cambio: (d: DiaEditor) => DiaEditor) =>
    setSemana((s) => s && s.map((d) => (d.dia === dia ? cambio(d) : d)));

  const alternar = (d: DiaEditor) =>
    cambiarDia(d.dia, (x) => {
      if (x.abierto) return { ...x, abierto: false };
      if (x.tramos.length > 0) return { ...x, abierto: true };
      // Al abrir un día nuevo se copia el último día abierto antes que él: se
      // carga la semana de corrido sin repetir las mismas horas.
      const previo = [...(semana ?? [])].reverse().find((p) => p.dia < x.dia && p.abierto && p.tramos.length > 0);
      return { ...x, abierto: true, tramos: previo ? previo.tramos.map((t) => ({ ...t })) : [{ ...TRAMO_POR_DEFECTO }] };
    });

  const copiarAHabiles = () =>
    setSemana((s) => {
      if (!s) return s;
      const lunes = s[0];
      return s.map((d) => (d.dia >= 2 && d.dia <= 5 ? { ...d, abierto: lunes.abierto, tramos: lunes.tramos.map((t) => ({ ...t })) } : d));
    });

  const errores = (semana ?? []).map(errorDelDia);
  const listo = () => {
    // Con un error el popup queda abierto: el mensaje ya está en su día.
    if (!semana || errores.some(Boolean)) return;
    try {
      onCambio(normalizarHorario(tramosDesdeSemana(semana)));
      cerrar();
    } catch {
      // errorDelDia ya revisa cada día; lo de la lista entera (más de 14
      // tramos) no puede salir de este popup.
    }
  };
  const quitar = () => {
    onCambio(null);
    cerrar();
  };

  return (
    <>
      <div className="space-y-1.5">
        <span className="block text-[13px] font-semibold text-texto-2">Horario de atención</span>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`Horario de ${nombre}: ${resumen ?? "sin horario cargado"}. Cambiar`}
          onClick={abrir}
          className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-borde bg-white px-3 py-2 text-left transition-colors hover:bg-muted"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted" aria-hidden="true">
            <Icon name="clock" size={18} color={resumen ? c.oscuro : "#94A3B8"} />
          </span>
          <span className={`min-w-0 flex-1 text-sm ${resumen ? "font-semibold text-texto" : "text-texto-3"}`}>
            {resumen ?? "Sin horario cargado"}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-texto-3">
            {resumen ? "Cambiar" : "Cargar"}
            <Icon name="chevronRight" size={15} />
          </span>
        </button>
        <span className="block text-xs text-texto-4">Con esto tu página muestra «Abierto ahora» o «Cerrado».</span>
      </div>

      <Modal
        abierto={semana !== null}
        titulo={`Horario de ${nombre}`}
        subtitulo="Tus clientes ven «Abierto ahora · cierra 20:00» o cuándo volvés a abrir."
        onClose={cerrar}
        ancho="max-w-2xl"
        cerrarAlClicAfuera={false}
        acciones={
          <>
            {valor && (
              <Boton variante="ghost" className="mr-auto !text-danger-text" onClick={quitar}>
                Quitar horario
              </Boton>
            )}
            <Boton variante="ghost" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton onClick={listo}>Listo</Boton>
          </>
        }
      >
        <ul className="divide-y divide-borde-soft" aria-label="Días de la semana">
          {(semana ?? []).map((d, i) => (
            <FilaDia
              key={d.dia}
              d={d}
              c={c}
              error={errores[i]}
              onAlternar={() => alternar(d)}
              onCambio={(tramos) => cambiarDia(d.dia, (x) => ({ ...x, tramos }))}
              onCopiar={d.dia === 1 ? copiarAHabiles : undefined}
            />
          ))}
        </ul>
        <p className="mt-3 text-xs text-texto-4">
          ¿Cerrás pasada la medianoche? Cargá hasta las 24:00 y seguí el día siguiente desde las 0:00: la página lo
          lee como un solo horario.
        </p>
      </Modal>
    </>
  );
}

/** Un día: abierto o cerrado, sus horas y, si hay, su error. */
function FilaDia({
  d,
  c,
  error,
  onAlternar,
  onCambio,
  onCopiar,
}: {
  d: DiaEditor;
  c: Paleta;
  error: string | null;
  onAlternar: () => void;
  onCambio: (tramos: DiaEditor["tramos"]) => void;
  /** Sólo el lunes: "Copiar a todos los días hábiles". */
  onCopiar?: () => void;
}) {
  const nombre = NOMBRE_DIA_MAYUSCULA[d.dia];
  const delDia = NOMBRE_DIA[d.dia];
  const cambiarTramo = (i: number, campo: "desde" | "hasta", hora: string) =>
    onCambio(d.tramos.map((t, j) => (j === i ? { ...t, [campo]: hora } : t)));
  const idError = `horario-error-${d.dia}`;

  const select = "w-full sm:w-28";
  const agregar = d.tramos.length < 2 && (
    <button
      type="button"
      onClick={() => onCambio(agregarCorte(d.tramos))}
      // En el celular baja a su propia línea; en la computadora queda al lado de las horas.
      className="min-h-9 basis-full whitespace-nowrap text-left text-[13px] font-semibold sm:basis-auto sm:pl-1"
      style={{ color: c.oscuro }}
      aria-label={`Agregar corte el ${delDia}`}
    >
      + Agregar corte
    </button>
  );

  return (
    // En la computadora es una tabla: día y switch a la izquierda, las horas
    // al lado con su ancho justo (no estiradas); en el celular, una debajo de otra.
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-h-11 items-center justify-between gap-3 sm:w-52 sm:shrink-0">
        <strong className="text-sm text-texto sm:w-24">{nombre}</strong>
        <button
          type="button"
          role="switch"
          aria-checked={d.abierto}
          aria-label={`${nombre} abierto`}
          onClick={onAlternar}
          className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-texto-2 sm:flex-1"
        >
          <span
            aria-hidden="true"
            className="relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors"
            style={{ background: d.abierto ? c.acento : "#CBD5E1" }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]"
              style={{ left: d.abierto ? 18 : 2 }}
            />
          </span>
          <span className="w-14 text-left">{d.abierto ? "Abierto" : "Cerrado"}</span>
        </button>
      </div>

      {d.abierto && (
        <div className="min-w-0 flex-1 space-y-2">
          {d.tramos.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="min-w-0 flex-1 sm:flex-none">
                <Select
                  className={select}
                  aria-label={`${nombre}: abre${i === 1 ? " (después del corte)" : ""}`}
                  aria-describedby={error ? idError : undefined}
                  value={t.desde}
                  onChange={(ev) => cambiarTramo(i, "desde", ev.target.value)}
                >
                  {opcionesHora(false, t.desde).map((h) => (
                    <option key={h} value={h}>
                      {horaCorta(h)}
                    </option>
                  ))}
                </Select>
              </div>
              <span className="text-[13px] text-texto-3">a</span>
              <div className="min-w-0 flex-1 sm:flex-none">
                <Select
                  className={select}
                  aria-label={`${nombre}: cierra${i === 1 ? " (después del corte)" : ""}`}
                  aria-describedby={error ? idError : undefined}
                  value={t.hasta}
                  onChange={(ev) => cambiarTramo(i, "hasta", ev.target.value)}
                >
                  {opcionesHora(true, t.hasta).map((h) => (
                    <option key={h} value={h}>
                      {h === "24:00" ? "24:00 (medianoche)" : horaCorta(h)}
                    </option>
                  ))}
                </Select>
              </div>
              {d.tramos.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Quitar el ${i === 0 ? "primer" : "segundo"} horario del ${delDia}`}
                  onClick={() => onCambio(d.tramos.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-texto-3 hover:bg-muted"
                >
                  <Icon name="close" size={16} />
                </button>
              ) : (
                agregar
              )}
            </div>
          ))}
          {onCopiar && (
            <button type="button" onClick={onCopiar} className="min-h-9 text-[13px] font-semibold" style={{ color: c.oscuro }}>
              Copiar a todos los días hábiles
            </button>
          )}
          {error && (
            <p id={idError} role="alert" className="text-xs text-danger-text">
              {error}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
