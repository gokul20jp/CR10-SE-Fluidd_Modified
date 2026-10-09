<template>
  <v-card outlined>
    <v-card-title class="subtitle-2 pb-1">
      Motion Anomaly Monitor
      <v-spacer />
      <v-chip x-small class="mr-1">Speed: <b class="ml-1">{{ liveVelocity.toFixed(0) }} mm/s</b></v-chip>
      <v-chip v-if="velocityDropDetected" x-small color="warning" text-color="white">⚠ Velocity Drop</v-chip>
    </v-card-title>

    <v-card-text class="pa-0">
      <v-alert v-if="!dataAvailable" type="info" dense outlined class="ma-3">
        Waiting for <code>motion_report</code> data from Klipper...
      </v-alert>
      <div v-else style="position: relative;">
        <div
          v-if="!isPrinting && samples.length === 0"
          class="grey--text caption text-center"
          style="position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);pointer-events:none;z-index:1;"
        >
          Motion data will populate when printing starts.<br/>
          <span style="font-size:10px;">Current velocity: {{ liveVelocity.toFixed(0) }} mm/s</span>
        </div>
        <div :style="{ height: chartHeight + 'px' }">
          <e-chart
            ref="chart"
            :option="chartOptions"
            :update-options="updateOptions"
            :init-options="initOptions"
            autoresize
          />
        </div>
      </div>
      <div v-if="dataAvailable" class="px-3 pb-2 d-flex justify-space-between caption grey--text">
        <span>Commanded: <b>{{ displayCommandedSpeed.toFixed(0) }} mm/s</b></span>
        <span>Actual: <b>{{ liveVelocity.toFixed(0) }} mm/s</b></span>
        <span>Efficiency: <b :class="efficiencyClass">{{ speedEfficiency.toFixed(0) }}%</b></span>
        <span>Drops: <b :class="dropCount > 3 ? 'warning--text' : ''">{{ dropCount }}</b></span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch, Ref } from 'vue-property-decorator'
import type { ECharts, EChartsInitOpts, SetOptionOpts } from 'echarts'

const MAX_SAMPLES = 300
const EFFICIENCY_WARN = 0.70

interface MotionSample { time: string; commanded: number; actual: number; isAnomaly: boolean }

@Component({})
export default class MotionAnomalyChart extends Vue {
  @Prop({ type: Number, default: 180 })
  readonly chartHeight!: number

  @Ref('chart') readonly chartRef?: ECharts

  readonly updateOptions: SetOptionOpts = Object.freeze({ notMerge: false, lazyUpdate: true })
  readonly initOptions: EChartsInitOpts = Object.freeze({ renderer: 'canvas' })

  samples: MotionSample[] = []
  dropCount = 0
  velocityDropDetected = false

  get dataAvailable (): boolean { return !!this.$store.state.printer.printer.motion_report && !!this.$store.state.printer.printer.gcode_move }
  get isPrinting (): boolean { return this.$store.state.printer.printer.print_stats?.state === 'printing' }
  get liveVelocity (): number { return this.$store.state.printer.printer.motion_report?.live_velocity ?? 0 }
  get displayCommandedSpeed (): number {
    if (!this.isPrinting) return 0
    return this.$store.state.printer.printer.gcode_move?.speed ?? 0
  }
  get speedEfficiency (): number {
    if (this.displayCommandedSpeed < 5) return 100
    return Math.min(100, (this.liveVelocity / this.displayCommandedSpeed) * 100)
  }
  get efficiencyClass (): string {
    const e = this.speedEfficiency
    if (e > 90) return 'success--text'; if (e > 70) return 'warning--text'; return 'error--text'
  }
  get isDark (): boolean { return this.$store.state.config.uiSettings.theme.isDark }

  get chartOptions () {
    const isDark = this.isDark
    const fc = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const samples = this.samples

    return {
      animation: false,
      backgroundColor: 'transparent',
      legend: { show: true, bottom: 0, textStyle: { color: fc, fontSize: 10 } },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        textStyle: { color: fc, fontSize: 11 },
        formatter: (params: any[]) => {
          const s = samples[params[0]?.dataIndex]
          if (!s) return ''
          return `<b>${s.time}</b><br/>Commanded: ${s.commanded} mm/s<br/>Actual: <b>${s.actual} mm/s</b>${s.isAnomaly ? '<br/>⚠ Velocity drop' : ''}`
        }
      },
      grid: { top: 8, left: 48, right: 16, bottom: 36 },
      xAxis: { type: 'category', data: samples.map(s => s.time), axisLabel: { show: false }, axisLine: { lineStyle: { color: fc, opacity: 0.15 } }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'mm/s', nameTextStyle: { color: fc, fontSize: 9 }, axisLabel: { color: fc, fontSize: 9 }, splitLine: { lineStyle: { color: fc, opacity: 0.08 } } },
      series: [
        { name: 'Commanded', type: 'line', data: samples.map(s => s.commanded), symbol: 'none', lineStyle: { color: 'rgba(255,255,255,0.25)', type: 'dashed', width: 1 } },
        { name: 'Actual', type: 'line', data: samples.map(s => ({ value: s.actual, itemStyle: { color: s.isAnomaly ? '#f44336' : '#4CAF50' } })), symbol: 'none', lineStyle: { color: '#4CAF50', width: 2 } }
      ]
    }
  }

  @Watch('liveVelocity')
  onVelocityChange () {
    if (!this.isPrinting && this.liveVelocity < 1) return
    const eff = this.speedEfficiency
    const isAnomaly = this.isPrinting && this.displayCommandedSpeed > 10 && eff < EFFICIENCY_WARN * 100
    if (isAnomaly && (this.samples.length === 0 || !this.samples[this.samples.length - 1].isAnomaly)) this.dropCount++
    this.velocityDropDetected = this.samples.slice(-10).some(s => s.isAnomaly)
    this.samples.push({ time: new Date().toLocaleTimeString(), commanded: this.displayCommandedSpeed, actual: this.liveVelocity, isAnomaly })
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
  }
}
</script>
