/**
 * VitaCare Design System - TypeScript Theme Constants
 * Sử dụng trong TypeScript components
 */

export const VitaCareTheme = {
    // Colors
    colors: {
        primary: {
            main: '#00589F',
            hover: '#2B3E66',
            light: '#43A2E6',
            lighter: '#AACEF2',
            bg: '#DAECFF'
        },
        secondary: {
            main: '#BAA7DE',
            hover: '#7B63C8',
            bg: '#FECFA'
        },
        success: {
            main: '#00589F',
            hover: '#2B3E66',
            light: '#43A2E6',
            bg: '#DAECFF'
        },
        warning: {
            main: '#F59E0B',
            hover: '#D97706',
            light: '#FCD34D',
            bg: '#FFF7ED'
        },
        danger: {
            main: '#C42326',
            hover: '#8B1E19',
            light: '#EF4444',
            bg: '#FEEAD'
        },
        info: {
            main: '#5A5BDC',
            hover: '#7B63C8',
            bg: '#FECFA'
        },
        neutral: {
            100: '#0A0A0A',
            90: '#242242',
            80: '#616161',
            70: '#757575',
            60: '#9E9E9E',
            50: '#C2C2C2',
            40: '#ECECED',
            30: '#EDEDED',
            20: '#F5F5F5',
            10: '#FFFFFF'
        },
        text: {
            primary: '#0A0A0A',
            secondary: '#616161',
            tertiary: '#9E9E9E',
            inverse: '#FFFFFF'
        },
        background: {
            primary: '#00589F',
            secondary: '#FFFFFF',
            light: '#F5F5F5'
        }
    },

    // Typography
    typography: {
        fontFamily: {
            title: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            content: "'Arimo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            base: "'Arimo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        },
        fontSize: {
            xs: '12px',
            sm: '14px',
            base: '16px',
            lg: '18px',
            xl: '20px',
            '2xl': '24px',
            '3xl': '30px',
            '4xl': '36px',
            '5xl': '48px',
            '6xl': '60px'
        },
        fontWeight: {
            light: 300,
            normal: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
            extrabold: 800
        },
        lineHeight: {
            tight: 1.25,
            normal: 1.5,
            relaxed: 1.75,
            loose: 2
        }
    },

    // Spacing
    spacing: {
        0: '0',
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
        20: '80px',
        24: '96px'
    },

    // Border Radius
    radius: {
        none: '0',
        sm: '4px',
        base: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
        full: '9999px'
    },

    // Shadows
    shadows: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    },

    // Transitions
    transitions: {
        fast: '150ms ease-in-out',
        base: '250ms ease-in-out',
        slow: '350ms ease-in-out'
    },

    // Z-Index
    zIndex: {
        dropdown: 1000,
        sticky: 1020,
        fixed: 1030,
        modalBackdrop: 1040,
        modal: 1050,
        popover: 1060,
        tooltip: 1070
    },

    // Breakpoints
    breakpoints: {
        xs: '0',
        sm: '576px',
        md: '768px',
        lg: '992px',
        xl: '1200px',
        xxl: '1400px'
    }
} as const;

// Export individual sections for easier imports
export const Colors = VitaCareTheme.colors;
export const Typography = VitaCareTheme.typography;
export const Spacing = VitaCareTheme.spacing;
export const Radius = VitaCareTheme.radius;
export const Shadows = VitaCareTheme.shadows;
export const Transitions = VitaCareTheme.transitions;
export const ZIndex = VitaCareTheme.zIndex;
export const Breakpoints = VitaCareTheme.breakpoints;

// Helper function to use in components
export function getThemeColor(path: string): string {
    const keys = path.split('.');
    let value: any = VitaCareTheme.colors;

    for (const key of keys) {
        value = value[key];
        if (!value) return '';
    }

    return value;
}

// TypeScript types
export type ThemeColors = typeof VitaCareTheme.colors;
export type ThemeTypography = typeof VitaCareTheme.typography;
export type ThemeSpacing = typeof VitaCareTheme.spacing;
