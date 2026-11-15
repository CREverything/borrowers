import type { LucideIcon } from 'lucide-react'
import {
  Armchair,
  BookOpen,
  Calculator,
  CookingPot,
  Dice5,
  Headphones,
  LampDesk,
  Lightbulb,
  Package,
  PartyPopper,
  PenLine,
  Plug,
  Presentation,
  Projector,
  Refrigerator,
  Shirt,
  Speaker,
  Table2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { Item } from '../types'

/** Maps `Item.iconKey` to an icon. Listings from the backend fall back to a generic box. */
const icons: Record<string, LucideIcon> = {
  book: BookOpen,
  calculator: Calculator,
  headphones: Headphones,
  fridge: Refrigerator,
  pot: CookingPot,
  shirt: Shirt,
  'desk-lamp': LampDesk,
  dice: Dice5,
  projector: Projector,
  speaker: Speaker,
  plug: Plug,
  chair: Armchair,
  whiteboard: Presentation,
  marker: PenLine,
  lights: Lightbulb,
  table: Table2,
  party: PartyPopper,
  box: Package,
}

/** Icons a lender can choose as their listing's picture. Keys must match ICON_KEYS in the backend. */
export const iconChoices: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'box', label: 'Box', icon: Package },
  { key: 'book', label: 'Book', icon: BookOpen },
  { key: 'calculator', label: 'Calculator', icon: Calculator },
  { key: 'headphones', label: 'Headphones', icon: Headphones },
  { key: 'speaker', label: 'Speaker', icon: Speaker },
  { key: 'projector', label: 'Projector', icon: Projector },
  { key: 'plug', label: 'Charger or cable', icon: Plug },
  { key: 'desk-lamp', label: 'Lamp', icon: LampDesk },
  { key: 'lights', label: 'Lights', icon: Lightbulb },
  { key: 'fridge', label: 'Fridge', icon: Refrigerator },
  { key: 'pot', label: 'Cookware', icon: CookingPot },
  { key: 'chair', label: 'Chair', icon: Armchair },
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'whiteboard', label: 'Whiteboard', icon: Presentation },
  { key: 'marker', label: 'Stationery', icon: PenLine },
  { key: 'shirt', label: 'Clothing', icon: Shirt },
  { key: 'dice', label: 'Game', icon: Dice5 },
  { key: 'party', label: 'Party', icon: PartyPopper },
]

export const getItemIcon = (item: Item): LucideIcon => icons[item.iconKey] ?? Package

/** Pastel tint that stays the same for an item on every page. */
export const tintClass = (item: Item) => `tint-${item.id % 3}`

interface ItemIllustrationProps {
  item: Item
  size: number
  className?: string
  children?: ReactNode
}

export default function ItemIllustration({ item, size, className = '', children }: ItemIllustrationProps) {
  const Icon = getItemIcon(item)
  return (
    <div className={`illustration ${tintClass(item)} ${className}`}>
      <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
      {children}
    </div>
  )
}
