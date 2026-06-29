import { useEffect } from 'react'
import { useGame } from '../game/store'
import type { Toast } from '../game/types'

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useGame((s) => s.dismissToast)
  useEffect(() => {
    const handle = setTimeout(() => dismiss(t.id), 3400)
    return () => clearTimeout(handle)
  }, [t.id, dismiss])
  return <div className={`toast ${t.kind}`}>{t.msg}</div>
}

export function Toasts() {
  const toasts = useGame((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  )
}
