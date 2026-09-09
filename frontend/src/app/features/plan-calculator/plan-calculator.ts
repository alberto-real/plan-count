import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgStyle } from '@angular/common';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  LegendEntry,
  MatchedEntry,
  PlanFile,
  PromotedGroup,
  StyleGroup,
  Unit,
  UNIT_TO_METERS,
  UploadResponse,
  styleGroupKey,
  swatchStyle,
} from './models';
import { UploadService } from './upload.service';
import { LegendStep } from './legend-step/legend-step';
import { PlanStep, PlanStepper } from './plan-stepper/plan-stepper';
import { FilePickerButton } from '../../shared/file-picker-button/file-picker-button';

export interface PlanRow {
  key: string;
  label: string;
  colorHex: string;
  isDashed: boolean;
  linearMeters: number;
  areaM2: number;
  /** Present only for a row promoted from unmatched geometry — lets the
   * template offer an editable label and a way to unpromote it. */
  promotedGroup?: StyleGroup;
}

export interface PlanReport {
  id: string;
  label: string;
  rows: PlanRow[];
  undetermined: StyleGroup[];
}

let nextPlanFileId = 0;

function createPlanFile(label: string): PlanFile {
  return {
    id: `plan-${nextPlanFileId++}`,
    label,
    file: null,
    status: 'idle',
    errorMessage: null,
    result: null,
    promoted: [],
  };
}

@Component({
  selector: 'app-plan-calculator',
  imports: [DecimalPipe, NgStyle, TranslocoModule, LegendStep, PlanStepper, FilePickerButton],
  templateUrl: './plan-calculator.html',
})
export class PlanCalculator {
  private readonly uploadService = inject(UploadService);
  private readonly translocoService = inject(TranslocoService);

  readonly legend = signal<LegendEntry[] | null>(null);
  readonly heightCm = signal<number>(250);
  readonly unit = signal<Unit>('m');

  readonly planFiles = signal<PlanFile[]>([createPlanFile(this.defaultPlanLabel(0))]);

  /** The step furthest reached so far, derived from progress — used to mark
   * steps as "done" in the stepper regardless of which step is being viewed. */
  readonly reachedStep = computed<PlanStep>(() => {
    if (!this.legend()) {
      return 'legend';
    }
    return this.allUploadsSucceeded() ? 'summary' : 'plan';
  });

  /** The step currently being displayed. Defaults to following `reachedStep`
   * as progress is made, but the user can click back to any step in the
   * stepper without losing progress. */
  private readonly viewStepOverride = signal<PlanStep | null>(null);
  readonly viewStep = computed<PlanStep>(() => this.viewStepOverride() ?? this.reachedStep());

  private readonly anyUploading = computed(() => this.planFiles().some((p) => p.status === 'uploading'));
  private readonly allUploadsSucceeded = computed(() => {
    const files = this.planFiles();
    return files.length > 0 && files.every((p) => p.status === 'success');
  });

  readonly reports = computed<PlanReport[]>(() => {
    const heightMeters = this.heightCm() / 100;
    const unitFactor = UNIT_TO_METERS[this.unit()];
    return this.planFiles()
      .filter((plan) => plan.result)
      .map((plan) => this.buildReport(plan, heightMeters, unitFactor));
  });

  readonly totalRows = computed<PlanRow[]>(() => {
    const totals = new Map<string, PlanRow>();
    for (const report of this.reports()) {
      for (const row of report.rows) {
        const existing = totals.get(row.key);
        if (existing) {
          existing.linearMeters += row.linearMeters;
          existing.areaM2 += row.areaM2;
        } else {
          totals.set(row.key, { ...row });
        }
      }
    }
    return [...totals.values()];
  });

  onLegendConfirmed(legend: LegendEntry[]): void {
    this.legend.set(legend);
    this.viewStepOverride.set(null);
  }

  onStepSelected(step: PlanStep): void {
    this.viewStepOverride.set(step);
  }

  onPlanFileSelected(planId: string, file: File | null): void {
    this.updatePlanFile(planId, (plan) => ({ ...plan, file }));
  }

  onPlanLabelChange(planId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updatePlanFile(planId, (plan) => ({ ...plan, label: value }));
  }

  addPlanFile(): void {
    this.planFiles.update((files) => [...files, createPlanFile(this.defaultPlanLabel(files.length))]);
  }

  removePlanFile(planId: string): void {
    this.planFiles.update((files) => (files.length > 1 ? files.filter((p) => p.id !== planId) : files));
  }

  onHeightChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    this.heightCm.set(Number.isFinite(value) ? value : 0);
  }

  onUnitChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.unit.set(select.value as Unit);
  }

  onSubmit(): void {
    const legend = this.legend();
    const files = this.planFiles().filter((p) => p.file);
    if (!legend || files.length === 0) {
      return;
    }

    for (const plan of files) {
      this.updatePlanFile(plan.id, (p) => ({ ...p, status: 'uploading', errorMessage: null }));

      this.uploadService.upload(plan.file!, legend).subscribe({
        next: (response) => {
          this.updatePlanFile(plan.id, (p) => ({ ...p, result: response, status: 'success' }));
          if (this.planFiles().every((p) => p.status !== 'uploading')) {
            this.unit.set(response.detectedUnit);
          }
        },
        error: (err: unknown) => {
          this.updatePlanFile(plan.id, (p) => ({
            ...p,
            status: 'error',
            errorMessage: this.extractErrorMessage(err),
          }));
        },
      });
    }
  }

  dismissError(planId: string): void {
    this.updatePlanFile(planId, (plan) => ({ ...plan, status: 'idle', errorMessage: null }));
  }

  /** Promotes an unmatched style group into the materials table for a plan,
   * under the given user-supplied label. */
  promoteGroup(planId: string, group: StyleGroup, label: string): void {
    const promoted: PromotedGroup = { ...group, label };
    this.updatePlanFile(planId, (plan) => ({ ...plan, promoted: [...plan.promoted, promoted] }));
  }

  unpromoteGroup(planId: string, group: StyleGroup): void {
    const key = styleGroupKey(group);
    this.updatePlanFile(planId, (plan) => ({
      ...plan,
      promoted: plan.promoted.filter((p) => styleGroupKey(p) !== key),
    }));
  }

  onPromotedLabelChange(planId: string, group: StyleGroup, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const key = styleGroupKey(group);
    this.updatePlanFile(planId, (plan) => ({
      ...plan,
      promoted: plan.promoted.map((p) => (styleGroupKey(p) === key ? { ...p, label: value } : p)),
    }));
  }

  swatchStyle(entity: { colorHex: string; isDashed: boolean }): Record<string, string> {
    return swatchStyle(entity);
  }

  styleGroupKey(group: StyleGroup): string {
    return styleGroupKey(group);
  }

  isUploading(): boolean {
    return this.anyUploading();
  }

  canSubmit(): boolean {
    return this.planFiles().some((p) => p.file) && !this.anyUploading();
  }

  private buildReport(plan: PlanFile, heightMeters: number, unitFactor: number): PlanReport {
    const result = plan.result as UploadResponse;
    const matchedRows = result.matched.map((entry: MatchedEntry) =>
      this.toPlanRow(entry, entry.linearMeters, heightMeters, unitFactor),
    );

    const promotedKeys = new Set(plan.promoted.map((p) => styleGroupKey(p)));
    const promotedRows = plan.promoted.map((group) => ({
      ...this.toPlanRow(
        { key: styleGroupKey(group), label: group.label, colorHex: group.colorHex, isDashed: group.isDashed },
        group.linearMeters,
        heightMeters,
        unitFactor,
      ),
      promotedGroup: group,
    }));

    const undetermined = result.undetermined
      .filter((group) => !promotedKeys.has(styleGroupKey(group)))
      .map((group) => ({ ...group, linearMeters: group.linearMeters * unitFactor }));

    return {
      id: plan.id,
      label: plan.label,
      rows: [...matchedRows, ...promotedRows],
      undetermined,
    };
  }

  private toPlanRow(
    entry: { key: string; label: string; colorHex: string; isDashed: boolean },
    rawLinearMeters: number,
    heightMeters: number,
    unitFactor: number,
  ): PlanRow {
    const linearMeters = rawLinearMeters * unitFactor;
    return {
      key: entry.key,
      label: entry.label,
      colorHex: entry.colorHex,
      isDashed: entry.isDashed,
      linearMeters,
      areaM2: linearMeters * heightMeters,
    };
  }

  private updatePlanFile(planId: string, updater: (plan: PlanFile) => PlanFile): void {
    this.planFiles.update((files) => files.map((p) => (p.id === planId ? updater(p) : p)));
  }

  private defaultPlanLabel(index: number): string {
    return this.translocoService.translate('planCalculator.defaultFloorLabel', { index: index + 1 });
  }

  private extractErrorMessage(err: unknown): string {
    if (
      err &&
      typeof err === 'object' &&
      'error' in err &&
      err.error &&
      typeof err.error === 'object' &&
      'detail' in err.error &&
      typeof (err.error as { detail: unknown }).detail === 'string'
    ) {
      return (err.error as { detail: string }).detail;
    }
    return this.translocoService.translate('planCalculator.genericError');
  }
}
