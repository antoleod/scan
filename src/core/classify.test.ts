import { classify } from './classify';
import { defaultSettings } from './settings';
import { AppSettings } from '../types';

// Mock settings for tests
const settings: AppSettings = {
    ...defaultSettings,
    fullPrefix: '02PI20',
    shortPrefix: 'MUSTBRUN',
    ocrCorrection: true,
};

describe('classify', () => {
    it('should classify RITM numbers correctly', () => {
        const result = classify('RITM1234567', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'RITM',
            normalized: 'RITM1234567',
            piMode: 'N/A',
        });
    });

    it('should classify REQ numbers correctly', () => {
        const result = classify('REQ0987654', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'REQ',
            normalized: 'REQ0987654',
            piMode: 'N/A',
        });
    });

    it('should classify INC numbers correctly', () => {
        const result = classify('INC1122334', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'INC',
            normalized: 'INC1122334',
            piMode: 'N/A',
        });
    });

    it('should classify SCTASK numbers correctly', () => {
        const result = classify('SCTASK5566778', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'SCTASK',
            normalized: 'SCTASK5566778',
            piMode: 'N/A',
        });
    });

    it('should classify a full PI number', () => {
        const result = classify('02PI201234567800', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'PI',
            normalized: '02PI201234567800',
            piMode: 'FULL',
        });
    });

    it('should classify a short PI number', () => {
        const result = classify('MUSTBRUN12345678', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'PI',
            normalized: 'MUSTBRUN12345678',
            piMode: 'SHORT',
        });
    });

    it('should classify a short PI number without prefix', () => {
        const result = classify('12345678', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'PI',
            normalized: '12345678',
            piMode: 'SHORT',
        });
    });

    it('should apply OCR correction for PI numbers', () => {
        // O should be converted to 0
        const result = classify('O2PI2O12345678OO', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'PI',
            normalized: '02PI201234567800',
            piMode: 'FULL',
        });
    });

    it('should classify a generic string as QR', () => {
        const raw = 'https://example.com/some-qr-code';
        const result = classify(raw, settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'QR',
            normalized: raw,
            piMode: 'N/A',
        });
    });

    it('should handle whitespace and classify as QR', () => {
        const raw = '  some random text  ';
        const result = classify(raw, settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'QR',
            normalized: 'some random text',
            piMode: 'N/A',
        });
    });

    it('should handle an empty string', () => {
        const result = classify('', settings);
        expect(result).toEqual({
            profileId: 'auto',
            type: 'QR',
            normalized: '',
            piMode: 'N/A',
        });
    });
});