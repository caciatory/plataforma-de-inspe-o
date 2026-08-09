"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminInspectionRow } from "@/lib/inspection/admin-list";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};

type SortKey = "data" | "nota" | "status";

export function InspectionsTable({ rows }: { rows: AdminInspectionRow[] }) {
  const [query, setQuery] = useState("");
  const [tecnicoFiltro, setTecnicoFiltro] = useState("");
  const [tipoClienteFiltro, setTipoClienteFiltro] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("data");

  const tecnicos = Array.from(new Set(rows.map((r) => r.tecnicoNome))).sort();

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = q === "" || r.matricula.toLowerCase().includes(q) || r.marcaModelo.toLowerCase().includes(q);
    const matchesTecnico = tecnicoFiltro === "" || r.tecnicoNome === tecnicoFiltro;
    const matchesTipoCliente = tipoClienteFiltro === "" || r.tipoCliente === tipoClienteFiltro;
    return matchesQuery && matchesTecnico && matchesTipoCliente;
  });

  const sorted = filtered.slice().sort((a, b) => {
    if (sortKey === "nota") return (b.nota ?? -1) - (a.nota ?? -1);
    if (sortKey === "status") return a.status.localeCompare(b.status);
    return b.dataAbertura.localeCompare(a.dataAbertura);
  });

  return (
    <div className="stack">
      <div className="filter-bar">
        <input
          className="input"
          placeholder="Buscar por matrícula ou modelo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar"
        />
        <select className="input" value={tecnicoFiltro} onChange={(e) => setTecnicoFiltro(e.target.value)} aria-label="Filtrar por técnico">
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={tipoClienteFiltro}
          onChange={(e) => setTipoClienteFiltro(e.target.value)}
          aria-label="Filtrar por tipo de cliente"
        >
          <option value="">Todos os tipos</option>
          <option value="particular">Particular</option>
          <option value="stand">Stand</option>
        </select>
        <select className="input" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Ordenar por">
          <option value="data">Data</option>
          <option value="nota">Nota</option>
          <option value="status">Estado</option>
        </select>
      </div>
      <table className="item-table">
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Veículo</th>
            <th>Técnico</th>
            <th>Estado</th>
            <th>Nota</th>
            <th>Data</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td>{r.matricula}</td>
              <td>{r.marcaModelo}</td>
              <td>{r.tecnicoNome}</td>
              <td>
                {STATUS_LABEL[r.status] ?? r.status}
                {r.atrasada && <span className="status-pill status-pill--danger"> Atrasada</span>}
              </td>
              <td>{r.nota !== null ? `${r.nota.toFixed(1)} (${r.classificacao})` : "—"}</td>
              <td>{r.dataAbertura}</td>
              <td>
                <Link href={`/inspections/${r.id}`} className="btn btn-secondary">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma inspeção encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
