import { useState } from 'react'

// Main photo + clickable thumbnails. Renders nothing when there are no photos.
export default function Gallery({ images, alt }: { images?: string[]; alt: string }) {
  const [i, setI] = useState(0)
  if (!images?.length) return null
  const main = images[Math.min(i, images.length - 1)]

  return (
    <div className="mb-4">
      <img src={main} alt={alt} className="h-64 w-full rounded-xl object-cover" />
      {images.length > 1 && (
        <div className="mt-2 flex gap-2">
          {images.map((u, n) => (
            <button key={u} type="button" onClick={() => setI(n)} className={`overflow-hidden rounded-lg border-2 ${n === i ? 'border-brand-600' : 'border-transparent'}`} aria-label={`${alt} ${n + 1}`}>
              <img src={u} alt="" className="h-14 w-14 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
