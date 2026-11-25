/**
 * Smart Mesh Naming Parser
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles raw Blender / Three.js mesh names from the BodyParts3D atlas and
 * converts them into clean structures for the UI and database lookup.
 *
 * Supported input patterns (case-insensitive):
 *   • "Left femur"                 → Femur Kiri (Sinister)
 *   • "Right humerus"              → Humerus Kanan (Dexter)
 *   • "femur_R"  / "femur.r"       → Femur Kanan (Dexter)
 *   • "femur_L"  / "femur.l"       → Femur Kiri (Sinister)
 *   • "femur.001"                  → Femur
 *   • "femur_cancellous"           → Femur
 *   • "Sternocostal part of right pectoralis major"  → handled via INNER
 */

export type Side = 'left' | 'right' | null;

export interface ParsedMeshName {
  /** Full display name for UI, e.g. "Femur Kiri (Sinister)" */
  displayName: string;
  /** Clean snake_case key for anatomy_data.json lookup, e.g. "femur" */
  baseKey: string;
  /** Side indicator */
  side: Side;
}

// ── Blender artifact suffixes to strip ──────────────────────────────────────
const BLENDER_SUFFIXES: RegExp[] = [
  /\.\d{3,}$/,           // .001, .002, .012  … (numeric dup suffix)
  /\s+\d+$/,             // trailing space + number
  /_cancellous$/i,
  /_cortical$/i,
  /_compact$/i,
  /_spongy$/i,
  /_inner$/i,
  /_outer$/i,
  /_surface$/i,
  /_mesh$/i,
  /_geo$/i,
  /_shape$/i,
  /_body$/i,
];

// ── Side patterns ────────────────────────────────────────────────────────────

// Suffix: "femur_R", "femur.r", "femur - R"
const SUFFIX_RIGHT = /[._\s\-]+r$/i;
const SUFFIX_LEFT  = /[._\s\-]+l$/i;

// Suffix spelled out: "femur_right", "femur right"
const SUFFIX_WORD_RIGHT = /[._\s\-]right$/i;
const SUFFIX_WORD_LEFT  = /[._\s\-]left$/i;

// Prefix: "Right femur", "right femur"
const PREFIX_RIGHT = /^right[_\s]+/i;
const PREFIX_LEFT  = /^left[_\s]+/i;

// Inner phrase: "… of right …", "… of left …"
const INNER_RIGHT = /(\s+of\s+right\s+)/i;
const INNER_LEFT  = /(\s+of\s+left\s+)/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts an arbitrary name string into a snake_case database key.
 * - Lowercased
 * - Special chars removed (keeps letters, digits, spaces)
 * - Spaces → underscores; multiple underscores collapsed
 *
 * @example
 * toSnakeKey("Biceps Brachii")  → "biceps_brachii"
 * toSnakeKey("pectoralis major") → "pectoralis_major"
 */
export function toSnakeKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')   // non-alnum → space
    .replace(/\s+/g, '_')            // spaces → underscores
    .replace(/_+/g, '_')             // collapse multiples
    .replace(/^_|_$/g, '');          // trim edges
}

/**
 * Title-cases a string for display purposes.
 * "biceps brachii" → "Biceps Brachii"
 */
function titleCase(s: string): string {
  return s
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Parses a raw mesh name into a structured object with display name,
 * snake_case database key, and laterality.
 *
 * @example
 * parseMeshName("Left femur")
 *   → { displayName: "Femur Kiri (Sinister)", baseKey: "femur", side: "left" }
 *
 * parseMeshName("Sternocostal part of right pectoralis major")
 *   → { displayName: "Sternocostal Part Of Pectoralis Major Kanan (Dexter)", baseKey: "sternocostal_part_of_pectoralis_major", side: "right" }
 *
 * parseMeshName("tibia.001")
 *   → { displayName: "Tibia", baseKey: "tibia", side: null }
 */
export function parseMeshName(rawName: string): ParsedMeshName {
  let name = rawName.trim();
  let side: Side = null;

  // ── Step 1: Strip Blender artifact suffixes ──────────────────────────────
  for (const pattern of BLENDER_SUFFIXES) {
    name = name.replace(pattern, '').trim();
  }

  // ── Step 2: Detect side — order matters (more specific → less specific) ──

  // 2a. Single-letter suffix (_R / .r / -R etc.)
  if (SUFFIX_RIGHT.test(name)) {
    side = 'right';
    name = name.replace(SUFFIX_RIGHT, '').trim();
  } else if (SUFFIX_LEFT.test(name)) {
    side = 'left';
    name = name.replace(SUFFIX_LEFT, '').trim();
  }
  // 2b. Spelled-out word suffix (_right / _left)
  else if (SUFFIX_WORD_RIGHT.test(name)) {
    side = 'right';
    name = name.replace(SUFFIX_WORD_RIGHT, '').trim();
  } else if (SUFFIX_WORD_LEFT.test(name)) {
    side = 'left';
    name = name.replace(SUFFIX_WORD_LEFT, '').trim();
  }
  // 2c. Spelled-out prefix ("Right …" / "Left …")
  else if (PREFIX_RIGHT.test(name)) {
    side = 'right';
    name = name.replace(PREFIX_RIGHT, '').trim();
  } else if (PREFIX_LEFT.test(name)) {
    side = 'left';
    name = name.replace(PREFIX_LEFT, '').trim();
  }
  // 2d. Inner phrase ("… of right …" / "… of left …")
  else if (INNER_RIGHT.test(name)) {
    side = 'right';
    name = name.replace(INNER_RIGHT, ' of ').trim();
  } else if (INNER_LEFT.test(name)) {
    side = 'left';
    name = name.replace(INNER_LEFT, ' of ').trim();
  }

  // ── Step 3: Build clean database key ────────────────────────────────────
  const baseKey = toSnakeKey(name);

  // ── Step 4: Build display name ───────────────────────────────────────────
  const baseName = titleCase(name);
  let displayName: string;

  if (side === 'left') {
    displayName = `${baseName} Kiri (Sinister)`;
  } else if (side === 'right') {
    displayName = `${baseName} Kanan (Dexter)`;
  } else {
    displayName = baseName;
  }

  return { displayName, baseKey, side };
}

// ── Lookup helper ─────────────────────────────────────────────────────────────

export interface AnatomyEntry {
  name_id: string;
  snomed_code: string;
  description: string;
}

/**
 * Attempts multiple key variants to find a match in the anatomy database.
 * Falls back gracefully if the exact key isn't present.
 *
 * Strategy:
 *   1. Exact baseKey match
 *   2. baseKey without last word (e.g. "biceps_brachii_muscle" → "biceps_brachii")
 *   3. First word only (e.g. "femoral_artery_left" → "femur" is too far, skip)
 */
export function lookupAnatomyEntry(
  baseKey: string,
  db: Record<string, AnatomyEntry>,
): AnatomyEntry | null {
  // Direct match
  if (db[baseKey]) return db[baseKey];

  // Try removing trailing word(s) one at a time (up to 2 reductions)
  const parts = baseKey.split('_');
  for (let drop = 1; drop <= 2 && parts.length - drop > 0; drop++) {
    const shorter = parts.slice(0, parts.length - drop).join('_');
    if (db[shorter]) return db[shorter];
  }

  // Try matching by first two words
  if (parts.length >= 2) {
    const twoWord = parts.slice(0, 2).join('_');
    if (db[twoWord]) return db[twoWord];
  }

  // First word only
  if (parts[0] && db[parts[0]]) return db[parts[0]];

  return null;
}
