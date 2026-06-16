import { Link, useParams } from 'react-router-dom'
import { getCard } from '../store/cards'
import { CardView } from '../components/CardView'

export function Study() {
  const { id } = useParams()
  const card = id ? getCard(id) : undefined

  if (!card) {
    return (
      <div className="text-slate-400">
        Card not found. <Link to="/" className="text-sky-300 underline">Back</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
        ← Cards
      </Link>
      <CardView key={card.id} card={card} />
    </div>
  )
}
