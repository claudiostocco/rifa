#!/usr/bin/env python3
"""Verifica a disponibilidade pública da T4 e da T5 em produção."""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class Verificacao:
    nome: str
    url: str
    texto_obrigatorio: str


def buscar(verificacao: Verificacao, timeout: float) -> None:
    requisicao = Request(
        verificacao.url,
        headers={"User-Agent": "rifa-app-verificador/1.0"},
    )
    try:
        with urlopen(requisicao, timeout=timeout) as resposta:
            status = resposta.status
            conteudo = resposta.read().decode("utf-8", errors="replace")
    except HTTPError as erro:
        raise RuntimeError(
            f"{verificacao.nome}: resposta HTTP {erro.code} em {verificacao.url}"
        ) from erro
    except URLError as erro:
        raise RuntimeError(
            f"{verificacao.nome}: não foi possível acessar {verificacao.url}: "
            f"{erro.reason}"
        ) from erro

    if status != 200:
        raise RuntimeError(
            f"{verificacao.nome}: resposta HTTP {status} em {verificacao.url}"
        )
    if verificacao.texto_obrigatorio not in conteudo:
        raise RuntimeError(
            f"{verificacao.nome}: conteúdo esperado não encontrado em "
            f"{verificacao.url}"
        )

    print(f"OK — {verificacao.nome}: HTTP {status} e conteúdo confirmado.")


def executar(verificacoes: tuple[Verificacao, ...], timeout: float, intervalo: float, repeticoes: int) -> None:
    rodada = 0
    while repeticoes == 0 or rodada < repeticoes:
        rodada += 1
        for verificacao in verificacoes:
            buscar(verificacao, timeout)
        if repeticoes == 0 or rodada < repeticoes:
            time.sleep(intervalo)


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verifica a disponibilidade pública da aplicação Rifa App."
    )
    parser.add_argument(
        "--url",
        required=True,
        help="URL pública da T4, por exemplo https://app.exemplo/r/minha-rifa",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=15,
        help="Tempo máximo de cada requisição em segundos.",
    )
    parser.add_argument(
        "--intervalo",
        type=float,
        default=300,
        help="Intervalo entre rodadas em segundos.",
    )
    parser.add_argument(
        "--repeticoes",
        type=int,
        default=1,
        help="Quantidade de rodadas; use 0 para executar continuamente.",
    )
    return parser.parse_args()


def main() -> int:
    opcoes = argumentos()
    if opcoes.timeout <= 0 or opcoes.intervalo < 0 or opcoes.repeticoes < 0:
        print(
            "Erro: timeout deve ser positivo; intervalo e repetições não podem ser negativos.",
            file=sys.stderr,
        )
        return 2

    url = opcoes.url.rstrip("/")
    verificacoes = (
        Verificacao("T4 pública", url, "<title>Rifa · Rifa App</title>"),
        Verificacao(
            "T5 resultado",
            f"{url}/resultado",
            "Sorteio ainda não realizado",
        ),
    )
    try:
        executar(verificacoes, opcoes.timeout, opcoes.intervalo, opcoes.repeticoes)
    except RuntimeError as erro:
        print(f"ERRO — {erro}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
