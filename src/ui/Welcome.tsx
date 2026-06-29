import { useEffect, useState } from 'react'

export function Welcome() {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 4400)
    return () => clearTimeout(id)
  }, [])
  if (!show) return null
  return <div className="welcome">A new village stirs by the campfire — guide them well.</div>
}
