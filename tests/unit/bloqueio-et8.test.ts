// ET-8 · prova empírica do bloqueio de MR: teste propositalmente falhante.
// Comportamento esperado: pnpm test falha → CI vermelho → merge recusado.
// Este arquivo SERÁ REMOVIDO logo após a comprovação (ver PLAN.md ET-8).
import { expect, test } from 'vitest'

test('prova do bloqueio: MR com teste falho deve ficar vermelho', () => {
  expect(true).toBe(false)
})
