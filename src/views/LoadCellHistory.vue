<template>
  <v-container fluid class="load-cell-history pa-4" style="max-width:1400px;margin:0 auto;">
    <v-row align="center" class="mb-3">
      <v-col>
        <div class="d-flex align-center">
          <v-icon class="mr-2" color="primary">$chart</v-icon>
          <span class="text-h6 font-weight-medium">Load Cell Reference History</span>
          <v-chip small outlined class="ml-3">Reference only — does NOT change z_offset</v-chip>
        </div>
        <div class="caption grey--text mt-1">
          Tracks prtouch pressure sensor Z-offset measurements at different temperatures and positions.
          Use this to understand thermal expansion and calibrate your z_offset manually.
        </div>
      </v-col>
      <v-col cols="auto">
        <v-btn small :loading="loading" @click="refresh()">
          Refresh
        </v-btn>
        <v-btn small color="error" class="ml-2" @click="confirmClear()">
          Clear
        </v-btn>
      </v-col>
    </v-row>

    <!-- Run calibration instructions -->
    <v-alert type="info" dense outlined class="mb-3">
      <strong>How to use:</strong>
      Run <code>LOAD_CELL_REFERENCE_CALIBRATION TEMP=140 BED_TEMP=60</code> from Fluidd console,
      then repeat at <code>TEMP=200</code> and <code>TEMP=240</code> to build a temperature profile.
      The chart below shows how z_offset varies with temperature.
    </v-alert>

    <v-alert v-if="error" type="error" dense outlined dismissible class="mb-3">
      {{ error }}
    </v-alert>

    <v-row v-if="sessions.length === 0 && !loading">
      <v-col class="text-center py-8">
        <div class="grey--text">No load cell data yet. Run LOAD_CELL_REFERENCE_CALIBRATION to start.</div>
      </v-col>
    </v-row>

    <template v-else-if="sessions.length > 0">
      <!-- Temperature vs Z-offset chart -->
      <v-card outlined class="mb-4">
        <v-card-title class="subtitle-2">
          Temperature vs Z-Offset (Reference)
          <v-spacer />
          <v-chip v-if="thermalExpansionFactor" small>
            Thermal expansion: {{ (thermalExpansionFactor * 1000).toFixed(2) }}μm/°C
          </v-chip>
        </v-card-title>
        <v-card-text class="caption grey--text pb-0">
          Each point = one calibration session. The trend line shows thermal expansion.
          Use the Z-offset calculator below to find your ideal value.
        </v-card-text>
        <div style="height:320px;">
          <e-chart :option="tempChartOptions" :update-options="updateOpts" :init-options="initOpts" autoresize />
        </div>
      </v-card>

      <!-- Z-offset calculator -->
      <v-card outlined class="mb-4">
        <v-card-title class="subtitle-2">Z-Offset Calculator</v-card-title>
        <v-card-text>
          <v-row align="center">
            <v-col cols="12" sm="4">
              <v-text-field
                v-model.number="calcTemp"
                label="Print temperature (°C)"
                type="number" dense outlined hide-details
              />
            </v-col>
            <v-col cols="12" sm="4" class="text-center">
              <div class="caption grey--text">Recommended z_offset</div>
              <div class="text-h5 font-weight-bold primary--text">
                {{ calculatedZOffset !== null ? calculatedZOffset.toFixed(4) + ' mm' : '—' }}
              </div>
              <div class="caption grey--text">
                (interpolated from {{ sessions.length }} session{{ sessions.length !== 1 ? 's' : '' }})
              </div>
            </v-col>
            <v-col cols="12" sm="4">
              <div class="caption grey--text mb-1">Current bltouch z_offset</div>
              <v-chip small outlined>{{ currentZOffset.toFixed(4) }} mm</v-chip>
              <div v-if="calculatedZOffset !== null" class="caption mt-1"
                   :class="Math.abs(currentZOffset - calculatedZOffset) > 0.05 ? 'warning--text' : 'success--text'">
                Difference: {{ (calculatedZOffset - currentZOffset) >= 0 ? '+' : '' }}
                {{ (calculatedZOffset - currentZOffset).toFixed(4) }} mm
              </div>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Sessions table -->
      <v-card outlined>
        <v-card-title class="subtitle-2">All Sessions ({{ sessions.length }})</v-card-title>
        <v-simple-table dense>
          <thead>
            <tr>
              <th>Session</th>
              <th>Nozzle Temp</th>
              <th>Bed Temp</th>
              <th>Positions</th>
              <th>Z Mean</th>
              <th>Z Spread</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, idx) in sessionsReversed" :key="idx" @click="selectedSession = s" style="cursor:pointer;"
                :class="selectedSession === s ? 'primary--text' : ''">
              <td class="caption text-no-wrap">{{ formatTs(s.session_id) }}</td>
              <td class="font-weight-bold">{{ s.nozzle_temp?.toFixed(1) ?? '—' }}°C</td>
              <td>{{ s.bed_temp?.toFixed(1) ?? '—' }}°C</td>
              <td>{{ s.positions?.length ?? 0 }}</td>
              <td class="font-weight-bold primary--text">{{ s.overall_stats?.z_mean?.toFixed(4) ?? '—' }} mm</td>
              <td :class="(s.overall_stats?.z_spread_across_positions ?? 0) > 0.1 ? 'warning--text' : 'success--text'">
                {{ s.overall_stats?.z_spread_across_positions?.toFixed(4) ?? '—' }} mm
              </td>
              <td class="caption grey--text">{{ s.note }}</td>
            </tr>
          </tbody>
        </v-simple-table>
      </v-card>

      <!-- Selected session detail -->
      <v-card v-if="selectedSession" outlined class="mt-4">
        <v-card-title class="subtitle-2">
          Session Detail — {{ formatTs(selectedSession.session_id) }}
          @ {{ selectedSession.nozzle_temp?.toFixed(1) }}°C
        </v-card-title>
        <v-simple-table dense>
          <thead>
            <tr>
              <th>Position</th>
              <th>X</th><th>Y</th>
              <th>Z Mean (mm)</th>
              <th>Z Std Dev</th>
              <th>Samples</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pos in selectedSession.positions" :key="pos.pos_label">
              <td class="font-weight-medium">{{ pos.pos_label }}</td>
              <td>{{ pos.x?.toFixed(0) }}</td>
              <td>{{ pos.y?.toFixed(0) }}</td>
              <td class="font-weight-bold">{{ pos.stats?.z_mean?.toFixed(4) ?? '—' }}</td>
              <td :class="(pos.stats?.z_stddev ?? 0) > 0.001 ? 'warning--text' : ''">
                ±{{ pos.stats?.z_stddev?.toFixed(4) ?? '—' }}
              </td>
              <td>{{ pos.samples?.length ?? 0 }}</td>
            </tr>
          </tbody>
        </v-simple-table>
      </v-card>
    </template>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import type { EChartsInitOpts, SetOptionOpts } from 'echarts'

