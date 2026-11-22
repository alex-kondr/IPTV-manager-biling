import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';
import {
  SHOPPING_CATEGORIES,
  ShoppingCatalogItem,
  ShoppingCategoryId,
  ShoppingCategoryMeta,
  ShoppingItem,
  ShoppingList,
  ShoppingParticipant,
  ShoppingPriceMode,
  computeShoppingItemTotal,
  resolveShoppingItemImage,
  resolveShoppingPriceMode,
} from '../../models/shopping.model';

type ShoppingItemFilter = 'all' | 'todo' | 'bought';

@Component({
  selector: 'app-shopping-view',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5 animate-fade-in">
      <!-- Top Header -->
      <div class="flex items-center gap-3 min-w-0">
        <button
          type="button"
          (click)="backToHome.emit()"
          class="w-10 h-10 rounded-2xl bg-white dark:bg-[#111827] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 cursor-pointer transition-colors shadow-xs"
          title="Повернутися до меню"
        >
          <mat-icon class="text-xl leading-none">arrow_back</mat-icon>
        </button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <mat-icon class="text-lg leading-none">shopping_cart</mat-icon>
            </span>
            <h1 class="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              Спільні покупки
            </h1>
            <button
              id="btn-new-shopping-list"
              type="button"
              (click)="openCreateListModal()"
              aria-label="Новий список"
              title="Новий список"
              class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white inline-flex items-center justify-center shrink-0 cursor-pointer border-0 shadow-sm shadow-rose-500/20 transition-all active:scale-95"
            >
              <mat-icon class="text-lg leading-none">add</mat-icon>
            </button>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Списки з родиною та друзями
          </p>
        </div>
      </div>

      <!-- Shopping Lists Switcher Strip -->
      @if (sortedLists().length > 0) {
        <div class="flex items-stretch gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          @for (list of sortedLists(); track list.id) {
            @let isSelected = selectedListId() === list.id;
            @let isInactive = !!list.isInactive;
            @let listSpent = computeListSpent(list);
            @let listBought = computeListBoughtCount(list);
            @let listOver = list.budgetUah !== null && list.budgetUah > 0 && listSpent > list.budgetUah;
            <button
              type="button"
              (click)="selectList(list.id)"
              [class]="isSelected
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-500/20'
                : (isInactive
                  ? 'bg-slate-100/90 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-slate-300/80 dark:border-slate-800 opacity-60 hover:opacity-100 border-dashed'
                  : 'bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500/40')"
              class="min-w-[200px] max-w-[260px] shrink-0 text-left rounded-3xl px-4 py-3 border transition-all cursor-pointer flex flex-col justify-between gap-2"
            >
              <div class="space-y-1 w-full">
                <div class="flex items-start justify-between gap-2 w-full">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="font-bold text-sm truncate" [class.line-through]="isInactive && !isSelected">{{ list.title }}</span>
                    @if (isInactive) {
                      <span
                        [class]="isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
                        class="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0"
                      >
                        Неактивний
                      </span>
                    }
                  </div>
                  <span
                    [class]="isSelected
                      ? 'bg-white/20 text-white'
                      : (isInactive ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')"
                    class="px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 tabular-nums"
                  >
                    {{ listBought }}/{{ list.items.length }}
                  </span>
                </div>
                @if (formatDateTime(list.createdAt); as listCreatedLabel) {
                  <div
                    class="flex items-center gap-1 text-[10px] font-medium tabular-nums"
                    [class.text-rose-100/90]="isSelected"
                    [class.text-slate-400]="!isSelected"
                    [class.dark:text-slate-500]="!isSelected"
                  >
                    <mat-icon class="text-[12px] w-3 h-3 leading-none shrink-0">schedule</mat-icon>
                    <span>{{ listCreatedLabel }}</span>
                  </div>
                }
              </div>
              <div class="flex items-center justify-between gap-2 text-xs">
                @let cardPeople = getListParticipants(list);
                <div class="flex items-center -space-x-1.5 min-w-0" [title]="getParticipantSummaryLabel(list)">
                  @for (person of cardPeople.slice(0, 4); track person.id) {
                    <span
                      [title]="person.name"
                      [attr.aria-label]="person.name"
                      [class]="isSelected
                        ? 'ring-rose-600 bg-white/25 text-white'
                        : 'ring-white dark:ring-[#111827] bg-rose-500/15 text-rose-600 dark:text-rose-300'"
                      class="w-5 h-5 rounded-full ring-2 inline-flex items-center justify-center overflow-hidden text-[9px] font-extrabold shrink-0"
                    >
                      @if (person.picture) {
                        <img
                          [src]="person.picture"
                          [alt]="person.name"
                          referrerpolicy="no-referrer"
                          class="w-full h-full object-cover"
                        />
                      } @else {
                        <span>{{ getInitial(person.name) }}</span>
                      }
                    </span>
                  }
                  @if (cardPeople.length > 4) {
                    <span
                      [class]="isSelected
                        ? 'ring-rose-600 bg-white/25 text-white'
                        : 'ring-white dark:ring-[#111827] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'"
                      class="w-5 h-5 rounded-full ring-2 inline-flex items-center justify-center text-[9px] font-extrabold shrink-0"
                    >
                      +{{ cardPeople.length - 4 }}
                    </span>
                  }
                </div>
                <span
                  class="font-extrabold tabular-nums shrink-0"
                  [class.text-white]="isSelected"
                  [class.text-rose-600]="!isSelected && listOver"
                  [class.dark:text-rose-400]="!isSelected && listOver"
                  [class.text-slate-900]="!isSelected && !listOver"
                  [class.dark:text-white]="!isSelected && !listOver"
                >
                  {{ formatUah(listSpent) }} ₴
                </span>
              </div>
            </button>
          }
        </div>
      }

      <!-- Empty State when no lists exist -->
      @if (!isLoading() && sortedLists().length === 0) {
        <div class="bg-white dark:bg-[#111827] rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 sm:p-12 text-center shadow-sm space-y-4">
          <div class="w-16 h-16 rounded-3xl bg-rose-100 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <mat-icon class="text-4xl leading-none">add_shopping_cart</mat-icon>
          </div>
          <div class="max-w-md mx-auto space-y-1.5">
            <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              Створіть перший список покупок
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Вибирайте людей для спільного ведення списку, задавайте наявний бюджет, вносьте ціни куплених товарів та додавайте продукти у 1 клік із великого каталогу.
            </p>
          </div>
          <button
            type="button"
            (click)="openCreateListModal()"
            class="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold inline-flex items-center gap-2 cursor-pointer border-0 shadow-md shadow-rose-500/20 transition-all"
          >
            <mat-icon class="text-lg leading-none">add</mat-icon>
            <span>Створити список покупок</span>
          </button>
        </div>
      }

      <!-- Active Shopping List Workspace -->
      @if (activeList(); as list) {
        @let metrics = activeListMetrics();
        <div class="space-y-4">
          <!-- Budget & Participants Hero Card -->
          <div class="bg-white dark:bg-[#111827] rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
            <!-- List Header & Actions -->
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div class="space-y-2 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white break-words" [class.line-through]="list.isInactive">
                    {{ list.title }}
                  </h2>
                  @if (list.isInactive) {
                    <span class="px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1">
                      <mat-icon class="text-xs leading-none">archive</mat-icon>
                      <span>Неактивний</span>
                    </span>
                  }
                  @if (list.ownerUserId === currentUserId()) {
                    <span class="px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[11px] font-bold">
                      Ваш список
                    </span>
                  } @else {
                    <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
                      Автор: {{ list.ownerName }}
                    </span>
                  }
                </div>

                <!-- Participants Avatars Only & Quick Actions -->
                <div class="flex items-center gap-2.5 flex-wrap">
                  <div class="flex items-center -space-x-2">
                    @for (person of activeListParticipants(); track person.id) {
                      <span
                        [title]="person.name"
                        [attr.aria-label]="person.name"
                        class="w-8 h-8 rounded-full ring-2 ring-white dark:ring-[#111827] bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 inline-flex items-center justify-center overflow-hidden shrink-0 shadow-xs"
                      >
                        @if (person.picture) {
                          <img
                            [src]="person.picture"
                            [alt]="person.name"
                            referrerpolicy="no-referrer"
                            class="w-full h-full object-cover"
                          />
                        } @else {
                          <span class="w-full h-full bg-rose-500/15 text-rose-600 dark:text-rose-300 flex items-center justify-center text-xs font-extrabold">
                            {{ getInitial(person.name) }}
                          </span>
                        }
                      </span>
                    }
                  </div>
                  @if (list.ownerUserId === currentUserId()) {
                    <button
                      type="button"
                      (click)="openEditListModal(list)"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30 text-xs font-bold cursor-pointer transition-colors"
                    >
                      <mat-icon class="text-sm leading-none">manage_accounts</mat-icon>
                      <span>Учасники / Змінити</span>
                    </button>
                  } @else {
                    <button
                      type="button"
                      (click)="openEditListModal(list)"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 text-xs font-bold cursor-pointer transition-colors"
                    >
                      <mat-icon class="text-sm leading-none">tune</mat-icon>
                      <span>Параметри списку</span>
                    </button>
                  }

                  <button
                    type="button"
                    (click)="toggleListInactive(list)"
                    [title]="list.isInactive ? 'Зробити список активним' : 'Зробити список неактивним'"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors border"
                    [class]="list.isInactive
                      ? 'bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-700'"
                  >
                    <mat-icon class="text-sm leading-none">{{ list.isInactive ? 'unarchive' : 'archive' }}</mat-icon>
                    <span>{{ list.isInactive ? 'Зробити активним' : 'Зробити неактивним' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Dynamic Financial Summary Grid (Combined Remaining/Total Budget + Total Spent) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- 1. Combined Editable Budget & Remaining Balance ("1 500 з 2 000 ₴") -->
              <div
                class="rounded-2xl p-4 border flex flex-col justify-between gap-2 transition-all"
                [class.bg-rose-50]="metrics.isOverBudget"
                [class.dark:bg-rose-500/15]="metrics.isOverBudget"
                [class.border-rose-400]="metrics.isOverBudget"
                [class.dark:border-rose-500/50]="metrics.isOverBudget"
                [class.bg-emerald-50/70]="!metrics.isOverBudget"
                [class.dark:bg-emerald-500/10]="!metrics.isOverBudget"
                [class.border-emerald-200/80]="!metrics.isOverBudget"
                [class.dark:border-emerald-500/25]="!metrics.isOverBudget"
              >
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="text-xs font-bold flex items-center gap-1.5"
                    [class.text-rose-700]="metrics.isOverBudget"
                    [class.dark:text-rose-300]="metrics.isOverBudget"
                    [class.text-emerald-800]="!metrics.isOverBudget"
                    [class.dark:text-emerald-300]="!metrics.isOverBudget"
                  >
                    <mat-icon class="text-base leading-none">
                      {{ metrics.isOverBudget ? 'warning' : 'account_balance_wallet' }}
                    </mat-icon>
                    <span>
                      @if (metrics.isOverBudget) { Перевищення бюджету }
                      @else if (metrics.hasBudget) { Залишок бюджету }
                      @else { Бюджет }
                    </span>
                  </span>
                  @if (!isEditingBudget()) {
                    <button
                      type="button"
                      (click)="startEditBudget(list)"
                      [class]="metrics.isOverBudget
                        ? 'bg-rose-600/15 hover:bg-rose-600/25 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300'"
                      class="px-2 py-0.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer border-0 transition-colors"
                    >
                      <mat-icon class="text-xs leading-none">edit</mat-icon>
                      <span>{{ metrics.hasBudget ? 'Змінити' : 'Задати' }}</span>
                    </button>
                  }
                </div>

                @if (isEditingBudget()) {
                  <div class="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputmode="decimal"
                      min="0"
                      step="10"
                      [formControl]="inlineBudgetControl"
                      (keydown.enter)="saveInlineBudget()"
                      (keydown.escape)="cancelEditBudget()"
                      placeholder="Напр. 2000"
                      class="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-400 text-sm font-extrabold text-slate-900 dark:text-white focus:outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      (click)="saveInlineBudget()"
                      class="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shrink-0 cursor-pointer border-0"
                      title="Зберегти бюджет"
                    >
                      <mat-icon class="text-base leading-none">check</mat-icon>
                    </button>
                    <button
                      type="button"
                      (click)="cancelEditBudget()"
                      class="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 cursor-pointer border-0"
                      title="Скасувати"
                    >
                      <mat-icon class="text-base leading-none">close</mat-icon>
                    </button>
                  </div>
                } @else {
                  <button
                    type="button"
                    (click)="startEditBudget(list)"
                    class="text-left bg-transparent border-0 p-0 cursor-pointer group"
                  >
                    @if (metrics.hasBudget) {
                      <div class="flex items-baseline gap-1.5 flex-wrap tabular-nums tracking-tight group-hover:underline">
                        <span
                          class="text-2xl font-black"
                          [class.text-emerald-600]="!metrics.isOverBudget"
                          [class.dark:text-emerald-400]="!metrics.isOverBudget"
                          [class.text-rose-600]="metrics.isOverBudget"
                          [class.dark:text-rose-400]="metrics.isOverBudget"
                        >
                          @if (metrics.isOverBudget) {
                            -{{ formatUah(Math.abs(metrics.remaining)) }}
                          } @else {
                            {{ formatUah(metrics.remaining) }}
                          }
                        </span>
                        <span
                          class="text-sm sm:text-base font-bold"
                          [class.text-emerald-700/75]="!metrics.isOverBudget"
                          [class.dark:text-emerald-300/75]="!metrics.isOverBudget"
                          [class.text-rose-700/80]="metrics.isOverBudget"
                          [class.dark:text-rose-300/80]="metrics.isOverBudget"
                        >
                          з {{ formatUah(metrics.budget) }} ₴
                        </span>
                      </div>
                      <div
                        class="text-[11px] font-semibold mt-0.5"
                        [class.text-emerald-700/80]="!metrics.isOverBudget"
                        [class.dark:text-emerald-300/80]="!metrics.isOverBudget"
                        [class.text-rose-600]="metrics.isOverBudget"
                        [class.dark:text-rose-300]="metrics.isOverBudget"
                      >
                        @if (metrics.isOverBudget) {
                          Перевищено наявну суму на {{ formatUah(Math.abs(metrics.remaining)) }} ₴
                        } @else {
                          Використано {{ metrics.percentUsed }}% від наявної суми
                        }
                      </div>
                    } @else {
                      <div class="text-base font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <span>+ Вказати бюджет</span>
                      </div>
                      <div class="text-[11px] text-emerald-700/75 dark:text-emerald-300/75 mt-0.5">
                        Натисніть, щоб задати наявну суму та бачити залишок
                      </div>
                    }
                  </button>
                }
              </div>

              <!-- 2. Dynamic Total Cost of Purchases ("Загальна сума покупок") -->
              <div
                class="rounded-2xl p-4 border flex flex-col justify-between gap-2 transition-colors"
                [class.bg-rose-50]="metrics.isOverBudget"
                [class.dark:bg-rose-500/15]="metrics.isOverBudget"
                [class.border-rose-300]="metrics.isOverBudget"
                [class.dark:border-rose-500/40]="metrics.isOverBudget"
                [class.bg-slate-50]="!metrics.isOverBudget"
                [class.dark:bg-slate-900/70]="!metrics.isOverBudget"
                [class.border-slate-200/80]="!metrics.isOverBudget"
                [class.dark:border-slate-800]="!metrics.isOverBudget"
              >
                <div class="flex items-center justify-between gap-2">
                  <span
                    class="text-xs font-bold flex items-center gap-1.5"
                    [class.text-rose-700]="metrics.isOverBudget"
                    [class.dark:text-rose-300]="metrics.isOverBudget"
                    [class.text-slate-600]="!metrics.isOverBudget"
                    [class.dark:text-slate-300]="!metrics.isOverBudget"
                  >
                    <mat-icon class="text-base leading-none">receipt_long</mat-icon>
                    <span>Сума покупок</span>
                  </span>
                  <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                    {{ metrics.pricedItemsCount }} з {{ list.items.length }} з ціною
                  </span>
                </div>
                <div>
                  <div
                    class="text-2xl font-black tabular-nums tracking-tight"
                    [class.text-rose-600]="metrics.isOverBudget"
                    [class.dark:text-rose-400]="metrics.isOverBudget"
                    [class.text-slate-900]="!metrics.isOverBudget"
                    [class.dark:text-white]="!metrics.isOverBudget"
                  >
                    {{ formatUah(metrics.totalSpent) }} ₴
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Куплено позицій: {{ metrics.boughtCount }} із {{ list.items.length }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Budget Progress Bar -->
            @if (metrics.hasBudget) {
              <div class="space-y-1.5">
                <div class="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-300"
                    [style.width.%]="metrics.progressBarPercent"
                    [class.bg-emerald-500]="!metrics.isOverBudget && metrics.percentUsed < 85"
                    [class.bg-amber-500]="!metrics.isOverBudget && metrics.percentUsed >= 85"
                    [class.bg-rose-500]="metrics.isOverBudget"
                  ></div>
                </div>
              </div>
            }
          </div>

          <!-- Action Toolbar: Filter Pills + "Перенести залишок" (left/right) -->
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="inline-flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <button
                type="button"
                (click)="itemFilter.set('all')"
                [class]="itemFilter() === 'all'
                  ? 'bg-slate-900 dark:bg-slate-700 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent'"
                class="px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border-0 transition-colors"
              >
                Усі ({{ list.items.length }})
              </button>
              <button
                type="button"
                (click)="itemFilter.set('todo')"
                [class]="itemFilter() === 'todo'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent'"
                class="px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border-0 transition-colors"
              >
                Купити ({{ metrics.todoCount }})
              </button>
              <button
                type="button"
                (click)="itemFilter.set('bought')"
                [class]="itemFilter() === 'bought'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent'"
                class="px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer border-0 transition-colors"
              >
                Куплено ({{ metrics.boughtCount }})
              </button>
            </div>

            @if (metrics.todoCount > 0 || (metrics.hasBudget && metrics.remaining > 0)) {
              <button
                id="btn-open-carry-over-modal"
                type="button"
                (click)="openCarryOverModal(list)"
                class="px-3.5 py-2 sm:py-2.5 rounded-2xl bg-white dark:bg-[#111827] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/30 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs shrink-0"
              >
                <mat-icon class="text-base sm:text-lg leading-none">drive_file_move</mat-icon>
                <span>Перенести залишок</span>
              </button>
            }
          </div>

          <!-- Shopping Items List -->
          @if (filteredItems().length === 0) {
            <div class="bg-white dark:bg-[#111827] rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center space-y-3">
              <div class="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/15 text-rose-500 flex items-center justify-center mx-auto">
                <mat-icon class="text-2xl leading-none">shopping_basket</mat-icon>
              </div>
              <div class="text-sm font-bold text-slate-800 dark:text-white">
                @if (list.items.length === 0) {
                  Список покупок порожній
                } @else {
                  У цьому фільтрі немає товарів
                }
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                Натисніть «Додати», щоб швидко обрати товари зі списку або додати новий товар.
              </p>
              @if (list.items.length === 0) {
                <button
                  type="button"
                  (click)="openCatalogModal()"
                  class="px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border-0 shadow-xs"
                >
                  <mat-icon class="text-base leading-none">add_circle</mat-icon>
                  <span>Додати товари</span>
                </button>
              }
            </div>
          } @else {
            <div class="bg-white dark:bg-[#111827] rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/90">
              @for (item of filteredItems(); track item.id) {
                @let catMeta = getCategoryMeta(item.category);
                @let itemImg = getProductImage(item.name, item.category);
                @let mode = getItemPriceMode(item);
                @let isWeightMode = mode === 'per_100g' || mode === 'per_kg';
                @let lineTotal = getEffectiveItemTotal(item);
                <div
                  class="p-3.5 sm:p-4 flex flex-col gap-3 transition-colors"
                  [class.bg-emerald-50/40]="item.isBought"
                  [class.dark:bg-emerald-500/5]="item.isBought"
                >
                  <!-- Top Row: Checkbox + Thematic Product Photo + Name + Category + Delete -->
                  <div class="flex items-start justify-between gap-2.5">
                    <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        (click)="toggleItemBought(list, item)"
                        [title]="item.isBought ? 'Позначити як некуплений' : 'Позначити як куплений'"
                        class="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer border transition-all"
                        [class.bg-emerald-500]="item.isBought"
                        [class.text-white]="item.isBought"
                        [class.border-emerald-500]="item.isBought"
                        [class.bg-slate-50]="!item.isBought"
                        [class.dark:bg-slate-800]="!item.isBought"
                        [class.text-slate-400]="!item.isBought"
                        [class.border-slate-200]="!item.isBought"
                        [class.dark:border-slate-700]="!item.isBought"
                        [class.hover:border-rose-400]="!item.isBought"
                      >
                        <mat-icon class="text-xl leading-none">
                          {{ item.isBought ? 'check' : 'radio_button_unchecked' }}
                        </mat-icon>
                      </button>

                      <!-- Thematic Product Thumbnail -->
                      <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden shrink-0 border border-slate-200/80 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        @if (!isImageFailed(itemImg)) {
                          <img
                            [src]="itemImg"
                            [alt]="item.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            (error)="markImageFailed(itemImg)"
                            class="w-full h-full object-cover transition-all duration-200"
                            [class.opacity-50]="item.isBought"
                            [class.grayscale]="item.isBought"
                          />
                        } @else {
                          <mat-icon class="text-xl text-rose-500 dark:text-rose-400 leading-none">{{ catMeta.icon }}</mat-icon>
                        }
                      </div>

                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span
                            class="text-sm sm:text-base font-bold break-words"
                            [class.line-through]="item.isBought"
                            [class.text-slate-400]="item.isBought"
                            [class.dark:text-slate-500]="item.isBought"
                            [class.text-slate-900]="!item.isBought"
                            [class.dark:text-white]="!item.isBought"
                          >
                            {{ item.name }}
                          </span>
                          <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold inline-flex items-center gap-1">
                            <mat-icon class="text-xs leading-none">{{ catMeta.icon }}</mat-icon>
                            <span>{{ catMeta.shortLabel }}</span>
                          </span>
                        </div>
                        @let addedActor = getActorInfo(item.addedByUserId, item.addedByName);
                        @let addedKey = item.id + ':added';
                        @let isAddedRevealed = revealedActorKey() === addedKey;
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-x-1.5 gap-y-1 flex-wrap">
                          <span class="inline-flex items-center gap-1">
                            <span>Додав</span>
                            <button
                              type="button"
                              (click)="toggleRevealedActor(addedKey)"
                              [title]="addedActor.name"
                              [attr.aria-label]="'Додав: ' + addedActor.name"
                              [attr.aria-expanded]="isAddedRevealed"
                              class="inline-flex items-center gap-1 rounded-full p-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 cursor-pointer transition-all"
                              [class.pr-2]="isAddedRevealed"
                            >
                              @if (addedActor.picture) {
                                <img
                                  [src]="addedActor.picture"
                                  [alt]="addedActor.name"
                                  referrerpolicy="no-referrer"
                                  class="w-4 h-4 rounded-full object-cover shrink-0"
                                />
                              } @else {
                                <span class="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[9px] font-extrabold inline-flex items-center justify-center shrink-0">
                                  {{ getInitial(addedActor.name) }}
                                </span>
                              }
                              @if (isAddedRevealed) {
                                <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 leading-none">
                                  {{ addedActor.name }}
                                </span>
                              }
                            </button>
                          </span>

                          @if (item.isBought && (item.boughtByName || item.boughtByUserId)) {
                            @let boughtActor = getActorInfo(item.boughtByUserId, item.boughtByName);
                            @let boughtKey = item.id + ':bought';
                            @let isBoughtRevealed = revealedActorKey() === boughtKey;
                            <span class="text-slate-300 dark:text-slate-600 font-bold select-none">/</span>
                            <span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                              <span>Купив</span>
                              <button
                                type="button"
                                (click)="toggleRevealedActor(boughtKey)"
                                [title]="boughtActor.name"
                                [attr.aria-label]="'Купив: ' + boughtActor.name"
                                [attr.aria-expanded]="isBoughtRevealed"
                                class="inline-flex items-center gap-1 rounded-full p-0.5 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-200/80 dark:border-emerald-500/35 cursor-pointer transition-all"
                                [class.pr-2]="isBoughtRevealed"
                              >
                                @if (boughtActor.picture) {
                                  <img
                                    [src]="boughtActor.picture"
                                    [alt]="boughtActor.name"
                                    referrerpolicy="no-referrer"
                                    class="w-4 h-4 rounded-full object-cover shrink-0"
                                  />
                                } @else {
                                  <span class="w-4 h-4 rounded-full bg-emerald-200/80 dark:bg-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-[9px] font-extrabold inline-flex items-center justify-center shrink-0">
                                    {{ getInitial(boughtActor.name) }}
                                  </span>
                                }
                                @if (isBoughtRevealed) {
                                  <span class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 leading-none">
                                    {{ boughtActor.name }}
                                  </span>
                                }
                              </button>
                            </span>
                          }

                        </div>
                      </div>
                    </div>

                    <!-- Delete Item -->
                    <button
                      type="button"
                      (click)="removeItem(list, item)"
                      title="Видалити товар зі списку"
                      class="w-8 h-8 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/15 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center cursor-pointer border-0 bg-transparent transition-colors shrink-0"
                    >
                      <mat-icon class="text-lg leading-none">close</mat-icon>
                    </button>
                  </div>

                  <!-- Controls Row: Single-line Price Mode Toggle + Creation Date/Time, then Weight/Quantity + Price -->
                  <div class="flex flex-col gap-2 pl-0 sm:pl-12">
                    <div class="flex items-center justify-between gap-2 flex-nowrap">
                      <!-- 3-Way Price Basis Toggle -->
                      <div
                        role="group"
                        aria-label="Одиниця ціни"
                        class="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 shrink-0"
                      >
                        <button
                          type="button"
                          (click)="setItemPriceMode(list, item, 'per_100g')"
                          [class]="mode === 'per_100g'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent'"
                          class="px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer border-0 transition-colors whitespace-nowrap"
                        >
                          За 100 г
                        </button>
                        <button
                          type="button"
                          (click)="setItemPriceMode(list, item, 'per_kg')"
                          [class]="mode === 'per_kg'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent'"
                          class="px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer border-0 transition-colors whitespace-nowrap"
                        >
                          За 1 кг
                        </button>
                        <button
                          type="button"
                          (click)="setItemPriceMode(list, item, 'per_unit')"
                          [class]="mode === 'per_unit'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent'"
                          class="px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer border-0 transition-colors whitespace-nowrap"
                        >
                          За 1 шт
                        </button>
                      </div>

                      @if (formatDateTime(item.createdAt); as itemCreatedLabel) {
                        <span class="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                          <mat-icon class="text-[13px] w-3.5 h-3.5 leading-none">schedule</mat-icon>
                          <span>{{ itemCreatedLabel }}</span>
                        </span>
                      }
                    </div>

                    <!-- Weight / Quantity + Price + Computed Sum -->
                    <div class="flex items-center gap-2 flex-wrap">
                      @if (isWeightMode) {
                        <!-- Weight Input (grams for За 100 г, kg for За 1 кг; supports both '.' and ',') -->
                        <div class="relative w-24 sm:w-28">
                          <input
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            spellcheck="false"
                            [value]="getDisplayedWeightValue(item)"
                            (input)="onItemWeightInput(list, item, $any($event.target).value)"
                            (blur)="commitItemWeight(list, item, $any($event.target).value)"
                            (keydown.enter)="$any($event.target).blur()"
                            [placeholder]="mode === 'per_100g' ? '100' : '1,0'"
                            [attr.aria-label]="mode === 'per_100g' ? 'Вага в грамах' : 'Вага в кілограмах'"
                            class="w-full pl-2.5 pr-8 py-1.5 rounded-xl text-xs sm:text-sm font-bold tabular-nums bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 transition-colors"
                          />
                          <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                            {{ mode === 'per_100g' ? 'г' : 'кг' }}
                          </span>
                        </div>
                      } @else {
                        <!-- Quantity Stepper for За 1 шт -->
                        <div class="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 p-0.5">
                          <button
                            type="button"
                            (click)="stepItemQuantity(list, item, -1)"
                            class="w-7 h-7 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer border-0 bg-transparent transition-colors"
                            title="Зменшити кількість"
                          >
                            <mat-icon class="text-base leading-none">remove</mat-icon>
                          </button>
                          <span class="px-2 text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums whitespace-nowrap">
                            {{ item.quantity }} {{ getDisplayUnitForPieceMode(item) }}
                          </span>
                          <button
                            type="button"
                            (click)="stepItemQuantity(list, item, 1)"
                            class="w-7 h-7 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer border-0 bg-transparent transition-colors"
                            title="Збільшити кількість"
                          >
                            <mat-icon class="text-base leading-none">add</mat-icon>
                          </button>
                        </div>
                      }

                      <!-- Inline Price Input -->
                      <div class="relative w-32 sm:w-36">
                        <input
                          type="number"
                          inputmode="decimal"
                          min="0"
                          step="0.5"
                          [value]="getDisplayedPriceValue(item)"
                          (input)="onItemPriceInput(list, item, $any($event.target).value)"
                          (blur)="commitItemPrice(list, item, $any($event.target).value)"
                          (keydown.enter)="$any($event.target).blur()"
                          placeholder="Ціна"
                          aria-label="Ціна товару в гривнях"
                          class="w-full pl-2.5 pr-12 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold tabular-nums border focus:outline-none transition-colors"
                          [class.bg-emerald-50]="lineTotal > 0"
                          [class.dark:bg-emerald-500/15]="lineTotal > 0"
                          [class.border-emerald-300]="lineTotal > 0"
                          [class.dark:border-emerald-500/40]="lineTotal > 0"
                          [class.text-emerald-700]="lineTotal > 0"
                          [class.dark:text-emerald-300]="lineTotal > 0"
                          [class.bg-slate-50]="lineTotal <= 0"
                          [class.dark:bg-slate-900]="lineTotal <= 0"
                          [class.border-slate-200]="lineTotal <= 0"
                          [class.dark:border-slate-700]="lineTotal <= 0"
                          [class.text-slate-900]="lineTotal <= 0"
                          [class.dark:text-white]="lineTotal <= 0"
                        />
                        <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                          {{ getPriceSuffix(mode) }}
                        </span>
                      </div>

                      <!-- Calculated Line Total Badge (shown when weight mode or qty > 1 and price > 0) -->
                      @if (lineTotal > 0 && (isWeightMode || item.quantity > 1)) {
                        <span
                          class="px-2.5 py-1.5 rounded-xl bg-emerald-100/90 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold tabular-nums whitespace-nowrap"
                          title="Розрахована вартість позиції"
                        >
                          = {{ formatUah(lineTotal) }} ₴
                        </span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (activeList()) {
      <!-- Stationary Floating Action Button (+): поверх вкладки Покупки знизу справа -->
      <button
        id="btn-open-shopping-catalog"
        type="button"
        (click)="openCatalogModal()"
        title="Додати товар"
        aria-label="Додати товар"
        class="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-7 right-4 sm:right-6 z-30 w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-600/35 transition-colors cursor-pointer border-0"
      >
        <mat-icon class="text-3xl leading-none">add</mat-icon>
      </button>
    }

    <!-- ===================================================================== -->
    <!-- MODAL 1: QUICK-PICK PRODUCT CATALOG + FAST SEARCH + ADD NEW PRODUCT   -->
    <!-- ===================================================================== -->
    @if (isCatalogModalOpen()) {
      <div
        class="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-xs p-0 sm:p-4 flex items-start justify-center overflow-y-auto"
        (click)="closeCatalogModal()"
        (keydown.escape)="closeCatalogModal()"
        tabindex="-1"
      >
        <div
          class="w-full max-w-3xl bg-white dark:bg-[#111827] rounded-b-3xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88dvh] mt-0 sm:mt-2"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
          tabindex="-1"
        >
          <!-- Modal Header (Compact) -->
          <div class="px-4 py-2.5 sm:px-5 sm:py-3 bg-gradient-to-r from-rose-600 to-pink-600 text-white flex items-center justify-between gap-2.5 shrink-0">
            <div class="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                (click)="closeCatalogModal()"
                title="Готово (закрити)"
                aria-label="Готово"
                class="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 text-white flex items-center justify-center shrink-0 cursor-pointer border-0 transition-all"
              >
                <mat-icon class="text-lg leading-none">add_shopping_cart</mat-icon>
              </button>
              <h3 class="text-sm sm:text-base font-extrabold truncate">
                Додати товари до списку
              </h3>
            </div>
            <button
              type="button"
              (click)="closeCatalogModal()"
              class="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center cursor-pointer border-0 shrink-0 transition-all"
              title="Закрити"
            >
              <mat-icon class="text-base leading-none">close</mat-icon>
            </button>
          </div>

          <!-- Search Bar & Dropdown Category Filter in ONE line -->
          <div class="px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 shrink-0">
            <div class="relative flex-1 min-w-0">
              <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg leading-none">search</mat-icon>
              <input
                id="shopping-catalog-search"
                type="text"
                [formControl]="catalogSearchControl"
                placeholder="Швидкий пошук товару..."
                class="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
              @if (catalogSearchText().length > 0) {
                <button
                  type="button"
                  (click)="clearCatalogSearch()"
                  class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center cursor-pointer border-0 bg-transparent"
                  title="Очистити пошук"
                >
                  <mat-icon class="text-sm leading-none">close</mat-icon>
                </button>
              }
            </div>

            <!-- Category Dropdown Select in line with search -->
            <div class="relative w-36 sm:w-48 shrink-0">
              <select
                aria-label="Фільтр за категорією"
                [value]="selectedCatalogCategory()"
                (change)="selectedCatalogCategory.set($any($event.target).value)"
                class="w-full appearance-none pl-3 pr-7 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-rose-500 cursor-pointer transition-colors truncate"
              >
                <option value="all">Усі ({{ catalog().length }})</option>
                @for (cat of categories; track cat.id) {
                  <option [value]="cat.id">
                    {{ cat.shortLabel }}
                  </option>
                }
              </select>
              <mat-icon aria-hidden="true" class="text-base text-slate-500 dark:text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 leading-none">
                expand_more
              </mat-icon>
            </div>
          </div>

          <!-- Scrollable Catalog Body -->
          <div class="p-3.5 sm:p-5 pb-6 sm:pb-6 overflow-y-auto flex-1 space-y-3.5">
            <!-- Smart "Not Found / Add Custom Product to List AND Catalog" Banner (Compact) -->
            @if (shouldSuggestNewCatalogProduct()) {
              <div class="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-br from-rose-50 to-amber-50/70 dark:from-rose-500/15 dark:to-amber-500/10 border border-rose-200 dark:border-rose-500/35 space-y-2">
                <div class="flex items-center gap-2.5">
                  <div class="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <mat-icon class="text-lg leading-none">add_box</mat-icon>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                      @if (filteredCatalogItems().length === 0) {
                        Товар «{{ catalogSearchText() }}» не знайдено у каталозі
                      } @else {
                        Додати новий товар «{{ catalogSearchText() }}»
                      }
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <select
                    [formControl]="newProductCategoryControl"
                    aria-label="Категорія нового товару"
                    class="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-rose-500 truncate"
                  >
                    @for (cat of categories; track cat.id) {
                      <option [value]="cat.id">{{ cat.label }}</option>
                    }
                  </select>
                  <button
                    type="button"
                    (click)="addCustomProductAndSaveToCatalog()"
                    [disabled]="isSavingItem()"
                    class="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer border-0 shadow-xs transition-colors disabled:opacity-50 shrink-0"
                  >
                    <mat-icon class="text-base leading-none">library_add</mat-icon>
                    <span>У список + каталог</span>
                  </button>
                </div>
              </div>
            }

            <!-- Quick-Pick Product List (Single Column for Full Readable Names) -->
            @if (filteredCatalogItems().length > 0) {
              <div class="grid grid-cols-1 gap-2">
                @for (prod of filteredCatalogItems(); track prod.id) {
                  @let inListCount = getProductCountInActiveList(prod.name);
                  @let prodCat = getCategoryMeta(prod.category);
                  @let prodImg = getProductImage(prod.name, prod.category);
                  <button
                    type="button"
                    (click)="quickAddFromCatalog(prod)"
                    class="group text-left px-3 py-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 w-full"
                    [class.bg-emerald-50]="inListCount > 0"
                    [class.dark:bg-emerald-500/15]="inListCount > 0"
                    [class.border-emerald-300]="inListCount > 0"
                    [class.dark:border-emerald-500/40]="inListCount > 0"
                    [class.bg-slate-50]="inListCount === 0"
                    [class.dark:bg-slate-900/80]="inListCount === 0"
                    [class.border-slate-200/80]="inListCount === 0"
                    [class.dark:border-slate-800]="inListCount === 0"
                    [class.hover:border-rose-400]="inListCount === 0"
                  >
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      <div class="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800 flex items-center justify-center">
                        @if (!isImageFailed(prodImg)) {
                          <img
                            [src]="prodImg"
                            [alt]="prod.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            (error)="markImageFailed(prodImg)"
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        } @else {
                          <mat-icon class="text-base text-rose-500 dark:text-rose-400 leading-none">{{ prodCat.icon }}</mat-icon>
                        }
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="text-sm font-bold text-slate-900 dark:text-white break-words leading-snug">
                          {{ prod.name }}
                        </div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{{ prodCat.shortLabel }}</span>
                          @if (prod.isCustom) {
                            <span class="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold text-[10px]">
                              Свій
                            </span>
                          }
                        </div>
                      </div>
                    </div>

                    @if (inListCount > 0) {
                      <span class="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 text-xs font-extrabold">
                        <mat-icon class="text-base leading-none">check</mat-icon>
                      </span>
                    } @else {
                      <span class="w-7 h-7 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 group-hover:bg-rose-600 group-hover:text-white group-hover:border-rose-600 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0 transition-colors">
                        <mat-icon class="text-base leading-none">add</mat-icon>
                      </span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

    <!-- ===================================================================== -->
    <!-- MODAL 2: CREATE / EDIT SHOPPING LIST & SELECT SHARED PARTICIPANTS     -->
    <!-- ===================================================================== -->
    @if (isListModalOpen()) {
      <div
        class="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-xs p-0 sm:p-4 flex items-start justify-center overflow-y-auto"
        (click)="closeListModal()"
        (keydown.escape)="closeListModal()"
        tabindex="-1"
      >
        <div
          class="w-full max-w-lg bg-white dark:bg-[#111827] rounded-b-3xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[84dvh] sm:h-auto sm:min-h-[590px] max-h-[94dvh] mt-0 sm:mt-2"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
          tabindex="-1"
        >
          <div class="px-4 py-3 sm:px-5 sm:py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-rose-500/25 text-rose-300 flex items-center justify-center">
                <mat-icon class="text-xl leading-none">
                  {{ editingListId() ? 'edit' : 'add_shopping_cart' }}
                </mat-icon>
              </div>
              <div>
                <h3 class="text-base font-extrabold">
                  {{ editingListId() ? 'Налаштування списку покупок' : 'Новий список покупок' }}
                </h3>
                <p class="text-[11px] text-slate-300">
                  Оберіть людей, з якими ведете цей список, та виділений бюджет
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeListModal()"
              class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer border-0"
              title="Закрити"
            >
              <mat-icon class="text-lg leading-none">close</mat-icon>
            </button>
          </div>

          <div class="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 flex flex-col">
            <!-- List Title -->
            <div>
              <label for="shopping-list-title" class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Назва списку
              </label>
              <input
                id="shopping-list-title"
                type="text"
                [formControl]="listTitleControl"
                placeholder="Наприклад: Продукти на тиждень, Сільпо, Дача..."
                class="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <!-- Budget ("Наявна сума") -->
            <div>
              <label for="shopping-list-budget" class="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Наявна сума / бюджет (₴, необовʼязково)
              </label>
              <div class="relative">
                <input
                  id="shopping-list-budget"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="50"
                  [formControl]="listBudgetControl"
                  placeholder="Наприклад: 2000"
                  class="w-full pl-3.5 pr-9 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
                <span class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₴</span>
              </div>
            </div>

            <!-- Select People to Share With (shared household members: invited + house co-members) -->
            @if (isEditingOwnList()) {
              <div class="space-y-2 flex-1 flex flex-col min-h-0 pt-0.5">
                <div class="flex items-center justify-between gap-2 shrink-0">
                  <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Учасники ({{ selectedParticipantIds().length }} обрано)
                  </span>
                  <button
                    type="button"
                    (click)="openInviteModalFromShopping()"
                    class="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer shrink-0"
                  >
                    <mat-icon class="text-sm leading-none">person_add</mat-icon>
                    <span>Запросити</span>
                  </button>
                </div>

                @if (selectableOtherPeople().length === 0) {
                  <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Тут відображаються користувачі з вашого спільного дому — ті, кого ви запросили або додали до спільних будинків. Інші користувачі приховані за замовчуванням.
                    </p>
                    <button
                      type="button"
                      (click)="openInviteModalFromShopping()"
                      class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer border-0 transition-colors"
                    >
                      <mat-icon class="text-base leading-none">qr_code_2</mat-icon>
                      <span>Запросити користувача</span>
                    </button>
                  </div>
                } @else {
                  <div class="space-y-1.5 flex-1 min-h-[180px] max-h-80 sm:max-h-[350px] overflow-y-auto pr-0.5">
                    @for (person of selectableOtherPeople(); track person.id) {
                      @let checked = isParticipantSelected(person.id);
                      <button
                        type="button"
                        (click)="toggleParticipantSelection(person.id)"
                        [class]="checked
                          ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-400 dark:border-rose-500/50'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'"
                        class="w-full p-2.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer text-left transition-all"
                      >
                        <div class="flex items-center gap-2.5 min-w-0">
                          @if (person.picture) {
                            <img
                              [src]="person.picture"
                              [alt]="person.name"
                              referrerpolicy="no-referrer"
                              class="w-9 h-9 rounded-xl object-cover shrink-0"
                            />
                          } @else {
                            <div class="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-extrabold text-sm shrink-0">
                              {{ getInitial(person.name) }}
                            </div>
                          }
                          <div class="min-w-0">
                            <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                              {{ person.name }}
                            </div>
                            @if (person.email) {
                              <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {{ person.email }}
                              </div>
                            }
                            @if (person.sharedHouses && person.sharedHouses.length > 0) {
                              <div class="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                                <mat-icon class="text-[12px] w-3 h-3 leading-none shrink-0">home_work</mat-icon>
                                <span class="truncate">{{ person.sharedHouses.join(', ') }}</span>
                              </div>
                            }
                          </div>
                        </div>
                        <span
                          class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                          [class.bg-rose-600]="checked"
                          [class.text-white]="checked"
                          [class.bg-slate-200]="!checked"
                          [class.dark:bg-slate-800]="!checked"
                          [class.text-transparent]="!checked"
                        >
                          <mat-icon class="text-base leading-none">check</mat-icon>
                        </span>
                      </button>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                Керувати складом учасників може лише власник цього списку.
              </div>
            }
          </div>

          <div class="px-3.5 sm:px-5 py-3 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 shrink-0">
            <div>
              @if (editingList(); as editTarget) {
                <button
                  type="button"
                  (click)="confirmDeleteList(editTarget)"
                  class="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer border-0 transition-colors"
                >
                  <mat-icon class="text-[15px] w-4 h-4 leading-none">
                    {{ editTarget.ownerUserId === currentUserId() ? 'delete_outline' : 'logout' }}
                  </mat-icon>
                  <span>{{ editTarget.ownerUserId === currentUserId() ? 'Видалити' : 'Покинути' }}</span>
                </button>
              }
            </div>
            <div class="flex items-center gap-1.5 sm:gap-2 ml-auto">
              <button
                type="button"
                (click)="closeListModal()"
                class="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <mat-icon class="text-[15px] w-4 h-4 leading-none">close</mat-icon>
                <span>Скасувати</span>
              </button>
              <button
                type="button"
                (click)="saveListModal()"
                [disabled]="isSavingList()"
                class="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[11px] sm:text-xs font-extrabold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer border-0 shadow-sm disabled:opacity-50"
              >
                <mat-icon class="text-[15px] w-4 h-4 leading-none">check</mat-icon>
                <span>{{ editingListId() ? 'Зберегти' : 'Створити' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- ===================================================================== -->
    <!-- MODAL 3: CARRY OVER UNBOUGHT ITEMS & REMAINING BUDGET TO NEW LIST     -->
    <!-- ===================================================================== -->
    @if (isCarryOverModalOpen() && activeList(); as srcList) {
      @let srcMetrics = activeListMetrics();
      @let unboughtItems = carryOverUnboughtItems();
      <div
        class="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-xs p-0 sm:p-4 flex items-end sm:items-center justify-center"
        (click)="closeCarryOverModal()"
        (keydown.escape)="closeCarryOverModal()"
        tabindex="-1"
      >
        <div
          class="w-full max-w-xl bg-white dark:bg-[#111827] rounded-t-3xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] pb-safe"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
          tabindex="-1"
        >
          <!-- Modal Header -->
          <div class="px-5 py-4 bg-gradient-to-r from-rose-600 to-pink-600 text-white flex items-center justify-between gap-3 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <mat-icon class="text-xl leading-none">drive_file_move</mat-icon>
              </div>
              <div class="min-w-0">
                <h3 class="text-base sm:text-lg font-extrabold truncate">
                  Перенести залишок у новий список
                </h3>
                <p class="text-xs text-rose-100 truncate">
                  Некуплені товари та залишок бюджету зі списку «{{ srcList.title }}»
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="closeCarryOverModal()"
              class="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer border-0 shrink-0 transition-colors"
              title="Закрити"
            >
              <mat-icon class="text-lg leading-none">close</mat-icon>
            </button>
          </div>

          <!-- Modal Body -->
          <div class="p-5 space-y-5 overflow-y-auto flex-1">
            <!-- New List Title -->
            <div class="space-y-1.5">
              <label for="carry-over-title" class="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Назва нового списку *
              </label>
              <input
                id="carry-over-title"
                type="text"
                [formControl]="carryOverTitleControl"
                placeholder="Напр. Залишок: Продукти на тиждень"
                class="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <!-- Remaining Budget Transfer Card -->
            <div
              class="rounded-2xl p-4 border transition-colors space-y-3"
              [class.bg-emerald-50/70]="carryOverIncludeBudget()"
              [class.dark:bg-emerald-500/10]="carryOverIncludeBudget()"
              [class.border-emerald-300]="carryOverIncludeBudget()"
              [class.dark:border-emerald-500/35]="carryOverIncludeBudget()"
              [class.bg-slate-50]="!carryOverIncludeBudget()"
              [class.dark:bg-slate-900/70]="!carryOverIncludeBudget()"
              [class.border-slate-200]="!carryOverIncludeBudget()"
              [class.dark:border-slate-800]="!carryOverIncludeBudget()"
            >
              <button
                type="button"
                (click)="toggleCarryOverIncludeBudget()"
                class="w-full flex items-center justify-between gap-3 text-left bg-transparent border-0 p-0 cursor-pointer"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span
                    class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                    [class.bg-emerald-600]="carryOverIncludeBudget()"
                    [class.text-white]="carryOverIncludeBudget()"
                    [class.bg-slate-200]="!carryOverIncludeBudget()"
                    [class.dark:bg-slate-700]="!carryOverIncludeBudget()"
                    [class.text-slate-400]="!carryOverIncludeBudget()"
                  >
                    <mat-icon class="text-sm leading-none">
                      {{ carryOverIncludeBudget() ? 'check' : 'account_balance_wallet' }}
                    </mat-icon>
                  </span>
                  <div class="min-w-0">
                    <div class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                      Перенести залишок бюджету
                    </div>
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      @if (srcMetrics.hasBudget && srcMetrics.remaining > 0) {
                        Залишилось {{ formatUah(srcMetrics.remaining) }} ₴ (було {{ formatUah(srcMetrics.budget) }} ₴ − витрачено {{ formatUah(srcMetrics.totalSpent) }} ₴)
                      } @else if (srcMetrics.hasBudget) {
                        Поточний бюджет уже вичерпано — за бажанням вкажіть нову суму
                      } @else {
                        У поточному списку бюджет не задано — можна вказати суму для нового
                      }
                    </div>
                  </div>
                </div>
                @if (srcMetrics.hasBudget && srcMetrics.remaining > 0) {
                  <span class="px-2.5 py-1 rounded-xl bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-xs font-black tabular-nums shrink-0">
                    {{ formatUah(srcMetrics.remaining) }} ₴
                  </span>
                }
              </button>

              @if (carryOverIncludeBudget()) {
                <div class="relative">
                  <input
                    id="carry-over-budget"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="10"
                    [formControl]="carryOverBudgetControl"
                    placeholder="Сума бюджету, ₴"
                    aria-label="Бюджет нового списку в гривнях"
                    class="w-full pl-3.5 pr-9 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-500/40 text-sm font-extrabold text-emerald-700 dark:text-emerald-300 focus:outline-none focus:border-emerald-500 tabular-nums"
                  />
                  <span class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                    ₴
                  </span>
                </div>
              }
            </div>

            <!-- Pre-Selected Unbought Items Section -->
            <div class="space-y-2.5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ще не куплені товари ({{ carryOverSelectedItemIds().length }} з {{ unboughtItems.length }})
                </span>
                @if (unboughtItems.length > 0) {
                  <button
                    type="button"
                    (click)="toggleAllCarryOverItems()"
                    class="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                  >
                    {{ carryOverSelectedItemIds().length === unboughtItems.length ? 'Зняти всі' : 'Вибрати всі' }}
                  </button>
                }
              </div>

              @if (unboughtItems.length === 0) {
                <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 text-center">
                  Усі товари в цьому списку вже куплено — можна перенести лише залишок бюджету у новий список.
                </div>
              } @else {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  @for (item of unboughtItems; track item.id) {
                    @let isChecked = isCarryOverItemSelected(item.id);
                    @let catMeta = getCategoryMeta(item.category);
                    @let itemImg = getProductImage(item.name, item.category);
                    <button
                      type="button"
                      (click)="toggleCarryOverItem(item.id)"
                      [class]="isChecked
                        ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-400 dark:border-rose-500/50 text-slate-900 dark:text-white shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'"
                      class="p-2.5 rounded-2xl border text-left flex items-center gap-2.5 cursor-pointer transition-all"
                    >
                      <span
                        class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                        [class.bg-rose-600]="isChecked"
                        [class.text-white]="isChecked"
                        [class.bg-slate-200]="!isChecked"
                        [class.dark:bg-slate-800]="!isChecked"
                        [class.text-slate-400]="!isChecked"
                      >
                        <mat-icon class="text-sm leading-none">
                          {{ isChecked ? 'check' : 'radio_button_unchecked' }}
                        </mat-icon>
                      </span>
                      <div class="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-800 flex items-center justify-center">
                        @if (!isImageFailed(itemImg)) {
                          <img
                            [src]="itemImg"
                            [alt]="item.name"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            (error)="markImageFailed(itemImg)"
                            class="w-full h-full object-cover"
                          />
                        } @else {
                          <mat-icon class="text-base text-rose-500 dark:text-rose-400 leading-none">{{ catMeta.icon }}</mat-icon>
                        }
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="text-xs sm:text-sm font-bold truncate">{{ item.name }}</div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                          <mat-icon class="text-xs leading-none">{{ catMeta.icon }}</mat-icon>
                          <span>{{ formatCarryOverItemAmount(item) }}</span>
                        </div>
                      </div>
                    </button>
                  }
                </div>
              }
            </div>

            <!-- Remove from Source Option + Inherited Participants Info -->
            @if (unboughtItems.length > 0 && carryOverSelectedItemIds().length > 0) {
              <button
                type="button"
                (click)="carryOverRemoveFromSource.set(!carryOverRemoveFromSource())"
                class="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
              >
                <div class="min-w-0">
                  <div class="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Прибрати перенесені товари зі старого списку
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400">
                    Куплені товари залишаться в старому списку як історія
                  </div>
                </div>
                <span
                  class="w-10 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0"
                  [class.bg-rose-600]="carryOverRemoveFromSource()"
                  [class.justify-end]="carryOverRemoveFromSource()"
                  [class.bg-slate-300]="!carryOverRemoveFromSource()"
                  [class.dark:bg-slate-700]="!carryOverRemoveFromSource()"
                  [class.justify-start]="!carryOverRemoveFromSource()"
                >
                  <span class="w-5 h-5 rounded-full bg-white shadow-xs block"></span>
                </span>
              </button>
            }

            @if (activeListParticipants().length > 1) {
              <div class="flex items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
                <span>Учасники списку також отримають доступ:</span>
                <div class="flex items-center -space-x-1.5">
                  @for (person of activeListParticipants(); track person.id) {
                    <span
                      [title]="person.name"
                      class="w-6 h-6 rounded-full ring-2 ring-white dark:ring-[#111827] bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center overflow-hidden text-[10px] font-extrabold text-rose-600 dark:text-rose-300"
                    >
                      @if (person.picture) {
                        <img
                          [src]="person.picture"
                          [alt]="person.name"
                          referrerpolicy="no-referrer"
                          class="w-full h-full object-cover"
                        />
                      } @else {
                        <span>{{ getInitial(person.name) }}</span>
                      }
                    </span>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Modal Footer -->
          <div class="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              (click)="closeCarryOverModal()"
              class="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <mat-icon class="text-sm leading-none">close</mat-icon>
              <span>Скасувати</span>
            </button>
            <button
              id="btn-confirm-carry-over"
              type="button"
              (click)="confirmCarryOverToNewList()"
              [disabled]="isSavingCarryOver()"
              class="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer border-0 shadow-sm disabled:opacity-50"
            >
              <mat-icon class="text-base leading-none">drive_file_move</mat-icon>
              <span>{{ isSavingCarryOver() ? 'Перенесення...' : 'Перенести у новий список' }}</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ShoppingView implements OnInit, OnDestroy {
  readonly dataService = inject(IptvData);
  readonly Math = Math;
  readonly backToHome = output<void>();

  readonly categories: ShoppingCategoryMeta[] = SHOPPING_CATEGORIES;
  readonly lists = this.dataService.shoppingLists;
  readonly catalog = this.dataService.shoppingCatalog;
  readonly people = this.dataService.shoppingPeople;
  readonly isLoading = this.dataService.isShoppingLoading;
  readonly currentUserId = computed(() => this.dataService.currentUser()?.id || '');

  readonly selectedListId = signal<string | null>(null);
  readonly itemFilter = signal<ShoppingItemFilter>('all');

  // Local live price & weight drafts so dynamic total & remaining budget update on EVERY keystroke
  readonly draftPrices = signal<Record<string, string>>({});
  readonly draftWeights = signal<Record<string, string>>({});

  // Inline budget editor
  readonly isEditingBudget = signal<boolean>(false);
  readonly inlineBudgetControl = new FormControl<string>('', { nonNullable: true });

  // Catalog modal state
  readonly isCatalogModalOpen = signal<boolean>(false);
  readonly selectedCatalogCategory = signal<ShoppingCategoryId | 'all'>('all');
  readonly catalogSearchControl = new FormControl<string>('', { nonNullable: true });
  readonly catalogSearchText = signal<string>('');
  readonly newProductCategoryControl = new FormControl<ShoppingCategoryId>('other', { nonNullable: true });
  readonly newProductPriceControl = new FormControl<string>('', { nonNullable: true });
  readonly newProductPriceMode = signal<ShoppingPriceMode>('per_unit');
  readonly newProductWeightControl = new FormControl<string>('', { nonNullable: true });
  readonly isSavingItem = signal<boolean>(false);

  // Create / Edit List modal state
  readonly isListModalOpen = signal<boolean>(false);
  readonly editingListId = signal<string | null>(null);
  readonly listTitleControl = new FormControl<string>('', { nonNullable: true });
  readonly listBudgetControl = new FormControl<string>('', { nonNullable: true });
  readonly selectedParticipantIds = signal<string[]>([]);
  readonly isSavingList = signal<boolean>(false);

  // Carry-over remaining items & budget modal state
  readonly isCarryOverModalOpen = signal<boolean>(false);
  readonly carryOverTitleControl = new FormControl<string>('', { nonNullable: true });
  readonly carryOverBudgetControl = new FormControl<string>('', { nonNullable: true });
  readonly carryOverIncludeBudget = signal<boolean>(true);
  readonly carryOverSelectedItemIds = signal<string[]>([]);
  readonly carryOverRemoveFromSource = signal<boolean>(true);
  readonly isSavingCarryOver = signal<boolean>(false);

  readonly carryOverUnboughtItems = computed<ShoppingItem[]>(() => {
    const list = this.activeList();
    if (!list) return [];
    return list.items.filter((it) => !it.isBought);
  });

  // Sorted shopping lists: active lists first, newest lists first (by createdAt desc), inactive lists last
  readonly sortedLists = computed<ShoppingList[]>(() => {
    const all = [...this.lists()];
    return all.sort((a, b) => {
      const aInactive = !!a.isInactive;
      const bInactive = !!b.isInactive;
      if (aInactive !== bInactive) {
        return aInactive ? 1 : -1; // Active first, inactive last
      }
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA; // Newest first
    });
  });

  private priceAutoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private weightAutoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.catalogSearchControl.valueChanges.subscribe((val) => {
      this.catalogSearchText.set((val || '').trim());
    });

    effect(() => {
      const currentLists = this.sortedLists();
      const curId = this.selectedListId();
      if (currentLists.length === 0) {
        if (curId !== null) this.selectedListId.set(null);
      } else if (!curId || !currentLists.some((l) => l.id === curId)) {
        this.selectedListId.set(currentLists[0].id);
      }
    });
    effect(() => {
      const uid = this.dataService.currentUser()?.id || '';
      if (!uid) {
        return;
      }
      this.dataService.startShoppingRealtimeSync();
      void this.dataService.loadShoppingData(true);
    });
  }

  ngOnInit(): void {
    void this.dataService.loadShoppingData(false);
    this.dataService.startShoppingRealtimeSync();
  }

  ngOnDestroy(): void {
    for (const timer of this.priceAutoSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.priceAutoSaveTimers.clear();
    for (const timer of this.weightAutoSaveTimers.values()) {
      clearTimeout(timer);
    }
    this.weightAutoSaveTimers.clear();
  }

  readonly activeList = computed<ShoppingList | null>(() => {
    const id = this.selectedListId();
    const all = this.sortedLists();
    if (!all.length) return null;
    return all.find((l) => l.id === id) || all[0];
  });

  getListParticipants(list: ShoppingList): ShoppingParticipant[] {
    const peopleMap = new Map<string, ShoppingParticipant>();
    const me = this.dataService.currentUser();
    if (me?.id) {
      peopleMap.set(me.id, {
        id: me.id,
        name: me.name || me.email || 'Ви',
        email: me.email,
        picture: me.picture,
      });
    }
    for (const p of this.people()) {
      peopleMap.set(p.id, p);
    }
    const result: ShoppingParticipant[] = [];
    const owner = peopleMap.get(list.ownerUserId) || {
      id: list.ownerUserId,
      name: list.ownerName || 'Власник',
    };
    result.push(owner);
    for (const pid of list.participantIds || []) {
      if (pid === list.ownerUserId) continue;
      const person = peopleMap.get(pid);
      if (person) {
        result.push(person);
      }
    }
    return result;
  }

  readonly activeListParticipants = computed<ShoppingParticipant[]>(() => {
    const list = this.activeList();
    if (!list) return [];
    return this.getListParticipants(list);
  });

  readonly peopleByIdMap = computed<Map<string, ShoppingParticipant>>(() => {
    const map = new Map<string, ShoppingParticipant>();
    const me = this.dataService.currentUser();
    if (me?.id) {
      map.set(me.id, {
        id: me.id,
        name: me.name || me.email || 'Ви',
        email: me.email,
        picture: me.picture,
      });
    }
    for (const p of this.people()) {
      map.set(p.id, p);
    }
    return map;
  });

  readonly revealedActorKey = signal<string | null>(null);
  readonly failedImageUrls = signal<Set<string>>(new Set());

  getProductImage(name: string, category: ShoppingCategoryId): string {
    return resolveShoppingItemImage(name, category);
  }

  markImageFailed(url: string): void {
    this.failedImageUrls.update((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  isImageFailed(url: string): boolean {
    return this.failedImageUrls().has(url);
  }

  getActorInfo(
    userId: string | undefined,
    fallbackName: string | undefined
  ): { name: string; picture?: string } {
    const person = userId ? this.peopleByIdMap().get(userId) : undefined;
    const name = (person?.name || fallbackName || 'Користувач').trim();
    return {
      name,
      picture: person?.picture,
    };
  }

  toggleRevealedActor(key: string): void {
    this.revealedActorKey.update((cur) => (cur === key ? null : key));
  }

  readonly isEditingOwnList = computed<boolean>(() => {
    const editId = this.editingListId();
    if (!editId) return true;
    const list = this.lists().find((l) => l.id === editId);
    if (!list) return true;
    return list.ownerUserId === this.currentUserId();
  });

  readonly selectableOtherPeople = computed<ShoppingParticipant[]>(() => {
    const myId = this.currentUserId();
    return this.people().filter((p) => p.id !== myId);
  });

  readonly activeListMetrics = computed(() => {
    const list = this.activeList();
    const drafts = this.draftPrices();
    const weightDrafts = this.draftWeights();
    if (!list) {
      return {
        budget: 0,
        hasBudget: false,
        totalSpent: 0,
        remaining: 0,
        isOverBudget: false,
        percentUsed: 0,
        progressBarPercent: 0,
        boughtCount: 0,
        todoCount: 0,
        pricedItemsCount: 0,
      };
    }

    let totalSpent = 0;
    let boughtCount = 0;
    let pricedItemsCount = 0;

    for (const item of list.items) {
      if (item.isBought) boughtCount++;
      const lineTotal = this.resolveEffectiveLineTotal(item, drafts, weightDrafts);
      if (lineTotal > 0) {
        totalSpent += lineTotal;
        pricedItemsCount++;
      }
    }

    totalSpent = Math.round(totalSpent * 100) / 100;
    const budget = list.budgetUah !== null && list.budgetUah !== undefined ? Number(list.budgetUah) : 0;
    const hasBudget = Number.isFinite(budget) && budget > 0;
    const remaining = hasBudget ? Math.round((budget - totalSpent) * 100) / 100 : 0;
    const isOverBudget = hasBudget && totalSpent > budget;
    const percentUsed = hasBudget ? Math.round((totalSpent / budget) * 100) : 0;
    const progressBarPercent = hasBudget ? Math.min(100, Math.max(0, (totalSpent / budget) * 100)) : 0;

    return {
      budget,
      hasBudget,
      totalSpent,
      remaining,
      isOverBudget,
      percentUsed,
      progressBarPercent,
      boughtCount,
      todoCount: list.items.length - boughtCount,
      pricedItemsCount,
    };
  });

  readonly filteredItems = computed<ShoppingItem[]>(() => {
    const list = this.activeList();
    if (!list) return [];
    const filter = this.itemFilter();
    const items = list.items.filter((it) => {
      if (filter === 'todo') return !it.isBought;
      if (filter === 'bought') return it.isBought;
      return true;
    });
    // Show unbought items first, bought items below
    return [...items].sort((a, b) => {
      if (a.isBought !== b.isBought) return a.isBought ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  });

  readonly filteredCatalogItems = computed<ShoppingCatalogItem[]>(() => {
    const query = this.catalogSearchText().toLowerCase();
    const cat = this.selectedCatalogCategory();
    return this.catalog().filter((item) => {
      if (cat !== 'all' && item.category !== cat) return false;
      if (!query) return true;
      return item.name.toLowerCase().includes(query);
    });
  });

  readonly shouldSuggestNewCatalogProduct = computed<boolean>(() => {
    const query = this.catalogSearchText().trim();
    if (!query) return false;
    const norm = query.toLowerCase();
    const exactExists = this.catalog().some((c) => c.name.trim().toLowerCase() === norm);
    return !exactExists;
  });

  refreshData(): void {
    void this.dataService.loadShoppingData(false);
  }

  selectList(listId: string): void {
    this.selectedListId.set(listId);
    this.isEditingBudget.set(false);
    this.draftPrices.set({});
    this.draftWeights.set({});
  }

  getCategoryMeta(catId: ShoppingCategoryId): ShoppingCategoryMeta {
    return this.categories.find((c) => c.id === catId) || this.categories[this.categories.length - 1];
  }

  getInitial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  formatUah(val: number): string {
    const num = Number(val) || 0;
    return num.toLocaleString('uk-UA', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  formatDateTime(iso?: string): string {
    if (!iso) return '';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    try {
      const formatted = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(dt);
      return formatted.replace(', ', ' ');
    } catch {
      return dt.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(', ', ' ');
    }
  }

  computeListSpent(list: ShoppingList): number {
    const isCurrent = list.id === this.selectedListId();
    const drafts = isCurrent ? this.draftPrices() : {};
    const weightDrafts = isCurrent ? this.draftWeights() : {};
    let total = 0;
    for (const item of list.items) {
      total += this.resolveEffectiveLineTotal(item, drafts, weightDrafts);
    }
    return Math.round(total * 100) / 100;
  }

  computeListBoughtCount(list: ShoppingList): number {
    return list.items.filter((i) => i.isBought).length;
  }

  getParticipantSummaryLabel(list: ShoppingList): string {
    const count = (list.participantIds || []).length;
    if (count === 0) return 'Особистий';
    const total = count + 1;
    return `${total} учасн.`;
  }

  getItemPriceMode(item: ShoppingItem): ShoppingPriceMode {
    return resolveShoppingPriceMode(item);
  }

  getPriceSuffix(mode: ShoppingPriceMode): string {
    if (mode === 'per_100g') return '₴/100г';
    if (mode === 'per_kg') return '₴/кг';
    return '₴/шт';
  }

  getDisplayUnitForPieceMode(item: ShoppingItem): string {
    const u = (item.unit || '').trim();
    const low = u.toLowerCase();
    if (!u || low === 'г' || low === 'гр' || low === 'кг') {
      return 'шт';
    }
    return u;
  }

  private normalizeDecimalString(raw: string): string {
    const compact = String(raw ?? '').replace(/\s+/g, '').replace(/,/g, '.');
    if (!compact) return '';
    let hasDot = false;
    let out = '';
    for (const ch of compact) {
      if (ch >= '0' && ch <= '9') {
        out += ch;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        out += '.';
      }
    }
    return out;
  }

  private parseWeightDraftToGrams(raw: string, mode: ShoppingPriceMode): number | null {
    const cleaned = this.normalizeDecimalString(raw);
    if (!cleaned || cleaned === '.') return null;
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    const grams = mode === 'per_kg' ? parsed * 1000 : parsed;
    return Math.round(grams * 10) / 10;
  }

  private resolveEffectiveUnitPrice(item: ShoppingItem, drafts: Record<string, string>): number {
    if (Object.prototype.hasOwnProperty.call(drafts, item.id)) {
      const raw = drafts[item.id];
      if (!raw || raw.trim() === '') return 0;
      const parsed = Number(raw.replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }
    return item.price !== null && item.price !== undefined && item.price > 0 ? Number(item.price) : 0;
  }

  private resolveEffectiveWeightGrams(
    item: ShoppingItem,
    weightDrafts: Record<string, string>
  ): number | null {
    const mode = resolveShoppingPriceMode(item);
    if (Object.prototype.hasOwnProperty.call(weightDrafts, item.id)) {
      return this.parseWeightDraftToGrams(weightDrafts[item.id], mode);
    }
    return item.weightGrams !== null && item.weightGrams !== undefined && item.weightGrams > 0
      ? Number(item.weightGrams)
      : null;
  }

  private resolveEffectiveLineTotal(
    item: ShoppingItem,
    drafts: Record<string, string>,
    weightDrafts: Record<string, string>
  ): number {
    const unitPrice = this.resolveEffectiveUnitPrice(item, drafts);
    const weightGrams = this.resolveEffectiveWeightGrams(item, weightDrafts);
    return computeShoppingItemTotal(item, unitPrice, weightGrams);
  }

  getEffectiveItemTotal(item: ShoppingItem): number {
    return this.resolveEffectiveLineTotal(item, this.draftPrices(), this.draftWeights());
  }

  getDisplayedPriceValue(item: ShoppingItem): string {
    const drafts = this.draftPrices();
    if (Object.prototype.hasOwnProperty.call(drafts, item.id)) {
      return drafts[item.id];
    }
    return item.price !== null && item.price !== undefined && item.price > 0 ? String(item.price) : '';
  }

  getDisplayedWeightValue(item: ShoppingItem): string {
    const drafts = this.draftWeights();
    if (Object.prototype.hasOwnProperty.call(drafts, item.id)) {
      return drafts[item.id];
    }
    const grams = item.weightGrams;
    if (grams === null || grams === undefined || !Number.isFinite(grams) || grams <= 0) {
      return '';
    }
    const mode = resolveShoppingPriceMode(item);
    if (mode === 'per_kg') {
      const kg = Math.round((grams / 1000) * 1000) / 1000;
      return String(kg);
    }
    return String(Math.round(grams * 10) / 10);
  }

  async setItemPriceMode(
    list: ShoppingList,
    item: ShoppingItem,
    mode: ShoppingPriceMode
  ): Promise<void> {
    if (resolveShoppingPriceMode(item) === mode) return;
    // Clear active weight draft so the converted weight displays cleanly in the new unit
    this.draftWeights.update((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, item.id)) return prev;
      const copy = { ...prev };
      delete copy[item.id];
      return copy;
    });
    const nextUnit =
      mode === 'per_100g'
        ? 'г'
        : mode === 'per_kg'
          ? 'кг'
          : this.getDisplayUnitForPieceMode(item);
    await this.dataService.updateShoppingItem(list.id, item.id, {
      priceMode: mode,
      unit: nextUnit,
    });
  }

  onItemWeightInput(list: ShoppingList, item: ShoppingItem, rawVal: string): void {
    this.draftWeights.update((prev) => ({ ...prev, [item.id]: rawVal }));
    const existingTimer = this.weightAutoSaveTimers.get(item.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.weightAutoSaveTimers.delete(item.id);
      const latestList = this.lists().find((l) => l.id === list.id) || list;
      const latestItem = latestList.items.find((i) => i.id === item.id) || item;
      const latestDraft = this.draftWeights()[item.id];
      if (latestDraft !== undefined) {
        const trimmed = latestDraft.trim();
        if (trimmed.endsWith(',') || trimmed.endsWith('.')) {
          return;
        }
        void this.commitItemWeight(latestList, latestItem, latestDraft, true);
      }
    }, 650);
    this.weightAutoSaveTimers.set(item.id, timer);
  }

  async commitItemWeight(
    list: ShoppingList,
    item: ShoppingItem,
    rawVal: string,
    keepDraftWhileFocused = false
  ): Promise<void> {
    const existingTimer = this.weightAutoSaveTimers.get(item.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.weightAutoSaveTimers.delete(item.id);
    }
    const mode = resolveShoppingPriceMode(item);
    const nextWeightGrams = this.parseWeightDraftToGrams(rawVal, mode);

    if (!keepDraftWhileFocused) {
      this.draftWeights.update((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    }

    const currentGrams = item.weightGrams ?? null;
    if (currentGrams === nextWeightGrams) return;

    await this.dataService.updateShoppingItem(list.id, item.id, {
      weightGrams: nextWeightGrams,
    });
  }

  onItemPriceInput(list: ShoppingList, item: ShoppingItem, rawVal: string): void {
    this.draftPrices.update((prev) => ({ ...prev, [item.id]: rawVal }));
    const existingTimer = this.priceAutoSaveTimers.get(item.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.priceAutoSaveTimers.delete(item.id);
      const latestList = this.lists().find((l) => l.id === list.id) || list;
      const latestItem = latestList.items.find((i) => i.id === item.id) || item;
      const latestDraft = this.draftPrices()[item.id];
      if (latestDraft !== undefined) {
        void this.commitItemPrice(latestList, latestItem, latestDraft, true);
      }
    }, 650);
    this.priceAutoSaveTimers.set(item.id, timer);
  }

  async commitItemPrice(
    list: ShoppingList,
    item: ShoppingItem,
    rawVal: string,
    keepDraftWhileFocused = false
  ): Promise<void> {
    const existingTimer = this.priceAutoSaveTimers.get(item.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.priceAutoSaveTimers.delete(item.id);
    }

    const cleaned = String(rawVal || '').trim().replace(',', '.');
    let nextPrice: number | null = null;
    if (cleaned !== '') {
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed) && parsed >= 0) {
        nextPrice = Math.round(parsed * 100) / 100;
      }
    }

    if (!keepDraftWhileFocused) {
      this.draftPrices.update((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    }

    const currentPrice = item.price ?? null;
    const shouldAutoMarkBought = nextPrice !== null && nextPrice > 0 && !item.isBought;
    if (currentPrice === nextPrice && !shouldAutoMarkBought) return;

    await this.dataService.updateShoppingItem(list.id, item.id, {
      price: nextPrice,
      ...(shouldAutoMarkBought ? { isBought: true } : {}),
    });
  }

  async toggleItemBought(list: ShoppingList, item: ShoppingItem): Promise<void> {
    await this.dataService.updateShoppingItem(list.id, item.id, {
      isBought: !item.isBought,
    });
  }

  async stepItemQuantity(list: ShoppingList, item: ShoppingItem, delta: number): Promise<void> {
    const nextQty = Math.max(1, Math.round((item.quantity + delta) * 100) / 100);
    if (nextQty === item.quantity) return;
    await this.dataService.updateShoppingItem(list.id, item.id, { quantity: nextQty });
  }

  async removeItem(list: ShoppingList, item: ShoppingItem): Promise<void> {
    await this.dataService.deleteShoppingItem(list.id, item.id);
  }

  openCarryOverModal(list: ShoppingList): void {
    const metrics = this.activeListMetrics();
    const cleanTitle = list.title.startsWith('Залишок:')
      ? `${list.title} (новий)`
      : `Залишок: ${list.title}`;
    this.carryOverTitleControl.setValue(cleanTitle);

    const hasPositiveRemaining = metrics.hasBudget && metrics.remaining > 0;
    this.carryOverIncludeBudget.set(hasPositiveRemaining);
    this.carryOverBudgetControl.setValue(hasPositiveRemaining ? String(metrics.remaining) : '');

    const unboughtIds = list.items.filter((i) => !i.isBought).map((i) => i.id);
    this.carryOverSelectedItemIds.set(unboughtIds);
    this.carryOverRemoveFromSource.set(true);
    this.isCarryOverModalOpen.set(true);
  }

  closeCarryOverModal(): void {
    this.isCarryOverModalOpen.set(false);
  }

  toggleCarryOverIncludeBudget(): void {
    const next = !this.carryOverIncludeBudget();
    this.carryOverIncludeBudget.set(next);
    if (next && !String(this.carryOverBudgetControl.value ?? '').trim()) {
      const metrics = this.activeListMetrics();
      if (metrics.hasBudget && metrics.remaining > 0) {
        this.carryOverBudgetControl.setValue(String(metrics.remaining));
      }
    }
  }

  isCarryOverItemSelected(itemId: string): boolean {
    return this.carryOverSelectedItemIds().includes(itemId);
  }

  toggleCarryOverItem(itemId: string): void {
    this.carryOverSelectedItemIds.update((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }

  toggleAllCarryOverItems(): void {
    const allIds = this.carryOverUnboughtItems().map((i) => i.id);
    if (this.carryOverSelectedItemIds().length === allIds.length) {
      this.carryOverSelectedItemIds.set([]);
    } else {
      this.carryOverSelectedItemIds.set(allIds);
    }
  }

  formatCarryOverItemAmount(item: ShoppingItem): string {
    const mode = resolveShoppingPriceMode(item);
    if (mode === 'per_100g') {
      const g = item.weightGrams && item.weightGrams > 0 ? item.weightGrams : 100;
      return `${Math.round(g * 10) / 10} г`;
    }
    if (mode === 'per_kg') {
      const kg =
        item.weightGrams && item.weightGrams > 0
          ? Math.round((item.weightGrams / 1000) * 1000) / 1000
          : 1;
      return `${kg} кг`;
    }
    return `${item.quantity} ${this.getDisplayUnitForPieceMode(item)}`;
  }

  async confirmCarryOverToNewList(): Promise<void> {
    const srcList = this.activeList();
    if (!srcList || this.isSavingCarryOver()) return;

    const title = String(this.carryOverTitleControl.value ?? '').trim();
    if (!title) {
      this.dataService.showError('Вкажіть назву нового списку покупок');
      return;
    }

    let nextBudget: number | null = null;
    if (this.carryOverIncludeBudget()) {
      const rawBudget = String(this.carryOverBudgetControl.value ?? '').trim().replace(',', '.');
      if (rawBudget !== '') {
        const parsed = Number(rawBudget);
        if (Number.isFinite(parsed) && parsed > 0) {
          nextBudget = Math.round(parsed * 100) / 100;
        }
      }
    }

    const validUnboughtIds = new Set(srcList.items.filter((i) => !i.isBought).map((i) => i.id));
    const itemIds = this.carryOverSelectedItemIds().filter((id) => validUnboughtIds.has(id));

    if (itemIds.length === 0 && nextBudget === null) {
      this.dataService.showError('Оберіть хоча б один товар або залишок бюджету для перенесення');
      return;
    }

    this.isSavingCarryOver.set(true);
    try {
      const created = await this.dataService.carryOverShoppingList(srcList.id, {
        title,
        budgetUah: nextBudget,
        itemIds,
        removeFromSource: this.carryOverRemoveFromSource(),
      });
      if (created) {
        this.isCarryOverModalOpen.set(false);
        this.selectList(created.id);
      }
    } finally {
      this.isSavingCarryOver.set(false);
    }
  }

  // Inline budget editing
  startEditBudget(list: ShoppingList): void {
    this.inlineBudgetControl.setValue(
      list.budgetUah !== null && list.budgetUah !== undefined && list.budgetUah > 0
        ? String(list.budgetUah)
        : ''
    );
    this.isEditingBudget.set(true);
  }

  cancelEditBudget(): void {
    this.isEditingBudget.set(false);
  }

  async saveInlineBudget(): Promise<void> {
    const list = this.activeList();
    if (!list) return;
    const raw = String(this.inlineBudgetControl.value ?? '').trim().replace(',', '.');
    let nextBudget: number | null = null;
    if (raw !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        nextBudget = Math.round(parsed * 100) / 100;
      }
    }
    this.isEditingBudget.set(false);
    await this.dataService.updateShoppingList(list.id, { budgetUah: nextBudget });
  }

  // Catalog Modal Actions
  openCatalogModal(): void {
    this.catalogSearchControl.setValue('');
    this.catalogSearchText.set('');
    this.newProductPriceControl.setValue('');
    this.newProductPriceMode.set('per_unit');
    this.newProductWeightControl.setValue('');
    const currentCat = this.selectedCatalogCategory();
    this.newProductCategoryControl.setValue(currentCat === 'all' ? 'other' : currentCat);
    this.isCatalogModalOpen.set(true);
  }

  closeCatalogModal(): void {
    this.isCatalogModalOpen.set(false);
  }

  clearCatalogSearch(): void {
    this.catalogSearchControl.setValue('');
    this.catalogSearchText.set('');
  }

  getProductCountInActiveList(name: string): number {
    const list = this.activeList();
    if (!list) return 0;
    const norm = name.trim().toLowerCase();
    return list.items.filter((i) => i.name.trim().toLowerCase() === norm && !i.isBought).length;
  }

  async quickAddFromCatalog(prod: ShoppingCatalogItem): Promise<void> {
    const list = this.activeList();
    if (!list) return;
    const unit = prod.defaultUnit || 'шт';
    const initialMode: ShoppingPriceMode =
      unit.toLowerCase() === 'г'
        ? 'per_100g'
        : unit.toLowerCase() === 'кг'
          ? 'per_kg'
          : 'per_unit';
    await this.dataService.addShoppingItem(list.id, {
      name: prod.name,
      category: prod.category,
      quantity: 1,
      unit,
      priceMode: initialMode,
      weightGrams: null,
      price: null,
      isBought: false,
    });
  }

  async addCustomProductAndSaveToCatalog(): Promise<void> {
    const list = this.activeList();
    const name = this.catalogSearchText().trim();
    if (!list || !name || this.isSavingItem()) return;
    this.isSavingItem.set(true);
    try {
      const cat = this.newProductCategoryControl.value || 'other';
      const added = await this.dataService.addShoppingItem(list.id, {
        name,
        category: cat,
        quantity: 1,
        unit: 'шт',
        priceMode: 'per_unit',
        weightGrams: null,
        price: null,
        isBought: false,
        addToCatalog: true,
      });
      if (added) {
        this.dataService.showSuccess(`«${name}» додано у список та збережено в каталог`);
        this.catalogSearchControl.setValue('');
        this.catalogSearchText.set('');
      }
    } finally {
      this.isSavingItem.set(false);
    }
  }

  async toggleListInactive(list: ShoppingList): Promise<void> {
    const nextState = !list.isInactive;
    const updated = await this.dataService.updateShoppingList(
      list.id,
      { isInactive: nextState },
      nextState ? 'Список позначено як неактивний' : 'Список відновлено як активний'
    );
    if (updated) {
      this.selectedListId.set(updated.id);
    }
  }

  // Create / Edit List Modal Actions
  openCreateListModal(): void {
    this.editingListId.set(null);
    this.listTitleControl.setValue('');
    this.listBudgetControl.setValue('');
    this.selectedParticipantIds.set([]);
    this.isListModalOpen.set(true);
  }

  openEditListModal(list: ShoppingList): void {
    this.editingListId.set(list.id);
    this.listTitleControl.setValue(list.title);
    this.listBudgetControl.setValue(
      list.budgetUah !== null && list.budgetUah !== undefined && list.budgetUah > 0
        ? String(list.budgetUah)
        : ''
    );
    this.selectedParticipantIds.set([...(list.participantIds || [])]);
    this.isListModalOpen.set(true);
  }

  closeListModal(): void {
    this.isListModalOpen.set(false);
  }

  openInviteModalFromShopping(): void {
    this.isListModalOpen.set(false);
    this.dataService.openSharedHouseholdModal();
  }

  isParticipantSelected(userId: string): boolean {
    return this.selectedParticipantIds().includes(userId);
  }

  toggleParticipantSelection(userId: string): void {
    this.selectedParticipantIds.update((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async saveListModal(): Promise<void> {
    const title = String(this.listTitleControl.value ?? '').trim();
    if (!title) {
      this.dataService.showError('Вкажіть назву списку покупок');
      return;
    }
    const rawBudget = String(this.listBudgetControl.value ?? '').trim().replace(',', '.');
    let budgetUah: number | null = null;
    if (rawBudget !== '') {
      const parsed = Number(rawBudget);
      if (Number.isFinite(parsed) && parsed > 0) {
        budgetUah = Math.round(parsed * 100) / 100;
      }
    }
    const allowedIds = new Set(this.selectableOtherPeople().map((p) => p.id));
    const participantIds = this.selectedParticipantIds().filter((id) => allowedIds.has(id));

    this.isSavingList.set(true);
    try {
      const editId = this.editingListId();
      if (editId) {
        const updated = await this.dataService.updateShoppingList(editId, {
          title,
          budgetUah,
          ...(this.isEditingOwnList() ? { participantIds } : {}),
        });
        if (updated) {
          this.dataService.showSuccess('Список покупок оновлено');
          this.closeListModal();
        }
      } else {
        const created = await this.dataService.createShoppingList({
          title,
          budgetUah,
          participantIds,
        });
        if (created) {
          this.selectedListId.set(created.id);
          this.closeListModal();
        }
      }
    } finally {
      this.isSavingList.set(false);
    }
  }

  readonly editingList = computed<ShoppingList | null>(() => {
    const id = this.editingListId();
    if (!id) return null;
    return this.lists().find((l) => l.id === id) || null;
  });

  async confirmDeleteList(list: ShoppingList): Promise<void> {
    const isOwner = list.ownerUserId === this.currentUserId();
    const confirmed = await this.dataService.openConfirmDialog({
      title: isOwner ? 'Видалити список покупок?' : 'Покинути спільний список?',
      message: isOwner
        ? `Список «${list.title}» та всі його товари буде остаточно видалено для всіх учасників.`
        : `Ви більше не бачитимете спільний список «${list.title}».`,
      confirmText: isOwner ? 'Видалити' : 'Покинути',
      tone: 'danger',
    });
    if (!confirmed) return;
    const ok = await this.dataService.deleteShoppingList(list.id);
    if (ok && this.editingListId() === list.id) {
      this.closeListModal();
    }
  }
}
