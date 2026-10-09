import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone =
  | 'neutral'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'info';

@Component({
  selector: 'app-badge',
  templateUrl: './badge.html',
  styleUrl: './badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Badge {
  readonly label = input.required<string>();
  readonly tone = input<BadgeTone>('neutral');
}
