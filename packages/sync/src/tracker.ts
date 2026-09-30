import {
  DEFAULT_TOLERANCE,
  estimateOffset,
  type EstimateOptions,
  type HeardTrigram,
} from './histogram.js'
import type { SyncIndex } from './index-format.js'

export type TrackerPhase = 'listening' | 'locked'

/** Pourquoi le suivi est repassé en écoute. */
export type UnlockReason = 'lost' | 'jump'

export interface TrackerOptions extends EstimateOptions {
  /** Trigrammes concordants exigés pour verrouiller. Défaut : 3. */
  readonly minSupport?: number
  /** Délai au bout duquel un recalage est souhaitable, en secondes. Défaut : 30. */
  readonly resyncInterval?: number
  /** Écart avec la position prédite au-delà duquel on parle d'un saut. Défaut : 3 s. */
  readonly maxJump?: number
  /** Échecs consécutifs tolérés avant de lâcher le verrou. Défaut : 3. */
  readonly maxConsecutiveFailures?: number
  /** Profondeur de l'historique servant à estimer le débit, en secondes. Défaut : 600. */
  readonly rateWindow?: number
  /** Écart temporel minimal entre ancres avant d'oser estimer un débit. Défaut : 180 s. */
  readonly minRateSpan?: number
  /** Nombre d'ancres minimal avant d'oser estimer un débit. Défaut : 5. */
  readonly minRateAnchors?: number
  /**
   * Erreur type maximale tolérée sur la pente. Défaut : 0,003.
   *
   * C'est le garde-fou qui compte : une pente peut être parfaitement calculée et
   * néanmoins ne rien signifier si les ancres sont bruitées sur une courte durée.
   */
  readonly maxRateStdError?: number
  /**
   * Bornes du débit estimé. Défaut : [0,94 ; 1,06].
   *
   * Les seuls écarts réels viennent des conversions de cadence : 25/23,976 = 1,0427,
   * son inverse 0,959, et 30/29,97 = 1,001. Tout ce qui sort de cet intervalle est
   * une erreur d'estimation, pas un film.
   */
  readonly rateBounds?: readonly [number, number]
}

export interface TrackerStatus {
  readonly phase: TrackerPhase
  /**
   * Instant local du dernier recalage réussi, en secondes. Combiné à `mediaTimeAt`,
   * il dit à quel point la position affichée est fraîche.
   */
  readonly anchoredAt: number | undefined
  /** Vitesse de lecture relative à la timeline canonique. 1 tant qu'elle n'est pas mesurée. */
  readonly rate: number
  /** Nombre de trigrammes concordants du dernier relevé exploitable. */
  readonly support: number
  /** Pourquoi le dernier verrou a été perdu, le cas échéant. */
  readonly lastUnlockReason: UnlockReason | undefined
}

interface Anchor {
  readonly local: number
  readonly canonical: number
}

const DEFAULTS = {
  minSupport: 3,
  resyncInterval: 30,
  maxJump: 3,
  maxConsecutiveFailures: 3,
  rateWindow: 600,
  minRateSpan: 180,
  minRateAnchors: 5,
  maxRateStdError: 0.003,
  rateBounds: [0.94, 1.06] as readonly [number, number],
}

/**
 * Suit la position du film à partir de ce que le micro entend.
 *
 * Deux états seulement : on écoute, ou on est verrouillé. Verrouillé, une horloge
 * locale prend le relais — le compte à rebours doit être exact à la centiseconde
 * près alors que Whisper ne produit un relevé que toutes les quelques secondes.
 *
 * Le suivi estime aussi le **débit** de lecture, ce que §7.3 ne demande pas. Sans
 * cela, un transfert PAL (25/23,976, soit 4,3 % d'écart) dérive de 1,3 s entre
 * deux recalages espacés de 30 s — de quoi déclencher la protection après la
 * scène plutôt qu'avant. Voir `docs/adr/0004`.
 */
export class SyncTracker {
  readonly #index: SyncIndex
  readonly #options: Required<TrackerOptions>

  #phase: TrackerPhase = 'listening'
  #anchors: Anchor[] = []
  #rate = 1
  #failures = 0
  #support = 0
  #unlockReason: UnlockReason | undefined

