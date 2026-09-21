import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';

import {
  CHART_HEIGHT,
  CHART_WIDTH,
  X_LABEL_Y,
  Y_LABEL_X,
  type ChartPoint,
  type SeriesChart
} from '../core/series-chart';

/** Draws one `SeriesChart`. All geometry arrives computed; this only renders. */
@Component({
  selector: 'app-series-chart',
  templateUrl: './series-chart.html',
  styleUrl: './series-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SeriesChartCard {
  readonly chart = input.required<SeriesChart>();

  protected readonly width = CHART_WIDTH;
  protected readonly height = CHART_HEIGHT;
  protected readonly xLabelY = X_LABEL_Y;
  protected readonly yLabelX = Y_LABEL_X;

  protected readonly hovered = signal<ChartPoint | null>(null);

  protected hover(point: ChartPoint): void {
    this.hovered.set(point);
  }

  protected clearHover(): void {
    this.hovered.set(null);
  }
}
