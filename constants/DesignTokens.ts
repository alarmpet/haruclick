/**
 * Design Tokens for HaruClick
 * Based on frontend-design principles adapted for React Native
 */

// === Color Tokens ===
export const ColorTokens = {
    // Brand Colors (Identity)
    brand: {
        primary: '#0F172A',      // Navy (하루클릭 아이덴티티)
        accent: '#F97316',       // Vibrant Orange (클릭/액션)
    },

    // Semantic Colors (Purpose)
    semantic: {
        success: '#4ADE80',      // 긍정적 피드백
        warning: '#FBBF24',      // 경고
        danger: '#F87171',       // 에러/삭제
        info: '#60A5FA',         // 정보
    },

    // Neutral Scale (Gray)
    neutral: {
        50: '#F8FAFC',           // 배경
        100: '#F1F5F9',
        200: '#E2E8F0',          // 보더
        300: '#CBD5E1',
        500: '#64748B',          // 서브텍스트
        800: '#1E293B',          // 주텍스트
        900: '#0F172A',          // 네이비
    },

    // Surface Colors
    surface: {
        background: '#F8FAFC',
        card: '#FFFFFF',
        overlay: 'rgba(15, 23, 42, 0.5)',
        glass: 'rgba(255, 255, 255, 0.7)',
        glassBorder: 'rgba(255, 255, 255, 0.5)',
    },

    // Social Login Colors
    social: {
        kakao: '#FEE500',
        naver: '#03C75A',
        google: '#4285F4',
    },

    // Legacy (for backward compatibility)
    legacy: {
        green: '#10B981',
        red: '#EF4444',
        primaryGreen: '#2ECC71',
        darkBackground: '#0A0A0A',
        darkCard: '#1A1A1A',
        darkBorder: '#2A2A2A',
    },
};

// === Typography Tokens ===
export const Typography = {
    // Font Family
    fontFamily: {
        regular: 'Pretendard-Medium',
        bold: 'Pretendard-Bold',
    },

    // Font Size Scale
    fontSize: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30,
        '4xl': 36,
    },

    // Line Height
    lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
    },

    // Letter Spacing
    letterSpacing: {
        tight: -0.5,
        normal: 0,
        wide: 0.5,
    },
};

// === Spacing Scale (4px grid) ===
export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
    '6xl': 64,
};

// === Motion Tokens ===
export const Motion = {
    // Duration (ms)
    duration: {
        fast: 150,
        normal: 300,
        slow: 500,
    },

    // Easing
    easing: {
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out',
    },

    // Stagger (for sequential animations)
    stagger: {
        item: 50,   // 각 아이템 간격
    },
};

// === Shadow Tokens ===
export const Shadow = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
    },
};

// === Border Radius ===
export const BorderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
};

// === Backward Compatible Export (Colors.ts 호환) ===
export const Colors = {
    navy: ColorTokens.brand.primary,
    orange: ColorTokens.brand.accent,
    background: ColorTokens.surface.background,
    white: '#FFFFFF',
    text: ColorTokens.neutral[800],
    subText: ColorTokens.neutral[500],
    border: ColorTokens.neutral[200],
    green: ColorTokens.legacy.green,
    lightGray: ColorTokens.neutral[300],
    glass: ColorTokens.surface.glass,
    glassBorder: ColorTokens.surface.glassBorder,
    shadow: ColorTokens.neutral[500],
    primaryGradient: [ColorTokens.brand.primary, ColorTokens.neutral[800]],
    red: ColorTokens.legacy.red,
    success: ColorTokens.semantic.success,
    danger: ColorTokens.semantic.danger,
    card: ColorTokens.surface.card,
    primary: ColorTokens.brand.primary,
    darkBackground: ColorTokens.legacy.darkBackground,
    darkCard: ColorTokens.legacy.darkCard,
    darkBorder: ColorTokens.legacy.darkBorder,
    primaryGreen: ColorTokens.legacy.primaryGreen,
    kakaoYellow: ColorTokens.social.kakao,
    naverGreen: ColorTokens.social.naver,
    googleBlue: ColorTokens.social.google,
};