  constructor(index: SyncIndex, options: TrackerOptions = {}) {
    this.#index = index
    this.#options = {
      minSupport: options.minSupport ?? DEFAULTS.minSupport,
      resyncInterval: options.resyncInterval ?? DEFAULTS.resyncInterval,
      maxJump: options.maxJump ?? DEFAULTS.maxJump,
      maxConsecutiveFailures: options.maxConsecutiveFailures ?? DEFAULTS.maxConsecutiveFailures,
      rateWindow: options.rateWindow ?? DEFAULTS.rateWindow,
      minRateSpan: options.minRateSpan ?? DEFAULTS.minRateSpan,
      minRateAnchors: options.minRateAnchors ?? DEFAULTS.minRateAnchors,
      maxRateStdError: options.maxRateStdError ?? DEFAULTS.maxRateStdError,
      rateBounds: options.rateBounds ?? DEFAULTS.rateBounds,
      tolerance: options.tolerance ?? DEFAULT_TOLERANCE,
    }
  }

  get status(): TrackerStatus {
    return {
      phase: this.#phase,
      anchoredAt: this.#phase === 'locked' ? this.#latestAnchor()?.local : undefined,
      rate: this.#rate,
      support: this.#support,
      lastUnlockReason: this.#unlockReason,
    }
  }

  /** Position estimée dans le film à un instant local donné. */
  mediaTimeAt(localTime: number): number | undefined {
    if (this.#phase !== 'locked') return undefined
    const anchor = this.#latestAnchor()
    if (anchor === undefined) return undefined
    return anchor.canonical + (localTime - anchor.local) * this.#rate
  }

  /** Vrai quand le dernier recalage commence à dater. Le client décide quand réécouter. */
  needsResync(localTime: number): boolean {
    if (this.#phase !== 'locked') return true
    const anchor = this.#latestAnchor()
    if (anchor === undefined) return true
    return localTime - anchor.local >= this.#options.resyncInterval
  }

  /** Repasse délibérément en écoute — par exemple quand l'utilisateur signale un décalage. */
  reset(): void {
    this.#phase = 'listening'
    this.#anchors = []
    this.#rate = 1
    this.#failures = 0
    this.#support = 0
    this.#unlockReason = undefined
  }

  /**
   * Soumet un relevé. Renvoie l'état résultant.
   *
   * Un relevé qui ne concorde pas assez ne fait jamais perdre le verrou tout de
   * suite : un passage sans dialogue, de la musique ou un bruit de salon sont
   * des situations normales. Il faut `maxConsecutiveFailures` échecs de suite.
   */
  observe(heard: readonly HeardTrigram[]): TrackerStatus {
    const estimate =
      heard.length === 0
        ? undefined
        : estimateOffset(heard, this.#index, { tolerance: this.#options.tolerance })

    if (estimate === undefined || estimate.support < this.#options.minSupport) {
      this.#registerFailure()
      return this.status
    }

    this.#support = estimate.support
    this.#failures = 0

    // Le relevé couvre une fenêtre : on l'ancre en son milieu, pas à son début,
    // sinon un débit différent de 1 biaise systématiquement l'ancre.
    const times = heard.map((t) => t.at)
    const local = (Math.min(...times) + Math.max(...times)) / 2
    const canonical = local + estimate.offset

    if (this.#phase === 'listening') {
      this.#anchors = [{ local, canonical }]
      this.#rate = 1
      this.#phase = 'locked'
      this.#unlockReason = undefined
      return this.status
    }

    const predicted = this.mediaTimeAt(local)
    if (predicted !== undefined && Math.abs(canonical - predicted) > this.#options.maxJump) {
      // Pause, avance rapide ou coupure publicitaire : la position d'avant n'a
      // plus cours, et l'historique de débit qu'elle a servi à construire non plus.
      this.#unlock('jump')
      return this.status
    }

    this.#anchors.push({ local, canonical })
    this.#pruneAnchors(local)
    this.#rate = this.#estimateRate()
    return this.status
  }

  #registerFailure(): void {
    if (this.#phase !== 'locked') return
    this.#failures += 1
    if (this.#failures >= this.#options.maxConsecutiveFailures) this.#unlock('lost')
  }

  #unlock(reason: UnlockReason): void {
    this.#phase = 'listening'
    this.#anchors = []
    this.#rate = 1
    this.#failures = 0
    this.#support = 0
    this.#unlockReason = reason
  }

  #latestAnchor(): Anchor | undefined {
    return this.#anchors[this.#anchors.length - 1]
  }

  #pruneAnchors(now: number): void {
    const cutoff = now - this.#options.rateWindow
    const kept = this.#anchors.filter((a) => a.local >= cutoff)
    // On garde toujours la dernière ancre, même trop ancienne : elle porte la position.
    this.#anchors = kept.length > 0 ? kept : this.#anchors.slice(-1)
  }

  /**
   * Moindres carrés sur les ancres récentes : la pente est le débit de lecture.
   *
   * **Une pente n'est adoptée que si elle est mesurée, pas devinée.** Les ancres
   * portent un bruit de segmentation de quelques dixièmes de seconde ; sur une
   * courte durée, la pente que ce bruit produit est indiscernable d'un vrai écart
   * de cadence. L'adopter fait dériver la position de plusieurs dizaines de
   * secondes — et une position fausse décale toutes les protections.
   *
   * D'où trois conditions cumulatives : assez d'ancres, une durée assez longue,
   * et une **erreur type** sur la pente assez faible. Tant qu'elles ne sont pas
   * réunies, le débit reste à 1, ce qui est le comportement de §7.3 — donc jamais
   * pire que ce que le cahier des charges demande.
   */
  #estimateRate(): number {
    const anchors = this.#anchors
    if (anchors.length < this.#options.minRateAnchors) return this.#rate

    const first = anchors[0] as Anchor
    const last = anchors[anchors.length - 1] as Anchor
    if (last.local - first.local < this.#options.minRateSpan) return this.#rate

    const n = anchors.length
    let sumX = 0
    let sumY = 0
    for (const a of anchors) {
      sumX += a.local
      sumY += a.canonical
    }
    const meanX = sumX / n
    const meanY = sumY / n

    let sxy = 0
    let sxx = 0
    for (const a of anchors) {
      const dx = a.local - meanX
      sxy += dx * (a.canonical - meanY)
      sxx += dx * dx
    }
    if (sxx === 0) return this.#rate

    const slope = sxy / sxx
    const intercept = meanY - slope * meanX

    // Erreur type de la pente : sans elle, on ne sait pas si la pente décrit les
    // ancres ou le bruit qu'elles portent.
    let sumSquaredResiduals = 0
    for (const a of anchors) {
      const residual = a.canonical - (intercept + slope * a.local)
      sumSquaredResiduals += residual * residual
    }
    const variance = sumSquaredResiduals / (n - 2)
    const standardError = Math.sqrt(variance / sxx)
    if (!Number.isFinite(standardError) || standardError > this.#options.maxRateStdError) {
      return this.#rate
    }

    const [min, max] = this.#options.rateBounds
    // Hors de ces bornes, ce n'est pas un film : c'est une erreur d'estimation.
    if (slope < min || slope > max) return this.#rate
    return slope
  }
}
