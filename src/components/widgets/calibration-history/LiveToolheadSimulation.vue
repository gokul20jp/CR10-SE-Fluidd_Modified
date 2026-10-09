<template>
  <v-card outlined class="live-toolhead-card">
    <v-card-title class="subtitle-2 pb-1">
      3D Toolhead Movement
      <v-spacer />
      <v-chip x-small :color="isPrinting ? 'green' : 'grey'" text-color="white" class="mr-1">
        {{ isPrinting ? 'PRINTING' : 'IDLE' }}
      </v-chip>
      <v-btn icon x-small @click="clearTrail()">
        <v-icon x-small>$delete</v-icon>
      </v-btn>
    </v-card-title>

    <v-card-text class="pa-0">
      <v-alert
        v-if="!motionReportAvailable"
        type="info"
        dense
        outlined
        class="ma-3"
      >
        <code>motion_report</code> is not available. Enable it by adding
        <code>[motion_report]</code> to your <code>printer.cfg</code>, or wait for Klipper to be ready.
      </v-alert>
      <div v-else :style="{ height: chartHeight + 'px' }">
        <e-chart
          :option="chartOptions"
          :init-options="{ renderer: 'canvas' }"
          autoresize
        />
      </div>
      <!-- Live coords — show raw machine position, not the adjusted display pos -->
      <div v-if="motionReportAvailable" class="px-3 pb-2 d-flex justify-space-between caption grey--text">
        <span>X: <b>{{ rawPos[0].toFixed(1) }}</b></span>
        <span>Y: <b>{{ rawPos[1].toFixed(1) }}</b></span>
        <span>Z: <b>{{ rawPos[2].toFixed(3) }}</b></span>
        <span>V: <b>{{ velocity.toFixed(0) }}</b> mm/s</span>
        <span>Trail: {{ trail.length }} pts</span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'

const MAX_TRAIL = 800     // max positions to keep in trail
const SAMPLE_MS = 200     // sample interval in ms

@Component({})
export default class LiveToolheadSimulation extends Vue {
  @Prop({ type: Number, default: 300 })
  readonly chartHeight!: number

  trail: Array<[number, number, number, number]> = []  // [x, y, z, velocity]
  private _sampleInterval: ReturnType<typeof setInterval> | null = null

  get isPrinting (): boolean {
    return this.$store.state.printer.printer.print_stats?.state === 'printing'
  }

  get motionReportAvailable (): boolean {
    return !!this.$store.state.printer.printer.motion_report
  }

  /** Raw machine position (for display in coords bar) */
  get rawPos (): number[] {
    return this.$store.state.printer.printer.motion_report?.live_position ?? [0, 0, 0, 0]
  }

  get pos (): number[] {
    const raw = this.$store.state.printer.printer.motion_report?.live_position
    if (!raw) {
      // Not available yet — show center of bed as default
      const { minX, maxX, minY, maxY } = this.bedSize
      return [(minX + maxX) / 2, (minY + maxY) / 2, 5, 0]
    }
    // If homed position is 0,0 (machine home / pre-home), show center of bed visually
    // so the dot is visible inside the bed, not at the corner/outside
    const [x, y, z, e] = raw
    if (x === 0 && y === 0 && z === 0) {
      const { minX, maxX, minY, maxY } = this.bedSize
      return [(minX + maxX) / 2, (minY + maxY) / 2, 5, e]
    }
    return raw
  }

  get velocity (): number {
    return this.$store.state.printer.printer.motion_report?.live_velocity ?? 0
  }

  get isDark (): boolean {
    return this.$store.state.config.uiSettings.theme.isDark
  }

  get bedSize () {
    return this.$store.getters['printer/getBedSize'] ?? { minX: 0, maxX: 220, minY: 0, maxY: 220 }
  }

  // Max Z from printer config
  get maxZ (): number {
    return this.$store.state.printer.printer.toolhead?.axis_maximum?.[2] ?? 265
  }

  @Watch('pos', { immediate: true })
  onPosChange (newPos: number[]) {
    // Always track position — even at idle, so the toolhead dot is always visible
    const v = this.velocity
    this.trail.push([newPos[0], newPos[1], newPos[2], v])
    if (this.trail.length > MAX_TRAIL) {
      this.trail.splice(0, this.trail.length - MAX_TRAIL)
    }
  }

