/**
 * PB-5 · FotoPremio — seletor, upload client e preview na T2 (SPEC §3.3/§4.12).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FotoPremio } from "@/components/FotoPremio";

const mocks = vi.hoisted(() => ({
  enviarFoto: vi.fn(),
  comprimirImagemPremio: vi.fn(),
}));

vi.mock("@/actions/fotos", () => ({ enviarFoto: mocks.enviarFoto }));
vi.mock("@/lib/imagem", () => ({ comprimirImagemPremio: mocks.comprimirImagemPremio }));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.enviarFoto.mockReset();
  mocks.comprimirImagemPremio.mockReset();
});

describe("FotoPremio · upload e preview", () => {
  it("deve enviar foto comprimida, guardar a URL no formulário e mostrar preview", async () => {
    const arquivoComprimido = new File(["webp"], "premio.webp", { type: "image/webp" });
    mocks.comprimirImagemPremio.mockResolvedValue(arquivoComprimido);
    mocks.enviarFoto.mockResolvedValue({
      ok: true,
      mensagem: "Foto enviada com sucesso.",
      imagemUrl: "https://rifa.supabase.co/storage/v1/object/public/premios/org/premio.webp",
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:foto-local");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(<FotoPremio />);
    const seletor = screen.getByLabelText("Escolher foto do prêmio");
    expect(seletor).toHaveAttribute("accept", "image/*");
    expect(seletor).toHaveAttribute("capture", "environment");
    const arquivoOriginal = new File(["jpg"], "premio.jpg", { type: "image/jpeg" });
    fireEvent.change(seletor, { target: { files: [arquivoOriginal] } });

    await waitFor(() =>
      expect(
        screen.getByDisplayValue(
          "https://rifa.supabase.co/storage/v1/object/public/premios/org/premio.webp",
        ),
      ).toBeInTheDocument(),
    );
    expect(mocks.comprimirImagemPremio).toHaveBeenCalledWith(arquivoOriginal);
    expect(mocks.enviarFoto).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: "Prévia da foto do prêmio" })).toHaveAttribute(
      "src",
      "https://rifa.supabase.co/storage/v1/object/public/premios/org/premio.webp",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Foto enviada com sucesso.");
  });

  it("deve exibir imagem já salva e recusar arquivo acima de 5 MB antes do envio", () => {
    render(<FotoPremio imagemInicial="https://rifa.supabase.co/premios/existente.webp" />);
    expect(screen.getByDisplayValue("https://rifa.supabase.co/premios/existente.webp")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Prévia da foto do prêmio" })).toHaveAttribute(
      "src",
      "https://rifa.supabase.co/premios/existente.webp",
    );

    const seletor = screen.getByLabelText("Escolher foto do prêmio");
    const arquivoGrande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(seletor, { target: { files: [arquivoGrande] } });

    expect(screen.getByRole("alert")).toHaveTextContent("A foto deve ter no máximo 5 MB.");
    expect(mocks.comprimirImagemPremio).not.toHaveBeenCalled();
    expect(mocks.enviarFoto).not.toHaveBeenCalled();
  });
});
