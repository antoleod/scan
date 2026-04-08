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
