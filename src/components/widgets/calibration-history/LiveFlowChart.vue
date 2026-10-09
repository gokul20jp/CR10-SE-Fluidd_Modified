<template>
  <v-card outlined>
    <v-card-title class="subtitle-2 pb-1">
      Filament Flow & E-Axis Slip
      <v-spacer />
      <v-chip x-small class="mr-1">
        Flow: <b class="ml-1">{{ currentFlow.toFixed(1) }} mm/s</b>
      </v-chip>
      <v-chip v-if="slipDetected" x-small color="error" text-color="white">⚠ Slip!</v-chip>
    </v-card-title>

    <v-card-text class="pa-0">
      <v-alert v-if="!dataAvailable" type="info" dense outlined class="ma-3">
        Waiting for <code>motion_report</code> and <code>gcode_move</code> data from Klipper...
      </v-alert>
      <div v-else style="position: relative;">
        <div
          v-if="!isPrinting && samples.length === 0"
          class="grey--text caption text-center"
          style="position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);pointer-events:none;z-index:1;"
        >
          Chart will populate when printing starts.<br/>
          <span style="font-size:10px;">E-axis: {{ commandedE.toFixed(1) }} cmd / {{ actualE.toFixed(1) }} actual</span>
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
      <div class="px-3 pb-2 d-flex justify-space-between caption grey--text">
        <span>Extrude factor: <b>{{ (extrudeFactor * 100).toFixed(0) }}%</b></span>
        <span>Max slip: <b :class="maxSlip > 5 ? 'error--text' : ''">{{ maxSlip.toFixed(1) }} mm</b></span>
        <span>Commanded E: <b>{{ commandedE.toFixed(1) }}</b></span>
        <span>Actual E: <b>{{ actualE.toFixed(1) }}</b></span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch, Ref } from 'vue-property-decorator'
import type { ECharts, EChartsInitOpts, SetOptionOpts } from 'echarts'

const MAX_SAMPLES = 300
const SLIP_THRESHOLD = 5.0

interface FlowSample { time: string; flow: number; slip: number }

@Component({})
export default class LiveFlowChart extends Vue {
  @Prop({ type: Number, default: 180 })
  readonly chartHeight!: number

  @Ref('chart') readonly chartRef?: ECharts

  readonly updateOptions: SetOptionOpts = Object.freeze({ notMerge: false, lazyUpdate: true })
  readonly initOptions: EChartsInitOpts = Object.freeze({ renderer: 'canvas' })

  samples: FlowSample[] = []
  maxSlip = 0

  get dataAvailable (): boolean { return !!this.$store.state.printer.printer.motion_report && !!this.$store.state.printer.printer.gcode_move }
  get isPrinting (): boolean { return this.$store.state.printer.printer.print_stats?.state === 'printing' }
  get liveVelocity (): number { return this.$store.state.printer.printer.motion_report?.live_velocity ?? 0 }
  get extrudeFactor (): number { return this.$store.state.printer.printer.gcode_move?.extrude_factor ?? 1 }
  get commandedE (): number { return this.$store.state.printer.printer.gcode_move?.position?.[3] ?? 0 }
  get actualE (): number { return this.$store.state.printer.printer.motion_report?.live_position?.[3] ?? 0 }
  get currentFlow (): number { return Math.max(0, this.liveVelocity * this.extrudeFactor) }
  get slip (): number { return Math.abs(this.commandedE - this.actualE) }
  get slipDetected (): boolean { return this.slip > SLIP_THRESHOLD }
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
          return `<b>${s.time}</b><br/>Flow: <b>${s.flow.toFixed(1)} mm/s</b><br/>E-Slip: ${s.slip.toFixed(2)} mm`
        }
      },
      grid: { top: 8, left: 56, right: 16, bottom: 36 },
      xAxis: { type: 'category', data: samples.map(s => s.time), axisLabel: { show: false }, axisLine: { lineStyle: { color: fc, opacity: 0.15 } }, axisTick: { show: false } },
      yAxis: [
        { type: 'value', name: 'Flow mm/s', nameTextStyle: { color: fc, fontSize: 9 }, axisLabel: { color: fc, fontSize: 9 }, splitLine: { lineStyle: { color: fc, opacity: 0.08 } } },
        { type: 'value', name: 'Slip mm', nameTextStyle: { color: fc, fontSize: 9 }, axisLabel: { color: fc, fontSize: 9 }, splitLine: { show: false } }
      ],
      series: [
        { name: 'Flow Rate', type: 'line', yAxisIndex: 0, data: samples.map(s => s.flow), symbol: 'none', lineStyle: { color: '#4CAF50', width: 2 }, areaStyle: { color: 'rgba(76,175,80,0.1)' } },
        {
          name: 'E-Axis Slip', type: 'line', yAxisIndex: 1, data: samples.map(s => s.slip), symbol: 'none', lineStyle: { color: '#f44336', width: 1.5 },
          markLine: { silent: true, data: [{ yAxis: SLIP_THRESHOLD, lineStyle: { type: 'dashed', color: 'rgba(244,67,54,0.4)', width: 1 }, label: { formatter: `slip ${SLIP_THRESHOLD}mm`, fontSize: 9 } }] }
        }
      ]
    }
  }

  @Watch('liveVelocity')
  onVelocityChange () {
    if (!this.isPrinting && this.liveVelocity < 1) return
    const slip = this.slip
    this.maxSlip = Math.max(this.maxSlip, slip)
    this.samples.push({ time: new Date().toLocaleTimeString(), flow: +this.currentFlow.toFixed(2), slip: +slip.toFixed(3) })
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
  }
}
</script>
