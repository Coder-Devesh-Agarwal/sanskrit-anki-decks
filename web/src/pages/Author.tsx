import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardEditor } from '../components/CardEditor'
import { emptyCard, getCard, saveCard, type CardType } from '../store/cards'

export function Author() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const type: CardType = params.get('type') === 'generic' ? 'generic' : 'astadhyayi'
  const initial = id ? (getCard(id) ?? emptyCard(type)) : emptyCard(type)

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
