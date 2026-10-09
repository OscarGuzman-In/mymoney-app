import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { CategoriesApiService } from '../../core/api/categories-api.service';
import { toUserMessage } from '../../core/http/api-error.util';
import {
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
  Category,
  CategoryType,
  isSystemCategory,
} from '../../core/models/category.model';
import { Badge } from '../../shared/ui/badge/badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { PageHeader } from '../../shared/ui/page-header/page-header';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, PageHeader, EmptyState, Badge],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Categories implements OnInit {
  private readonly api = inject(CategoriesApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly types = CATEGORY_TYPES;
  readonly typeLabels = CATEGORY_TYPE_LABELS;

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['expense' as CategoryType, [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
    color: ['', [Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]],
    icon: ['', [Validators.maxLength(50)]],
  });

  ngOnInit(): void {
    this.load();
  }

  get name() {
    return this.form.controls.name;
  }

  get color() {
    return this.form.controls.color;
  }

  isSystem(category: Category): boolean {
    return isSystemCategory(category);
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.controls.type.enable({ emitEvent: false });
    this.form.reset({
      name: '',
      type: 'expense',
      description: '',
      color: '',
      icon: '',
    });
    this.formOpen.set(true);
  }

  openEdit(category: Category): void {
    if (isSystemCategory(category)) {
      return;
    }
    this.editingId.set(category.id);
    this.formError.set(null);
    this.form.reset({
      name: category.name,
      type: category.type,
      description: category.description ?? '',
      color: category.color ?? '',
      icon: category.icon ?? '',
    });
    this.form.controls.type.disable({ emitEvent: false });
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.formError.set(null);
    this.form.controls.type.enable({ emitEvent: false });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.saving()) {
      return;
    }

    const value = this.form.getRawValue();
    const editingId = this.editingId();
    this.saving.set(true);
    this.formError.set(null);

    const request$ = editingId
      ? this.api.update(editingId, {
          name: value.name,
          description: value.description || null,
          color: value.color || null,
          icon: value.icon || null,
        })
      : this.api.create({
          name: value.name,
          type: value.type,
          description: value.description || undefined,
          color: value.color || undefined,
          icon: value.icon || undefined,
        });

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.formOpen.set(false);
          this.editingId.set(null);
          this.load();
        },
        error: (error: unknown) => this.formError.set(toUserMessage(error)),
      });
  }

  deactivate(category: Category): void {
    const confirmed = window.confirm(
      `¿Desactivar la categoría "${category.name}"?`,
    );
    if (!confirmed) {
      return;
    }
    this.api
      .deactivate(category.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (categories) => this.categories.set(categories),
        error: (error: unknown) => this.error.set(toUserMessage(error)),
      });
  }
}
