import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MonthlyChartItem, RechartsDynamicsChart } from './recharts-wrapper';

@Component({
  selector: 'app-recharts-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #chartContainer class="w-full"></div>`,
})
export class RechartsChartComponent implements OnChanges, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  @Input() data: MonthlyChartItem[] = [];
  @Input() providerBalanceUsd = 0;
  @Input() isProviderBalanceLow = false;

  private root: Root | null = null;

  ngOnChanges(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  private renderChart(): void {
    if (!this.chartContainer) return;

    if (!this.root) {
      this.root = createRoot(this.chartContainer.nativeElement);
    }

    this.root.render(
      React.createElement(RechartsDynamicsChart, {
        data: this.data,
        providerBalanceUsd: this.providerBalanceUsd,
        isProviderBalanceLow: this.isProviderBalanceLow,
      })
    );
  }
}
