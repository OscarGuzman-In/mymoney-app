import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatTrend = 'positive' | 'negative' | 'neutral';

@Component({
  selector: 'app-stat-card',
  templateUrl: './stat-card.html',
  styleUrl: './stat-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string>('');
  readonly trend = input<StatTrend>('neutral');
}
