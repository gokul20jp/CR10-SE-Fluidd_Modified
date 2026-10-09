<template>
  <div class="live-monitor-tab">

    <!-- Print Status Header Bar -->
    <v-card
      outlined
      class="mb-3"
      :color="isPrinting ? 'green darken-4' : isPaused ? 'orange darken-4' : ''"
    >
      <v-card-text class="py-2">
        <v-row align="center" no-gutters>
          <v-col>
            <div class="d-flex align-center flex-wrap" style="gap: 8px;">
              <!-- Status -->
              <v-chip small :color="statusColor" text-color="white">
                {{ printStatus.toUpperCase() }}
              </v-chip>

              <!-- File name -->
              <span v-if="filename" class="caption">
                📄 <b>{{ filename }}</b>
              </span>

              <!-- Progress -->
              <v-chip v-if="isPrinting || isPaused" small>
                {{ (progress * 100).toFixed(1) }}%
              </v-chip>

              <!-- Layer -->
              <v-chip v-if="currentLayer > 0" small>
                Layer {{ currentLayer }}/{{ totalLayers || '?' }}
              </v-chip>

              <!-- Layer time -->
              <v-chip v-if="avgLayerDuration > 0" small>
                avg {{ avgLayerDuration.toFixed(1) }}s/layer
              </v-chip>

              <!-- Anomalies -->
              <v-chip
                v-if="anomalyCount > 0"
                small
                color="error"
                text-color="white"
              >
                ⚠ {{ anomalyCount }} anomalies
              </v-chip>

              <!-- Filament sensor -->
              <v-chip
                small
                :color="filamentOk ? 'green' : 'error'"
                text-color="white"
              >
                {{ filamentOk ? '✅ Filament OK' : '❌ Filament Runout!' }}
              </v-chip>
            </div>
          </v-col>
          <v-col cols="auto">
            <!-- Print time elapsed -->
            <span v-if="printElapsed > 0" class="caption grey--text">
              Elapsed: {{ formatDuration(printElapsed) }}
            </span>
          </v-col>
        </v-row>

        <!-- Progress bar -->
        <v-progress-linear
          v-if="isPrinting || isPaused"
          :value="progress * 100"
          :color="isPaused ? 'orange' : 'green'"
          height="4"
          class="mt-2"
          rounded
        />
      </v-card-text>
    </v-card>

    <!-- Anomaly Alert Banner -->
    <v-alert
      v-if="latestAnomaly"
      type="warning"
      dense
      outlined
      dismissible
      class="mb-3"
    >
      <b>Layer {{ latestAnomaly.layer }}</b> took
      {{ latestAnomaly.duration.toFixed(1) }}s
      ({{ latestAnomaly.ratio.toFixed(1) }}× avg {{ latestAnomaly.avg_duration.toFixed(1) }}s).
      Possible slow layer or print failure starting.
    </v-alert>

    <!-- Top Row: 3D Simulation + Layer Time -->
    <v-row class="mb-2">
      <v-col cols="12" md="6">
        <live-toolhead-simulation :chart-height="isMobile ? 240 : 320" />
      </v-col>
      <v-col cols="12" md="6">
        <v-row>
          <v-col cols="12">
            <layer-time-chart :chart-height="isMobile ? 150 : 180" />
          </v-col>
          <v-col cols="12">
            <live-z-offset-chart :chart-height="isMobile ? 130 : 150" />
          </v-col>
        </v-row>
      </v-col>
    </v-row>

    <!-- Middle Row: Thermal + Flow + Motion -->
    <v-row class="mb-2">
      <v-col cols="12" md="6">
        <live-thermal-chart :chart-height="isMobile ? 180 : 220" />
      </v-col>
      <v-col cols="12" md="6">
        <v-row>
          <v-col cols="12">
            <live-flow-chart :chart-height="isMobile ? 140 : 160" />
          </v-col>
          <v-col cols="12">
            <motion-anomaly-chart :chart-height="isMobile ? 120 : 140" />
          </v-col>
        </v-row>
      </v-col>
    </v-row>

    <!-- Bottom: Live GCode Console (full width) -->
    <live-gcode-console :console-height="isMobile ? 180 : 220" />

    <!-- Moonraker disconnected -->
    <v-alert
      v-if="socketDisconnected"
      type="error"
      dense
      outlined
      class="mt-3"
    >
      <v-icon left small>$wifi</v-icon>
      <strong>Moonraker is not connected.</strong>
      Live data is unavailable. Check your network and Moonraker service.
    </v-alert>

    <!-- Klipper not ready (but socket OK) -->
    <v-alert
      v-else-if="!klippyReady && socketReady"
      type="warning"
      dense
      outlined
      class="mt-3"
    >
      <v-icon left small>$printer3d</v-icon>
      <strong>Klipper is not ready</strong> (state: <b>{{ klippyState }}</b>).
      Live telemetry will be available once Klipper finishes starting up.
      <span v-if="klippyState === 'error'" class="d-block mt-1 caption">
        Error: {{ klippyStateMessage }}
      </span>
    </v-alert>

    <!-- Not printing info (only show when connected and ready) -->
    <v-alert
      v-else-if="klippyReady && !isPrinting && !isPaused"
      type="info"
      dense
      outlined
      class="mt-3"
    >
      <v-icon left small>$printer3d</v-icon>
      Start a print to see live telemetry. All charts will populate with real-time data during printing.
      <br/>
      <span class="caption mt-1 d-block">
        💡 Layer time tracking requires <code>[layer_tracker]</code> in <code>printer_params.cfg</code> (already configured for CR-10 SE).
      </span>
    </v-alert>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import LiveToolheadSimulation from './LiveToolheadSimulation.vue'
