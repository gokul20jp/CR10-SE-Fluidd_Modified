import { createState } from './state'
import { getters } from './getters'
import { mutations } from './mutations'
import { actions } from './actions'

export const calibration_history = {
  namespaced: true,
  state: createState,
  getters,
  mutations,
  actions
}
