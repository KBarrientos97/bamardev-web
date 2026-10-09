import type { ReactNode } from "react";

/** Una tarjeta del editor "Mi página": título, acciones a la derecha y contenido. */
export default function Seccion({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-texto">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}