import LayerTimeChart from './LayerTimeChart.vue'
import LiveZOffsetChart from './LiveZOffsetChart.vue'
import LiveFlowChart from './LiveFlowChart.vue'
import LiveThermalChart from './LiveThermalChart.vue'
import MotionAnomalyChart from './MotionAnomalyChart.vue'
import LiveGcodeConsole from './LiveGcodeConsole.vue'

@Component({
  components: {
    LiveToolheadSimulation,
    LayerTimeChart,
    LiveZOffsetChart,
    LiveFlowChart,
    LiveThermalChart,
    MotionAnomalyChart,
    LiveGcodeConsole
  }
})
export default class LiveMonitorTab extends Mixins(StateMixin) {

  get printStats () {
    return this.$store.state.printer.printer.print_stats ?? {}
  }

  get printStatus (): string {
    return this.printStats.state ?? 'idle'
  }

  get isPrinting (): boolean {
    return this.printStatus === 'printing'
  }

  get isPaused (): boolean {
    return this.printStatus === 'paused'
  }

  get filename (): string {
    return this.printStats.filename ?? ''
  }

  get progress (): number {
    return this.$store.state.printer.printer.display_status?.progress ?? 0
  }

  get currentLayer (): number {
    return this.printStats.info?.current_layer ?? this.layerTracker.current_layer ?? 0
  }

  get totalLayers (): number {
    return this.printStats.info?.total_layer ?? this.layerTracker.total_layers ?? 0
  }

  get layerTracker () {
    return this.$store.state.printer.printer.layer_tracker ?? {}
  }

  get avgLayerDuration (): number {
    return this.layerTracker.avg_layer_duration ?? 0
  }

  get printElapsed (): number {
    return this.layerTracker.print_elapsed ?? this.printStats.print_duration ?? 0
  }

  get anomalyEvents (): any[] {
    return this.layerTracker.anomaly_events ?? []
  }

  get anomalyCount (): number {
    return this.anomalyEvents.length
  }

  get latestAnomaly (): any | null {
    if (this.anomalyEvents.length === 0) return null
    return this.anomalyEvents[this.anomalyEvents.length - 1]
  }

  get filamentOk (): boolean {
    const sensor = this.$store.state.printer.printer['filament_switch_sensor filament_sensor']
    if (!sensor) return true  // assume ok if no sensor configured
    return sensor.filament_detected !== false
  }

  get statusColor (): string {
    switch (this.printStatus) {
      case 'printing': return 'green'
      case 'paused': return 'orange'
      case 'error': return 'error'
      case 'cancelled': return 'red'
      case 'complete': return 'blue'
      default: return 'grey'
    }
  }

  get isMobile (): boolean {
    return this.$vuetify.breakpoint.mobile
  }

  formatDuration (seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }
}
</script>

<style lang="scss" scoped>
.live-monitor-tab {
  max-width: 100%;
}

code {
  font-family: 'Roboto Mono', monospace;
  font-size: 11px;
  padding: 1px 4px;
  background: rgba(128, 128, 128, 0.15);
  border-radius: 3px;
}
</style>
