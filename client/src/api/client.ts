import axios from 'axios'
import i18n from '../i18n'

export const api = axios.create({ baseURL: '/api', withCredentials: true })

// Turns any axios error into a readable message (+ per-field errors from zod)
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; errors?: { field: string; message: string }[] }
      | undefined
    if (data?.errors?.length) return data.errors.map((e) => i18n.t(e.message)).join('. ')
    if (data?.message) return i18n.t(data.message)
    if (!err.response) return i18n.t('Cannot reach server. Is the backend running?')
  }
  return i18n.t('Something went wrong')
}
