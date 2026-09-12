// Liste initiale de l'équipe, chargée lors de la première installation.
export const INITIAL_PLAYERS: { firstName: string; lastName: string }[] = [
  { firstName: 'Maxim', lastName: 'Leonard' },
  { firstName: 'Jeremy', lastName: 'De Maeyer' },
  { firstName: 'Ronny', lastName: 'Verast' },
  { firstName: 'Emmanuel', lastName: 'Van Diest' },
  { firstName: 'Julien', lastName: 'Devuyst' },
  { firstName: 'Quentin', lastName: 'Vanderpeypen' },
  { firstName: 'Maxime', lastName: 'Demoulin' },
  { firstName: 'Marvin', lastName: 'Dekrom' },
  { firstName: 'Maxime', lastName: 'Vigne' },
  { firstName: 'Bruno', lastName: 'Huberty' },
  { firstName: 'Jarne', lastName: 'Van Bellinghen' },
  { firstName: 'Kobe', lastName: 'Van Bellinghen' },
  { firstName: 'Mathis', lastName: 'Leyder' },
  { firstName: 'Edouard', lastName: 'Tordeur' },
  { firstName: 'Ilias', lastName: 'Letellier' },
  { firstName: 'Maxime', lastName: 'Compere' },
  { firstName: 'Arnaud', lastName: 'Compère' },
  { firstName: 'Dimitri', lastName: 'Van Saet' },
  { firstName: 'Joachim', lastName: 'Allard' },
  { firstName: 'Jérôme', lastName: 'Fetu' },
  { firstName: 'Arnaud', lastName: 'Decarpentrie' },
]

export const INITIAL_FINE_TYPES = [
  {
    label: 'Retard',
    description: '1 € par minute après les 5 premières minutes, plafonné à 15 €.',
    kind: 'perUnit' as const,
    amount: 1,
    unitLabel: 'minute',
    freeUnits: 5,
    cap: 15,
  },
  { label: 'Short non conforme', kind: 'fixed' as const, amount: 2 },
  { label: 'T-shirt non conforme', kind: 'fixed' as const, amount: 2 },
  { label: 'Oubli de pull', kind: 'fixed' as const, amount: 2 },
  { label: 'Chaussettes non conformes', kind: 'fixed' as const, amount: 2 },
  { label: 'Carton vert', kind: 'fixed' as const, amount: 2 },
  { label: 'Carton jaune', kind: 'fixed' as const, amount: 5 },
  { label: 'Carton rouge', kind: 'fixed' as const, amount: 10 },
]

export const INITIAL_STAT_CATEGORIES = [
  { label: 'Papa dans l’année', emoji: '👶' },
  { label: 'Homme du match', emoji: '⭐' },
]
