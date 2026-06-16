import { useNavigate, useParams } from 'react-router-dom'
import { CardEditor } from '../components/CardEditor'
import { emptyCard, getCard, saveCard } from '../store/cards'

export function Author() {
  const { id } = useParams()
  const nav = useNavigate()
  const initial = id ? getCard(id) ?? emptyCard() : emptyCard()

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-200">
        {id ? 'Edit card' : 'New card'}
      </h1>
      <CardEditor
        initial={initial}
        onCancel={() => nav('/')}
        onSave={(c) => {
          saveCard(c)
          nav('/')
        }}
      />
    </div>
  )
}
