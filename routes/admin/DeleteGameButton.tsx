'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteGameAction } from '../server/actions'

export function DeleteGameButton({
  slug,
  gameId,
  title,
}: {
  slug: string
  gameId: string
  title: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function remove() {
    if (!window.confirm(`「${title}」を完全に削除します。よろしいですか？`)) {
      return
    }
    setBusy(true)
    const result = await deleteGameAction(slug, gameId)
    setBusy(false)
    if (!result.ok) {
      window.alert(`削除に失敗しました: ${result.error}`)
      return
    }
    router.refresh()
  }

  return (
    <button type="button" disabled={busy} onClick={() => void remove()}>
      {busy ? '削除中...' : '削除'}
    </button>
  )
}
