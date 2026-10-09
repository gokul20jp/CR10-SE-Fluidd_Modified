import type { MutationTree } from 'vuex'
import type { CalibrationHistoryState, CalibrationEntry } from './types'
import { createState } from './state'

export const mutations = {
  setLoading (state: CalibrationHistoryState, loading: boolean) {
    state.loading = loading
  },

  setError (state: CalibrationHistoryState, error: string | null) {
    state.error = error
  },

  setEntries (state: CalibrationHistoryState, entries: CalibrationEntry[]) {
    state.entries = entries
    state.lastFetched = Date.now()
    state.error = null
  },

  clearEntries (state: CalibrationHistoryState) {
    state.entries = []
    state.lastFetched = null
  },

  reset (state: CalibrationHistoryState) {
    Object.assign(state, createState())
  }
} satisfies MutationTree<CalibrationHistoryState>
