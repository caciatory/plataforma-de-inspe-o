import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistNavGroup } from "./checklist-nav-group";

const subcategorias = [{ subcategoria: "Motor", pendentes: 2 }];

vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

let mockPathname = "";

describe("ChecklistNavGroup", () => {
  it("shows the sublist when the current route is inside this group", () => {
    mockPathname = "/inspections/insp-1/checklist/group-1";
    render(
      <ChecklistNavGroup
        inspectionId="insp-1"
        group={{ id: "group-1", nome: "Exterior", pendentes: 2 }}
        subcategorias={subcategorias}
      />
    );
    expect(screen.getByText("Motor")).toBeInTheDocument();
  });

  it("hides the sublist for a group that isn't the active route", () => {
    mockPathname = "/inspections/insp-1/checklist/group-2";
    render(
      <ChecklistNavGroup
        inspectionId="insp-1"
        group={{ id: "group-1", nome: "Exterior", pendentes: 2 }}
        subcategorias={subcategorias}
      />
    );
    expect(screen.queryByText("Motor")).not.toBeInTheDocument();
  });

  it("keeps the sublist visible when a ?sub= query param is present for the active group", () => {
    mockPathname = "/inspections/insp-1/checklist/group-1";
    render(
      <ChecklistNavGroup
        inspectionId="insp-1"
        group={{ id: "group-1", nome: "Exterior", pendentes: 2 }}
        subcategorias={subcategorias}
      />
    );
    expect(screen.getByText("Motor")).toBeInTheDocument();
  });

  it("shows the pending count and swaps to a checkmark once everything is answered", () => {
    mockPathname = "/inspections/insp-1/checklist/group-2";
    const { rerender } = render(
      <ChecklistNavGroup
        inspectionId="insp-1"
        group={{ id: "group-1", nome: "Exterior", pendentes: 2 }}
        subcategorias={subcategorias}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();

    rerender(
      <ChecklistNavGroup
        inspectionId="insp-1"
        group={{ id: "group-1", nome: "Exterior", pendentes: 0 }}
        subcategorias={subcategorias}
      />
    );
    expect(screen.getByText("✓")).toBeInTheDocument();
  });
});