  get chartOptions () {
    const isDark = this.isDark
    const fontColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const { minX, maxX, minY, maxY } = this.bedSize
    const maxZ = this.maxZ

    // Current position — always show, even at idle
    const current = this.pos
    const currentPoint = {
      name: 'current',
      value: [current[0], current[1], current[2]],
      itemStyle: { color: '#FF5722', opacity: 1 },
      symbolSize: 16
    }

    // Trail: only show when printing; at idle show last few points only
    const trailSrc = this.isPrinting ? this.trail : this.trail.slice(-3)
    // line3D just needs [x, y, z] arrays
    const trailData = trailSrc.map(pt => [pt[0], pt[1], pt[2]])

    return {
      darkMode: isDark,
      backgroundColor: 'transparent',
      tooltip: { show: false },
      xAxis3D: {
        type: 'value', min: minX, max: maxX, name: 'X',
        nameTextStyle: { color: fontColor },
        axisLabel: { color: fontColor, fontSize: 10 },
        splitLine: { lineStyle: { color: fontColor, opacity: 0.08 } }
      },
      yAxis3D: {
        type: 'value', min: minY, max: maxY, name: 'Y',
        nameTextStyle: { color: fontColor },
        axisLabel: { color: fontColor, fontSize: 10 },
        splitLine: { lineStyle: { color: fontColor, opacity: 0.08 } }
      },
      zAxis3D: {
        type: 'value', min: 0, max: maxZ, name: 'Z',
        nameTextStyle: { color: fontColor },
        axisLabel: { color: fontColor, fontSize: 10 },
        splitLine: { lineStyle: { color: fontColor, opacity: 0.08 } }
      },
      grid3D: {
        boxWidth: 100, boxDepth: 100, boxHeight: 50,
        viewControl: {
          rotateSensitivity: 1.5,
          zoomSensitivity: 1.5,
          rotateMouseButton: 'left',
          panMouseButton: 'right'
        },
        environment: 'auto',
        light: { main: { shadow: false } }
      },
      series: [
        // Trail — drawn as a 3D line so the full toolhead path is visible
        {
          type: 'line3D',
          name: 'trail',
          data: trailData,
          lineStyle: {
            color: '#42A5F5',   // blue trail
            width: 3,
            opacity: 0.8
          }
        },
        // Recent trail segment (last 20 pts) — highlighted in orange to show current direction
        ...(trailData.length > 20 ? [{
          type: 'line3D',
          name: 'recent',
          data: trailData.slice(-20),
          lineStyle: { color: '#FF9800', width: 4, opacity: 1.0 },
          showInLegend: false
        }] : []),
        // Current position (large dot) — rendered on top of trail end
        {
          type: 'scatter3D',
          name: 'current',
          data: [{ ...currentPoint, value: [...currentPoint.value, this.velocity] }],
          symbolSize: 14,
          itemStyle: { color: '#FF5722' },
          label: {
            show: true,
            formatter: () => `Z:${current[2].toFixed(2)}`,
            textStyle: { color: '#FF5722', fontSize: 10 }
          }
        },
        // Bed plane (4 corners)
        {
          type: 'scatter3D',
          name: 'bed',
          data: [
            { value: [minX, minY, 0, 0], itemStyle: { color: 'rgba(33,150,243,0.3)', opacity: 0.3 } },
            { value: [maxX, minY, 0, 0], itemStyle: { color: 'rgba(33,150,243,0.3)', opacity: 0.3 } },
            { value: [maxX, maxY, 0, 0], itemStyle: { color: 'rgba(33,150,243,0.3)', opacity: 0.3 } },
            { value: [minX, maxY, 0, 0], itemStyle: { color: 'rgba(33,150,243,0.3)', opacity: 0.3 } }
          ],
          symbolSize: 1
        }
      ]
    }
  }

  clearTrail () {
    this.trail = []
  }

  beforeDestroy () {
    if (this._sampleInterval) clearInterval(this._sampleInterval)
  }
}
</script>