interface LoadCellSample { sample_num: number; z_at_trigger: number; adc_at_trigger: number }
interface LoadCellPosition {
  pos_label: string; x: number; y: number
  samples: LoadCellSample[]
  stats: { z_mean: number; z_stddev: number; z_min: number; z_max: number; sample_count: number }
}
interface LoadCellSession {
  session_id: string; timestamp: string; note: string
  nozzle_temp: number; nozzle_target: number; bed_temp: number; bed_target: number
  positions: LoadCellPosition[]
  overall_stats: { z_mean: number; z_spread_across_positions: number; recommended_z_offset: number; position_count: number }
}

@Component({})
export default class LoadCellHistoryView extends Vue {
  sessions: LoadCellSession[] = []
  loading = false
  error: string | null = null
  selectedSession: LoadCellSession | null = null
  calcTemp = 240
  lastFetched: number | null = null

  readonly updateOpts: SetOptionOpts = Object.freeze({ notMerge: false, lazyUpdate: true })
  readonly initOpts: EChartsInitOpts = Object.freeze({ renderer: 'canvas' })

  get isDark () { return this.$store.state.config.uiSettings.theme.isDark }
  get sessionsReversed () { return [...this.sessions].reverse() }

  get currentZOffset (): number {
    return this.$store.state.printer.printer.configfile?.settings?.bltouch?.z_offset ?? 0
  }

  /** Sessions with valid temperature and z_mean for charting */
  get chartSessions () {
    return this.sessions.filter(s => s.nozzle_temp > 0 && s.overall_stats?.z_mean)
  }

  /** Linear regression: z_offset = a * temp + b */
  get thermalExpansionFactor (): number | null {
    const pts = this.chartSessions
    if (pts.length < 2) return null
    const n = pts.length
    const sumX = pts.reduce((a, s) => a + s.nozzle_temp, 0)
    const sumY = pts.reduce((a, s) => a + s.overall_stats.z_mean, 0)
    const sumXY = pts.reduce((a, s) => a + s.nozzle_temp * s.overall_stats.z_mean, 0)
    const sumX2 = pts.reduce((a, s) => a + s.nozzle_temp * s.nozzle_temp, 0)
    const denom = n * sumX2 - sumX * sumX
    if (Math.abs(denom) < 1e-10) return null
    return (n * sumXY - sumX * sumY) / denom  // slope = dZ/dTemp
  }

