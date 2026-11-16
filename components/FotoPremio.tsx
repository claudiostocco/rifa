"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { enviarFoto } from "@/actions/fotos";
import { comprimirImagemPremio } from "@/lib/imagem";
import { TAMANHO_MAXIMO_FOTO } from "@/lib/schemas";

type Props = {
  imagemInicial?: string;
};

export function FotoPremio({ imagemInicial = "" }: Props) {
  const [imagemUrl, setImagemUrl] = useState(imagemInicial);
  const [previaLocal, setPreviaLocal] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [enviando, iniciarEnvio] = useTransition();
  const urlLocal = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlLocal.current) URL.revokeObjectURL(urlLocal.current);
    },
    [],
  );

  function liberarPreviaLocal() {
    if (urlLocal.current) URL.revokeObjectURL(urlLocal.current);
    urlLocal.current = null;
    setPreviaLocal(null);
  }

  function selecionarFoto(arquivo: File | undefined) {
    setMensagem(null);
    setErro(false);
    if (!arquivo) return;

    if (arquivo.size === 0) {
      setErro(true);
      setMensagem("A foto selecionada está vazia.");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_FOTO) {
      setErro(true);
      setMensagem("A foto deve ter no máximo 5 MB.");
      return;
    }

    liberarPreviaLocal();
    const url = URL.createObjectURL(arquivo);
    urlLocal.current = url;
    setPreviaLocal(url);

    iniciarEnvio(async () => {
      try {
        const comprimida = await comprimirImagemPremio(arquivo);
        if (comprimida.size > TAMANHO_MAXIMO_FOTO) {
          throw new Error("A foto comprimida deve ter no máximo 5 MB.");
        }

        const dados = new FormData();
        dados.set("arquivo", comprimida);
        const resultado = await enviarFoto(dados);
        if (!resultado.ok) {
          setErro(true);
          setMensagem(resultado.mensagem);
          return;
        }

        setImagemUrl(resultado.imagemUrl);
        setMensagem(resultado.mensagem);
        liberarPreviaLocal();
      } catch {
        setErro(true);
        setMensagem("Não foi possível preparar a foto. Confira o arquivo e tente novamente.");
      }
    });
  }

  const urlParaPrevia = previaLocal ?? imagemUrl;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-tinta">Foto do prêmio (opcional)</legend>
      <input type="hidden" name="imagem_url" value={imagemUrl} />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Escolher foto do prêmio"
        disabled={enviando}
        onChange={(evento) => selecionarFoto(evento.currentTarget.files?.[0])}
        className="min-h-[44px] w-full rounded-lg border border-linha bg-white p-2 text-sm text-tinta file:mr-3 file:min-h-9 file:rounded-md file:border-0 file:bg-papel-escuro file:px-3 file:font-medium file:text-tinta"
      />
      <p className="text-xs text-tinta-suave">
        JPG, PNG ou WEBP · até 5 MB. A foto é reduzida antes do envio.
      </p>
      {enviando ? (
        <p role="status" className="text-sm text-tinta-suave">
          Preparando e enviando a foto…
        </p>
      ) : null}
      {mensagem ? (
        <p role={erro ? "alert" : "status"} className="text-sm text-tinta-suave">
          {mensagem}
        </p>
      ) : null}
      {urlParaPrevia ? (
        <div className="relative aspect-[4/3] max-w-sm overflow-hidden rounded-card bg-papel-escuro">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs da prévia local não passam pelo otimizador do Next. */}
          <img
            src={urlParaPrevia}
            alt="Prévia da foto do prêmio"
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div
          role="img"
          aria-label="Sem foto do prêmio"
          className="flex aspect-[4/3] max-w-sm items-center justify-center rounded-card bg-papel-escuro text-4xl"
        >
          <span aria-hidden="true">🎁</span>
        </div>
      )}
    </fieldset>
  );
}
