/**
 * Templates behind the mock event planner. A Gemini-backed planner would
 * replace these with model output in the same `EventPlan` shape.
 */
export interface RequirementTemplate {
  id: string
  name: string
  reason: string
  keywords: string[]
  /** One unit covers this many guests. Omit for a fixed quantity of 1. */
  guestsPerUnit?: number
}

export interface EventTemplate {
  type: string
  title: string
  summary: string
  /** Words in the description that select this template. */
  triggers: string[]
  requirements: RequirementTemplate[]
}

export const eventTemplates: EventTemplate[] = [
  {
    type: 'movie-night',
    title: 'Movie night',
    summary: 'A big screen, good sound and enough seats so nobody ends up on the floor.',
    triggers: ['movie', 'film', 'screening', 'watch party', 'cinema'],
    requirements: [
      { id: 'projector', name: 'Projector', reason: 'Puts the movie on a wall or screen everyone can see.', keywords: ['projector'] },
      { id: 'speakers', name: 'Speakers', reason: 'Laptop speakers will not carry across a room.', keywords: ['speaker'] },
      { id: 'extension', name: 'Extension cable', reason: 'Power for the projector and speakers in one spot.', keywords: ['extension'] },
      { id: 'chairs', name: 'Chairs', reason: 'Extra seating beyond what the room has.', keywords: ['chair'], guestsPerUnit: 6 },
    ],
  },
  {
    type: 'study-group',
    title: 'Study group',
    summary: 'Somewhere to work problems out together, and the tools to check the answers.',
    triggers: ['study', 'exam', 'midterm', 'final', 'review session', 'homework', 'tutoring'],
    requirements: [
      { id: 'whiteboard', name: 'Whiteboard', reason: 'A shared surface for working through problems.', keywords: ['whiteboard'] },
      { id: 'markers', name: 'Markers', reason: 'Dry-erase markers in a few colors.', keywords: ['marker'] },
      { id: 'calculators', name: 'Calculators', reason: 'One for every few people to check work.', keywords: ['calculator'], guestsPerUnit: 3 },
    ],
  },
  {
    type: 'campus-party',
    title: 'Campus party',
    summary: 'Music, lighting and somewhere to put the food.',
    triggers: ['party', 'birthday', 'celebration', 'celebrate', 'dance', 'social', 'mixer'],
    requirements: [
      { id: 'speakers', name: 'Speakers', reason: 'Music loud enough for the whole room.', keywords: ['speaker'] },
      { id: 'decorations', name: 'Decorations', reason: 'Banners and table covers to set the mood.', keywords: ['decoration'] },
      { id: 'lights', name: 'Lights', reason: 'String lights for a warmer feel than overhead lighting.', keywords: ['lights'] },
      { id: 'tables', name: 'Tables', reason: 'Space for food and drinks.', keywords: ['table'], guestsPerUnit: 15 },
    ],
  },
]

/** Used when the description does not match any template. */
export const fallbackTemplate: EventTemplate = {
  type: 'get-together',
  title: 'Get-together',
  summary: 'The basics most gatherings need: seating, a surface and some music.',
  triggers: [],
  requirements: [
    { id: 'chairs', name: 'Chairs', reason: 'Seating for your guests.', keywords: ['chair'], guestsPerUnit: 6 },
    { id: 'tables', name: 'Tables', reason: 'A place for food, drinks or supplies.', keywords: ['table'], guestsPerUnit: 15 },
    { id: 'speakers', name: 'Speakers', reason: 'Background music.', keywords: ['speaker'] },
    { id: 'extension', name: 'Extension cable', reason: 'Power wherever you set up.', keywords: ['extension'] },
  ],
}
