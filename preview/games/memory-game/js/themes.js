/**
 * Card Theme System
 *
 * Each theme provides an array of card face values (emoji + text).
 * The theme system is designed to be easily extensible - just add
 * a new entry to THEMES to add a new theme.
 */
const THEMES = {
    animals: {
        name: '🐾 동물',
        cards: [
            '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
            '🐨', '🐯', '🦁', '🐮', '🦄', '🐧', '🐸', '🐙',
            '🦋', '🐞', '🐝', '🐳', '🐬', '🦈', '🦭', '🦥',
            '🐒', '🦍', '🐕', '🐈', '🦌', '🦒', '🐘', '🦏',
            '🐪', '🦙', '🦘', '🐁', '🦔', '🐿️', '🦉', '🦅',
            '🐦', '🦩', '🦚', '🐊', '🦎', '🐢', '🐍', '🦎'
        ]
    },
    fruits: {
        name: '🍎 과일',
        cards: [
            '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
            '🍑', '🍒', '🍍', '🥝', '🥭', '🍈', '🍏', '🍐',
            '🍅', '🫒', '🥑', '🌽', '🥕', '🥦', '🍄', '🌶️',
            '🥒', '🥬', '🧅', '🫛', '🍆', '🥔', '🧄', '🥜',
            '🍊', '🍇', '🍓', '🍌', '🍎', '🍑', '🍒', '🍍',
            '🥝', '🥭', '🍈', '🫐', '🍐', '🍏', '🍊', '🍋'
        ]
    },
    patterns: {
        name: '🔷 무늬',
        cards: [
            '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛',
            '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫',
            '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛',
            '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫',
            '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛',
            '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫'
        ]
    }
};

/**
 * Get a subset of cards from a theme for a given grid size.
 * @param {string} themeName - Key of the theme
 * @param {number} gridSize - Number of cards per row/column (must be even)
 * @returns {string[]} Array of card face values (length = gridSize * gridSize)
 */
function getThemeCards(themeName, gridSize) {
    const theme = THEMES[themeName];
    if (!theme) {
        console.warn(`Theme "${themeName}" not found, falling back to animals`);
        return getThemeCards('animals', gridSize);
    }

    const totalCards = gridSize * gridSize;
    const pairsNeeded = totalCards / 2;

    // Get unique symbols, cycling through the theme array if needed
    const uniqueSymbols = [];
    const sourceCards = theme.cards;
    for (let i = 0; i < pairsNeeded; i++) {
        uniqueSymbols.push(sourceCards[i % sourceCards.length]);
    }

    // Create pairs and shuffle
    const deck = [...uniqueSymbols, ...uniqueSymbols];
    return shuffleArray(deck);
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Get list of all available theme keys.
 * Useful when adding new themes dynamically.
 */
function getAvailableThemes() {
    return Object.keys(THEMES);
}

/**
 * Register a new theme at runtime.
 * @param {string} key - Unique theme key
 * @param {object} theme - Theme object with name and cards array
 */
function registerTheme(key, theme) {
    if (THEMES[key]) {
        console.warn(`Theme "${key}" already exists and will be overwritten`);
    }
    if (!theme.name || !Array.isArray(theme.cards)) {
        console.error('Invalid theme object. Must have "name" (string) and "cards" (array)');
        return;
    }
    THEMES[key] = {
        name: theme.name,
        cards: [...theme.cards]
    };
}