  get calculatedZOffset (): number | null {
    const pts = this.chartSessions
    if (pts.length === 0) return null
    if (pts.length === 1) return pts[0].overall_stats.z_mean
    // Use linear interpolation/extrapolation
    const factor = this.thermalExpansionFactor
    if (factor === null) return null
    // y = factor * x + b; b = meanY - factor * meanX
    const meanX = pts.reduce((a, s) => a + s.nozzle_temp, 0) / pts.length
    const meanY = pts.reduce((a, s) => a + s.overall_stats.z_mean, 0) / pts.length
    const b = meanY - factor * meanX
    return Math.round((factor * this.calcTemp + b) * 10000) / 10000
  }

  get tempChartOptions () {
    const isDark = this.isDark
    const fc = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const pts = this.chartSessions

    // Scatter data
    const scatterData = pts.map(s => ({
      value: [s.nozzle_temp, s.overall_stats.z_mean],
      label: { show: true, formatter: (p: any) => p.value[1].toFixed(3), fontSize: 9, color: fc }
    }))

    // Trend line
    const trendData = (() => {
      if (pts.length < 2 || !this.thermalExpansionFactor) return []
      const temps = [Math.min(...pts.map(s => s.nozzle_temp)) - 10,
                     Math.max(...pts.map(s => s.nozzle_temp)) + 10]
      const factor = this.thermalExpansionFactor!
      const meanX = pts.reduce((a, s) => a + s.nozzle_temp, 0) / pts.length
      const meanY = pts.reduce((a, s) => a + s.overall_stats.z_mean, 0) / pts.length
      const b = meanY - factor * meanX
      return temps.map(t => [t, +(factor * t + b).toFixed(5)])
    })()

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        textStyle: { color: fc, fontSize: 12 },
        formatter: (params: any) => {
          const [temp, z] = params.value
          return `<b>${params.seriesName}</b><br/>Temp: ${temp}°C<br/>Z-offset: <b>${z.toFixed(4)} mm</b>`
        }
      },
      legend: { show: true, bottom: 0, textStyle: { color: fc, fontSize: 11 } },
      grid: { top: 16, left: 72, right: 24, bottom: 48 },
      xAxis: {
        type: 'value', name: 'Nozzle Temp (°C)', nameTextStyle: { color: fc, fontSize: 10 },
        axisLabel: { color: fc, fontSize: 10 }, splitLine: { lineStyle: { color: fc, opacity: 0.08 } }
      },
      yAxis: {
        type: 'value', name: 'Z-Offset (mm)', nameTextStyle: { color: fc, fontSize: 10 },
        axisLabel: { color: fc, fontSize: 10, formatter: (v: number) => v.toFixed(3) },
        splitLine: { lineStyle: { color: fc, opacity: 0.08 } }
      },
      series: [
        {
          name: 'Measured', type: 'scatter', data: scatterData,
          symbolSize: 12, itemStyle: { color: '#2196F3' }
        },
        ...(trendData.length ? [{
          name: 'Trend (thermal expansion)', type: 'line', data: trendData,
          symbol: 'none', lineStyle: { color: '#FF9800', type: 'dashed', width: 2 }
        }] : [])
      ]
    }
  }

  async mounted () {
    await this.refresh()
  }

  async refresh () {
    this.loading = true
    this.error = null
    try {
      const moonrakerBase = `${window.location.protocol}//${window.location.hostname}:7125`
      const response = await fetch(`${moonrakerBase}/printer/load_cell_history/list?limit=200`, {
        signal: AbortSignal.timeout(8000)
      })
      if (response.ok) {
        const data = await response.json()
        this.sessions = data?.result?.sessions ?? data?.sessions ?? []
      } else if (response.status === 404) {
        // Try reading file directly
        const fileResp = await fetch(`${moonrakerBase}/server/files/config/load_cell_data.json`)
        if (fileResp.ok) {
          this.sessions = await fileResp.json()
        } else {
          this.error = 'No load cell data found. Make sure [load_cell_monitor] is in printer_params.cfg and Klipper is restarted.'
        }
      } else {
        this.error = `HTTP ${response.status}`
      }
    } catch (e: any) {
      // Fallback: read JSON file directly
      try {
        const moonrakerBase = `${window.location.protocol}//${window.location.hostname}:7125`
        const r = await fetch(`${moonrakerBase}/server/files/config/load_cell_data.json`)
        if (r.ok) this.sessions = await r.json()
      } catch { /* ignore */ }
    } finally {
      this.loading = false
    }
  }

  async confirmClear () {
    const ok = await this.$confirm(
      'Delete all load cell reference data?',
      { title: 'Clear Load Cell History', color: 'error', icon: '$error' }
    )
    if (ok) {
      // Send LOAD_CELL_CLEAR via GCode
      const moonrakerBase = `${window.location.protocol}//${window.location.hostname}:7125`
      await fetch(`${moonrakerBase}/printer/gcode/script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: 'LOAD_CELL_CLEAR' })
      })
      await this.refresh()
    }
  }

  formatTs (ts: string): string {
    try { return new Date(ts).toLocaleString() } catch { return ts }
  }
}
</script>
