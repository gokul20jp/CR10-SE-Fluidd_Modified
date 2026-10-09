<template>
  <v-container fluid class="calibration-history-page pa-4">
    <!-- Page Header -->
    <v-row align="center" class="mb-2">
      <v-col cols="12" sm="8">
        <div class="d-flex align-center">
          <v-icon class="mr-2" color="primary">$bedMesh</v-icon>
          <span class="text-h6 font-weight-medium">Calibration History</span>
          <v-chip
            v-if="hasDriftWarning"
            small
            color="warning"
            text-color="white"
            class="ml-3"
          >
            ⚠ Z-Offset Drift
          </v-chip>
        </div>
        <div class="caption grey--text mt-1">
          CR-10 SE — tracks Z-offset and bed mesh calibration over time
        </div>
      </v-col>
      <v-col cols="12" sm="4" class="text-right">
        <v-btn
          small
          :loading="loading"
          :disabled="!socketReady"
          @click="refresh()"
        >
          <v-icon small left>$refresh</v-icon>
          Refresh
        </v-btn>
      </v-col>
    </v-row>

    <!-- ─── Connection / Klipper state banners ─── -->

    <!-- Moonraker disconnected -->
    <v-alert
      v-if="socketDisconnected"
      type="error"
      dense
      outlined
      class="mb-3"
    >
      <v-icon left small>$wifi</v-icon>
      <strong>Moonraker is not connected.</strong>
      Cannot load calibration history.
      <template #append>
        <v-btn x-small text @click="refresh()">Retry</v-btn>
      </template>
    </v-alert>

    <!-- Socket initializing -->
    <v-alert
      v-else-if="socketInitializing"
      type="info"
      dense
      outlined
      class="mb-3"
    >
      <v-progress-circular indeterminate size="14" width="2" class="mr-2" />
      Connecting to Moonraker...
    </v-alert>

    <!-- Klipper not ready (but socket is up) -->
    <v-alert
      v-else-if="!klippyReady && socketReady"
      type="warning"
      dense
      outlined
      class="mb-3"
    >
      <v-icon left small>$printer3d</v-icon>
      <strong>Klipper is not ready</strong> (state: {{ klippyState }}).
      Calibration history is still available from the last session, but live data is unavailable.
    </v-alert>

    <!-- Fetch error -->
    <v-alert
      v-if="error"
      type="error"
      dense
      outlined
      dismissible
      class="mb-3"
    >
      <strong>Failed to load calibration history:</strong> {{ error }}
      <br/>
      <span class="caption">
        Make sure <code>[calibration_history]</code> is in your <code>printer.cfg</code> and Klipper is running.
      </span>
    </v-alert>

    <!-- Loading overlay on first load -->
    <v-row v-if="loading && totalEntries === 0">
      <v-col class="text-center pa-8">
        <v-progress-circular indeterminate color="primary" />
        <div class="mt-2 grey--text">Loading calibration history...</div>
      </v-col>
    </v-row>

    <!-- Not connected at all — no tabs to show -->
    <v-card
      v-else-if="socketDisconnected && totalEntries === 0"
      outlined
      class="text-center pa-8"
    >
      <v-icon size="48" color="grey" class="mb-3">$wifi</v-icon>
      <div class="text-subtitle-1 grey--text">Cannot connect to Moonraker</div>
      <div class="caption grey--text mt-1 mb-4">
        Start Moonraker and Klipper, then refresh.
      </div>
      <v-btn small @click="refresh()">
        <v-icon small left>$refresh</v-icon>
        Retry Connection
      </v-btn>
    </v-card>

    <!-- Main Tabs -->
    <v-card v-else outlined>
      <v-tabs
        v-model="activeTab"
        background-color="transparent"
        color="primary"
        show-arrows
      >
        <v-tab>
          Summary
        </v-tab>
        <v-tab>
          Z-Offset History
          <v-badge
            v-if="zOffsetCount > 0"
            :content="zOffsetCount"
            color="blue"
            inline
            class="ml-1"
          />
        </v-tab>
        <v-tab>
          Mesh Viewer
          <v-badge
            v-if="meshCount > 0"
            :content="meshCount"
            color="green"
            inline
            class="ml-1"
          />
        </v-tab>
        <v-tab :disabled="meshCount < 2">
          Variation / Diff
          <span v-if="meshCount < 2" class="caption ml-1 grey--text">(2+ meshes)</span>
        </v-tab>

        <v-tab>
          Live Monitor
          <v-chip
            v-if="isPrinting"
            x-small
            color="green"
            text-color="white"
            class="ml-1"
          >
            LIVE
          </v-chip>
        </v-tab>

        <v-tab>
          Compensation Preview
        </v-tab>
      </v-tabs>

      <v-divider />

      <v-tabs-items v-model="activeTab">
        <!-- Tab 0: Summary -->
        <v-tab-item>
          <v-card-text>
            <calibration-summary-tab />
          </v-card-text>
        </v-tab-item>

        <!-- Tab 1: Z-Offset History -->
        <v-tab-item>
          <v-card-text>
            <z-offset-history-chart />
          </v-card-text>
        </v-tab-item>

        <!-- Tab 2: Mesh 3D Viewer + Point Table -->
        <v-tab-item>
          <v-card-text>
            <mesh-history-viewer />
          </v-card-text>
        </v-tab-item>

        <!-- Tab 3: Diff View -->
        <v-tab-item>
          <v-card-text>
            <mesh-diff-view />
          </v-card-text>
        </v-tab-item>

        <!-- Tab 4: Live Print Monitor -->
        <v-tab-item>
          <v-card-text>
            <live-monitor-tab />
          </v-card-text>
        </v-tab-item>

        <!-- Tab 5: Mesh Compensation Preview -->
        <v-tab-item>
          <v-card-text>
            <mesh-compensation-preview />
          </v-card-text>
        </v-tab-item>
      </v-tabs-items>
    </v-card>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import CalibrationSummaryTab from '@/components/widgets/calibration-history/CalibrationSummaryTab.vue'
