import type { ActionTree } from 'vuex'
import type { CalibrationHistoryState } from './types'
import type { RootState } from '../types'

export const actions = {
  /**
   * Reset this store module to its initial state.
   */
  async reset ({ commit }) {
    commit('reset')
  },

  /**
   * Fetch calibration history entries from the Klipper webhook endpoint.
   * Endpoint: GET /printer/calibration_history/list?limit=200
   * Registered by klippy/extras/calibration_history.py
   *
   * Fluidd runs behind nginx on port 4408. Moonraker runs on port 7125.
   * Relative URLs (/printer/...) go through nginx which proxies to Moonraker.
   * We build the Moonraker URL dynamically from the current window.location.
   */
  async fetchHistory ({ commit }) {
    commit('setLoading', true)
    commit('setError', null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)  // 8s timeout

      // Build Moonraker API URL: same host, port 7125 (Moonraker default)
      // This works regardless of whether Fluidd is on port 80, 4408, etc.
      const moonrakerBase = `${window.location.protocol}//${window.location.hostname}:7125`
      const apiUrl = `${moonrakerBase}/printer/calibration_history/list?limit=200`

      let response: Response
      try {
        response = await fetch(apiUrl, {
          signal: controller.signal
        })
      } finally {
        clearTimeout(timeout)
      }

      if (response.status === 404) {
        commit('setError',
          'Endpoint not found (404). Make sure [calibration_history] is added to printer.cfg and Klipper has been restarted.')
        return
      }
      if (response.status === 503) {
        commit('setError',
          'Klipper is not ready (503). Wait for Klipper to finish starting up, then refresh.')
        return
      }
      if (!response.ok) {
        commit('setError', `Server returned HTTP ${response.status}: ${response.statusText}`)
        return
      }

      const data = await response.json()
      // Moonraker wraps all responses in {"result": {...}}
      // Our webhook returns {"history": [...], "total": N, "returned": N}
      // so the full path is data.result.history
      const entries = data?.result?.history ?? data?.history ?? []
      commit('setEntries', entries)
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        commit('setError',
          'Request timed out (8s). Moonraker may be starting up or overloaded. Try refreshing.')
      } else if (e?.name === 'TypeError' && e?.message?.includes('fetch')) {
        commit('setError',
          'Cannot reach Moonraker. Check that Moonraker is running and accessible.')
      } else {
        commit('setError', e?.message ?? 'Unknown error loading calibration history.')
      }
    } finally {
      commit('setLoading', false)
    }
  },

  /**
   * Clear all calibration history via the webhook endpoint.
   * Endpoint: POST /printer/calibration_history/clear
   */
  async clearHistory ({ commit }) {
    commit('setLoading', true)
    commit('setError', null)
    try {
      const moonrakerBase = `${window.location.protocol}//${window.location.hostname}:7125`
      const response = await fetch(`${moonrakerBase}/printer/calibration_history/clear`, { method: 'POST' })
      if (response.status === 404) {
        commit('setError', 'Clear endpoint not found. Make sure [calibration_history] is in printer.cfg.')
        return
      }
      if (!response.ok) {
        commit('setError', `Failed to clear history: HTTP ${response.status}`)
        return
      }
      commit('clearEntries')
    } catch (e: any) {
      if (e?.name === 'TypeError') {
        commit('setError', 'Cannot reach Moonraker. Check your connection.')
      } else {
        commit('setError', e?.message ?? 'Failed to clear calibration history.')
      }
    } finally {
      commit('setLoading', false)
    }
  }
} satisfies ActionTree<CalibrationHistoryState, RootState>
