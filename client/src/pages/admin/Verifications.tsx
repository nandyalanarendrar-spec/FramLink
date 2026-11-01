import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { api, errorMessage } from '../../api/client'

type Status = 'pending' | 'verified' | 'rejected'
type RoleFilter = '' | 'farmer' | 'buyer' | 'transporter'

interface Row {
  _id: string
  name: string
  phone: string
  email: string
  role: 'farmer' | 'buyer' | 'transporter'
  createdAt: string
  rejectionReason?: string
  buyerType?: string
  businessName?: string
  vehicleType?: string
  vehicleNumber?: string
  vehicleCapacityKg?: number
  farmerProfile?: { district: string; village: string; state: string; farmSizeAcres?: number; farmAddress?: string } | null
  idType?: string
  idNumber?: string
  licenceNumber?: string
  landSurveyNumber?: string
  businessAddress?: string
  gstNumber?: string
  detailsSubmittedAt?: string
  documents?: { id: string; name: string; mime: string }[]
}

const statuses: Status[] = ['pending', 'verified', 'rejected']
const roles: { value: RoleFilter; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'farmer', label: 'Farmers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'transporter', label: 'Transporters' },
]

function Details({ u }: { u: Row }) {
  const items: [string, string | undefined][] =
    u.role === 'farmer'
      ? [
          ['Village', u.farmerProfile?.village], ['District', u.farmerProfile?.district],
          ['ID type', u.idType?.replace('_', ' ')], ['ID number', u.idNumber],
          ['Farm size', u.farmerProfile?.farmSizeAcres ? `${u.farmerProfile.farmSizeAcres} acres` : undefined],
          ['Survey no.', u.landSurveyNumber], ['Farm address', u.farmerProfile?.farmAddress],
        ]
      : u.role === 'buyer'
        ? [
            ['Buyer type', u.buyerType], ['Business', u.businessName],
            ['ID type', u.idType?.replace('_', ' ')], ['ID number', u.idNumber],
            ['GST', u.gstNumber], ['Address', u.businessAddress],
          ]
        : [
            ['Vehicle', u.vehicleType], ['Number plate', u.vehicleNumber],
            ['Capacity', u.vehicleCapacityKg ? `${u.vehicleCapacityKg} kg` : undefined], ['Driving licence', u.licenceNumber],
          ]
  return (
    <>
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      <div><dt className="text-slate-500">Mobile</dt><dd>{u.phone}</dd></div>
      <div><dt className="text-slate-500">Email</dt><dd className="break-all">{u.email}</dd></div>
      {items.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt className="text-slate-500">{k}</dt><dd className="capitalize">{v}</dd></div>
      ))}
    </dl>
    <p className="mt-3 text-sm">
      <span className="text-slate-500">Documents: </span>
      {u.documents?.length ? u.documents.map((d) => <a key={d.id} href={`/api/files/docs/${d.id}`} target="_blank" rel="noreferrer" className="mr-3 font-medium text-brand-700 hover:underline">{d.name}</a>) : <span className="text-amber-700">none uploaded</span>}
    </p>
    </>
  )
}

export default function Verifications() {
  const [status, setStatus] = useState<Status>('pending')
  const [role, setRole] = useState<RoleFilter>('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/admin/users', { params: { status, role: role || undefined } })
      setRows(data.users)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [status, role])

  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'verify' | 'reject') {
    setError('')
    try {
      await api.patch(`/admin/users/${id}/${action}`, action === 'reject' ? { reason } : undefined)
      setRejecting(null)
      setReason('')
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const tab = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition ${active ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Account verifications</h1>
        <p className="text-sm text-slate-500">Review farmers, buyers and transporters. Accounts appear here after they confirm their email and submit their verification details.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => <button key={s} className={tab(status === s)} onClick={() => setStatus(s)}>{s}</button>)}
        <span className="mx-2 w-px bg-slate-200" />
        {roles.map((r) => <button key={r.label} className={tab(role === r.value)} onClick={() => setRole(r.value)}>{r.label}</button>)}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No {status} accounts.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((u) => (
            <li key={u._id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{u.name} <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">{u.role}</span></p>
                  <p className="text-xs text-slate-500">Registered {new Date(u.createdAt).toLocaleDateString()}</p>
                </div>
                {status !== 'verified' && (
                  <div className="flex gap-2">
                    <button className="btn-primary gap-1" onClick={() => act(u._id, 'verify')}><Check size={16} /> Verify</button>
                    {status === 'pending' && (
                      <button className="btn-outline gap-1 text-red-600" onClick={() => { setRejecting(u._id); setReason('') }}><X size={16} /> Reject</button>
                    )}
                  </div>
                )}
              </div>
              <Details u={u} />
              {u.rejectionReason && <p className="mt-3 text-sm text-red-700">Rejected: {u.rejectionReason}</p>}
              {rejecting === u._id && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input className="input max-w-md" placeholder="Reason for rejection" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                  <button className="btn-primary bg-red-600 hover:bg-red-700" onClick={() => act(u._id, 'reject')} disabled={reason.trim().length < 3}>Confirm reject</button>
                  <button className="btn-outline" onClick={() => setRejecting(null)}>Cancel</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
