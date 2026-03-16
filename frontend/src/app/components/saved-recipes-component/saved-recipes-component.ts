import { Component, computed, input, output, signal } from '@angular/core';
import type { Recipe } from '../recipe-component/recipe-component';

@Component({
  selector: 'app-saved-recipes-component',
  templateUrl: './saved-recipes-component.html',
  styleUrl: './saved-recipes-component.css',
})
export class SavedRecipesComponent {
  readonly recipes = input<Recipe[]>([]);

  readonly recipeRemoved = output<Recipe>();

  readonly recipeSelected = output<Recipe>();

  readonly searchQuery = signal('');

  readonly filteredRecipes = computed(() => {
    const list = this.recipes();
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.title.toLowerCase().includes(q));
  });

  expandedTitle: string | null = null;

  toggleExpand(title: string): void {
    this.expandedTitle = this.expandedTitle === title ? null : title;
  }

  isExpanded(recipe: Recipe): boolean {
    return this.expandedTitle === recipe.title;
  }

  stripLeadingNumber(text: string): string {
    if (!text || typeof text !== 'string') return text;
    const stripped = text.replace(/^\s*(?:\d+[.)]\s*|step\s*\d+\s*:?\s*)/i, '').trim();
    return stripped || text;
  }

  remove(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.recipeRemoved.emit(recipe);
  }

  showInMain(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.recipeSelected.emit(recipe);
  }
}
