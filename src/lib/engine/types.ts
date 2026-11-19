/** Inclusive laser position range. Positions are positive safe integers. */
export interface SpotRange {
  from: number;
  to: number;
}

/** Opt-in automatic endpoints; unmarked values are kept as typed. */
export interface Auto {
  from?: true;
  to?: true;
}

export interface PoolRange extends SpotRange {
  auto?: Auto;
}

export interface Unknown extends SpotRange {
  auto?: Auto;
  name: string;
  tag: string;
}

export type StandardRole = 'primary' | 'secondary' | 'reference';

export interface Standard {
  name: string;
  role: StandardRole;
  ranges: PoolRange[];
  mineral?: string;
  perBracket?: number;
  cadence?: 'every' | 'odd' | 'even';
  used: number[];
  spare: number;
}

/** The exact Qtegra column order; metadata never enters an export. */
export const QTEGRA_COLUMNS = [
  'Label',
  'Status',
  'Duration [s]',
  'Comment',
  'Evaluate',
  'Sample Type',
  'Standard',
  'Dilution Factor',
  'Amount',
  'Final Quantity',
  'Identifier',
  'Laser Scan Position Number',
  'Laser Output Setting [%]',
] as const;

export interface QtegraCells {
  Label: string;
  Status: null;
  'Duration [s]': number;
  Comment: string;
  Evaluate: boolean;
  'Sample Type': string;
  Standard: string;
  'Dilution Factor': number;
  Amount: string;
  'Final Quantity': string;
  Identifier: string;
  'Laser Scan Position Number': number | null;
  'Laser Output Setting [%]': number;
}

export type ColumnDefaults = Omit<
  QtegraCells,
  'Label' | 'Status' | 'Laser Scan Position Number'
>;

export interface Experiment {
  name: string;
  defaults: ColumnDefaults;
}

export interface BlockEntry {
  /** A standard name, or the single primary standard via "@primary". */
  standard: string;
  count: number;
}

export type Chunking =
  | { mode: 'budget' }
  | { mode: 'size'; size: number }
  | { mode: 'count'; count: number };

export interface Recipe {
  opening: BlockEntry[];
  mid: BlockEntry[];
  closing: BlockEntry[];
  secondaryPairsPerBracket: number;
  spotsPerSecondary: number;
  primaryPerBracket: number;
  chunking: Chunking;
  maxPairsPerBracket: number;
  bracketAtSampleBoundaries: boolean;
  rotationStart: number;
  secondaries?: 'rotate' | 'cadence';
  openingBracket?: boolean;
  rotationStarts?: Record<string, number>;
}

export type Block = 'opening' | 'unknowns' | 'mid' | 'bracket' | 'closing';

export interface Row extends QtegraCells {
  /** Internal identity survives cell edits; excluded from all file formats. */
  meta: {
    kind: 'unknown' | 'unrecognized' | StandardRole;
    name: string;
    block: Block;
  };
}

export type WarningKind =
  | 'pool-exhausted'
  | 'duplicate-spot'
  | 'outside-pool'
  | 'already-used'
  | 'outside-sample'
  | 'unrecognized-row';

export interface Warning {
  kind: WarningKind;
  message: string;
  /** Zero-based indexes into the current rows; messages use one-based rows. */
  rowIndexes: number[];
  locations?: { session: number; rowIndex: number }[];
}

export interface Session {
  number: number;
  unknowns: Unknown[];
  rows: Row[];
  fixed: boolean;
  source?: string;
  mineral?: string;
}

export interface Project {
  version: 1;
  grainatlas?: { file: string; spots: SpotRange[] };
  wizard?: { step: 1 | 2 | 3 | 4; mineral: string };
  experiment: Experiment;
  standards: Standard[];
  recipe: Recipe;
  sessions: Session[];
}

export interface BudgetUse {
  available: number;
  needed: number;
  leftAfter: number;
}

export interface Budget {
  /** Feasible run-wide bracket and pair counts (before any shortage fallback). */
  K: number;
  P: number;
  perStandard: Record<string, BudgetUse>;
}

export const DEFAULT_EXPERIMENT: Experiment = {
  name: '',
  defaults: {
    'Duration [s]': 30,
    Comment: '<Comment>',
    Evaluate: true,
    'Sample Type': 'UNKNOWN',
    Standard: '',
    'Dilution Factor': 1,
    Amount: '',
    'Final Quantity': '',
    Identifier: '<Identifier>',
    'Laser Output Setting [%]': 46,
  },
};

export const DEFAULT_RECIPE: Recipe = {
  opening: [
    { standard: 'NIST612', count: 3 },
    { standard: 'NIST610', count: 3 },
    { standard: '@primary', count: 2 },
  ],
  mid: [
    { standard: 'NIST610', count: 3 },
    { standard: 'NIST612', count: 3 },
  ],
  closing: [
    { standard: 'NIST612', count: 3 },
    { standard: 'NIST610', count: 3 },
  ],
  secondaryPairsPerBracket: 1,
  spotsPerSecondary: 2,
  primaryPerBracket: 2,
  chunking: { mode: 'budget' },
  maxPairsPerBracket: 2,
  bracketAtSampleBoundaries: false,
  rotationStart: 0,
};
