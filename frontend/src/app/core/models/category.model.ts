export type CategoryType = 'income' | 'expense';

export const CATEGORY_TYPES: readonly CategoryType[] = ['income', 'expense'];

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
};

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  type: CategoryType;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryRequest {
  name: string;
  type: CategoryType;
  description?: string;
  color?: string;
  icon?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}

export function isSystemCategory(category: Category): boolean {
  return category.user_id === null;
}
