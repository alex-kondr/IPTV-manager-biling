import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { IptvData } from '../../services/iptv-data';

export interface AppliedMeterReading {
  readingT1?: number;
  readingT2?: number;
  readingWater?: number;
  meterNumber?: string;
  note?: string;
}

export interface MeterRecognitionData {
  success: boolean;
  readingT1?: number | null;
  readingT2?: number | null;
  singleReading?: number | null;
  readingWater?: number | null;
  meterNumber?: string | null;
  confidence?: number;
  explanation?: string;
  error?: string;
}

function parseMeterNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim().replace(/\s+/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

@Component({
  selector: 'app-meter-camera-modal',
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 z-50 overflow-y-auto p-2 sm:p-4 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <!-- Backdrop click-to-close overlay -->
      <button
        type="button"
        aria-label="Закрити камеру"
        class="fixed inset-0 w-full h-full bg-transparent cursor-default -z-10"
        (click)="onClose()"
      ></button>

      <div
        class="relative w-full max-w-xl bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 overflow-hidden flex flex-col max-h-[94dvh] my-auto animate-in zoom-in-95 duration-150"
      >
        <!-- Pinned Header -->
        <div class="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              [class.bg-amber-500]="utilityType() === 'electricity'"
              [class.bg-cyan-600]="utilityType() === 'water'"
            >
              <mat-icon class="text-white text-xl">photo_camera</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm sm:text-base font-bold text-white">
                  Фотофіксація показів лічильника
                </h3>
                <span
                  class="px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider"
                  [class.bg-amber-500/20]="utilityType() === 'electricity'"
                  [class.text-amber-300]="utilityType() === 'electricity'"
                  [class.border]="true"
                  [class.border-amber-500/30]="utilityType() === 'electricity'"
                  [class.bg-cyan-500/20]="utilityType() === 'water'"
                  [class.text-cyan-300]="utilityType() === 'water'"
                  [class.border-cyan-500/30]="utilityType() === 'water'"
                >
                  {{ utilityType() === 'electricity' ? 'Електроенергія' : 'Водопостачання' }}
                </span>
              </div>
              <p class="text-2xs text-slate-400 mt-0.5">
                {{ accountName() || 'Розпізнавання чисел за допомогою штучного інтелекту' }}
                @if (utilityType() === 'electricity' && electricityTariffType() === 'dual') {
                  <span class="text-amber-400 font-semibold">• Двозонний тариф (День/Ніч)</span>
                }
              </p>
            </div>
          </div>

          <button
            type="button"
            (click)="onClose()"
            aria-label="Закрити вікно камери"
            class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <!-- Scrollable Body -->
        <div class="p-4 sm:p-5 overflow-y-auto space-y-4">
          <!-- Error banner -->
          @if (errorMessage()) {
            <div
              class="p-3.5 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-start gap-2.5 animate-in fade-in"
            >
              <mat-icon class="text-red-400 text-lg shrink-0">error_outline</mat-icon>
              <div class="flex-1">
                <div class="font-bold text-red-100">Повідомлення</div>
                <div class="text-2xs mt-0.5 leading-relaxed">{{ errorMessage() }}</div>
              </div>
            </div>
          }

          <!-- STAGE 1: CAMERA STREAM OR FILE PICKER (No captured image yet) -->
          @if (!capturedImage()) {
            <div class="space-y-3">
              <!-- Live Camera Viewport -->
              <div
                class="relative w-full aspect-4/3 sm:aspect-16/10 rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center shadow-inner"
              >
                <!-- Video Element -->
                <video
                  #videoPlayer
                  autoplay
                  playsinline
                  muted
                  class="w-full h-full object-cover"
                  [class.hidden]="!cameraActive()"
                ></video>

                <!-- Viewfinder Target Overlay -->
                @if (cameraActive()) {
                  <div class="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                    <!-- Targeting Frame with glowing corners -->
                    <div
                      class="relative w-full max-w-xs sm:max-w-sm h-36 sm:h-44 rounded-xl border-2 border-dashed transition-colors flex items-center justify-center"
                      [class.border-amber-400]="utilityType() === 'electricity'"
                      [class.border-cyan-400]="utilityType() === 'water'"
                    >
                      <!-- Corner brackets -->
                      <div class="absolute -top-1 -left-1 w-4 h-4 border-t-3 border-l-3 border-white rounded-tl"></div>
                      <div class="absolute -top-1 -right-1 w-4 h-4 border-t-3 border-r-3 border-white rounded-tr"></div>
                      <div class="absolute -bottom-1 -left-1 w-4 h-4 border-b-3 border-l-3 border-white rounded-bl"></div>
                      <div class="absolute -bottom-1 -right-1 w-4 h-4 border-b-3 border-r-3 border-white rounded-br"></div>

                      <!-- Center label -->
                      <div class="px-2.5 py-1 rounded bg-black/60 backdrop-blur-xs text-3xs font-medium text-slate-200 border border-white/10 text-center">
                        Наведіть рамку на табло з цифрами
                      </div>
                    </div>
                  </div>

                  <!-- Quick Controls Overlay (top right of video) -->
                  <div class="absolute top-3 right-3 flex items-center gap-2">
                    @if (supportsTorch()) {
                      <button
                        type="button"
                        (click)="toggleTorch()"
                        [title]="isTorchOn() ? 'Вимкнути ліхтарик' : 'Увімкнути ліхтарик'"
                        class="p-2 rounded-xl bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/20 transition-colors cursor-pointer"
                      >
                        <mat-icon class="text-base leading-none">
                          {{ isTorchOn() ? 'flashlight_off' : 'flashlight_on' }}
                        </mat-icon>
                      </button>
                    }
                    @if (availableCameras().length > 1) {
                      <button
                        type="button"
                        (click)="switchCamera()"
                        title="Змінити камеру"
                        class="p-2 rounded-xl bg-black/60 backdrop-blur-md text-white hover:bg-black/80 border border-white/20 transition-colors cursor-pointer"
                      >
                        <mat-icon class="text-base leading-none">flip_camera_ios</mat-icon>
                      </button>
                    }
                  </div>
                } @else {
                  <!-- Camera Not Started or Blocked Placeholder -->
                  <div class="p-6 text-center space-y-3 max-w-sm">
                    <div class="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                      <mat-icon class="text-2xl">videocam_off</mat-icon>
                    </div>
                    <div>
                      <div class="font-bold text-sm text-slate-200">Камера очікує активації</div>
                      <p class="text-2xs text-slate-400 mt-1">
                        Натисніть «Увімкнути камеру» або виберіть готове фото лічильника з галереї чи файлу.
                      </p>
                    </div>
                    <button
                      type="button"
                      (click)="startCamera()"
                      class="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <mat-icon class="text-base leading-none">videocam</mat-icon>
                      <span>Увімкнути камеру</span>
                    </button>
                  </div>
                }
              </div>

              <!-- Action Buttons Row -->
              <div class="flex items-center justify-center gap-3 pt-1">
                @if (cameraActive()) {
                  <!-- Big Snapshot Button -->
                  <button
                    type="button"
                    (click)="takeSnapshot()"
                    class="px-6 py-3 rounded-2xl font-bold text-sm text-white flex items-center gap-2.5 shadow-lg transition-transform active:scale-95 cursor-pointer"
                    [class.bg-amber-500]="utilityType() === 'electricity'"
                    [class.hover:bg-amber-600]="utilityType() === 'electricity'"
                    [class.shadow-amber-500/30]="utilityType() === 'electricity'"
                    [class.bg-cyan-600]="utilityType() === 'water'"
                    [class.hover:bg-cyan-700]="utilityType() === 'water'"
                    [class.shadow-cyan-600/30]="utilityType() === 'water'"
                  >
                    <mat-icon class="text-xl leading-none">camera</mat-icon>
                    <span>Сфотографувати лічильник</span>
                  </button>
                }

                <!-- Upload File / Gallery Button -->
                <button
                  type="button"
                  (click)="fileInput.click()"
                  class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <mat-icon class="text-base leading-none">photo_library</mat-icon>
                  <span>Завантажити фото з файлу</span>
                </button>
                <input
                  #fileInput
                  type="file"
                  accept="image/*"
                  capture="environment"
                  (change)="onFileSelected($event)"
                  class="hidden"
                />
              </div>

              <div class="text-center text-3xs text-slate-400">
                💡 Порада: тримайте камеру перпендикулярно до табло з гарним освітленням без відблисків.
              </div>
            </div>
          }

          <!-- STAGE 2: PHOTO CAPTURED & AI RECOGNITION -->
          @if (capturedImage()) {
            <div class="space-y-4">
              <!-- Photo Preview with AI Scanning Effect -->
              <div class="relative w-full aspect-4/3 sm:aspect-16/10 rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                <img
                  [src]="capturedImage()"
                  alt="Знімок лічильника"
                  class="w-full h-full object-contain"
                />

                <!-- AI Scanning Overlay -->
                @if (isAnalyzing()) {
                  <div class="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div class="relative w-16 h-16 flex items-center justify-center">
                      <div class="absolute inset-0 rounded-full border-4 border-amber-500/20 animate-ping"></div>
                      <div class="w-12 h-12 rounded-full border-3 border-amber-400 border-t-transparent animate-spin flex items-center justify-center"></div>
                      <mat-icon class="text-amber-400 text-xl leading-none absolute">auto_awesome</mat-icon>
                    </div>
                    <div>
                      <div class="font-bold text-sm text-white">Штучний інтелект аналізує фото...</div>
                      <p class="text-2xs text-slate-400 mt-1 max-w-xs">
                        Зчитуємо цифри та тарифи з дисплея лічильника за допомогою моделі Gemini
                      </p>
                    </div>
                  </div>
                }
              </div>

              <!-- Results Card -->
              @if (!isAnalyzing() && recognitionResult()) {
                <div class="p-4 rounded-xl bg-slate-800/90 border border-slate-700 space-y-3.5">
                  <div class="flex items-center justify-between pb-2.5 border-b border-slate-700/80">
                    <div class="flex items-center gap-2">
                      <mat-icon class="text-emerald-400 text-lg">check_circle</mat-icon>
                      <span class="text-xs font-bold text-white">Показники успішно розпізнано!</span>
                    </div>
                    @if (recognitionResult()?.confidence !== undefined) {
                      <span class="px-2 py-0.5 rounded text-3xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Точність: {{ Math.round(((recognitionResult()?.confidence ?? 0.9)) * 100) }}%
                      </span>
                    }
                  </div>

                  @if (recognitionResult()?.explanation) {
                    <div class="text-2xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {{ recognitionResult()?.explanation }}
                    </div>
                  }

                  <!-- Result Summary Number Cards -->
                  <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-700/80">
                    <div class="text-3xs uppercase tracking-wider font-semibold text-slate-400 mb-2">
                      Розпізнаний показник (перетворено у число):
                    </div>
                    @if (utilityType() === 'electricity') {
                      @if (electricityTariffType() === 'dual') {
                        <div class="grid grid-cols-2 gap-2 text-center">
                          <div class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                            <span class="text-3xs text-amber-300 font-semibold block">День (Т1)</span>
                            <span class="text-lg font-mono font-black text-amber-400">
                              {{ manualReadingT1() !== null ? manualReadingT1() : '—' }}
                            </span>
                            <span class="text-3xs text-slate-400 ml-1">кВт·г</span>
                          </div>
                          <div class="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
                            <span class="text-3xs text-indigo-300 font-semibold block">Ніч (Т2)</span>
                            <span class="text-lg font-mono font-black text-indigo-400">
                              {{ manualReadingT2() !== null ? manualReadingT2() : '—' }}
                            </span>
                            <span class="text-3xs text-slate-400 ml-1">кВт·г</span>
                          </div>
                        </div>
                      } @else {
                        <div class="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-center">
                          <span class="text-3xs text-amber-300 font-semibold block">Показник електроенергії</span>
                          <span class="text-xl font-mono font-black text-amber-400">
                            {{ manualReadingT1() !== null ? manualReadingT1() : '—' }}
                          </span>
                          <span class="text-2xs text-slate-400 ml-1">кВт·г</span>
                        </div>
                      }
                    } @else {
                      <div class="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-center">
                        <span class="text-3xs text-cyan-300 font-semibold block">Показник лічильника води</span>
                        <span class="text-xl font-mono font-black text-cyan-400">
                          {{ manualReadingWater() !== null ? manualReadingWater() : '—' }}
                        </span>
                        <span class="text-2xs text-slate-400 ml-1">м³</span>
                      </div>
                    }
                  </div>

                  <!-- Editable Inputs for verification / correction -->
                  <div class="space-y-2.5">
                    <div class="text-3xs uppercase tracking-wider font-semibold text-slate-400">
                      Точне значення або корекція вручну:
                    </div>

                    @if (utilityType() === 'electricity') {
                      @if (electricityTariffType() === 'dual') {
                        <div class="grid grid-cols-2 gap-3">
                          <div>
                            <label for="meter-manual-t1" class="block text-3xs font-bold text-amber-400 mb-1">
                              День Т1 (кВт·г):
                            </label>
                            <input
                              id="meter-manual-t1"
                              type="number"
                              step="0.1"
                              min="0"
                              [value]="manualReadingT1() ?? ''"
                              (input)="onInputT1($event)"
                              placeholder="0.0"
                              class="w-full px-3 py-2 bg-slate-900 border border-amber-500/50 rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                            />
                          </div>

                          <div>
                            <label for="meter-manual-t2" class="block text-3xs font-bold text-indigo-400 mb-1">
                              Ніч Т2 (кВт·г):
                            </label>
                            <input
                              id="meter-manual-t2"
                              type="number"
                              step="0.1"
                              min="0"
                              [value]="manualReadingT2() ?? ''"
                              (input)="onInputT2($event)"
                              placeholder="0.0"
                              class="w-full px-3 py-2 bg-slate-900 border border-indigo-500/50 rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-indigo-400"
                            />
                          </div>
                        </div>
                      } @else {
                        <div>
                          <label for="meter-manual-single" class="block text-3xs font-bold text-amber-400 mb-1">
                            Показник електроенергії (кВт·г):
                          </label>
                          <input
                            id="meter-manual-single"
                            type="number"
                            step="0.1"
                            min="0"
                            [value]="manualReadingT1() ?? ''"
                            (input)="onInputT1($event)"
                            placeholder="0.0"
                            class="w-full px-3 py-2 bg-slate-900 border border-amber-500/50 rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      }
                    } @else {
                      <div>
                        <label for="meter-manual-water" class="block text-3xs font-bold text-cyan-400 mb-1">
                          Показник лічильника води (м³):
                        </label>
                        <input
                          id="meter-manual-water"
                          type="number"
                          step="0.01"
                          min="0"
                          [value]="manualReadingWater() ?? ''"
                          (input)="onInputWater($event)"
                          placeholder="0.0"
                          class="w-full px-3 py-2 bg-slate-900 border border-cyan-500/50 rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Retake or re-scan actions -->
              <div class="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  (click)="retakePhoto()"
                  [disabled]="isAnalyzing()"
                  class="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
                >
                  <mat-icon class="text-base leading-none">replay</mat-icon>
                  <span>Перезняти фото</span>
                </button>

                @if (!isAnalyzing() && hasValidNumbers()) {
                  <button
                    type="button"
                    (click)="applyReading()"
                    class="px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
                    [class.bg-emerald-600]="true"
                    [class.hover:bg-emerald-700]="true"
                    [class.shadow-emerald-600/30]="true"
                  >
                    <mat-icon class="text-base leading-none">check</mat-icon>
                    <span>Застосувати у форму показів</span>
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- Pinned Footer -->
        <div class="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950/70 shrink-0">
          <div class="text-3xs text-slate-400 flex items-center gap-1.5">
            <mat-icon class="text-xs text-amber-400">smart_toy</mat-icon>
            <span>Розпізнавання чисел за фотографією</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="onClose()"
              class="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
            >
              Скасувати
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MeterCameraModal implements OnInit, OnDestroy {
  readonly dataService = inject(IptvData);
  protected readonly Math = Math;

  readonly utilityType = input.required<'electricity' | 'water'>();
  readonly electricityTariffType = input<'single' | 'dual'>('single');
  readonly accountName = input<string>('');

  readonly closeModal = output<void>();
  readonly readingApplied = output<AppliedMeterReading>();

  @ViewChild('videoPlayer') videoElementRef?: ElementRef<HTMLVideoElement>;

  readonly cameraActive = signal<boolean>(false);
  readonly availableCameras = signal<MediaDeviceInfo[]>([]);
  readonly selectedCameraIndex = signal<number>(0);
  readonly isAnalyzing = signal<boolean>(false);
  readonly capturedImage = signal<string | null>(null);
  readonly recognitionResult = signal<MeterRecognitionData | null>(null);

  readonly manualReadingT1 = signal<number | null>(null);
  readonly manualReadingT2 = signal<number | null>(null);
  readonly manualReadingWater = signal<number | null>(null);

  readonly supportsTorch = signal<boolean>(false);
  readonly isTorchOn = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  private mediaStream: MediaStream | null = null;

  ngOnInit(): void {
    // Attempt auto-starting camera
    this.startCamera();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  async startCamera(): Promise<void> {
    this.errorMessage.set(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.errorMessage.set(
        'Камера не підтримується цим браузером. Ви можете завантажити фото лічильника з файлу.'
      );
      return;
    }

    try {
      this.stopCamera();
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.mediaStream = stream;

      if (this.videoElementRef?.nativeElement) {
        this.videoElementRef.nativeElement.srcObject = stream;
        await this.videoElementRef.nativeElement.play();
        this.cameraActive.set(true);
      } else {
        // Retry play on next frame if element wasn't rendered yet
        setTimeout(async () => {
          if (this.videoElementRef?.nativeElement && this.mediaStream) {
            this.videoElementRef.nativeElement.srcObject = this.mediaStream;
            await this.videoElementRef.nativeElement.play();
            this.cameraActive.set(true);
          }
        }, 100);
      }

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        if (caps?.torch) {
          this.supportsTorch.set(true);
        }
      }

      // Query available video devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter((d) => d.kind === 'videoinput');
      this.availableCameras.set(videoDevs);
    } catch (err: unknown) {
      console.warn('Camera stream error:', err);
      this.cameraActive.set(false);
      const errorObj = err as { name?: string };
      if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        this.errorMessage.set(
          'Доступ до камери заблоковано в налаштуваннях браузера. Надайте дозвіл або оберіть фото лічильника з галереї / файлу.'
        );
      } else {
        this.errorMessage.set(
          'Не вдалося підключитись до камери. Ви можете обрати фото лічильника за допомогою кнопки «Завантажити фото з файлу».'
        );
      }
    }
  }

  stopCamera(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.cameraActive.set(false);
    this.isTorchOn.set(false);
  }

  async switchCamera(): Promise<void> {
    const cams = this.availableCameras();
    if (cams.length <= 1) return;
    const nextIdx = (this.selectedCameraIndex() + 1) % cams.length;
    this.selectedCameraIndex.set(nextIdx);
    const targetDeviceId = cams[nextIdx].deviceId;

    try {
      this.stopCamera();
      const constraints: MediaStreamConstraints = {
        video: { deviceId: { exact: targetDeviceId } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.mediaStream = stream;
      if (this.videoElementRef?.nativeElement) {
        this.videoElementRef.nativeElement.srcObject = stream;
        await this.videoElementRef.nativeElement.play();
        this.cameraActive.set(true);
      }
    } catch (e) {
      console.warn('Failed to switch camera:', e);
      this.startCamera();
    }
  }

  async toggleTorch(): Promise<void> {
    if (!this.mediaStream) return;
    const track = this.mediaStream.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !this.isTorchOn();
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      this.isTorchOn.set(nextState);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  }

  async takeSnapshot(): Promise<void> {
    const video = this.videoElementRef?.nativeElement;
    if (!video) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    this.capturedImage.set(dataUrl);
    this.stopCamera();
    const processedUrl = await this.resizeImageIfNeeded(dataUrl);
    this.analyzePhoto(processedUrl);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        this.capturedImage.set(dataUrl);
        this.stopCamera();
        const processedUrl = await this.resizeImageIfNeeded(dataUrl);
        this.analyzePhoto(processedUrl);
      };
      reader.readAsDataURL(file);
    }
  }

  private resizeImageIfNeeded(dataUrl: string, maxDim = 1920): Promise<string> {
    return new Promise((resolve) => {
      if (typeof Image === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(dataUrl);
          return;
        }
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  onInputT1(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const val = target?.value ?? '';
    this.manualReadingT1.set(val === '' ? null : parseMeterNumber(val));
  }

  onInputT2(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const val = target?.value ?? '';
    this.manualReadingT2.set(val === '' ? null : parseMeterNumber(val));
  }

  onInputWater(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const val = target?.value ?? '';
    this.manualReadingWater.set(val === '' ? null : parseMeterNumber(val));
  }

  async analyzePhoto(imageBase64: string): Promise<void> {
    this.isAnalyzing.set(true);
    this.errorMessage.set(null);
    this.recognitionResult.set(null);

    try {
      const res = await this.dataService.recognizeMeterPhoto({
        imageBase64,
        utilityType: this.utilityType(),
        electricityTariffType: this.electricityTariffType(),
      });

      if (!res || res.success === false) {
        this.errorMessage.set(
          res?.error ||
            'Не вдалося розпізнати покази на фото. Спробуйте сфотографувати ближче або ввести вручну.'
        );
        return;
      }

      this.recognitionResult.set(res);

      if (this.utilityType() === 'electricity') {
        if (this.electricityTariffType() === 'dual') {
          const t1 = parseMeterNumber(res.readingT1);
          const t2 = parseMeterNumber(res.readingT2);
          this.manualReadingT1.set(t1);
          this.manualReadingT2.set(t2);
        } else {
          const val =
            parseMeterNumber(res.singleReading) !== null
              ? parseMeterNumber(res.singleReading)
              : parseMeterNumber(res.readingT1);
          this.manualReadingT1.set(val);
        }
      } else {
        const waterVal = parseMeterNumber(res.readingWater);
        this.manualReadingWater.set(waterVal);
      }
    } catch (err: unknown) {
      console.error('Error analyzing photo:', err);
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage.set(
        msg || 'Помилка розпізнавання фото. Будь ласка, спробуйте ще раз.'
      );
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  retakePhoto(): void {
    this.capturedImage.set(null);
    this.recognitionResult.set(null);
    this.manualReadingT1.set(null);
    this.manualReadingT2.set(null);
    this.manualReadingWater.set(null);
    this.errorMessage.set(null);
    this.startCamera();
  }

  hasValidNumbers(): boolean {
    if (this.utilityType() === 'electricity') {
      if (this.electricityTariffType() === 'dual') {
        return (
          this.manualReadingT1() !== null &&
          !isNaN(this.manualReadingT1()!)
        );
      }
      return (
        this.manualReadingT1() !== null &&
        !isNaN(this.manualReadingT1()!)
      );
    }
    return (
      this.manualReadingWater() !== null &&
      !isNaN(this.manualReadingWater()!)
    );
  }

  applyReading(): void {
    const res = this.recognitionResult();
    let noteText = '';
    if (res?.explanation) {
      noteText = `[Фотолічильник: ${res.explanation}]`;
    }

    if (this.utilityType() === 'electricity') {
      this.readingApplied.emit({
        readingT1: this.manualReadingT1() !== null ? Number(this.manualReadingT1()) : undefined,
        readingT2: this.manualReadingT2() !== null ? Number(this.manualReadingT2()) : undefined,
        meterNumber: res?.meterNumber || undefined,
        note: noteText,
      });
    } else {
      this.readingApplied.emit({
        readingWater:
          this.manualReadingWater() !== null ? Number(this.manualReadingWater()) : undefined,
        meterNumber: res?.meterNumber || undefined,
        note: noteText,
      });
    }
    this.onClose();
  }

  onClose(): void {
    this.stopCamera();
    this.closeModal.emit();
  }
}
