/** Inclusive laser position range. Positions are positive safe integers. */
export interface SpotRange {
  from: number;
  to: number;
}

export interface Unknown extends SpotRange {
  name: string;
  tag: string;
}

export type StandardRole = 'primary' | 'secondary' | 'reference';

export interface Standard {
  name: string;
  role: StandardRole;
  ranges: SpotRange[];
  used: number[];
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
  session: number;
  defaults: ColumnDefaults;
}

export interface BlockEntry {
  /** A standard name, or the single primary standard via "@primary". */
  standard: string;
  count: number;
}

export type Chunking =
  | { mode: 'auto' }
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
  sessionsLeft: number;
  bracketAtSampleBoundaries: boolean;
  rotationStart: number;
}

export type Block = 'opening' | 'unknowns' | 'mid' | 'bracket' | 'closing';

export interface Row extends QtegraCells {
  /** Internal identity survives cell edits; excluded from all file formats. */
  meta: {
    kind: 'unknown' | StandardRole;
    name: string;
    block: Block;
  };
}

export type WarningKind =
  | 'pool-exhausted'
  | 'duplicate-spot'
  | 'outside-pool'
  | 'already-used'
  | 'outside-sample';

export interface Warning {
  kind: WarningKind;
  message: string;
  /** Zero-based indexes into the current rows; messages use one-based rows. */
  rowIndexes: number[];
}

export interface BudgetUse {
  /** Draws across all sessionsLeft sessions for the proposed chunk count. */
  need: number;
  remaining: number;
}

export interface Budget {
  Bmax: number;
  chunksPerSession: number;
  perStandard: Record<string, BudgetUse>;
  /** Planning advisories are separate from warnings computed from row cells. */
  warnings: string[];
}

export const DEFAULT_EXPERIMENT: Experiment = {
  name: '',
  session: 1,
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
  chunking: { mode: 'auto' },
  sessionsLeft: 1,
  bracketAtSampleBoundaries: false,
  rotationStart: 0,
};
