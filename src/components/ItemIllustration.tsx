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
}

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
