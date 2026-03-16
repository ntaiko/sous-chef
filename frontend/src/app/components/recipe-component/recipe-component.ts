import { Component, input, output } from '@angular/core';

export interface Recipe {
  title: string;
  ingredients: string[];
  steps: string[];
}

@Component({
  selector: 'app-recipe-component',
  templateUrl: './recipe-component.html',
  styleUrl: './recipe-component.css',
})
export class RecipeComponent {
  /** Current recipe to display (from agent write_recipe / edit_recipe). */
  readonly recipe = input<Recipe | null>(null);
  /** Per-ingredient checked state (same length as recipe.ingredients). */
  readonly checkedIndices = input<boolean[]>([]);
  /** Emitted when user toggles an ingredient checkbox. */
  readonly ingredientCheckedChange = output<{ index: number; checked: boolean }>();
  /** Whether the recipe was just saved (show "Saved!"). */
  readonly saved = input<boolean>(false);

  /** Strip leading "1. ", "1) ", "Step 1: " etc. to avoid duplicate numbers with <ol> / list styling. */
  stripLeadingNumber(text: string): string {
    if (!text || typeof text !== 'string') return text;
    const stripped = text.replace(/^\s*(?:\d+[.)]\s*|step\s*\d+\s*:?\s*)/i, '').trim();
    return stripped || text;
  }

  isChecked(i: number): boolean {
    const arr = this.checkedIndices();
    return Array.isArray(arr) && i >= 0 && i < arr.length && !!arr[i];
  }

  onIngredientToggle(i: number, checked: boolean): void {
    this.ingredientCheckedChange.emit({ index: i, checked });
  }
}