import ZOffsetHistoryChart from '@/components/widgets/calibration-history/ZOffsetHistoryChart.vue'
import MeshHistoryViewer from '@/components/widgets/calibration-history/MeshHistoryViewer.vue'
import MeshDiffView from '@/components/widgets/calibration-history/MeshDiffView.vue'
import LiveMonitorTab from '@/components/widgets/calibration-history/LiveMonitorTab.vue'
import MeshCompensationPreview from '@/components/widgets/calibration-history/MeshCompensationPreview.vue'
import type { ZOffsetEntry, MeshSaveEntry } from '@/store/calibration_history/types'

@Component({
  components: {
    CalibrationSummaryTab,
    ZOffsetHistoryChart,
    MeshHistoryViewer,
    MeshDiffView,
    LiveMonitorTab,
    MeshCompensationPreview
  }
})
export default class CalibrationHistoryView extends Mixins(StateMixin) {
  activeTab = 0

  get loading (): boolean {
    return this.$store.state.calibration_history.loading
  }

  get error (): string | null {
    return this.$store.state.calibration_history.error
  }

  get totalEntries (): number {
    return this.$store.getters['calibration_history/getTotalEntries']
  }

  get zOffsetCount (): number {
    const entries: ZOffsetEntry[] = this.$store.getters['calibration_history/getZOffsetEntries']
    return entries.length
  }

  get meshCount (): number {
    const entries: MeshSaveEntry[] = this.$store.getters['calibration_history/getMeshSaveEntries']
    return entries.length
  }

  get hasDriftWarning (): boolean {
    return this.$store.getters['calibration_history/hasDriftWarning']
  }

  get isPrinting (): boolean {
    return this.$store.state.printer.printer.print_stats?.state === 'printing'
  }

  async mounted () {
    // Fetch on first visit; use cache if already loaded within last 30 seconds
    const lastFetched: number | null = this.$store.state.calibration_history.lastFetched
    const CACHE_TTL = 30_000 // 30s
    if (!lastFetched || Date.now() - lastFetched > CACHE_TTL) {
      await this.refresh()
    }
  }

  async refresh () {
    await this.$store.dispatch('calibration_history/fetchHistory')
  }
}
</script>

<style lang="scss" scoped>
.calibration-history-page {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
