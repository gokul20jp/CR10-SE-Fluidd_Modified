<template>
  <div class="mesh-compensation-preview">

    <!-- No mesh loaded -->
    <v-alert v-if="!hasMesh" type="warning" dense outlined class="mb-3">
      No mesh loaded. Load a bed mesh profile first (<code>BED_MESH_PROFILE LOAD=default</code>).
    </v-alert>

    <template v-else>

      <!-- ─── Z-Offset + Layer Controls ─────────────────────────────────────── -->
      <v-card outlined class="mb-3">
        <v-card-title class="subtitle-2 pb-0">Controls</v-card-title>
        <v-card-text>
          <v-row align="start">

            <!-- Z-Offset info + adjustment -->
            <v-col cols="12" md="6">
              <div class="caption grey--text mb-1">Z-Offset Sources</div>
              <!-- Row 1: BLTouch config z_offset -->
              <div class="d-flex align-center flex-wrap mb-1" style="gap:6px;">
                <v-chip small outlined>
                  🔧 BLTouch: <b class="ml-1">{{ probeZOffset.toFixed(4) }} mm</b>
                </v-chip>
                <span class="caption grey--text">Saved in printer.cfg — baked into mesh during calibration</span>
              </div>
              <!-- Row 2: Runtime gcode offset -->
              <div class="d-flex align-center flex-wrap mb-2" style="gap:6px;">
                <v-chip small :color="runtimeZOffset !== 0 ? 'orange' : 'grey'" text-color="white">
                  ⚙ Runtime: {{ runtimeZOffset >= 0 ? '+' : '' }}{{ runtimeZOffset.toFixed(4) }} mm
                </v-chip>
                <span class="caption grey--text">From variables.cfg / live adjustment — stacks on BLTouch</span>
              </div>
              <!-- Row 3: Simulation adjustment -->
              <v-row dense class="mb-1 align-center">
                <v-col cols="auto">
                  <v-chip small :color="zOffsetAdj !== 0 ? 'primary' : 'grey'" text-color="white">
                    Sim adj: {{ zOffsetAdj >= 0 ? '+' : '' }}{{ zOffsetAdj.toFixed(3) }} mm
                  </v-chip>
                </v-col>
                <v-col cols="auto">
                  <v-chip small color="primary" text-color="white">
                    Runtime total: {{ (runtimeZOffset + zOffsetAdj).toFixed(4) }} mm
                  </v-chip>
                </v-col>
                <v-col cols="auto">
                  <v-btn text x-small @click="zOffsetAdj = 0">Reset</v-btn>
                </v-col>
              </v-row>
              <v-slider
                v-model="zOffsetAdj"
                :min="-0.5" :max="0.5" :step="0.005"
                thumb-label color="primary" track-color="grey darken-2"
                dense hide-details
              >
                <template #thumb-label="{ value }">
                  {{ value >= 0 ? '+' : '' }}{{ value.toFixed(3) }}
                </template>
              </v-slider>
              <div class="d-flex justify-space-between caption grey--text mt-0">
                <span>-0.5 (closer)</span>
                <span>+0.5 (further)</span>
              </div>
              <div class="caption mt-1 primary--text">
                Drag slider to simulate adding a live Z-offset adjustment on top of the current runtime offset.
                The BLTouch probe offset ({{ probeZOffset.toFixed(4) }}mm) is NOT included — it was baked in during mesh calibration.
              </div>
            </v-col>

            <!-- Layer selector -->
            <v-col cols="12" md="6">
              <div class="caption grey--text mb-1">Layer to preview</div>
              <v-row dense class="mb-1 align-center">
                <v-col cols="auto">
                  <v-chip small color="green" text-color="white">
                    Layer {{ selectedLayer }} — Z={{ selectedLayerZ.toFixed(2) }}mm
                  </v-chip>
                </v-col>
                <v-col cols="auto">
                  <v-chip small :color="layerFadeColor" text-color="white">
                    {{ (getFadeFactorAt(selectedLayerZ) * 100).toFixed(0) }}% mesh correction
                  </v-chip>
                </v-col>
              </v-row>
              <v-slider
                v-model="selectedLayer"
                :min="1" :max="totalLayers" :step="1"
                thumb-label color="green" track-color="grey darken-2"
                dense hide-details
              >
                <template #thumb-label="{ value }">L{{ value }}</template>
              </v-slider>
              <div class="d-flex justify-space-between caption grey--text">
                <span>L1 (Z={{ layerHeight.toFixed(2) }}mm) — Full correction</span>
                <span>L{{ totalLayers }} (≥fade_end) — No correction</span>
              </div>
              <v-row dense class="mt-1 align-center">
                <v-col cols="auto" class="caption grey--text">Layer height:</v-col>
                <v-col cols="2">
                  <v-text-field
                    v-model.number="layerHeight"
                    type="number" step="0.05" min="0.05" max="0.5"
                    dense outlined hide-details style="max-width:80px;"
                  />
                </v-col>
                <v-col cols="auto" class="caption grey--text">mm &nbsp;|&nbsp; Fade: {{ fadeStart }}–{{ fadeEnd }}mm</v-col>
              </v-row>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- ─── Dual 3D Surface Chart ───────────────────────────────────────────── -->
      <v-card outlined class="mb-3">
        <v-card-title class="subtitle-2 pb-0">
          3D Bed Mesh + Compensation at Layer {{ selectedLayer }} (Z={{ selectedLayerZ.toFixed(2) }}mm)
        </v-card-title>
        <v-card-text class="caption grey--text pb-0">
          <b>Solid surface</b> = raw probed bed shape (what the physical bed actually looks like).<br/>
          <b>Translucent surface</b> = mesh correction applied at this layer (what the printer adds to Z, including z-offset adjustment).
          At Layer 1, the correction surface should be a near-mirror of the bed surface.
          As you increase the layer, the correction surface flattens toward zero.
        </v-card-text>
        <div :style="{ height: isMobile ? '320px' : '500px' }">
          <e-chart
            :option="dualSurfaceChartOptions"
            :update-options="updateOpts"
            :init-options="initOpts"
            autoresize
          />
        </div>
        <v-card-text class="pt-1">
          <v-row class="caption">
            <v-col cols="12" sm="4">
              <v-card outlined class="pa-2 text-center">
                <div class="grey--text">Bed shape range</div>
                <div class="font-weight-bold" :class="meshRange > 0.3 ? 'warning--text' : 'success--text'">
                  {{ meshRange.toFixed(4) }} mm
                </div>
                <div class="grey--text">(min to max of raw mesh)</div>
              </v-card>
            </v-col>
            <v-col cols="12" sm="4">
              <v-card outlined class="pa-2 text-center">
                <div class="grey--text">Correction range at L{{ selectedLayer }}</div>
                <div class="font-weight-bold" :class="correctionRange > 0.3 ? 'warning--text' : 'success--text'">
                  {{ correctionRange.toFixed(4) }} mm
                </div>
                <div class="grey--text">({{ (getFadeFactorAt(selectedLayerZ) * 100).toFixed(0) }}% of bed range)</div>
              </v-card>
            </v-col>
            <v-col cols="12" sm="4">
              <v-card outlined class="pa-2 text-center">
                <div class="grey--text">Mirror quality at L{{ selectedLayer }}</div>
                <div class="font-weight-bold" :class="mirrorQuality > 95 ? 'success--text' : 'warning--text'">
                  {{ mirrorQuality.toFixed(0) }}%
                </div>
                <div class="grey--text">(how well correction mirrors bed)</div>
              </v-card>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- ─── 7×7 Correction heatmap ──────────────────────────────────────────── -->
      <v-card outlined class="mb-3">
        <v-card-title class="subtitle-2">
          Correction Heatmap at Layer {{ selectedLayer }} (Z={{ selectedLayerZ.toFixed(2) }}mm)
          <v-spacer />
          <div class="caption grey--text d-flex" style="gap:8px;">
            <span><span style="display:inline-block;width:12px;height:12px;background:rgba(66,165,245,0.7);border-radius:2px;"/>&nbsp;Nozzle pushed up</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:rgba(239,83,80,0.7);border-radius:2px;"/>&nbsp;Nozzle pushed down</span>
          </div>
        </v-card-title>
        <div class="table-scroll-wrapper">
          <table class="mesh-table">
            <thead>
              <tr>
                <th class="corner-cell">Y↓/X→</th>
                <th v-for="(x, xi) in xCoords" :key="'xh'+xi" class="coord-header">{{ x.toFixed(0) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rIdx) in correctionHeatmap" :key="'r'+rIdx">
                <td class="coord-header">{{ yCoords[rIdx].toFixed(0) }}</td>
                <td
                  v-for="(val, cIdx) in row"
                  :key="'c'+rIdx+cIdx"
                  class="mesh-cell"
                  :style="{ backgroundColor: heatColor(val) }"
                >
                  <v-tooltip bottom>
                    <template #activator="{ on, attrs }">
                      <div class="cell-content" v-bind="attrs" v-on="on">
                        {{ val >= 0 ? '+' : '' }}{{ val.toFixed(3) }}
                      </div>
                    </template>
                    <span>
                      X={{ xCoords[cIdx].toFixed(0) }}, Y={{ yCoords[rIdx].toFixed(0) }}mm<br/>
                      Raw bed: {{ getRaw(rIdx, cIdx).toFixed(4) }}mm<br/>
                      Correction (×{{ getFadeFactorAt(selectedLayerZ).toFixed(2) }}): <b>{{ val >= 0 ? '+' : '' }}{{ val.toFixed(4) }}mm</b><br/>
                      BLTouch z_offset: {{ probeZOffset.toFixed(4) }}mm (baked in)<br/>
                      Runtime offset: {{ runtimeZOffset >= 0 ? '+' : '' }}{{ runtimeZOffset.toFixed(4) }}mm<br/>
                      Sim adj: {{ zOffsetAdj >= 0 ? '+' : '' }}{{ zOffsetAdj.toFixed(3) }}mm
                    </span>
                  </v-tooltip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <v-card-text class="caption grey--text pt-1">
          Correction = (raw_mesh − avg_z) × fade_factor + avg_z + runtime_z_offset_adj.<br/>
          <b>BLTouch z_offset ({{ probeZOffset.toFixed(4) }}mm)</b> is NOT in this formula — it was already subtracted from every probe measurement during mesh calibration (in <code>bed_mesh.py line 736</code>).<br/>
          <b>Runtime offset ({{ runtimeZOffset.toFixed(4) }}mm)</b> = from variables.cfg, applied to all moves via <code>gcode_move.homing_origin[2]</code>.
        </v-card-text>
      </v-card>

    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import type { EChartsInitOpts, SetOptionOpts } from 'echarts'

@Component({})
export default class MeshCompensationPreview extends Vue {
  zOffsetAdj = 0
  selectedLayer = 1
  layerHeight = 0.2

  readonly updateOpts: SetOptionOpts = Object.freeze({ notMerge: false, lazyUpdate: true })
  readonly initOpts: EChartsInitOpts = Object.freeze({ renderer: 'canvas' })

  get isMobile (): boolean { return this.$vuetify.breakpoint.mobile }
  get isDark (): boolean { return this.$store.state.config.uiSettings.theme.isDark }

  // ── Klipper data ──────────────────────────────────────────────────────────

  get bedMesh () { return this.$store.state.printer.printer.bed_mesh }
  get hasMesh (): boolean {
    const m = this.bedMesh
    return m && Array.isArray(m.probed_matrix) && m.probed_matrix.length >= 2
  }
  get probedMatrix (): number[][] { return this.bedMesh?.probed_matrix ?? [] }
  get meshMin (): [number, number] { return this.bedMesh?.mesh_min ?? [5, 5] }
  get meshMax (): [number, number] { return this.bedMesh?.mesh_max ?? [215, 215] }
  get rows (): number { return this.probedMatrix.length }
  get cols (): number { return this.probedMatrix[0]?.length ?? 0 }

  /** BLTouch probe z_offset from printer.cfg — used during mesh calibration */
  get probeZOffset (): number {
    return this.$store.state.printer.printer.configfile?.settings?.bltouch?.z_offset ??
           this.$store.state.printer.printer.probe?.z_offset ?? 0
  }

  /** Runtime gcode z_offset from variables.cfg / SET_GCODE_OFFSET — stacks on probe offset */
  get runtimeZOffset (): number {
    return this.$store.state.printer.printer.gcode_move?.homing_origin?.[2] ?? 0
  }

  /** Keep currentZOffset as alias for runtimeZOffset for backward compat */
  get currentZOffset (): number {
    return this.runtimeZOffset
  }
  get fadeStart (): number {
    return this.$store.state.printer.printer.configfile?.settings?.bed_mesh?.fade_start ?? 1.0
  }
  get fadeEnd (): number {
    return this.$store.state.printer.printer.configfile?.settings?.bed_mesh?.fade_end ?? 10.0
  }

  /** avg_z of probed matrix — Klipper's fade_target when config value is 0 */
  get avgZ (): number {
    const flat = this.probedMatrix.flatMap(r => r)
    if (!flat.length) return 0
    return flat.reduce((a, b) => a + b, 0) / flat.length
  }

  get meshRange (): number {
    const flat = this.probedMatrix.flatMap(r => r)
    if (!flat.length) return 0
    return Math.max(...flat) - Math.min(...flat)
  }

  // ── Layer / fade ──────────────────────────────────────────────────────────

  get totalLayers (): number {
    return Math.ceil((this.fadeEnd + this.layerHeight * 3) / this.layerHeight)
  }
  get selectedLayerZ (): number {
    return Math.round(this.selectedLayer * this.layerHeight * 1000) / 1000
  }
  get layerFadeColor (): string {
    const f = this.getFadeFactorAt(this.selectedLayerZ)
    return f === 1 ? 'success' : f === 0 ? 'grey' : 'warning'
  }

  getFadeFactorAt (z: number): number {
    const fadeDist = this.fadeEnd - this.fadeStart
    if (fadeDist <= 0) return 1.0
    if (z >= this.fadeEnd) return 0.0
    if (z >= this.fadeStart) return (this.fadeEnd - z) / fadeDist
    return 1.0
  }

  /** Correction at a raw mesh value for a given Z height — mirrors bed_mesh.py exactly */
  getCorrection (rawMesh: number, z: number): number {
    const factor = this.getFadeFactorAt(z)
    const ft = this.avgZ
    return (rawMesh - ft) * factor + ft + this.zOffsetAdj
  }

  // ── Coordinates ───────────────────────────────────────────────────────────

  get xCoords (): number[] {
    const step = (this.meshMax[0] - this.meshMin[0]) / (this.cols - 1)
    return Array.from({ length: this.cols }, (_, i) => this.meshMin[0] + i * step)
  }
  get yCoords (): number[] {
    const step = (this.meshMax[1] - this.meshMin[1]) / (this.rows - 1)
    // Display top=high Y, bottom=low Y
    return Array.from({ length: this.rows }, (_, i) => this.meshMax[1] - i * step)
  }
  getRaw (displayRIdx: number, cIdx: number): number {
    return this.probedMatrix[this.rows - 1 - displayRIdx]?.[cIdx] ?? 0
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  get correctionAtSelectedLayer (): number[] {
    return this.probedMatrix.flatMap(row =>
      row.map(v => this.getCorrection(v, this.selectedLayerZ))
    )
  }
  get correctionRange (): number {
    const c = this.correctionAtSelectedLayer
    return c.length ? Math.max(...c) - Math.min(...c) : 0
  }
  /** How well correction mirrors the bed: 100% = perfect mirror, 0% = no correlation */
  get mirrorQuality (): number {
    if (!this.meshRange) return 100
    const factor = this.getFadeFactorAt(this.selectedLayerZ)
    // At 100% factor, correction range = mesh range. Quality = how close we are.
    const expected = this.meshRange * factor
    const actual = this.correctionRange - Math.abs(this.zOffsetAdj) // remove adj shift
    return Math.max(0, Math.min(100, 100 - Math.abs(expected - actual) / this.meshRange * 100))
  }

  // ── Heatmap ───────────────────────────────────────────────────────────────

  get correctionHeatmap (): number[][] {
    const z = this.selectedLayerZ
    return [...this.probedMatrix].reverse().map(row =>
      row.map(v => this.getCorrection(v, z))
    )
  }

  heatColor (val: number): string {
    const absMax = Math.max(this.correctionRange / 2, 0.001)
    const t = Math.min(Math.abs(val) / absMax, 1) * 0.75
    return val > 0
      ? `rgba(66, 165, 245, ${t.toFixed(2)})`
      : `rgba(239, 83, 80, ${t.toFixed(2)})`
  }

  // ── Dual 3D surface chart ─────────────────────────────────────────────────

  get dualSurfaceChartOptions () {
    const isDark = this.isDark
    const fc = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const z = this.selectedLayerZ
    const factor = this.getFadeFactorAt(z)

    // Build surface coordinates
    const bedCoords: { name: string; value: [number, number, number] }[] = []
    const corrCoords: { name: string; value: [number, number, number] }[] = []

    this.probedMatrix.forEach((row, rIdx) => {
      const yStep = (this.meshMax[1] - this.meshMin[1]) / (this.rows - 1)
      const y = this.meshMin[1] + rIdx * yStep
      row.forEach((raw, cIdx) => {
        const xStep = (this.meshMax[0] - this.meshMin[0]) / (this.cols - 1)
        const x = this.meshMin[0] + cIdx * xStep
        const label = `X${x.toFixed(0)},Y${y.toFixed(0)}`
        bedCoords.push({ name: label, value: [x, y, raw] })
        corrCoords.push({ name: label, value: [x, y, this.getCorrection(raw, z)] })
      })
    })

    const dims: [number, number] = [this.rows, this.cols]

    // Common Z range covering both surfaces
    const allZ = [...bedCoords.map(c => c.value[2]), ...corrCoords.map(c => c.value[2])]
    const zMin = Math.min(...allZ) - 0.01
    const zMax = Math.max(...allZ) + 0.01
    const absMax = Math.max(Math.abs(zMin), Math.abs(zMax))

    const axisCommon = {
      nameTextStyle: { color: fc, fontSize: 10 },
      axisLabel: { color: fc, fontSize: 9 },
      splitLine: { lineStyle: { color: fc, opacity: 0.08 } }
    }

    return {
      animation: false,
      backgroundColor: 'transparent',
      legend: {
        show: true,
        bottom: 0,
        data: ['Bed Shape (raw mesh)', `Correction at L${this.selectedLayer}`],
        textStyle: { color: fc, fontSize: 11 }
      },
      tooltip: {
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        textStyle: { color: fc, fontSize: 11 },
        formatter: (params: any) => {
          if (!params.value) return ''
          const [x, y, zv] = params.value
          const rawEntry = this.probedMatrix
          // find raw mesh at this point
          const rIdx = Math.round((y - this.meshMin[1]) / ((this.meshMax[1] - this.meshMin[1]) / (this.rows - 1)))
          const cIdx = Math.round((x - this.meshMin[0]) / ((this.meshMax[0] - this.meshMin[0]) / (this.cols - 1)))
          const raw = rawEntry[rIdx]?.[cIdx] ?? 0
          const corr = this.getCorrection(raw, z)
          return `<b>${params.seriesName}</b><br/>
            X=${x.toFixed(0)}, Y=${y.toFixed(0)}mm<br/>
            Raw bed: <b>${raw.toFixed(4)}mm</b><br/>
            Correction (${(factor*100).toFixed(0)}%): <b>${corr >= 0 ? '+' : ''}${corr.toFixed(4)}mm</b><br/>
            BLTouch z_offset: ${this.probeZOffset.toFixed(4)}mm (baked in)<br/>
            Runtime offset: ${this.runtimeZOffset >= 0 ? '+' : ''}${this.runtimeZOffset.toFixed(4)}mm<br/>
            Sim adj: ${this.zOffsetAdj >= 0 ? '+' : ''}${this.zOffsetAdj.toFixed(3)}mm`
        }
      },
      visualMap: {
        show: true,
        dimension: 2,
        min: -absMax,
        max: absMax,
        inRange: { color: ['#f44336', '#9E9E9E', '#2196F3'] },
        textStyle: { color: fc, fontSize: 10 },
        left: 0, top: 0,
        itemWidth: 12, itemHeight: 80,
        precision: 3
      },
      xAxis3D: { type: 'value', min: this.meshMin[0], max: this.meshMax[0], name: 'X (mm)', ...axisCommon },
      yAxis3D: { type: 'value', min: this.meshMin[1], max: this.meshMax[1], name: 'Y (mm)', ...axisCommon },
      zAxis3D: { type: 'value', min: zMin, max: zMax, name: 'Z (mm)', ...axisCommon },
      grid3D: {
        viewControl: {
          rotateSensitivity: 1.5,
          zoomSensitivity: 1.5,
          rotateMouseButton: 'left',
          panMouseButton: 'right',
          distance: 180
        },
        boxWidth: 100, boxDepth: 100, boxHeight: 60
      },
      series: [
        // Surface 1: raw bed shape — solid, fully opaque
        {
          type: 'surface',
          name: 'Bed Shape (raw mesh)',
          shading: 'color',
          wireframe: { show: true, lineStyle: { opacity: 0.3, width: 1 } },
          data: bedCoords,
          dataShape: dims,
          // Solid opacity — this is the real bed
          itemStyle: { opacity: 1.0 }
        },
        // Surface 2: correction at selected layer — translucent
        {
          type: 'surface',
          name: `Correction at L${this.selectedLayer}`,
          shading: 'color',
          wireframe: {
            show: true,
            lineStyle: {
              opacity: 0.5, width: 1.5,
              color: factor === 0 ? 'rgba(150,150,150,0.5)' : 'rgba(255,180,0,0.6)'
            }
          },
          data: corrCoords,
          dataShape: dims,
          itemStyle: { opacity: 0.55 }  // semi-transparent so bed surface shows through
        }
      ]
    }
  }
}
</script>

<style lang="scss" scoped>
.table-scroll-wrapper { overflow-x: auto; padding: 0 12px 12px; }
.mesh-table {
  border-collapse: collapse; font-size: 11px; min-width: 100%;
  th, td { border: 1px solid rgba(128,128,128,0.2); padding: 0; text-align: center; white-space: nowrap; }
}
.corner-cell { font-size: 10px; color: rgba(128,128,128,0.6); padding: 4px 6px; min-width: 55px; }
.coord-header { font-size: 10px; color: rgba(128,128,128,0.8); padding: 4px 6px; min-width: 58px; }
.mesh-cell { padding: 0; min-width: 58px; transition: background-color 0.15s; }
.cell-content { padding: 5px 3px; font-family: 'Roboto Mono', monospace; font-size: 10px; cursor: default; }
</style>
