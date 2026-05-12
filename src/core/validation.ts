export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export const isValidIdentifier = (input: string): boolean => {
    // Validates whether the value is an email or an alphanumeric username with at least 3 characters
    return isValidEmail(input) || /^[a-zA-Z0-9._-]{3,}$/.test(input);
};

export const isValidPin = (pin: string): boolean => {
    // Firebase requiere al menos 6 caracteres para passwords
    return /^\d{6,}$/.test(pin);
};

export const isNonEmptyString = (str: string): boolean => {
    return str.trim().length > 0;
};

/**
 * Sanitize scan input: trim, remove control chars, enforce max length.
 * Returns { ok, value, error? } — ok=true if valid, value is sanitized string.
 */
export const sanitizeScanInput = (
    raw: string
): { ok: boolean; value?: string; error?: string } => {
    const MAX_LENGTH = 500;

    if (!raw || typeof raw !== 'string') {
        return { ok: false, error: 'Scan input must be a non-empty string' };
    }

    if (raw.length > MAX_LENGTH) {
        return { ok: false, error: `Scan input exceeds ${MAX_LENGTH} characters` };
    }

    // Remove control chars (0x00-0x1F, 0x7F) and zero-width chars
    const sanitized = raw
        .replace(/[\x00-\x1F\x7F​‌‍]/g, '')
        .trim();

    if (!sanitized) {
        return { ok: false, error: 'Scan input is empty after sanitization' };
    }

    return { ok: true, value: sanitized };
};

/**
 * Sanitize note text: preserve formatting, remove bad control chars, enforce max length.
 * Returns { ok, value, error? } — ok=true if valid, value is sanitized string.
 */
export const sanitizeNoteText = (
    raw: string
): { ok: boolean; value?: string; error?: string } => {
    const MAX_LENGTH = 10000;

    if (!raw || typeof raw !== 'string') {
        return { ok: false, error: 'Note text must be a non-empty string' };
    }

    if (raw.length > MAX_LENGTH) {
        return { ok: false, error: `Note text exceeds ${MAX_LENGTH} characters` };
    }

    // Remove dangerous control chars but keep \n (line feed) and \t (tab)
    const sanitized = raw
        .replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '')
        .trim();

    if (!sanitized) {
        return { ok: false, error: 'Note text is empty after sanitization' };
    }

    return { ok: true, value: sanitized };
};

/**
 * Heuristic check for catastrophic-backtracking ("ReDoS") patterns.
 * Returns true if the pattern looks dangerous and should be rejected.
 *
 * This is intentionally conservative — false positives reject patterns that
 * may be safe in practice, but false negatives let attackers freeze the JS
 * engine via a crafted backup file or shared template. Since we never trust
 * untrusted regex on hot paths, prefer rejection.
 */
export const isProbablyCatastrophicRegex = (pattern: string): boolean => {
    if (typeof pattern !== 'string') return true;
    if (pattern.length > 500) return true;

    // Strip char classes [...] so quantifiers inside them are not flagged.
    // (Char classes don't cause exponential backtracking the way grouped
    //  alternations do.)
    const stripped = pattern.replace(/\[(?:\\.|[^\]\\])*\]/g, '[]');

    // Nested quantifiers: (X+)+, (X*)*, (X+)*, (X*)+, (X{n,})+ etc.
    // These are the canonical catastrophic-backtracking shape.
    if (/\([^)]*[+*][^)]*\)\s*[+*?{]/.test(stripped)) return true;
    if (/\([^)]*\{\d+,?\d*\}[^)]*\)\s*[+*?{]/.test(stripped)) return true;

    // Alternation with overlapping branches inside a quantifier: (a|a)+, (a|ab)+
    // We can't cheaply detect "overlap" in static analysis, so flag any
    // alternation immediately followed by + or * or { as a precaution.
    if (/\([^)]*\|[^)]*\)\s*[+*]/.test(stripped)) return true;

    // Excessive repetition counts: {1000,}, {0,9999}
    if (/\{\s*(\d{4,})\s*,?/.test(stripped)) return true;

    return false;
};

/**
 * Validate and compile a user-supplied regex with ReDoS protection. Returns
 * `fallback` (compiled) when the pattern is missing, oversized, malformed, or
 * heuristically dangerous. Callers must always pass a fallback that has been
 * vetted by the developer.
 */
export const compileUserRegex = (
    pattern: unknown,
    flags: string,
    fallback: RegExp,
): RegExp => {
    if (typeof pattern !== 'string' || !pattern) return fallback;
    if (pattern.length > 500) return fallback;
    if (isProbablyCatastrophicRegex(pattern)) return fallback;
    try {
        return new RegExp(pattern, flags);
    } catch {
        return fallback;
    }
};

/**
 * Sanitize a user-supplied regex pattern for storage. Returns the original
 * string if it is safe to compile, otherwise the provided fallback. Used at
 * backup import / settings load to neutralize tampered or hostile patterns
 * before they reach hot rendering paths.
 */
export const sanitizeUserRegexPattern = (
    pattern: unknown,
    fallback: string,
): string => {
    if (typeof pattern !== 'string' || !pattern) return fallback;
    if (pattern.length > 500) return fallback;
    if (isProbablyCatastrophicRegex(pattern)) return fallback;
    try {
        // eslint-disable-next-line no-new
        new RegExp(pattern);
        return pattern;
    } catch {
        return fallback;
    }
};

/**
 * Sanitize template regex pattern: validate regex compiles, enforce max length.
 * Returns { ok, value, error? } — ok=true if valid, value is the original pattern.
 */
export const sanitizeTemplatePattern = (
    pattern: string
): { ok: boolean; value?: string; error?: string } => {
    const MAX_LENGTH = 2000;

    if (!pattern || typeof pattern !== 'string') {
        return { ok: false, error: 'Template pattern must be a non-empty string' };
    }

    if (pattern.length > MAX_LENGTH) {
        return { ok: false, error: `Template pattern exceeds ${MAX_LENGTH} characters` };
    }

    if (isProbablyCatastrophicRegex(pattern)) {
        return { ok: false, error: 'Pattern contains nested quantifiers that can cause catastrophic backtracking. Simplify it (avoid forms like (a+)+ or (a|a)+).' };
    }

    // Try to compile the regex
    try {
        // eslint-disable-next-line no-new
        new RegExp(pattern);
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `Invalid regex pattern: ${reason}` };
    }

    return { ok: true, value: pattern };
};
