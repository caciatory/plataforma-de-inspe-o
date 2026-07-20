import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PhotoManager } from "./photo-manager";

const attachPhotoAction = vi.fn();
const deletePhotoAction = vi.fn();
vi.mock("./actions", () => ({
  attachPhotoAction: (...args: unknown[]) => attachPhotoAction(...args),
  deletePhotoAction: (...args: unknown[]) => deletePhotoAction(...args),
}));

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload, getPublicUrl }),
    },
  }),
}));

beforeEach(() => {
  attachPhotoAction.mockReset();
  deletePhotoAction.mockReset();
  upload.mockReset();
  getPublicUrl.mockReset();
});

describe("PhotoManager", () => {
  it("renders existing photos with a delete button each", () => {
    render(
      <PhotoManager
        inspectionId="insp-1"
        itemTemplateId="item-1"
        initialPhotos={[{ id: "photo-1", url: "https://example.com/a.jpg" }]}
      />
    );

    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1);
  });

  it("uploads a file, attaches it, and adds it to the list", async () => {
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/novo.jpg" } });
    attachPhotoAction.mockResolvedValue({ photoId: "photo-2" });

    render(<PhotoManager inspectionId="insp-1" itemTemplateId="item-1" initialPhotos={[]} />);

    const file = new File(["conteudo"], "foto.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Foto") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(attachPhotoAction).toHaveBeenCalledWith("insp-1", "item-1", "https://example.com/novo.jpg"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1));
  });

  it("removes a photo from the list after a successful delete", async () => {
    deletePhotoAction.mockResolvedValue({});

    render(
      <PhotoManager
        inspectionId="insp-1"
        itemTemplateId="item-1"
        initialPhotos={[{ id: "photo-1", url: "https://example.com/a.jpg" }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Excluir" })).toHaveLength(0));
    expect(deletePhotoAction).toHaveBeenCalledWith("photo-1");
  });
});
