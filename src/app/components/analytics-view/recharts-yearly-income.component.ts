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
import {
  YearlyIncomeItem,
  YearlyIncomeSummary,
  RechartsYearlyIncomeChart,
} from './recharts-wrapper';

@Component({
  selector: 'app-recharts-yearly-income',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #chartContainer class="w-full"></div>`,
})
export class RechartsYearlyIncomeComponent implements OnChanges, OnDestroy {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  @Input() data: YearlyIncomeItem[] = [];
  @Input() summary: YearlyIncomeSummary | null = null;

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

    const defaultSummary: YearlyIncomeSummary = this.summary || {
      year: new Date().getFullYear(),
      totalYearIncome: this.data.reduce((sum, d) => sum + (d.totalIncome || 0), 0),
      averageMonthlyIncome: 0,
      totalYearPaymentsCount: this.data.reduce((sum, d) => sum + (d.paymentsCount || 0), 0),
      highestMonth: null,
      currentMonthIncome: 0,
      projectedYearEndIncome: 0,
    };

    this.root.render(
      React.createElement(RechartsYearlyIncomeChart, {
        data: this.data,
        summary: defaultSummary,
      })
    );
  }
}
