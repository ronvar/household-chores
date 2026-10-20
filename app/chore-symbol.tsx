"use client";

import { Bath, BrushCleaning, Cat, CookingPot, Dog, Droplets, Leaf, PanelsTopLeft, Recycle, Refrigerator, Shirt, Sofa, Sparkles, Sprout, Trash2, Utensils, Wind } from "lucide-react";

export default function ChoreSymbol({ title, className }: { title: string; className?: string }) {
  const patterns = [
    [/bathroom|bath|toilet/i, Bath], [/trash|garbage|bin/i, Trash2], [/water.*plant/i, Sprout],
    [/dog/i, Dog], [/cat/i, Cat], [/dish|dining|counter|sink/i, Utensils], [/stove|cook/i, CookingPot],
    [/fridge|pantry/i, Refrigerator], [/couch|sofa/i, Sofa], [/window|shade/i, PanelsTopLeft],
    [/weed|leav|plant|garden/i, Leaf], [/recycl/i, Recycle], [/laundry|clothes/i, Shirt],
    [/mop|wash/i, Droplets], [/sweep|patio|walkway/i, BrushCleaning], [/vacuum|dust/i, Wind],
  ] as const;
  const Icon = patterns.find(([pattern]) => pattern.test(title))?.[1] ?? Sparkles;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.5} />;
}
