import type { CalibrationHistoryState } from './types'

export const createState = (): CalibrationHistoryState => ({
  entries: [],
  loading: false,
  error: null,
  lastFetched: null
})
