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
