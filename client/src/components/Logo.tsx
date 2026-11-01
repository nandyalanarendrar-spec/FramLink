import { Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
        <Sprout size={20} />
      </span>
      <span className={`text-xl font-bold ${light ? 'text-white' : 'text-brand-900'}`}>FarmLink</span>
    </Link>
  )
}
