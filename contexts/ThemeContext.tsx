import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';

type ThemeType = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;
    isDark: boolean;
    colors: typeof Colors;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'user_theme_preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [theme, setTheme] = useState<ThemeType>('system');

    useEffect(() => {
        // Load persisted theme
        AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
            if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
                setTheme(saved as ThemeType);
            }
        });
    }, []);

    const handleSetTheme = async (newTheme: ThemeType) => {
        setTheme(newTheme);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
    };

    const isDark =
        theme === 'system' ? systemColorScheme === 'dark' : theme === 'dark';

    const themeColors = {
        ...Colors,
        background: isDark ? Colors.darkBackground : Colors.background,
        card: isDark ? Colors.darkCard : Colors.card,
        text: isDark ? Colors.white : Colors.text,
        subText: isDark ? Colors.subText : Colors.subText,
        border: isDark ? Colors.darkBorder : Colors.border,
    };

    return (
        <ThemeContext.Provider
            value={{
                theme,
                setTheme: handleSetTheme,
                isDark,
                colors: themeColors,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
