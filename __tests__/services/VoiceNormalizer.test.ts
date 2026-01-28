/** @jest-environment node */

import { VoiceNormalizer } from '../../services/voice/VoiceNormalizer';

describe('VoiceNormalizer.normalize', () => {
    it('keeps time expressions like "오후 3시" unchanged', () => {
        const input = '\uc624\ud6c4 3\uc2dc';
        const result = VoiceNormalizer.normalize(input);
        expect(result).toBe(input);
    });

    it('normalizes Korean numbers with units', () => {
        const input = '\uc0bc\ub9cc \uc624\ucc9c\uc6d0';
        const result = VoiceNormalizer.normalize(input);
        expect(result).toBe('35000\uc6d0');
    });

    it('does not convert single-syllable particles', () => {
        const input = '\uae30\uc131\uc774\ub791 \ubc25';
        const result = VoiceNormalizer.normalize(input);
        expect(result).toBe(input);
    });

    it('normalizes combined date-time phrases', () => {
        const input = '\ub0b4\uc77c\uc624\ud6c4 3\uc2dc';
        const result = VoiceNormalizer.normalize(input);
        expect(result).toBe('\ub0b4\uc77c \uc624\ud6c4 3\uc2dc');
    });
});

describe('VoiceNormalizer.normalizeRelativeWeekdays', () => {
    it('resolves next week weekday based on reference date', () => {
        const ref = new Date(2026, 0, 26); // 2026-01-26 (Mon)
        const result = VoiceNormalizer.normalizeRelativeWeekdays('\ub2e4\uc74c\uc8fc \uae08\uc694\uc77c', ref);
        expect(result).toBe('2026-02-06 \uae08\uc694\uc77c');
    });
});
