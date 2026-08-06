// app/(app)/inspections/[id]/checklist/checklist-nav-group.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SEM_SUBCATEGORIA_PARAM } from "@/lib/checklist/progress";

export type NavSubcategoria = {
  subcategoria: string | null;
  pendentes: number;
};

export type NavGroup = {
  id: string;
  nome: string;
  pendentes: number;
};

export function ChecklistNavGroup({
  inspectionId,
  group,
  subcategorias,
}: {
  inspectionId: string;
  group: NavGroup;
  subcategorias: NavSubcategoria[];
}) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(`/inspections/${inspectionId}/checklist/${group.id}`);

  return (
    <li>
      <Link href={`/inspections/${inspectionId}/checklist/${group.id}`} className="checklist-nav__link">
        <span
          className={`checklist-nav__status ${group.pendentes === 0 ? "checklist-nav__status--done" : "checklist-nav__status--pending"}`}
          aria-hidden="true"
        >
          {group.pendentes === 0 ? "✓" : group.pendentes}
        </span>
        <span className="sr-only">{group.pendentes === 0 ? "Concluído: " : `${group.pendentes} pendentes: `}</span>
        {group.nome}
      </Link>
      {isActive && subcategorias.length > 0 && (
        <ul className="checklist-nav__sublist">
          {subcategorias.map((sub) => {
            const subParam = sub.subcategoria ?? SEM_SUBCATEGORIA_PARAM;
            return (
              <li key={subParam}>
                <Link
                  href={`/inspections/${inspectionId}/checklist/${group.id}?sub=${encodeURIComponent(subParam)}`}
                  className="checklist-nav__sublink"
                >
                  <span className="checklist-nav__connector" aria-hidden="true">
                    ↳
                  </span>
                  <span
                    className={`checklist-nav__substatus ${sub.pendentes === 0 ? "checklist-nav__substatus--done" : "checklist-nav__substatus--pending"}`}
                    aria-hidden="true"
                  >
                    {sub.pendentes === 0 ? "✓" : sub.pendentes}
                  </span>
                  <span className="sr-only">{sub.pendentes === 0 ? "Concluído: " : `${sub.pendentes} pendentes: `}</span>
                  {sub.subcategoria ?? "Sem subcategoria"}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
